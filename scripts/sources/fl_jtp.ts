// scripts/sources/fl_jtp.ts
// Node 18+ ESM. Deps: pdfjs-dist.
// Parses the official JACKPOT TRIPLE PLAY PDF (multi-column layout) into canonical CSV
// where the 6th main lives in `special` (to match your existing draw-game CSV shape).

import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const requireCJS = createRequire(import.meta.url);

const PDF_URL = process.env.FL_JTP_PDF_URL
  ?? "https://files.floridalottery.com/exptkt/jtp.pdf";

const HEADER = "draw_date,num1,num2,num3,num4,num5,special\n";
const ERA_START = "2019-01-30"; // JTP launch date

const HTTP_TIMEOUT_MS = Number(process.env.FL_HTTP_TIMEOUT_MS ?? 20000);
const GAME_PAGE_URL = "https://floridalottery.com/games/draw-games/jackpot-triple-play";

// ---------- helpers ----------
const BASE_HEADERS: Record<string,string> = {
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
async function resolvePdfUrlFromGamePage(): Promise<string | null> {
  const html = await fetchText(GAME_PAGE_URL);
  // Prefer explicit "Winning Number History" link to jtp.pdf
  const m1 = html.match(/<a[^>]+href="([^"]+jtp\.pdf[^"]*)"[^>]*>(?:\s*Winning\s+Number\s+History\s*)<\/a>/i);
  if (m1?.[1]) return absolutize(GAME_PAGE_URL, m1[1]);
  // Fallback: any exptkt *.pdf on the JTP page that looks like the history
  const m2 = html.match(/<a[^>]+href="([^"]*\/exptkt\/[^"]*jtp[^"]*\.pdf[^"]*)"[^>]*>/i);
  if (m2?.[1]) return absolutize(GAME_PAGE_URL, m2[1]);
  return null;
}
async function fetchPdfBytes(url: string): Promise<Uint8Array> {
  const res = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS), headers: BASE_HEADERS });
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
  return new Uint8Array(await res.arrayBuffer());
}

// ---------- date & number parsing ----------
function toISO(dateLike: string): string | null {
  let m = dateLike.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
  if (m) {
    const [, mm, dd, yy] = m;
    const y = yy.length === 2 ? (Number(yy) >= 80 ? 1900 + Number(yy) : 2000 + Number(yy)) : Number(yy);
    const d = new Date(Date.UTC(y, Number(mm) - 1, Number(dd)));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
  }
  m = dateLike.match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ,](\d{4})$/);
  if (m) {
    const [, dd, mon, yyyy] = m;
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const idx = months.indexOf(mon.toUpperCase());
    if (idx >= 0) {
      const d = new Date(Date.UTC(Number(yyyy), idx, Number(dd)));
      return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
  }
  m = dateLike.match(/^([A-Za-z]{3})[ ](\d{1,2}),[ ](\d{4})$/);
  if (m) {
    const [, mon, dd, yyyy] = m;
    const months = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
    const idx = months.indexOf(mon.toUpperCase());
    if (idx >= 0) {
      const d = new Date(Date.UTC(Number(yyyy), idx, Number(dd)));
      return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
  }
  return null;
}
function isIntToken(s: string) { return /^\d{1,2}$/.test(s); }
function within6of46Distinct(nums: number[]): boolean {
  return nums.length === 6 &&
    nums.every((n) => Number.isInteger(n) && n >= 1 && n <= 46) &&
    new Set(nums).size === 6;
}

// ---------- structure-aware extraction (like fl_lotto, but no tags) ----------
type Cell = { str: string; x: number; y: number; kind: "num" | "date" | "noise" };

async function extractCells(buf: Uint8Array): Promise<Cell[]> {
  const pdfjsLib: any = await import("pdfjs-dist/legacy/build/pdf.mjs");

  // Robust standard_fonts resolution (Windows/CI friendly)
  const pkgPath = requireCJS.resolve("pdfjs-dist/package.json");
  const rootDir = path.dirname(pkgPath);
  const candidates = [
    path.join(rootDir, "standard_fonts"),
    path.join(rootDir, "legacy", "build", "standard_fonts"),
  ];
  let stdFontsDirFs: string | null = null;
  for (const p of candidates) {
    try {
      const st = await fs.stat(p);
      if (st.isDirectory()) { stdFontsDirFs = p; break; }
    } catch {}
  }
  const stdFontsDirUrl = stdFontsDirFs ? String(pathToFileURL(stdFontsDirFs)) + "/" : undefined;

  const loadingTask = pdfjsLib.getDocument({
    data: buf,
    disableWorker: true,
    ...(stdFontsDirUrl ? { standardFontDataUrl: stdFontsDirUrl } : {}),
  });
  const pdf = await loadingTask.promise;

  const cells: Cell[] = [];
  const DROP = [
    /^FLORIDA\s+LOTTERY\b/i,
    /^Winning Numbers History$/i,
    /^Page \d+ of \d+$/i,
    /^Please note every effort/i,
    /^JACKPOT\s+TRIPLE\s+PLAY$/i,
    /^-+$/ // hyphen runs / rules / column marks that sometimes show up
  ];
  const DATE_RE = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|[A-Za-z]{3}\s+\d{1,2},\s*\d{4}|\d{1,2}[- ][A-Za-z]{3}[- ,]\d{4})\b/i;

  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();

    for (const it of tc.items as any[]) {
      const s = String(it?.str ?? "").trim();
      if (!s) continue;
      const [, , , , e, f] = it?.transform || [0, 0, 0, 0, 0, 0];
      const x = e ?? 0, y = f ?? 0;

      if (DROP.some((re) => re.test(s))) continue;

      let kind: Cell["kind"] = "noise";
      if (DATE_RE.test(s)) kind = "date";
      else if (isIntToken(s) && Number(s) >= 1 && Number(s) <= 46) kind = "num";

      // Ignore stray tokens like multipliers, etc. (not expected in JTP history)
      if (/^X[2-9]$/i.test(s)) continue;

      cells.push({ str: s, x, y, kind });
    }
  }
  return cells;
}

type Labeled = { cx: number; type: "num"|"date"|"noise"; items: Cell[] };

function groupColumns(cells: Cell[]) {
  // cluster x into column centers
  const xs = [...new Set(cells.map(c => Math.round(c.x)))].sort((a,b)=>a-b);
  const groups: number[][] = [];
  for (const x of xs) {
    const g = groups[groups.length-1];
    if (!g || Math.abs(g[g.length-1] - x) > 12) groups.push([x]);
    else g.push(x);
  }
  const colCenters = groups.map(g => Math.round(g.reduce((a,b)=>a+b,0)/g.length)).sort((a,b)=>a-b);

  const colMap: Record<number, Cell[]> = {};
  for (const c of cells) {
    let best = colCenters[0], bd = Infinity;
    for (const cx of colCenters) {
      const d = Math.abs(cx - c.x);
      if (d < bd) { bd = d; best = cx; }
    }
    (colMap[best] ||= []).push(c);
  }

  const labeled: Labeled[] = Object.entries(colMap).map(([cx, arr]) => {
    const counts = { num:0, date:0, noise:0 };
    for (const c of arr) counts[c.kind as "num"|"date"|"noise"]++;
    let type: Labeled["type"] = "noise", max = -1;
    (Object.keys(counts) as (keyof typeof counts)[]).forEach(k => {
      if (counts[k] > max) { max = counts[k]; type = k as any; }
    });
    return { cx: Number(cx), type, items: arr.sort((a,b)=> b.y - a.y) };
  }).sort((a,b)=> a.cx - b.cx);

  // split into panes using the largest gap between numeric columns (same idea as fl_lotto)
  const numColsAll = labeled.filter(c => c.type === "num").sort((a,b)=> a.cx - b.cx);
  const dateColsAll = labeled.filter(c => c.type === "date").sort((a,b)=> a.cx - b.cx);

  if (numColsAll.length < 8) {
    return { panes: [{
      numCols: numColsAll,
      dateCol: dateColsAll.length ? dateColsAll[0] : null,
    }]};
  }

  const gaps = [];
  for (let i=0;i<numColsAll.length-1;i++) gaps.push({ i, gap: numColsAll[i+1].cx - numColsAll[i].cx });
  gaps.sort((a,b)=> b.gap - a.gap);
  const split = gaps[0].i;
  const GAP_MIN = 40;
  if (gaps[0].gap < GAP_MIN) {
    return { panes: [{
      numCols: numColsAll,
      dateCol: dateColsAll.length ? dateColsAll[dateColsAll.length-1] : null,
    }]};
  }

  const leftNums  = numColsAll.slice(0, split+1);
  const rightNums = numColsAll.slice(split+1);
  const mean = (arr: Labeled[]) => arr.reduce((a,c)=>a+c.cx,0)/arr.length;
  const leftMean  = mean(leftNums);
  const rightMean = mean(rightNums);

  const nearest = (cols: Labeled[], targetX: number|null) => {
    if (!cols.length || targetX == null) return null;
    return cols.reduce((best, c) =>
      (!best || Math.abs(c.cx - targetX) < Math.abs(best.cx - targetX)) ? c : best, null as Labeled|null);
  };

  const leftDate  = nearest(dateColsAll, leftMean);
  const rightDate = nearest(dateColsAll, rightMean);

  return {
    panes: [
      { numCols: leftNums,  dateCol: leftDate  },
      { numCols: rightNums, dateCol: rightDate },
    ]
  };
}

type Row = { y: number; dateISO: string; nums: number[] };

function buildRows(cells: Cell[]): Row[] {
  const { panes } = groupColumns(cells);
  const Y_TOL = 5.5;
  const allRows: Row[] = [];

  for (const pane of panes) {
    const { dateCol } = pane;
    let numCols = [...pane.numCols].sort((a,b)=> a.cx - b.cx);
    if (numCols.length >= 6) numCols = numCols.slice(0,6);
    if (!dateCol || numCols.length < 6) continue;

    for (const d of (dateCol.items || [])) {
      const dateISO = toISO(d.str);
      if (!dateISO) continue;

      const nums: number[] = [];
      for (const col of numCols) {
        const near = col.items.find(it => it.kind === "num" && Math.abs(it.y - d.y) <= Y_TOL);
        if (!near) { nums.length = 0; break; }
        nums.push(Number(near.str));
      }
      if (!nums.length || !within6of46Distinct(nums)) continue;
      allRows.push({ y: d.y, dateISO, nums });
    }
  }
  return allRows;
}

// ---------- Public parsing flow ----------
type Parsed = { dateISO: string; values: number[] };

async function parsePdfStructured(buf: Uint8Array): Promise<Parsed[]> {
  const cells = await extractCells(buf);
  const rows = buildRows(cells);

  // de-dupe by date (just in case multi-page overlaps)
  const byDate = new Map<string, Parsed>();
  for (const r of rows) byDate.set(r.dateISO, { dateISO: r.dateISO, values: r.nums });
  return [...byDate.values()];
}

async function loadPdfBuffer(localPath?: string): Promise<Uint8Array> {
  const local = (localPath ?? process.env.FL_JTP_PDF_PATH)?.trim();
  if (local) return new Uint8Array(await fs.readFile(path.resolve(local)));

  const envUrl = process.env.FL_JTP_PDF_URL?.trim();
  if (envUrl) return await fetchPdfBytes(envUrl);

  try {
    return await fetchPdfBytes(PDF_URL);
  } catch {
    const discovered = await resolvePdfUrlFromGamePage();
    if (!discovered) throw new Error("Could not discover Jackpot Triple Play PDF URL");
    return await fetchPdfBytes(discovered);
  }
}

function makeCsvLine(dateISO: string, vals: number[]): string {
  const [n1, n2, n3, n4, n5, n6] = vals;
  // put the 6th main in `special` to match your existing CSV schema
  return `${dateISO},${n1},${n2},${n3},${n4},${n5},${n6}\n`;
}

/** Public API: writes canonical CSV to public/data/fl/jackpot_triple_play.csv (unless overridden). */
export async function buildFloridaJtpCsv(outRelPath = "public/data/fl/jackpot_triple_play.csv", localPdfPath?: string) {
  const outPath = path.isAbsolute(outRelPath) ? outRelPath : path.resolve(process.cwd(), outRelPath);
  await fs.mkdir(path.dirname(outPath), { recursive: true });

  const buf = await loadPdfBuffer(localPdfPath);
  const parsed = await parsePdfStructured(buf);

  const base = parsed.filter((r) => r.dateISO >= ERA_START);
  const lines = base
    .map((r) => makeCsvLine(r.dateISO, r.values))
    .sort((a, b) => a.slice(0, 10).localeCompare(b.slice(0, 10)));

  await fs.writeFile(outPath, HEADER + lines.join(""), "utf8");
  console.log(`[FL JTP] Wrote ${base.length} draws (since ${ERA_START}) to: ${outPath}`);
}

// ---------- CLI ----------
if (typeof process !== "undefined" && process.argv && process.argv[1]) {
  const thisFile = path.resolve(fileURLToPath(import.meta.url));
  const invoked = path.resolve(process.argv[1]);
  if (thisFile === invoked) {
    const maybeLocal = process.argv[2]; // optional local file path
    buildFloridaJtpCsv(undefined, maybeLocal).catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
  }
}
