// scripts/sources/fl/fl_cashpop.ts
// Node 18+ ESM. Deps: pdfjs-dist.
// Parses the official FL Cash Pop PDF into FIVE CSVs:
//   • public/data/fl/cashpop_morning.csv
//   • public/data/fl/cashpop_matinee.csv
//   • public/data/fl/cashpop_afternoon.csv
//   • public/data/fl/cashpop_evening.csv
//   • public/data/fl/cashpop_latenight.csv
//
// Env overrides:
//   FL_CP_PDF_PATH        - local path to a PDF (bypass network)
//   FL_CP_PDF_URL         - explicit PDF URL (bypass discovery)
//   FL_HTTP_TIMEOUT_MS    - HTTP timeout (ms)
//   FL_CP_DEBUG=1         - verbose diagnostics
//
// Notes:
//  - Each row has one value (1..15). We emit header "draw_date,num1" so our
//    flexible CSV reader can ingest it (it knows num1..numN).

import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
const requireCJS = createRequire(import.meta.url);

// ---- Config ----
const GAME_PAGE_URL = "https://floridalottery.com/games/draw-games/cash-pop";
const PDF_URL_DEFAULT = "https://files.floridalottery.com/exptkt/cp.pdf";

const HTTP_TIMEOUT_MS = Number(process.env.FL_HTTP_TIMEOUT_MS ?? 20000);
const ENABLE_DEBUG = String(process.env.FL_CP_DEBUG ?? "").trim() !== "";

// outputs
const OUT = {
  morning:   "public/data/fl/cashpop_morning.csv",
  matinee:   "public/data/fl/cashpop_matinee.csv",
  afternoon: "public/data/fl/cashpop_afternoon.csv",
  evening:   "public/data/fl/cashpop_evening.csv",
  latenight: "public/data/fl/cashpop_latenight.csv",
};
const HEADER = "draw_date,num1\n";

// ---- HTTP utils ----
const BASE_HEADERS: Record<string, string> = {
  "user-agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
  "accept-language": "en-US,en;q=0.9",
};

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
  try {
    const html = await fetchText(GAME_PAGE_URL);
    const m1 = html.match(/<a[^>]+href="([^"]*cp\.pdf[^"]*)"[^>]*>(?:\s*Winning\s+Number\s+History\s*)<\/a>/i);
    if (m1?.[1]) return absolutize(GAME_PAGE_URL, m1[1]);
    const m2 = html.match(/<a[^>]+href="([^"]*\/exptkt\/[^"]*cp[^"]*\.pdf[^"]*)"[^>]*>/i);
    if (m2?.[1]) return absolutize(GAME_PAGE_URL, m2[1]);
  } catch {}
  return null;
}
async function loadPdfBuffer(localPath?: string): Promise<Uint8Array> {
  const local = (localPath ?? process.env.FL_CP_PDF_PATH)?.trim();
  if (local) return new Uint8Array(await fs.readFile(path.resolve(local)));

  const envUrl = process.env.FL_CP_PDF_URL?.trim();
  if (envUrl) return await fetchPdfBytes(envUrl);

  try {
    return await fetchPdfBytes(PDF_URL_DEFAULT);
  } catch {
    const discovered = await resolvePdfUrlFromGamePage();
    if (!discovered) throw new Error("Could not discover Florida Cash Pop PDF URL");
    return await fetchPdfBytes(discovered);
  }
}

// ---- parsing helpers ----
function toISO(raw: string): string | null {
  const s = raw.trim();
  const m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/); // e.g., 10/15/2025
  if (!m) return null;
  const y = Number(m[3]), mm = Number(m[1]) - 1, dd = Number(m[2]);
  const d = new Date(Date.UTC(y, mm, dd));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function maybeVal(s: string): number | null {
  const t = s.replace(/\s/g, "");
  if (!/^\d{1,2}$/.test(t)) return null;
  const n = Number(t);
  // Cash Pop values are 1..15 (inclusive)
  return (n >= 1 && n <= 15) ? n : null;
}

type CellKind = "date" | "header" | "val" | "noise";
type Cell = { str: string; x: number; y: number; kind: CellKind; page: number };

async function extractCells(buf: Uint8Array): Promise<Cell[]> {
  const pdfjsLib: any = await import("pdfjs-dist/legacy/build/pdf.mjs");

  function stdFontsDir(): string | undefined {
    try {
      const mjs = requireCJS.resolve("pdfjs-dist/legacy/build/pdf.mjs");
      const buildDir = path.dirname(mjs);
      const cand1 = path.join(buildDir, "standard_fonts");
      if (fsSync.existsSync(cand1)) return String(pathToFileURL(cand1)) + "/";
      const pkg = requireCJS.resolve("pdfjs-dist/package.json");
      const root = path.dirname(pkg);
      const cand2 = path.join(root, "legacy", "build", "standard_fonts");
      if (fsSync.existsSync(cand2)) return String(pathToFileURL(cand2)) + "/";
      const cand3 = path.join(root, "standard_fonts");
      if (fsSync.existsSync(cand3)) return String(pathToFileURL(cand3)) + "/";
    } catch {}
    return undefined;
  }

  const loadingTask = pdfjsLib.getDocument({
    data: buf,
    disableWorker: true,
    ...(stdFontsDir() ? { standardFontDataUrl: stdFontsDir() } : {}),
  });
  const pdf = await loadingTask.promise;

  const DROP = [
    /^FLORIDA\s+LOTTERY\b/i,
    /^CASH\s*POP$/i,
    /^Winning Numbers History$/i,
    /^Page \d+ of \d+$/i,
    /^Please note every effort/i,
    /^Last Queried:/i,
    /^GMT-?\d{2}:\d{2}$/i,
  ];

  const HEADERS = ["MORNING", "MATINEE", "AFTERNOON", "EVENING", "LATE NIGHT"];

  const cells: Cell[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent({ disableCombineTextItems: true, includeMarkedContent: true });

    for (const it of tc.items as any[]) {
      const text = String(it?.str ?? "").trim();
      if (!text) continue;
      if (DROP.some(re => re.test(text))) continue;

      const [, , , , e, f] = it?.transform || [0,0,0,0,0,0];
      const x = e ?? 0, y = f ?? 0;

      let kind: CellKind = "noise";
      if (toISO(text)) kind = "date";
      else if (HEADERS.includes(text.toUpperCase())) kind = "header";
      else if (maybeVal(text) !== null) kind = "val";

      cells.push({ str: text, x, y, kind, page: p });
    }
  }
  if (ENABLE_DEBUG) {
    const p1 = cells.filter(c=>c.page===1).slice(0, 30).map(c=>`${c.kind}@(${Math.round(c.x)},${Math.round(c.y)}):"${c.str}"`);
    console.log("[CP] page1 preview:", p1.join(" | "));
  }
  return cells;
}

type LabeledCol = { cx: number; type: CellKind; items: Cell[] };
function median(nums: number[]): number {
  if (!nums.length) return 0;
  const a = nums.slice().sort((x,y)=>x-y);
  const m = Math.floor(a.length/2);
  return a.length % 2 ? a[m] : (a[m-1]+a[m])/2;
}

function clusterColumns(cells: Cell[]): LabeledCol[] {
  const xs = [...new Set(cells.map(c=>Math.round(c.x)))].sort((a,b)=>a-b);
  const gaps: number[] = [];
  for (let i=1;i<xs.length;i++) gaps.push(xs[i]-xs[i-1]);
  const eps = Math.max(6, Math.min(14, Math.round((gaps.length?median(gaps):18) * 0.6)));

  const groups: number[][] = [];
  for (const x of xs) {
    const g = groups[groups.length-1];
    if (!g || Math.abs(g[g.length-1]-x) > eps) groups.push([x]); else g.push(x);
  }
  const centers = groups.map(g=>Math.round(g.reduce((a,b)=>a+b,0)/g.length));

  const map: Record<number, Cell[]> = {};
  for (const c of cells) {
    let best = centers[0], bd = 1e9;
    for (const cx of centers) {
      const d = Math.abs(cx - c.x);
      if (d < bd) { bd = d; best = cx; }
    }
    (map[best] ||= []).push(c);
  }

  return Object.entries(map).map(([cx, arr]) => {
    let type: CellKind = "noise";
    if (arr.some(c=>c.kind==="date")) type="date";
    else if (arr.some(c=>c.kind==="header")) type="header";
    else if (arr.some(c=>c.kind==="val")) type="val";
    return { cx: Number(cx), type, items: arr.sort((a,b)=>b.y-a.y) };
  }).sort((a,b)=>a.cx-b.cx);
}

function clamp(v:number, lo:number, hi:number){ return Math.max(lo, Math.min(hi, v)); }

type RowOut = { date: string; morning?: number; matinee?: number; afternoon?: number; evening?: number; latenight?: number };

function buildRows(cells: Cell[]): RowOut[] {
  const byPage = new Map<number, Cell[]>();
  for (const c of cells) { (byPage.get(c.page) || byPage.set(c.page, []).get(c.page)!).push(c); }

  const out: RowOut[] = [];

  for (const [page, arr] of [...byPage.entries()].sort((a,b)=>a[0]-b[0])) {
    const cols = clusterColumns(arr);
    const dateCols   = cols.filter(c=>c.type==="date");
    const headerCols = cols.filter(c=>c.type==="header");
    const valCols    = cols.filter(c=>c.type==="val");

    // Build the header → column center map using the header text tokens
    const headerMap: Array<{name: keyof RowOut, cx: number}> = [];
    const NAME_MAP: Record<string, keyof RowOut> = {
      "MORNING":"morning",
      "MATINEE":"matinee",
      "AFTERNOON":"afternoon",
      "EVENING":"evening",
      "LATE NIGHT":"latenight",
    };

    const headerTokens = arr.filter(c=>c.kind==="header");
    for (const ht of headerTokens) {
      const name = NAME_MAP[ht.str.toUpperCase()];
      if (!name) continue;
      // snap this header to the nearest value column center to stabilize
      let best = valCols[0]?.cx ?? ht.x, bd = 1e9;
      for (const vc of valCols) {
        const d = Math.abs(vc.cx - ht.x);
        if (d < bd) { bd = d; best = vc.cx; }
      }
      headerMap.push({ name, cx: best });
    }
    // If header row didn’t appear on a later page (rare), fallback to the 5 rightmost val columns
    if (headerMap.length < 5 && valCols.length >= 5) {
      const right5 = valCols.slice(-5);
      const order = ["morning","matinee","afternoon","evening","latenight"] as const;
      for (let i=0;i<5;i++) headerMap.push({ name: order[i], cx: right5[i].cx });
    }
    // De-duplicate by name (keep closest to date column by default order)
    const dedup = new Map<keyof RowOut, number>();
    headerMap.forEach(h => { if (!dedup.has(h.name)) dedup.set(h.name, h.cx); });

    // Infer row pitch from date column items
    const dateYs = dateCols.flatMap(c=>c.items.map(i=>i.y)).sort((a,b)=>b-a);
    const deltas:number[] = [];
    for (let i=1;i<dateYs.length;i++){ const d = Math.abs(dateYs[i-1]-dateYs[i]); if (d>2) deltas.push(d); }
    const pitch = deltas.length ? median(deltas) : 13;
    const Y_TOL = clamp(0.30 * pitch, 7, 14);

    const dates = dateCols.flatMap(c=>c.items).sort((a,b)=>b.y-a.y);
    for (const dTok of dates) {
      const date = toISO(dTok.str);
      if (!date) continue;

      const row: RowOut = { date };

      // for each named column center: pick nearest value at similar Y and to the right of the date x
      for (const [name, cx] of dedup.entries()) {
        // find value tokens near column center
        let best: Cell | null = null;
        let bestScore = 1e9;
        for (const vc of valCols) {
          if (Math.abs(vc.cx - cx) > 10) continue;
          for (const it of vc.items) {
            if (it.x <= dTok.x) continue; // must be to the right of the date
            if (Math.abs(it.y - dTok.y) > Y_TOL) continue;
            const sc = Math.abs(vc.cx - cx) + Math.abs(it.y - dTok.y)*0.8;
            if (sc < bestScore) { bestScore = sc; best = it; }
          }
        }
        if (best) (row as any)[name] = maybeVal(best.str) as number;
      }

      // push if at least one period captured (nearly always all five)
      if (row.morning||row.matinee||row.afternoon||row.evening||row.latenight) {
        out.push(row);
      }
    }

    if (ENABLE_DEBUG) {
      console.log(`[CP] page ${page}: dateCols=${dateCols.length} valCols=${valCols.length} headers=${headerTokens.length} rows+=${out.length}`);
    }
  }

  // De-dupe by date (keep last seen which usually is earliest page parsed first; order doesn’t matter)
  const byDate = new Map<string, RowOut>();
  for (const r of out) byDate.set(r.date, r);
  return [...byDate.values()].sort((a,b)=>a.date.localeCompare(b.date));
}

function makeCsvOne(rows: RowOut[], key: keyof RowOut): string {
  const lines = rows
    .filter(r => typeof (r as any)[key] === "number")
    .map(r => `${r.date},${(r as any)[key] as number}`);
  return HEADER + lines.join("\n") + (lines.length ? "\n" : "");
}

// ---- Public API ----
export async function buildFloridaCashPopCsvs(localPdfPath?: string, outOverride?: Partial<typeof OUT>) {
  const out = { ...OUT, ...(outOverride||{}) };
  const buf = await loadPdfBuffer(localPdfPath);
  const cells = await extractCells(buf);
  const rows = buildRows(cells);

  const files: Array<[keyof typeof OUT, string]> = [
    ["morning",   makeCsvOne(rows, "morning")],
    ["matinee",   makeCsvOne(rows, "matinee")],
    ["afternoon", makeCsvOne(rows, "afternoon")],
    ["evening",   makeCsvOne(rows, "evening")],
    ["latenight", makeCsvOne(rows, "latenight")],
  ];

  // ensure dirs & write
  for (const [k, csv] of files) {
    const outPath = path.isAbsolute(out[k]) ? out[k] : path.resolve(process.cwd(), out[k]);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, csv, "utf8");
    console.log(`[FL CASH POP] Wrote ${csv.split("\n").length-2} rows → ${outPath}`);
  }
}

// ---- CLI ----
if (typeof process !== "undefined" && process.argv && process.argv[1]) {
  const thisFile = path.resolve(fileURLToPath(import.meta.url));
  const invoked = path.resolve(process.argv[1]);
  if (thisFile === invoked) {
    // optional local PDF path
    const maybeLocal = process.argv[2];
    buildFloridaCashPopCsvs(maybeLocal).catch((e) => {
      console.error(e);
      process.exit(1);
    });
  }
}
