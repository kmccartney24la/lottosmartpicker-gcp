// scripts/sources/fl_lotto.ts
// Node 18+ ESM. Deps: pdfjs-dist.
// Parses the official FLORIDA LOTTO PDF (multi-column layout) into canonical CSV
// where the 6th main lives in `special`.
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
const requireCJS = createRequire(import.meta.url);
const PDF_URL = process.env.FL_LOTTO_PDF_URL
    ?? "https://files.floridalottery.com/exptkt/l6.pdf";
const HEADER = "draw_date,num1,num2,num3,num4,num5,special\n";
const ERA_START = "1999-10-24";
const CACHE_DIR = ".cache/fl";
const TEXT_CACHE = path.join(CACHE_DIR, "lotto_l6.txt");
const BASE_HEADERS = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
};
const GAME_PAGE_URL = "https://floridalottery.com/games/draw-games/florida-lotto";
const HTTP_TIMEOUT_MS = Number(process.env.FL_HTTP_TIMEOUT_MS ?? 20000);
// ---------- helpers ----------
function absolutize(base, href) {
    try {
        return new URL(href, base).toString();
    }
    catch {
        return href;
    }
}
async function fetchText(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS), headers: BASE_HEADERS });
    if (!res.ok)
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.text();
}
async function resolvePdfUrlFromGamePage() {
    const html = await fetchText(GAME_PAGE_URL);
    const m1 = html.match(/<a[^>]+href="([^"]+l6\.pdf[^"]*)"[^>]*>(?:\s*Winning\s+Number\s+History\s*)<\/a>/i);
    if (m1?.[1])
        return absolutize(GAME_PAGE_URL, m1[1]);
    const m2 = html.match(/<a[^>]+href="([^"]*\/exptkt\/l6\.pdf[^"]*)"[^>]*>/i);
    if (m2?.[1])
        return absolutize(GAME_PAGE_URL, m2[1]);
    const m3 = html.match(/<a[^>]+href="([^"]*\/exptkt\/[^"]*\.pdf[^"]*)"[^>]*>/i);
    if (m3?.[1])
        return absolutize(GAME_PAGE_URL, m3[1]);
    return null;
}
async function fetchPdfBytes(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS), headers: BASE_HEADERS });
    if (!res.ok)
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return new Uint8Array(await res.arrayBuffer());
}
// ---------- date parsing ----------
function toISO(dateLike) {
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
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const idx = months.indexOf(mon.toUpperCase());
        if (idx >= 0) {
            const d = new Date(Date.UTC(Number(yyyy), idx, Number(dd)));
            return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
        }
    }
    m = dateLike.match(/^([A-Za-z]{3})[ ](\d{1,2}),[ ](\d{4})$/);
    if (m) {
        const [, mon, dd, yyyy] = m;
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const idx = months.indexOf(mon.toUpperCase());
        if (idx >= 0) {
            const d = new Date(Date.UTC(Number(yyyy), idx, Number(dd)));
            return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
        }
    }
    return null;
}
function isIntToken(s) {
    return /^\d{1,2}$/.test(s);
}
function within6of53Distinct(nums) {
    return nums.length === 6 &&
        nums.every((n) => Number.isInteger(n) && n >= 1 && n <= 53) &&
        new Set(nums).size === 6;
}
async function extractCells(buf) {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    // --- NEW: robust standard_fonts resolution (works on Windows & Cloud Run)
    const pkgPath = requireCJS.resolve("pdfjs-dist/package.json");
    const rootDir = path.dirname(pkgPath);
    const candidates = [
        path.join(rootDir, "standard_fonts"), // pdfjs >=4 root
        path.join(rootDir, "legacy", "build", "standard_fonts"), // some builds/installers
    ];
    let stdFontsDirFs = null;
    for (const p of candidates) {
        try {
            const st = await fs.stat(p);
            if (st.isDirectory()) {
                stdFontsDirFs = p;
                break;
            }
        }
        catch { }
    }
    const stdFontsDirUrl = stdFontsDirFs ? String(pathToFileURL(stdFontsDirFs)) + "/" : undefined;
    const loadingTask = pdfjsLib.getDocument({
        data: buf,
        disableWorker: true,
        // If fonts dir couldn’t be found, omit this field; pdfjs will warn but still extract text.
        ...(stdFontsDirUrl ? { standardFontDataUrl: stdFontsDirUrl } : {}),
    });
    const pdf = await loadingTask.promise;
    // --- end: loader
    const cells = [];
    const DROP = [
        /^FLORIDA\s+LOTTERY\b/i,
        /^Winning Numbers History$/i,
        /^Page \d+ of \d+$/i,
        /^Please note every effort/i,
        /^LOTTO$/i, /^LOTTO\s*DP$/i, // we keep tags elsewhere
        /^-+$/ // column separators sometimes render as hyphen runs
    ];
    const DATE_RE = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|[A-Za-z]{3}\s+\d{1,2},\s*\d{4}|\d{1,2}[- ][A-Za-z]{3}[- ,]\d{4})\b/i;
    for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent();
        for (const it of tc.items) {
            const s = String(it?.str ?? "").trim();
            if (!s)
                continue;
            const [, , , , e, f] = it?.transform || [0, 0, 0, 0, 0, 0];
            const x = e ?? 0, y = f ?? 0;
            if (DROP.some((re) => re.test(s)))
                continue;
            let kind = "noise";
            if (/^LOTTO(?:\s*DP)?$/i.test(s))
                kind = "tag";
            else if (DATE_RE.test(s))
                kind = "date";
            else if (isIntToken(s) && Number(s) >= 1 && Number(s) <= 53)
                kind = "num";
            // Ignore multiplier singletons like X2, X3, etc.
            if (/^X[2-5]$/i.test(s))
                continue;
            cells.push({ str: s, x, y, kind });
        }
    }
    return cells;
}
/** Group X positions into vertical columns */
/** Group columns into left/right panes using X gaps, then label each pane's columns */
function groupColumns(cells) {
    // cluster by x within ~12 units to get raw column centers
    const xs = [...new Set(cells.map(c => Math.round(c.x)))].sort((a, b) => a - b);
    const groups = [];
    for (const x of xs) {
        const g = groups[groups.length - 1];
        if (!g || Math.abs(g[g.length - 1] - x) > 12)
            groups.push([x]);
        else
            g.push(x);
    }
    const colCenters = groups.map(g => Math.round(g.reduce((a, b) => a + b, 0) / g.length)).sort((a, b) => a - b);
    // assign cells to nearest center
    const colMap = {};
    for (const c of cells) {
        let best = colCenters[0], bd = Infinity;
        for (const cx of colCenters) {
            const d = Math.abs(cx - c.x);
            if (d < bd) {
                bd = d;
                best = cx;
            }
        }
        (colMap[best] ||= []).push(c);
    }
    const labeled = Object.entries(colMap).map(([cx, arr]) => {
        const counts = { num: 0, date: 0, tag: 0, noise: 0 };
        for (const c of arr)
            counts[c.kind]++;
        let type = "noise", max = -1;
        Object.keys(counts).forEach(k => {
            if (counts[k] > max) {
                max = counts[k];
                type = k;
            }
        });
        return { cx: Number(cx), type, items: arr.sort((a, b) => b.y - a.y) };
    }).sort((a, b) => a.cx - b.cx);
    // --- NEW: split into two panes by the largest X gap between numeric columns
    const numColsAll = labeled.filter(c => c.type === "num").sort((a, b) => a.cx - b.cx);
    // If we don't have enough numeric columns to split, return single pane
    if (numColsAll.length < 8) {
        const dateCols = labeled.filter(c => c.type === "date").sort((a, b) => a.cx - b.cx);
        const tagCols = labeled.filter(c => c.type === "tag").sort((a, b) => a.cx - b.cx);
        return {
            panes: [{
                    numCols: numColsAll,
                    dateCol: dateCols.length ? dateCols[0] : null,
                    tagCol: tagCols.length ? tagCols[tagCols.length - 1] : null,
                }]
        };
    }
    // find largest gap
    const gaps = [];
    for (let i = 0; i < numColsAll.length - 1; i++) {
        gaps.push({ i, gap: numColsAll[i + 1].cx - numColsAll[i].cx });
    }
    // a conservative split threshold; panes are clearly separated by ~60–120 units typically
    gaps.sort((a, b) => b.gap - a.gap);
    const split = gaps[0].i;
    const GAP_MIN = 40; // if largest gap is tiny, avoid splitting
    if (gaps[0].gap < GAP_MIN) {
        const dateCols = labeled.filter(c => c.type === "date").sort((a, b) => a.cx - b.cx);
        const tagCols = labeled.filter(c => c.type === "tag").sort((a, b) => a.cx - b.cx);
        return {
            panes: [{
                    numCols: numColsAll,
                    dateCol: dateCols.length ? dateCols[dateCols.length - 1] : null,
                    tagCol: tagCols.length ? tagCols[tagCols.length - 1] : null,
                }]
        };
    }
    const leftNums = numColsAll.slice(0, split + 1);
    const rightNums = numColsAll.slice(split + 1);
    // Assign date/tag columns to the nearest pane by X distance to pane means
    const mean = (arr) => arr.reduce((a, c) => a + c.cx, 0) / arr.length;
    const leftMean = mean(leftNums);
    const rightMean = mean(rightNums);
    const dateColsAll = labeled.filter(c => c.type === "date");
    const tagColsAll = labeled.filter(c => c.type === "tag");
    const nearest = (cols, targetX) => {
        if (!cols.length || targetX == null)
            return null;
        return cols.reduce((best, c) => (!best || Math.abs(c.cx - targetX) < Math.abs(best.cx - targetX)) ? c : best, null);
    };
    const leftDate = nearest(dateColsAll, leftMean);
    const rightDate = nearest(dateColsAll, rightMean);
    const leftTag = nearest(tagColsAll, leftMean);
    const rightTag = nearest(tagColsAll, rightMean);
    return {
        panes: [
            { numCols: leftNums, dateCol: leftDate, tagCol: leftTag },
            { numCols: rightNums, dateCol: rightDate, tagCol: rightTag },
        ]
    };
}
function buildRows(cells) {
    const { panes } = groupColumns(cells);
    if (process.env.DEBUG_FL_LOTTO) {
        const summarize = (p, i) => `pane${i}: nums=[${p.numCols.map((c) => c.cx).join(',')}], date=${p.dateCol ? p.dateCol.cx : 'none'}, tag=${p.tagCol ? p.tagCol.cx : 'none'}`;
        console.log("[FL LOTTO] panes:", panes.map(summarize).join(" | "));
    }
    const Y_TOL = 5.5;
    const allRows = [];
    for (const pane of panes) {
        const { dateCol, tagCol } = pane;
        let numCols = [...pane.numCols].sort((a, b) => a.cx - b.cx);
        // Keep exactly 6 numeric columns per pane (left→right).
        if (numCols.length >= 6)
            numCols = numCols.slice(0, 6);
        if (!dateCol || numCols.length < 6)
            continue;
        for (const d of (dateCol.items || [])) {
            const dateISO = toISO(d.str);
            if (!dateISO)
                continue;
            const nums = [];
            for (const col of numCols) {
                const near = col.items.find(it => it.kind === "num" && Math.abs(it.y - d.y) <= Y_TOL);
                if (!near) {
                    nums.length = 0;
                    break;
                }
                nums.push(Number(near.str));
            }
            if (!nums.length || !within6of53Distinct(nums))
                continue;
            let tag = "UNKNOWN";
            if (tagCol) {
                const t = tagCol.items.find(it => it.kind === "tag" && Math.abs(it.y - d.y) <= Y_TOL);
                if (t)
                    tag = /DP/i.test(t.str) ? "DP" : "LOTTO";
            }
            allRows.push({ y: d.y, dateISO, nums, tag });
        }
    }
    return allRows;
}
async function parsePdfStructured(buf) {
    const cells = await extractCells(buf);
    const rows = buildRows(cells);
    // dedupe by date (prefer LOTTO)
    const byDate = new Map();
    const rank = (x) => (x === "LOTTO" ? 2 : x === "UNKNOWN" ? 1 : 0);
    for (const r of rows) {
        const rec = { dateISO: r.dateISO, values: r.nums, tag: r.tag ?? "UNKNOWN" };
        const prev = byDate.get(r.dateISO);
        if (!prev || rank(rec.tag) > rank(prev.tag))
            byDate.set(r.dateISO, rec);
    }
    return [...byDate.values()];
}
async function loadPdfBuffer(localPath) {
    const local = (localPath ?? process.env.FL_LOTTO_PDF_PATH)?.trim();
    if (local)
        return new Uint8Array(await fs.readFile(path.resolve(local)));
    const envUrl = process.env.FL_LOTTO_PDF_URL?.trim();
    if (envUrl)
        return await fetchPdfBytes(envUrl);
    try {
        return await fetchPdfBytes(PDF_URL);
    }
    catch {
        const discovered = await resolvePdfUrlFromGamePage();
        if (!discovered)
            throw new Error("Could not discover Florida Lotto PDF URL");
        return await fetchPdfBytes(discovered);
    }
}
function makeCsvLine(dateISO, vals) {
    const [n1, n2, n3, n4, n5, n6] = vals;
    return `${dateISO},${n1},${n2},${n3},${n4},${n5},${n6}\n`;
}
/** Public API: writes canonical CSV to public/data/fl/lotto.csv (unless overridden). */
export async function buildFloridaLottoCsv(outRelPath = "public/data/fl/lotto.csv", localPdfPath) {
    const outPath = path.isAbsolute(outRelPath) ? outRelPath : path.resolve(process.cwd(), outRelPath);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    // cache raw text is no longer used; keep a minimal cache of parsed rows if you want.
    const buf = await loadPdfBuffer(localPdfPath);
    const parsed = await parsePdfStructured(buf);
    const base = parsed.filter((r) => r.tag !== "DP" && r.dateISO >= ERA_START);
    const lines = base
        .map((r) => makeCsvLine(r.dateISO, r.values))
        .sort((a, b) => a.slice(0, 10).localeCompare(b.slice(0, 10)));
    await fs.writeFile(outPath, HEADER + lines.join(""), "utf8");
    console.log(`[FL LOTTO] Wrote ${base.length} draws (since ${ERA_START}) to: ${outPath}`);
}
// ---------- CLI ----------
if (typeof process !== "undefined" && process.argv && process.argv[1]) {
    const thisFile = path.resolve(fileURLToPath(import.meta.url));
    const invoked = path.resolve(process.argv[1]);
    if (thisFile === invoked) {
        const maybeLocal = process.argv[2]; // optional local file path
        buildFloridaLottoCsv(undefined, maybeLocal).catch((e) => {
            console.error(e);
            process.exitCode = 1;
        });
    }
}
