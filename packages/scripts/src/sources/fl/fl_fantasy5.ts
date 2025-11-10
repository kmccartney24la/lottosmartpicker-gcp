// packages/scripts/src/sources/fl/fl_fantasy5.ts
// Node 18+ ESM. Deps: pdfjs-dist.
// Parses the official FL Fantasy 5 PDF into two CSVs:
//   • public/data/fl/fantasy5_midday.csv
//   • public/data/fl/fantasy5_evening.csv
//
// Diagnostics (enable with FL_FF_DEBUG=1):
//  - Per-page/column summary & row-pitch inferred Y tolerances
//  - Skip reasons and small tail previews
//  - Optional debug CSV of raw tokens: public/data/fl/fantasy5_debug_tokens.csv
//
// Env overrides:
//   FL_FF_PDF_PATH   - local path to a PDF (bypass network)
//   FL_FF_PDF_URL    - explicit PDF URL (bypass discovery)
//   FL_HTTP_TIMEOUT_MS (default 20000)
//
// Notes:
//  - Fantasy 5 has **5 numbers** and **no special ball**.
//  - The PDF layout differs from pick games. We classify tokens & stitch rows
//    using tolerant XY heuristics (no fixed-pane assumptions).

import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
const requireCJS = createRequire(import.meta.url);

// ---- Config ----
const GAME_PAGE_URL = "https://floridalottery.com/games/draw-games/fantasy5";
const PDF_URL_DEFAULT = "https://files.floridalottery.com/exptkt/ff.pdf";

const HTTP_TIMEOUT_MS = Number(process.env.FL_HTTP_TIMEOUT_MS ?? 20000);
const OUT_MIDDAY = "public/data/fl/fantasy5_midday.csv";
const OUT_EVENING = "public/data/fl/fantasy5_evening.csv";
const DEBUG_TOKENS_OUT = "public/data/fl/fantasy5_debug_tokens.csv";

// Keep header consistent with your GA F5 schema (blank 'special')
const HEADER = "draw_date,num1,num2,num3,num4,num5,special\n";
const ENABLE_DEBUG = String(process.env.FL_FF_DEBUG ?? "").trim() !== "";

const BASE_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

// ---- Utilities ----
function absolutize(base: string, href: string) {
  try { return new URL(href, base).toString(); } catch { return href; }
}
async function fetchText(url: string): Promise<string> {
  const res = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS), headers: BASE_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return await res.text();
}
async function fetchPdfBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS), headers: BASE_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer());
}
async function resolvePdfUrlFromGamePage(): Promise<string | null> {
  const html = await fetchText(GAME_PAGE_URL);
  // Prefer explicit Fantasy 5 "Winning Number History" link when present
  const m1 = html.match(/<a[^>]+href="([^"]*ff\.pdf[^"]*)"[^>]*>(?:\s*Winning\s+Number\s+History\s*)<\/a>/i);
  if (m1?.[1]) return absolutize(GAME_PAGE_URL, m1[1]);
  // Fallback: any exptkt/...ff*.pdf link
  const m2 = html.match(/<a[^>]+href="([^"]*\/exptkt\/[^"]*ff[^"]*\.pdf[^"]*)"[^>]*>/i);
  if (m2?.[1]) return absolutize(GAME_PAGE_URL, m2[1]);
  return null;
}
async function loadPdfBuffer(localPath?: string): Promise<Uint8Array> {
  const local = (localPath ?? process.env.FL_FF_PDF_PATH)?.trim();
  if (local) return new Uint8Array(await fs.readFile(path.resolve(local)));

  const envUrl = process.env.FL_FF_PDF_URL?.trim();
  if (envUrl) return await fetchPdfBytes(envUrl);

  try {
    return await fetchPdfBytes(PDF_URL_DEFAULT);
  } catch {
    const discovered = await resolvePdfUrlFromGamePage();
    if (!discovered) throw new Error("Could not discover Florida Fantasy 5 PDF URL");
    return await fetchPdfBytes(discovered);
  }
}
function normalizeDashes(s: string): string {
  return s.replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-");
}
function toISO(dateLikeRaw: string): string | null {
  const src = normalizeDashes(dateLikeRaw).replace(/\s+/g, " ").trim();

  // MM/DD/YY(YY)
  let m = src.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if (m) {
    const [, mm, dd, yy] = m;
    const y = yy.length === 2 ? (Number(yy) >= 80 ? 1900 + Number(yy) : 2000 + Number(yy)) : Number(yy);
    const d = new Date(Date.UTC(y, Number(mm) - 1, Number(dd)));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }

  // Mon DD, YYYY
  m = src.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s+(\d{4})$/);
  if (m) {
    const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    const idx = months.indexOf(m[1].slice(0,3).toUpperCase());
    if (idx >= 0) {
      const d = new Date(Date.UTC(Number(m[3]), idx, Number(m[2])));
      return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
  }

  // DD-Mon-YYYY or DD Mon YYYY
  m = src.match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ,]?(\d{4})$/);
  if (m) {
    const months = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    const idx = months.indexOf(m[2].toUpperCase());
    if (idx >= 0) {
      const d = new Date(Date.UTC(Number(m[3]), idx, Number(m[1])));
      return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
  }
  return null;
}

// ---- Tokenization ----
type CellKind = "date" | "session" | "ball" | "noise";
type Cell = { str: string; x: number; y: number; kind: CellKind; page: number };

function isSessionToken(s: string) {
  const t = s.replace(/\u00A0/g, " ").trim();
  // PDFs often render lone "M" / "E", or "M:" / "E:", or even "MIDDAY"/"EVENING"
  return /^(?:M|E)\s*:?$|^MIDDAY$|^EVENING$/i.test(t);
}
function maybeBall(s: string): number | null {
  // Accept 1–36, possibly zero-padded ("01" .. "36")
  const raw = s.replace(/\s/g, "");
  if (!/^\d{1,2}$/.test(raw)) return null;
  const n = Number(raw);
  return (n >= 1 && n <= 36) ? n : null;
}

async function extractCells(buf: Uint8Array): Promise<Cell[]> {
  const pdfjsLib: any = await import("pdfjs-dist/legacy/build/pdf.mjs");

  /**
   * Resolve the 'standard_fonts' directory for pdfjs.
   * Make this mirror the working Cash Pop resolver so we don't end up
   * picking a present-but-empty directory on Cloud Run.
   *
   * Preference order:
   *  1) FL_PDFJS_STD_FONTS env (explicit override)
   *  2) next to legacy/build/pdf.mjs  ← where pdfjs often ships fonts
   *  3) <pkg root>/legacy/build/standard_fonts
   *  4) <pkg root>/standard_fonts     ← worst fallback
   */
  function resolveStandardFontsUrl(): string | undefined {
    try {
      // 1) explicit override via env
      const envPath = (process.env.FL_PDFJS_STD_FONTS ?? "").trim();
      if (envPath && fsSync.existsSync(envPath)) {
        return String(pathToFileURL(path.resolve(envPath))) + "/";
      }

      // 2) prefer the directory right next to legacy/build/pdf.mjs
      //    (this is where many pdfjs-dist builds place standard_fonts)
      const pdfMjsPath = requireCJS.resolve("pdfjs-dist/legacy/build/pdf.mjs");
      const legacyBuildDir = path.dirname(pdfMjsPath);
      const candLegacySibling = path.join(legacyBuildDir, "standard_fonts");
      if (fsSync.existsSync(candLegacySibling)) {
        return String(pathToFileURL(candLegacySibling)) + "/";
      }

      // 3) try package root legacy/build/standard_fonts
      const pkgPath = requireCJS.resolve("pdfjs-dist/package.json");
      const rootDir = path.dirname(pkgPath);
      const candPkgLegacy = path.join(rootDir, "legacy", "build", "standard_fonts");
      if (fsSync.existsSync(candPkgLegacy)) {
        return String(pathToFileURL(candPkgLegacy)) + "/";
      }

      // 4) finally, fall back to package root /standard_fonts
      const candRoot = path.join(rootDir, "standard_fonts");
      if (fsSync.existsSync(candRoot)) {
        return String(pathToFileURL(candRoot)) + "/";
      }
    } catch {
      // swallow and fall through to undefined
    }
    return undefined;
  }

  const stdFontsDirUrl = resolveStandardFontsUrl();
  if (ENABLE_DEBUG) {
    if (stdFontsDirUrl) {
      console.log(`[FF] pdfjs standardFontDataUrl → ${stdFontsDirUrl}`);
    } else {
      console.log("[FF] pdfjs standardFontDataUrl not resolved; consider setting FL_PDFJS_STD_FONTS");
    }
  }

  const getDocOpts: any = { data: buf, disableWorker: true };
  if (stdFontsDirUrl) {
    // Ensure a trailing slash for pdfjs
    getDocOpts.standardFontDataUrl = stdFontsDirUrl.endsWith("/") ? stdFontsDirUrl : (stdFontsDirUrl + "/");
  }
  const loadingTask = pdfjsLib.getDocument(getDocOpts);

  const pdf = await loadingTask.promise;

  const DATE_RE = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s*\d{4}|\d{1,2}[- ][A-Za-z]{3}[- ,]?\d{4})\b/;

  const DROP = [
    /^FLORIDA\s+LOTTERY\b/i,
    /^Winning Numbers History$/i,
    /^Page \d+ of \d+$/i,
    /^Please note every effort/i,
    /^FANTASY\s*5$/i,
  ];

  const cells: Cell[] = [];

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent({
      disableCombineTextItems: true,
      includeMarkedContent: true,
    });

    for (const it of tc.items as any[]) {
      const raw = String(it?.str ?? "");
      const s0 = raw.trim();
      if (!s0) continue;
      if (DROP.some((re) => re.test(s0))) continue;

      const [, , , , e, f] = it?.transform || [0, 0, 0, 0, 0, 0];
      const x = e ?? 0, y = f ?? 0;

      let kind: CellKind = "noise";
      if (DATE_RE.test(s0) && toISO(s0)) kind = "date";
      else if (isSessionToken(s0)) kind = "session";
      else {
        const n = maybeBall(s0);
        if (n !== null) kind = "ball";
      }

      cells.push({ str: s0, x, y, kind, page: p });
    }

    if (ENABLE_DEBUG) {
      const byKind = cells.filter(c=>c.page===p).reduce((m,c)=> (m[c.kind]=(m[c.kind]||0)+1, m), {} as Record<string,number>);
      console.log(`[FF] page ${p}: token totals`, byKind);
    }
  }

  if (ENABLE_DEBUG) {
    // tiny preview of page 1 first items
    const p1 = cells.filter(c=>c.page===1).slice(0,30).map(c=>`${c.kind}@(${Math.round(c.x)},${Math.round(c.y)}):"${c.str}"`);
    console.log("[FF] page 1 preview:", p1.join(" | "));
  }

  return cells;
}

// ---- Column clustering & row building ----
type Labeled = { cx: number; type: CellKind; items: Cell[] };
function median(nums: number[]): number {
  if (!nums.length) return 0;
  const a = nums.slice().sort((x,y)=>x-y);
  const m = Math.floor(a.length/2);
  return a.length % 2 ? a[m] : (a[m-1] + a[m]) / 2;
}

function labelColumns(cells: Cell[]): Labeled[] {
  const xs = [...new Set(cells.map(c => Math.round(c.x)))].sort((a,b)=>a-b);
  const gaps: number[] = [];
  for (let i=1;i<xs.length;i++) gaps.push(xs[i]-xs[i-1]);
  const medGap = gaps.length ? median(gaps) : 18;
  const eps = Math.max(5, Math.min(12, Math.round(medGap * 0.6)));

  // simple greedy grouping by X with tolerance
  const groups: number[][] = [];
  for (const x of xs) {
    const g = groups[groups.length-1];
    if (!g || Math.abs(g[g.length-1] - x) > eps) groups.push([x]);
    else g.push(x);
  }
  const centers = groups.map(g => Math.round(g.reduce((a,b)=>a+b,0)/g.length));

  const colMap: Record<number, Cell[]> = {};
  for (const c of cells) {
    let best = centers[0], bd = 1e9;
    for (const cx of centers) {
      const d = Math.abs(cx - c.x);
      if (d < bd) { bd = d; best = cx; }
    }
    (colMap[best] ||= []).push(c);
  }

  const labeled: Labeled[] = Object.entries(colMap).map(([cx, arr]) => {
    const hasDate   = arr.some(c => c.kind === "date");
    const hasSess   = arr.some(c => c.kind === "session");
    const hasBall   = arr.some(c => c.kind === "ball");
    let type: CellKind = "noise";
    if (hasDate) type = "date";
    else if (hasSess) type = "session";
    else if (hasBall) type = "ball";
    return { cx: Number(cx), type, items: arr.sort((a,b)=> b.y - a.y) };
  }).sort((a,b)=> a.cx - b.cx);

  return labeled;
}

type F5Row = { dateISO: string; session: "M" | "E"; balls: number[]; y: number; page: number };

function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }

function buildRowsForPage(pageCells: Cell[], pageNum: number): F5Row[] {
  const cols = labelColumns(pageCells);
  const dateCols = cols.filter(c => c.type === "date");
  const sessCols = cols.filter(c => c.type === "session");
  const ballCols = cols.filter(c => c.type === "ball");

  // Estimate row pitch from session tokens’ Y deltas to set Y tolerance
  const sessYs = sessCols.flatMap(c => c.items.map(i=>i.y)).sort((a,b)=>b-a);
  const diffs: number[] = [];
  for (let i=1;i<sessYs.length;i++) {
    const d = Math.abs(sessYs[i-1] - sessYs[i]);
    if (d>2) diffs.push(d);
  }
  const pitch = diffs.length ? median(diffs) : 13;
  const Y_TOL = clamp(0.32 * pitch, 7, 14);

  if (ENABLE_DEBUG) {
    console.log(`[FF] page ${pageNum}: colCounts date=${dateCols.length} session=${sessCols.length} ball=${ballCols.length} | pitch≈${pitch.toFixed(1)} → Y_TOL=${Y_TOL.toFixed(1)}`);
  }

  const sessions = sessCols
    .flatMap(c => c.items.map(it => ({ it, cx: c.cx })))
    .sort((a,b)=> b.it.y - a.it.y || a.cx - b.cx);

  const rows: F5Row[] = [];
  const pickBalls = (yMid: number, xMin: number): number[] | null => {
    // collect candidate balls near the Y and to the right of session
    type BallHit = { it: Cell; cx: number };
    const cand: BallHit[] = ballCols
      .flatMap(c => c.items.filter(it =>
        it.x > xMin &&
        Math.abs(it.y - yMid) <= Y_TOL &&
        maybeBall(it.str) !== null
      ).map(it => ({ it, cx: c.cx } as BallHit)))
      .sort((a,b)=> a.it.x - b.it.x);

    if (!cand.length) return null;

    // Group by X to reduce duplicates; pick closest to yMid within each group; then take 5 left->right
    const groups: BallHit[][] = [];
    for (const t of cand) {
      const g = groups[groups.length-1];
      if (!g || Math.abs(g[g.length-1].it.x - t.it.x) > 10) groups.push([t]);
      else g.push(t);
    }
    const picked = groups
      .map((g) => g.slice().sort((a,b)=> Math.abs(a.it.y - yMid) - Math.abs(b.it.y - yMid))[0])
      .sort((a,b)=> a.it.x - b.it.x)
      .map((hit) => Number(maybeBall(hit.it.str)))
      .filter((n) => Number.isInteger(n));

    // We need exactly 5
    if (picked.length >= 5) return picked.slice(0,5);
    return null;
  };

  for (const s of sessions) {
    const raw = s.it.str.toUpperCase().trim();
    const sess: "M" | "E" = /^M/.test(raw) || /^MIDDAY$/.test(raw) ? "M" : "E";
    const yMid = s.it.y;
    const xSession = s.it.x;

    // Find nearest date at similar Y to the *left*
    const leftDates = dateCols.filter(c => c.cx < s.cx).sort((a,b)=> b.cx - a.cx);
    let bestDate: Cell | null = null;
    let bestDy = 1e9;
    for (const dc of leftDates) {
      for (const it of dc.items) {
        const iso = toISO(it.str);
        if (!iso) continue;
        const dy = Math.abs(it.y - yMid);
        if (dy <= Y_TOL && dy < bestDy) {
          bestDate = it;
          bestDy = dy;
        }
      }
      if (bestDate) break;
    }
    if (!bestDate) continue;
    const dateISO = toISO(bestDate.str);
    if (!dateISO) continue;

    const balls = pickBalls(yMid, xSession);
    if (!balls || balls.length !== 5) continue;

    rows.push({ dateISO, session: sess, balls, y: yMid, page: pageNum });
  }

  return rows;
}

async function buildRows(all: Cell[]): Promise<F5Row[]> {
  const byPage = new Map<number, Cell[]>();
  for (const c of all) {
    if (!byPage.has(c.page)) byPage.set(c.page, []);
    byPage.get(c.page)!.push(c);
  }

  let rows: F5Row[] = [];
  for (const [p, cells] of [...byPage.entries()].sort((a,b)=>a[0]-b[0])) {
    rows.push(...buildRowsForPage(cells, p));
  }

  // De-dupe by (dateISO|session); prefer a row that looks "cleaner" (already uniform)
  const key = (r: F5Row) => `${r.dateISO}|${r.session}`;
  const map = new Map<string, F5Row>();
  for (const r of rows) {
    const k = key(r);
    if (!map.has(k)) map.set(k, r);
  }

  const out = [...map.values()].sort((a,b)=> a.dateISO.localeCompare(b.dateISO));
  if (ENABLE_DEBUG) {
    const mTail = out.filter(r=>r.session==="M").slice(-6);
    const eTail = out.filter(r=>r.session==="E").slice(-6);
    console.log("[FF] tail M:", mTail.map(r=>`${r.dateISO} ${r.balls.join("-")}`).join(" | "));
    console.log("[FF] tail E:", eTail.map(r=>`${r.dateISO} ${r.balls.join("-")}`).join(" | "));
  }

  if (ENABLE_DEBUG && out.length === 0) {
    // Dump raw tokens to help inspect structure
    const lines = ["page,x,y,kind,text"];
    for (const [p, cells] of [...byPage.entries()].sort((a,b)=>a[0]-b[0])) {
      for (const c of cells.sort((a,b)=> a.x-b.x || b.y-a.y)) {
        lines.push(`${p},${Math.round(c.x)},${Math.round(c.y)},${c.kind},"${String(c.str).replaceAll('"','""')}"`);
      }
    }
    const dbgPath = path.resolve(process.cwd(), DEBUG_TOKENS_OUT);
    await fs.mkdir(path.dirname(dbgPath), { recursive: true });
    await fs.writeFile(dbgPath, lines.join("\n"), "utf8");
    console.log(`[FF] wrote debug tokens → ${dbgPath}`);
  }

  return out;
}

function makeCsv(rows: F5Row[]): string {
  // Ensure balls are sorted left-to-right already; still, keep as-is from PDF row
  const lines = rows.map(r => {
    const [n1,n2,n3,n4,n5] = r.balls;
    return `${r.dateISO},${n1},${n2},${n3},${n4},${n5},`;
  });
  return HEADER + lines.join("\n") + "\n";
}

// ---- Public API ----
export async function buildFloridaFantasy5Csvs(
  outMiddayRel = OUT_MIDDAY,
  outEveningRel = OUT_EVENING,
  localPdfPath?: string
) {
  const buf = await loadPdfBuffer(localPdfPath);
  const cells = await extractCells(buf);
  const rows = await buildRows(cells);

  const m = rows.filter(r => r.session === "M");
  const e = rows.filter(r => r.session === "E");

  const outM = path.isAbsolute(outMiddayRel) ? outMiddayRel : path.resolve(process.cwd(), outMiddayRel);
  const outE = path.isAbsolute(outEveningRel) ? outEveningRel : path.resolve(process.cwd(), outEveningRel);

  await fs.mkdir(path.dirname(outM), { recursive: true });
  await fs.mkdir(path.dirname(outE), { recursive: true });

  await fs.writeFile(outM, makeCsv(m), "utf8");
  await fs.writeFile(outE, makeCsv(e), "utf8");

  console.log(`[FL FANTASY5] Wrote ${m.length} midday rows → ${outM}`);
  console.log(`[FL FANTASY5] Wrote ${e.length} evening rows → ${outE}`);
}

// ---- CLI ----
if (typeof process !== "undefined" && process.argv && process.argv[1]) {
  const thisFile = path.resolve(fileURLToPath(import.meta.url));
  const invoked = path.resolve(process.argv[1]);
  if (thisFile === invoked) {
    const maybeLocal = process.argv[2]; // optional local PDF path
    buildFloridaFantasy5Csvs(undefined, undefined, maybeLocal).catch((e) => {
      console.error(e);
      process.exit(1);
    });
  }
}
