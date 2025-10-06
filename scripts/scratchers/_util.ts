// scripts/scratchers/_util.ts
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { Page, BrowserContext } from "playwright";

const DATA_DIR = "public/data/ga/scratchers";

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// --- tiny typed helpers for DOM-y code in Node builds ---
export function qs<T = any>(root: any, sel: string): T | null {
  return root?.querySelector?.(sel) ?? null;
}
export function qsa<T = any>(root: any, sel: string): T[] {
  return Array.from(root?.querySelectorAll?.(sel) ?? []);
}
/** Cast unknown → T at use-sites where TS complains about 'unknown' */
export function asAny<T = any>(x: unknown): T {
  return x as T;
}

export async function ensureDir(p: string) {
  await fs.mkdir(p, { recursive: true }).catch(() => {});
}

export async function saveDebug(page: Page, basename: string) {
  await ensureDir(DATA_DIR);
  const htmlPath = path.join(DATA_DIR, `${basename}.html`);
  const pngPath = path.join(DATA_DIR, `${basename}.png`);
  try {
    const html = await page.content();
    await fs.writeFile(htmlPath, html, "utf8");
  } catch {}
  try {
    await page.screenshot({ path: pngPath, fullPage: true });
  } catch {}
}

type RetryOpts = {
  attempts?: number;
  label?: string;
  minDelayMs?: number;
  factor?: number;
};

export async function withRetry<T>(fn: () => Promise<T>, opts: RetryOpts = {}): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const label = opts.label ?? "retry";
  const minDelay = opts.minDelayMs ?? 1200;
  const factor = opts.factor ?? 2.2;

  let lastErr: unknown;
  for (let i = 1; i <= attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (i < attempts) {
        const wait = Math.round(minDelay * Math.pow(factor, i - 1));
        console.warn(`[${label}] attempt ${i}/${attempts} failed: ${String(err)}; sleeping ${wait}ms`);
        await sleep(wait);
      }
    }
  }
  throw lastErr;
}

export async function maybeStartTracing(context: BrowserContext) {
  if (process.env.TRACE) {
    try {
      await context.tracing.start({ screenshots: true, snapshots: true, sources: true });
    } catch {}
  }
}

export async function maybeStopTracing(context: BrowserContext, outPath: string) {
  if (process.env.TRACE) {
    await ensureDir(DATA_DIR);
    try {
      await context.tracing.stop({ path: path.join(DATA_DIR, outPath) });
    } catch {}
  }
}

/** Odds parser: finds "1 in 3.47", "1:3.47", etc. Returns the numeric divisor (e.g. 3.47). */
export function oddsFromText(text?: string | null): number | undefined {
  if (!text) return undefined;
  const m = text.replace(/\s+/g, " ").match(/1\s*(?:in|:)\s*([0-9]+(?:\.[0-9]+)?)/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : undefined;
}

/* ---------------- link harvesting ---------------- */

const harvestByPage = new WeakMap<Page, Set<string>>();

function normalizeGameUrl(u: string): string | undefined {
  try {
    if (!u) return undefined;

    const cleaned = u.trim().replace(/\\u002F/gi, "/").replace(/\\\//g, "/");
    const url = new URL(cleaned, "https://www.galottery.com");
    const p = url.pathname;

    // accept with or without ".html", and AEM /content/... variants
    const m =
      p.match(/^\/en-us\/games\/scratchers\/([^\/?#]+)(?:\.html)?$/i) ||
      p.match(/^\/games\/scratchers\/([^\/?#]+)(?:\.html)?$/i) ||
      p.match(/^\/content\/[^\/]+\/en(?:-us)?\/games\/scratchers\/([^\/?#]+)(?:\.html)?$/i);

    if (!m) return undefined;
    let slug = m[1].toLowerCase();
    if (slug.endsWith(".html")) slug = slug.slice(0, -5);

    // obvious non-game pages & service endpoints
    const blocked = new Set([
      "active-games","ended-games","scratchers-top-prizes-claimed",
      "become-a-retailer","contact-us","media-requests","registration",
    ]);
    if (
      blocked.has(slug) ||
      slug.startsWith("scgametiles.") ||
      slug.includes("jcr:content") ||
      slug.includes("controller") ||
      slug.includes("service") ||
      slug.includes("overridejquery")
    ) return undefined;

    return `https://www.galottery.com/en-us/games/scratchers/${slug}.html`;
  } catch {
    return undefined;
  }
}

/** Pull candidate scratcher URLs out of arbitrary text/JSON/HTML. */
function harvestUrlsFromText(txt: string, baseOrigin = "https://www.galottery.com") {
  const out = new Set<string>();
  const cleaned = (txt || "").replace(/\\u002F/gi, "/").replace(/\\\//g, "/");

  // absolute *.html under galottery.com
  const abs = /https?:\/\/www\.galottery\.com\/[^"'\s<>]+?\.html/gi;
  let m: RegExpExecArray | null;
  while ((m = abs.exec(cleaned))) out.add(m[0]);

  // relative *.html → absolute
  const rel = /\/[^"'\s<>]+?\.html/gi;
  while ((m = rel.exec(cleaned))) {
    try { out.add(new URL(m[0], baseOrigin).toString()); } catch {}
  }

  // slug-only scratcher paths without ".html"
  const slugOnly = /\/(?:en-us\/|content\/[^\/]+\/en(?:-us)?\/)?games\/scratchers\/([a-z0-9-]+)(?=["'\/?#\s])/gi;
  while ((m = slugOnly.exec(cleaned))) {
    const url = `https://www.galottery.com/en-us/games/scratchers/${m[1]}.html`;
    out.add(url);
  }

  return out;
}

export function attachNetworkHarvester(page: Page) {
  const store = new Set<string>();
  harvestByPage.set(page, store);

  page.on("response", async (resp) => {
    try {
      const url = resp.url();
      // URL itself might already be a slug
      const direct = normalizeGameUrl(url);
      if (direct) store.add(direct);

      // Read body (size-guarded)
      const MAX = 2_000_000;
      let body = "";
      try {
        const buf = await resp.body();
        if (buf && buf.length <= MAX) body = new TextDecoder("utf-8", { fatal: false }).decode(buf);
      } catch {
        body = await resp.text().catch(() => "");
      }
      if (!body) return;

      if (/scgametiles\.calculatechecksum/i.test(url)) {
        try {
          const json = JSON.parse(body);
          const bag: string[] = [];
          const walk = (n: any) => {
            if (!n) return;
            if (typeof n === "string") bag.push(n);
            else if (Array.isArray(n)) n.forEach(walk);
            else if (typeof n === "object") Object.values(n).forEach(walk);
          };
          walk(json);
          for (const s of bag) {
            const n = normalizeGameUrl(String(s));
            if (n) store.add(n);
          }
        } catch {
          // fallback to generic grep
        }
      }

      // generic grep (covers HTML fragments and other JSON blobs)
      for (const u of harvestUrlsFromText(body)) store.add(u);
    } catch { /* ignore */ }
  });
}

type ReadyOpts = { loadMore?: boolean; maxScrolls?: number };

export async function openAndReady(page: Page, url: string, opts?: ReadyOpts) {
  await page.context().addInitScript(`/* esbuild helper shim (as in your original) */`);

  // First navigation (best effort)
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  } catch (e: any) {
    const now = page.url();
    const landed = now && (now === url || new URL(now).origin === new URL(url).origin);
    if (!landed) throw e;
  }

  // Wait & prep, then add global helpers before re-navigation (keeps your intent)
  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(600);
  await page.waitForSelector('a[href$=".html"], [data-href$=".html"], [data-url$=".html"]', { timeout: 6000 }).catch(() => {});
  await page.context().addInitScript(`
    (function () {
      var g = typeof globalThis!=='undefined' ? globalThis : (typeof window!=='undefined'?window:this);
      if (typeof g.__name !== 'function') {
        g.__name = function (fn, _name) { try { Object.defineProperty(fn, 'name', { value: _name, configurable: true }); } catch (e) {} return fn; };
      }
      if (typeof g.__publicField !== 'function') {
        g.__publicField = function (obj, key, value) { obj[key] = value; return value; };
      }
      if (typeof g.__spreadValues !== 'function') {
        g.__spreadValues = function (a, b) {
          for (var k in b) if (Object.prototype.hasOwnProperty.call(b, k)) a[k] = b[k];
          if (Object.getOwnPropertySymbols) {
            var syms = Object.getOwnPropertySymbols(b);
            for (var i = 0; i < syms.length; i++) {
              var s = syms[i]; var d = Object.getOwnPropertyDescriptor(b, s);
              if (d && d.enumerable) a[s] = b[s];
            }
          }
          return a;
        };
      }
      if (typeof g.__spreadProps !== 'function') {
        g.__spreadProps = function (a, b) { return Object.defineProperties(a, Object.getOwnPropertyDescriptors(b)); };
      }
      if (typeof g.__objRest !== 'function') {
        g.__objRest = function (source, exclude) {
          var target = {};
          for (var k in source)
            if (Object.prototype.hasOwnProperty.call(source, k) && exclude.indexOf(k) < 0) target[k] = source[k];
          if (source != null && Object.getOwnPropertySymbols) {
            var syms = Object.getOwnPropertySymbols(source);
            for (var i = 0; i < syms.length; i++) {
              var s = syms[i];
              if (exclude.indexOf(s) < 0 && Object.prototype.propertyIsEnumerable.call(source, s)) target[s] = source[s];
            }
          }
          return target;
        };
      }
    })();
  `);

  // Second navigation to ensure init script precedes page scripts
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  } catch (e: any) {
    const now = page.url();
    const landed = now && (now === url || new URL(now).origin === new URL(url).origin);
    if (!landed) throw e;
  }

  await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => {});
  await page.waitForTimeout(600); // let AEM boot

  // Dismiss common overlays/banners (OneTrust etc.)
  const overlaySelectors = [
    'button:has-text("Accept")','button:has-text("I Accept")','button:has-text("Agree")',
    'button:has-text("Got it")','button[aria-label="Close"]','#onetrust-accept-btn-handler',
    'button#truste-consent-button','.ot-sdk-container button:has-text("Accept")',
  ];
  for (const sel of overlaySelectors) {
    const btn = await page.$(sel).catch(() => null);
    if (btn) { try { await btn.click({ timeout: 2000 }); } catch {} }
  }

  attachNetworkHarvester(page);

  // Progressive scroll until we see any .html-ish links or data attrs
  const maxScrolls = opts?.maxScrolls ?? 24;
  for (let i = 0; i < maxScrolls; i++) {
    const found = await page.$$('a[href*=".html"], [data-href*=".html"], [data-url*=".html"]').catch(() => []);
    if (found && found.length > 0) break;
    await page.evaluate(() => window.scrollBy(0, Math.round(window.innerHeight * 0.9))).catch(() => {});
    await page.waitForTimeout(350);
  }
  await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
  await page.waitForTimeout(500);

  if (opts?.loadMore) {
    for (let i = 0; i < 6; i++) {
      const sel = ['button:has-text("Load more")','button:has-text("Show more")','button:has-text("View more")'].join(",");
      const btn = await page.$(sel).catch(() => null);
      if (!btn) break;
      try {
        await btn.click({ timeout: 4000 });
        await sleep(1000);
      } catch { break; }
    }
  }

  await sleep(1000);
}

export async function waitForNumericGameLinks(
  page: Page,
  nameHint: string,
  minCount = 5,
  timeoutMs = 45_000
) {
  const started = Date.now();
  const seen = new Set<string>();

  async function collectFromDom(): Promise<string[]> {
    const evalOnce = () =>
      page.evaluate(() => {
        const out = new Set<string>();
        const abs = (href: string) => {
          try { return new URL(href, window.location.href).toString(); } catch { return ""; }
        };

        // helper: walk Shadow DOMs
        const allRoots = (root: Document | ShadowRoot | Element): Element[] => {
          const acc: Element[] = [];
          const push = (el: Element) => {
            acc.push(el);
            const sr = (el as any).shadowRoot as ShadowRoot | null;
            if (sr) acc.push(...Array.from(sr.querySelectorAll("*")));
          };
          const scope = (root as any).querySelectorAll ? (root as any).querySelectorAll("*") : [];
          Array.from(scope).forEach(push);
          return acc;
        };

        // scan common attributes on whole tree (including shadow hosts)
        const scanEls = [document.documentElement, ...allRoots(document)];

        scanEls.forEach((el: any) => {
          if (!el.getAttribute) return;
          for (const key of ["data-init","data-items","data-teaser","data-props","data-options"]) {
            const raw = el.getAttribute(key);
            if (!raw) continue;
            try {
              const obj = JSON.parse(raw.replace(/\\u002F/gi, "/").replace(/\\\//g, "/"));
              const bag = new Set<string>();
              const walk = (v: any) => {
                if (!v) return;
                if (typeof v === "string") bag.add(v);
                else if (Array.isArray(v)) v.forEach(walk);
                else if (typeof v === "object") Object.values(v).forEach(walk);
              };
              walk(obj);
              for (const s of Array.from(bag)) {
                if (/\/games\/scratchers\/[a-z0-9-]+(?:\.html)?/i.test(s)) out.add(abs(s));
              }
            } catch { /* not JSON, ignore */ }
          }
        });

        // Anchors/forms – any *.html (normalize will whitelist real games)
        document.querySelectorAll('a[href$=".html"]').forEach((a: any) => {
          const href = a.getAttribute("href"); if (href) out.add(abs(href));
        });
        // Also anchors that have slug-only paths
        document.querySelectorAll('a[href*="/games/scratchers/"]').forEach((a: any) => {
          const href = a.getAttribute("href") || "";
          if (/\/games\/scratchers\/[a-z0-9-]+(?:\.html)?/i.test(href)) out.add(abs(href));
        });
        document.querySelectorAll('form[action$=".html"]').forEach((f: any) => {
          const act = f.getAttribute("action"); if (act) out.add(abs(act));
        });

        // Common tile patterns
        document.querySelectorAll('[class*="tile"],[class*="game"] a[href*="/games/scratchers/"]').forEach((a: any) => {
          const href = a.getAttribute("href"); if (href) out.add(abs(href));
        });

        // data-* attributes
        const attrs = ["data-href","data-url","data-link","data-target","data-gtm-href","data-analytics-href"];
        scanEls.forEach((el: any) => {
          for (const n of attrs) {
            const v = el.getAttribute(n);
            if (!v) continue;
            if (/\/games\/scratchers\/[a-z0-9-]+(?:\.html)?/i.test(v)) out.add(abs(v));
          }
        });

        // inline onclick(...)
        document.querySelectorAll("[onclick]").forEach((el: any) => {
          const js = el.getAttribute("onclick") || "";
          const m = js.match(/['"]((?:\/?)(?:en-us|content\/portal\/en)?\/games\/scratchers\/[^'"]+?)(?:\.html)?['"]/i);
          if (m) out.add(abs(m[1]));
        });

        // JSON blobs (attrs/scripts)
        document.querySelectorAll('[data-json],[data-config],[data-model]').forEach((el: any) => {
          for (const n of ["data-json","data-config","data-model"]) {
            const blob = el.getAttribute(n);
            if (blob && /\/games\/scratchers\//i.test(blob)) {
              const re = /(["'])([^"']*\/games\/scratchers\/[a-z0-9-]+(?:\.html)?)\1/gi; let m;
              while ((m = re.exec(blob))) out.add(abs(m[2]));
            }
          }
        });
        document.querySelectorAll('script[type*="json"]').forEach((s: any) => {
          const txt = s.textContent || "";
          if (/\/games\/scratchers\//i.test(txt)) {
            const re = /(["'])([^"']*\/games\/scratchers\/[a-z0-9-]+(?:\.html)?)\1/gi; let m;
            while ((m = re.exec(txt))) out.add(abs(m[2]));
          }
        });
        document.querySelectorAll('script:not([src])').forEach((s: any) => {
          const txt = s.textContent || "";
          if (/\/games\/scratchers\//i.test(txt)) {
            const re = /(["'])([^"']*\/games\/scratchers\/[a-z0-9-]+(?:\.html)?)\1/gi; let mm;
            while ((mm = re.exec(txt))) out.add(abs(mm[2]));
          }
        });

        return Array.from(out);
      });

    try {
      return await evalOnce();
    } catch (err) {
      const msg = String(err || "");
      if (msg.includes("__name is not defined")) {
        await page.addInitScript(`(function(){ if (typeof globalThis.__name!=='function'){ globalThis.__name=function(fn,_n){ try{Object.defineProperty(fn,'name',{value:_n,configurable:true})}catch(e){}; return fn; }; } })();`);
        return await evalOnce();
      }
      throw err;
    }
  }

  async function collectFromNetwork(): Promise<string[]> {
    const harvested = harvestByPage.get(page) ?? new Set<string>();
    return Array.from(harvested);
  }

  async function collectFromHtmlOuter(): Promise<string[]> {
    try {
      const html = await page.content();
      return Array.from(harvestUrlsFromText(html));
    } catch {
      return [];
    }
  }

  async function collectFromWindow(page: Page): Promise<string[]> {
    const strings: string[] = await page.evaluate(() => {
      const bag = new Set<string>();
      const push = (v: any) => {
        if (!v) return;
        if (typeof v === "string") bag.add(v);
        else if (Array.isArray(v)) v.forEach(push);
        else if (typeof v === "object") Object.values(v).forEach(push);
      };

      try {
        const dl = (globalThis as any).dataLayer;
        if (Array.isArray(dl)) dl.forEach(push);
      } catch {}

      try {
        const w = globalThis as any;
        for (const k of Object.keys(w)) {
          const lk = k.toLowerCase();
          if (lk.includes("game") || lk.includes("tile") || lk.includes("scratch")) push(w[k]);
        }
      } catch {}

      return Array.from(bag);
    });

    return strings;
  }

  let stagnant = 0,
    lastCount = 0;

  while (Date.now() - started < timeoutMs) {
    await page.evaluate(() => window.scrollBy(0, Math.round(window.innerHeight * 0.75))).catch(() => {});
    await sleep(350);

    const domLinks = await collectFromDom();
    const netLinks = await collectFromNetwork();
    const htmlLinks = await collectFromHtmlOuter();
    const winLinks = await collectFromWindow(page);

    for (const raw of [...domLinks, ...netLinks, ...htmlLinks, ...winLinks]) {
      const norm = normalizeGameUrl(raw);
      if (norm) seen.add(norm);
    }

    const count = seen.size;
    if (count >= minCount) break;

    if (count === lastCount) stagnant += 1;
    else {
      stagnant = 0;
      lastCount = count;
    }

    if (stagnant >= 3) {
      await page
        .evaluate(
          () =>
            new Promise<void>((r) => {
              try {
                (window as any).requestIdleCallback
                  ? (window as any).requestIdleCallback(() => r(), { timeout: 800 })
                  : setTimeout(() => r(), 300);
              } catch {
                setTimeout(() => r(), 300);
              }
            })
        )
        .catch(() => {});
      stagnant = 0;
    }
  }

  const results = Array.from(seen).sort();

  try {
    await fs.writeFile(
      path.join(DATA_DIR, `_debug_${nameHint}.links.json`),
      JSON.stringify({ count: results.length, links: results }, null, 2),
      "utf8"
    );
  } catch {}

  if (results.length === 0) {
    await saveDebug(page, `_debug_links_${nameHint}_fail`);
    throw new Error(
      `waitForNumericGameLinks: timed out without reaching minCount=${minCount}; gathered=${results.length}`
    );
  }

  return results;
}
