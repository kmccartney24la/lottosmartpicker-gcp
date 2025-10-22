// scripts/sources/fl_pick3.ts
// Node 18+ ESM. Deps: pdfjs-dist.
// Parses the official FL Pick 3 PDF (three-pane layout) into two CSVs:
//   • public/data/fl/pick3_midday.csv
//   • public/data/fl/pick3_evening.csv
//
// Diagnostics (enable with FL_P3_DEBUG=1):
//  - Per-page summary: page, col counts, rows built/skipped, retry softening
//  - Pane split points (centers), pane bounds (min/max X)
//  - Skip reasons per session token
//  - Date normalization histogram (post-2020)
//  - Optional debug CSV of tokens: public/data/fl/pick3_debug.csv
//
// Env overrides:
//   FL_P3_PDF_PATH  → local PDF path (bypasses network)
//   FL_P3_PDF_URL   → direct PDF URL
//   FL_HTTP_TIMEOUT_MS → fetch timeout (ms)
//   FL_P3_DEBUG     → any truthy value enables verbose debug
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createRequire } from "node:module";
import * as fsSync from "node:fs";
const requireCJS = createRequire(import.meta.url);
const GAME_PAGE_URL = "https://floridalottery.com/games/draw-games/pick-3";
const PDF_URL_DEFAULT = "https://files.floridalottery.com/exptkt/p3.pdf";
const HTTP_TIMEOUT_MS = Number(process.env.FL_HTTP_TIMEOUT_MS ?? 20000);
const OUT_MIDDAY = "public/data/fl/pick3_midday.csv";
const OUT_EVENING = "public/data/fl/pick3_evening.csv";
const DEBUG_OUT = "public/data/fl/pick3_debug.csv";
const HEADER = "draw_date,ball1,ball2,ball3,fb\n"; // fb optional; blank when absent
const ENABLE_DEBUG = String(process.env.FL_P3_DEBUG ?? "").trim() !== "";
const DIGITS_PER_DRAW = 3; // ← Pick 3 key
// ---------- helpers ----------
const BASE_HEADERS = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
};
function absolutize(base, href) {
    try {
        return new URL(href, base).toString();
    }
    catch {
        return href;
    }
}
function resolveStandardFontsUrl() {
    try {
        const pdfMjsPath = requireCJS.resolve("pdfjs-dist/legacy/build/pdf.mjs");
        const buildDir = path.dirname(pdfMjsPath);
        const cand1 = path.join(buildDir, "standard_fonts");
        if (fsSync.existsSync(cand1))
            return String(pathToFileURL(cand1)) + "/";
        const pkgPath = requireCJS.resolve("pdfjs-dist/package.json");
        const rootDir = path.dirname(pkgPath);
        const cand2 = path.join(rootDir, "legacy", "build", "standard_fonts");
        if (fsSync.existsSync(cand2))
            return String(pathToFileURL(cand2)) + "/";
        const cand3 = path.join(rootDir, "standard_fonts");
        if (fsSync.existsSync(cand3))
            return String(pathToFileURL(cand3)) + "/";
    }
    catch { }
    return undefined;
}
async function fetchText(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS), headers: BASE_HEADERS });
    if (!res.ok)
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return await res.text();
}
async function resolvePdfUrlFromGamePage() {
    const html = await fetchText(GAME_PAGE_URL);
    const m1 = html.match(/<a[^>]+href="([^"]*p3\.pdf[^"]*)"[^>]*>(?:\s*Winning\s+Number\s+History\s*)<\/a>/i);
    if (m1?.[1])
        return absolutize(GAME_PAGE_URL, m1[1]);
    const m2 = html.match(/<a[^>]+href="([^"]*\/exptkt\/[^"]*p3[^"]*\.pdf[^"]*)"[^>]*>/i);
    if (m2?.[1])
        return absolutize(GAME_PAGE_URL, m2[1]);
    return null;
}
async function fetchPdfBytes(url) {
    const res = await fetch(url, { signal: AbortSignal.timeout(HTTP_TIMEOUT_MS), headers: BASE_HEADERS });
    if (!res.ok)
        throw new Error(`HTTP ${res.status} ${res.statusText}`);
    return new Uint8Array(await res.arrayBuffer());
}
async function loadPdfBuffer(localPath) {
    const local = (localPath ?? process.env.FL_P3_PDF_PATH)?.trim();
    if (local)
        return new Uint8Array(await fs.readFile(path.resolve(local)));
    const envUrl = process.env.FL_P3_PDF_URL?.trim();
    if (envUrl)
        return await fetchPdfBytes(envUrl);
    try {
        return await fetchPdfBytes(PDF_URL_DEFAULT);
    }
    catch {
        const discovered = await resolvePdfUrlFromGamePage();
        if (!discovered)
            throw new Error("Could not discover Florida Pick 3 PDF URL");
        return await fetchPdfBytes(discovered);
    }
}
// ---------- token classification ----------
function normalizeDashes(s) {
    return s.replace(/[\u2010\u2011\u2012\u2013\u2014\u2212]/g, "-");
}
function toISO(dateLikeRaw) {
    const dateLike = normalizeDashes(dateLikeRaw).replace(/\s+/g, " ").trim();
    // 10/14/25, 10-14-2025
    let m = dateLike.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2}|\d{4})$/);
    if (m) {
        const [, mm, dd, yy] = m;
        const y = yy.length === 2 ? (Number(yy) >= 80 ? 1900 + Number(yy) : 2000 + Number(yy)) : Number(yy);
        const d = new Date(Date.UTC(y, Number(mm) - 1, Number(dd)));
        return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
    }
    // 14-OCT-2025 or 14 OCT 2025 (no comma)
    m = dateLike.match(/^(\d{1,2})[- ]([A-Za-z]{3})[- ,]?(\d{4})$/);
    if (m) {
        const [, dd, mon, yyyy] = m;
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const idx = months.indexOf(mon.toUpperCase());
        if (idx >= 0) {
            const d = new Date(Date.UTC(Number(yyyy), idx, Number(dd)));
            return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
        }
    }
    // Oct 14, 2025  / OCT 14 2025 (comma optional)
    m = dateLike.match(/^([A-Za-z]{3})[ ](\d{1,2}),?[ ](\d{4})$/);
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
function coerceSingleDigit(s) {
    const s2 = normalizeDashes(s);
    const m = s2.match(/^\s*-?\s*([0-9])\s*-?\s*$/);
    return m ? m[1] : null;
}
function isDigitToken(s) { return coerceSingleDigit(s) !== null; }
function isSessionToken(s) {
    const t = s.replace(/\u00A0/g, " ").trim();
    return /^\s*[EM]\s*:?\s*$/i.test(t);
}
// small helpers
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
function median(nums) {
    if (!nums.length)
        return 0;
    const a = nums.slice().sort((x, y) => x - y);
    const m = Math.floor(a.length / 2);
    return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}
async function extractCells(buf) {
    const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const stdFontsDirUrl = resolveStandardFontsUrl();
    if (ENABLE_DEBUG)
        console.log("[pdfjs] standardFontDataUrl =", stdFontsDirUrl ?? "(unset)");
    const loadingTask = pdfjsLib.getDocument({
        data: buf,
        disableWorker: true,
        ...(stdFontsDirUrl ? { standardFontDataUrl: stdFontsDirUrl } : {}),
    });
    const pdf = await loadingTask.promise;
    const DATE_RE = /\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|[A-Za-z]{3}\s+\d{1,2},?\s*\d{4}|\d{1,2}[- ][A-Za-z]{3}[- ,]?\d{4})\b/;
    const DROP = [
        /^FLORIDA\s+LOTTERY\b/i,
        /^Winning Numbers History$/i,
        /^Page \d+ of \d+$/i,
        /^Please note every effort/i,
        /^PICK\s*3$/i, // ← adjust
        /^E:\s*Evening/i, /^M:\s*Midday/i,
        /^-+$/,
    ];
    const cells = [];
    for (let p = 1; p <= pdf.numPages; p++) {
        const page = await pdf.getPage(p);
        const tc = await page.getTextContent({
            disableCombineTextItems: true,
            includeMarkedContent: true,
        });
        for (const it of tc.items) {
            const raw = String(it?.str ?? "");
            const s0 = raw.trim();
            if (!s0)
                continue;
            if (DROP.some((re) => re.test(s0)))
                continue;
            const [, , , , e, f] = it?.transform || [0, 0, 0, 0, 0, 0];
            const x = e ?? 0, y = f ?? 0;
            const s = s0;
            // Combined "FB 8" glyph run => split it
            const fbCombo = s.match(/^FB\s*([0-9])$/i);
            if (fbCombo) {
                cells.push({ str: "FB", x, y, kind: "fbtag", page: p });
                cells.push({ str: fbCombo[1], x: x + 6, y, kind: "digit", page: p });
                continue;
            }
            let kind = "noise";
            if (DATE_RE.test(s))
                kind = "date";
            else if (isSessionToken(s))
                kind = "session";
            else if (/^FB:?\s*$/i.test(s))
                kind = "fbtag";
            else {
                const d = coerceSingleDigit(s);
                if (d !== null) {
                    kind = "digit";
                    cells.push({ str: d, x, y, kind, page: p });
                    continue;
                }
            }
            cells.push({ str: s, x, y, kind, page: p });
        }
        const totalItems = tc.items.length;
        console.log(`[pdfjs] page ${p}: textItems=${totalItems}, classifiedCells=${cells.filter(c => c.page === p).length}`);
        if (p === 1) {
            const preview = tc.items.slice(0, 25).map(it => {
                const raw = String(it?.str ?? "");
                const s0 = raw.trim();
                const [, , , , e, f] = it?.transform || [0, 0, 0, 0, 0, 0];
                const x = Math.round(e ?? 0), y = Math.round(f ?? 0);
                let k = "noise";
                if (/\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|[A-Za-z]{3}\s+\d{1,2},?\s*\d{4}|\d{1,2}[- ][A-Za-z]{3}[- ,]?\d{4})\b/.test(s0))
                    k = "date";
                else if (/^[EM]$/i.test(s0))
                    k = "session";
                else if (/^FB$/i.test(s0) || /^FB\s*[0-9]$/i.test(s0))
                    k = "fb";
                else if (/^\s*[0-9]\s*(?:[-–—])?\s*$/.test(s0))
                    k = "digit";
                return `${k}@(${x},${y})="${s0.slice(0, 30)}"`;
            });
            console.log(`[pdfjs] page 1 preview: ${preview.join(" | ")}`);
        }
    }
    if (ENABLE_DEBUG) {
        const byKind = cells.reduce((m, c) => (m[c.kind] = (m[c.kind] || 0) + 1, m), {});
        console.log("[debug] token counts by kind:", byKind);
    }
    return cells;
}
function kmeans1D(centers, k = 3, maxIter = 20) {
    if (centers.length <= k)
        return centers.slice();
    const sorted = centers.slice().sort((a, b) => a - b);
    const inits = [sorted[Math.floor(sorted.length * 1 / 6)], sorted[Math.floor(sorted.length * 3 / 6)], sorted[Math.floor(sorted.length * 5 / 6)]];
    let mu = inits.slice(0, k);
    for (let it = 0; it < maxIter; it++) {
        const buckets = Array.from({ length: k }, () => []);
        for (const v of centers) {
            let bi = 0, bd = Infinity;
            for (let i = 0; i < k; i++) {
                const d = Math.abs(v - mu[i]);
                if (d < bd) {
                    bd = d;
                    bi = i;
                }
            }
            buckets[bi].push(v);
        }
        let changed = false;
        for (let i = 0; i < k; i++) {
            if (buckets[i].length === 0)
                continue;
            const m = Math.round(buckets[i].reduce((a, b) => a + b, 0) / buckets[i].length);
            if (m !== mu[i]) {
                mu[i] = m;
                changed = true;
            }
        }
        if (!changed)
            break;
    }
    return mu.slice(0, k).sort((a, b) => a - b);
}
function labelColumns(cells, xGroupEpsHint) {
    const xs = [...new Set(cells.map(c => Math.round(c.x)))].sort((a, b) => a - b);
    const gaps = [];
    for (let i = 1; i < xs.length; i++)
        gaps.push(xs[i] - xs[i - 1]);
    const medGap = gaps.length ? median(gaps) : 16;
    const xGroupEps = Math.max(4, Math.min(10, Math.round(medGap * 0.55)));
    const eps = Math.min(xGroupEps, Math.max(4, Math.round(xGroupEpsHint)));
    const groups = [];
    for (const x of xs) {
        const g = groups[groups.length - 1];
        if (!g || Math.abs(g[g.length - 1] - x) > eps)
            groups.push([x]);
        else
            g.push(x);
    }
    const colCenters = groups.map(g => Math.round(g.reduce((a, b) => a + b, 0) / g.length)).sort((a, b) => a - b);
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
        const hasDate = arr.some(c => c.kind === "date");
        const hasSess = arr.some(c => c.kind === "session");
        const hasFBTag = arr.some(c => c.kind === "fbtag");
        const hasDigit = arr.some(c => c.kind === "digit");
        let type = "noise";
        if (hasDate)
            type = "date";
        else if (hasSess)
            type = "session";
        else if (hasFBTag)
            type = "fbtag";
        else if (hasDigit)
            type = "digit";
        return { cx: Number(cx), type, items: arr.sort((a, b) => b.y - a.y) };
    }).sort((a, b) => a.cx - b.cx);
    return labeled;
}
function splitInto3Panes(cols, _ignoredGapMin = 35) {
    const core = cols.filter(c => c.type !== "noise").sort((a, b) => a.cx - b.cx);
    if (core.length === 0)
        return [];
    // Prefer date anchors
    const dateCenters = core.filter(c => c.type === "date").map(c => c.cx).sort((a, b) => a - b);
    const uniqDates = [...new Set(dateCenters)];
    let anchors = [];
    if (uniqDates.length >= 3) {
        if (uniqDates.length > 3) {
            const left = uniqDates[0], right = uniqDates[uniqDates.length - 1];
            let mid = uniqDates[0], best = -1;
            for (const x of uniqDates) {
                const d = Math.min(Math.abs(x - left), Math.abs(x - right));
                if (d > best) {
                    best = d;
                    mid = x;
                }
            }
            anchors = [left, mid, right].sort((a, b) => a - b);
        }
        else {
            anchors = uniqDates.slice(0, 3);
        }
    }
    if (anchors.length !== 3) {
        const centers = core.map(c => c.cx);
        anchors = kmeans1D(centers, 3).sort((a, b) => a - b);
    }
    const [a0, a1, a2] = anchors;
    const b1 = (a0 + a1) / 2;
    const b2 = (a1 + a2) / 2;
    const buckets = [[], [], []];
    for (const c of core) {
        const i = (c.cx < b1) ? 0 : (c.cx < b2 ? 1 : 2);
        buckets[i].push(c);
    }
    return buckets.map((arr, idx) => {
        arr.sort((a, b) => a.cx - b.cx);
        const cs = arr.map(a => a.cx);
        const minX = cs.length ? Math.min(...cs) : 0;
        const maxX = cs.length ? Math.max(...cs) : 0;
        return { cols: arr, idx, minX, maxX, centers: cs };
    });
}
function pickNearestY(col, yTarget, tol, predicate) {
    let best = null;
    let by = 1e9;
    for (const it of col.items) {
        if (!predicate(it))
            continue;
        const dy = Math.abs(it.y - yTarget);
        if (dy <= tol && dy < by) {
            by = dy;
            best = it;
        }
    }
    return best;
}
function assembleRowsFromPage(pageCells, pageNum, params, debugTokens, dateHisto) {
    const { Y_TOL, Y_TOL_FB, xGroupEps, gapMin } = params;
    const cols = labelColumns(pageCells, xGroupEps);
    const panes = splitInto3Panes(cols, gapMin);
    // map column center -> pane idx (for diagnostics)
    const cxToPane = new Map();
    for (const p of panes)
        for (const c of p.cols)
            cxToPane.set(c.cx, p.idx);
    const skipLogs = [];
    const rows = [];
    if (ENABLE_DEBUG) {
        const paneInfo = panes.map(p => ({
            pane: p.idx,
            minX: p.minX, maxX: p.maxX,
            centers: p.centers
        }));
        console.log(`[PAGE ${pageNum}] paneBounds:`, JSON.stringify(paneInfo));
    }
    // adaptive tolerances per pane using row pitch from session tokens
    const paneTol = {};
    for (const p of panes) {
        const sessYs = p.cols
            .filter(c => c.type === "session")
            .flatMap(c => c.items.filter(i => i.kind === "session"))
            .sort((a, b) => b.y - a.y)
            .map(s => s.y);
        const diffs = [];
        for (let i = 1; i < sessYs.length; i++) {
            const d = Math.abs(sessYs[i - 1] - sessYs[i]);
            if (d > 0)
                diffs.push(d);
        }
        const pitch = median(diffs.length ? diffs : [12]);
        const yTol = clamp(0.25 * pitch, 7, 12);
        const yTolFB = clamp(0.35 * pitch, 10, 16);
        paneTol[p.idx] = { yTol, yTolFB };
        if (ENABLE_DEBUG) {
            console.log(`[PAGE ${pageNum}] pane ${p.idx} rowPitch≈${pitch.toFixed(1)} → Y_TOL=${yTol.toFixed(1)} Y_TOL_FB=${yTolFB.toFixed(1)}`);
        }
    }
    // generalized N-digit pickers (N = 3 here)
    const pickN = (n, colsList, xMin, xMax, yMid, yTol, exclude) => {
        const refX = (xMax == null) ? (xMin + 80) : (xMin + xMax) / 2;
        const scored = [];
        for (const c of colsList) {
            if (!(c.cx > xMin && (xMax == null || c.cx < xMax)))
                continue;
            if (exclude && Math.abs(c.cx - exclude.x) <= exclude.radius)
                continue;
            const tok = pickNearestY(c, yMid, yTol, t => isDigitToken(t.str));
            if (!tok)
                continue;
            if (exclude && Math.abs(tok.x - exclude.x) <= exclude.radius)
                continue;
            const dy = Math.abs(tok.y - yMid);
            scored.push({ col: c, tok, dy, cx: c.cx, xdist: Math.abs(c.cx - refX) });
        }
        scored.sort((a, b) => a.dy - b.dy || a.xdist - b.xdist);
        const top = scored.slice(0, n).sort((a, b) => a.cx - b.cx);
        if (top.length === n) {
            return {
                digits: top.map(s => Number(s.tok.str)),
                xs: top.map(s => s.tok.x),
                ys: top.map(s => s.tok.y),
                panes: top.map(s => cxToPane.get(s.col.cx) ?? -1),
            };
        }
        // fallback: token scan with one-per-column-group protection
        const tokens = colsList
            .flatMap(dc => dc.items)
            .filter(d => d.x > xMin &&
            (xMax == null || d.x < xMax) &&
            Math.abs(d.y - yMid) <= yTol &&
            isDigitToken(d.str) &&
            (!exclude || Math.abs(d.x - exclude.x) > exclude.radius))
            .sort((a, b) => a.x - b.x);
        if (!tokens.length)
            return null;
        // group by x within eps
        const groups = [];
        for (const t of tokens) {
            const g = groups[groups.length - 1];
            if (!g || Math.abs(g[g.length - 1].x - t.x) > xGroupEps)
                groups.push([t]);
            else
                g.push(t);
        }
        const picked = groups.map(g => g.slice().sort((a, b) => Math.abs(a.y - yMid) - Math.abs(b.y - yMid))[0])
            .sort((a, b) => a.x - b.x)
            .slice(0, n);
        if (picked.length !== n)
            return null;
        return {
            digits: picked.map(p => Number(p.str)),
            xs: picked.map(p => p.x),
            ys: picked.map(p => p.y),
            panes: picked.map(p => {
                let nearestCx = colsList[0]?.cx ?? 0, bd = 1e9;
                for (const c of colsList) {
                    const d = Math.abs(c.cx - p.x);
                    if (d < bd) {
                        bd = d;
                        nearestCx = c.cx;
                    }
                }
                return cxToPane.get(nearestCx) ?? -1;
            })
        };
    };
    const pickNByColumns = (n, colsList, paneBounds, yMid, yTol, exclude) => {
        const digitColsOnly = colsList
            .filter(c => c.type === "digit" && c.cx >= paneBounds.minX && c.cx <= paneBounds.maxX)
            .filter(c => !exclude || Math.abs(c.cx - exclude.x) > exclude.radius);
        if (digitColsOnly.length < n)
            return null;
        const ranked = digitColsOnly
            .map(c => {
            const tok = pickNearestY(c, yMid, yTol, t => isDigitToken(t.str));
            return tok ? { c, tok } : null;
        })
            .filter(Boolean);
        if (ranked.length < n)
            return null;
        ranked.sort((a, b) => Math.abs(a.c.cx - (paneBounds.minX + paneBounds.maxX) / 2) - Math.abs(b.c.cx - (paneBounds.minX + paneBounds.maxX) / 2));
        const top = ranked.slice(0, n).sort((a, b) => a.c.cx - b.c.cx);
        return { digits: top.map(r => Number(r.tok.str)), xs: top.map(r => r.tok.x), ys: top.map(r => r.tok.y), panes: top.map(r => cxToPane.get(r.c.cx) ?? -1) };
    };
    for (const pane of panes) {
        const paneCols = pane.cols;
        if (!paneCols.length)
            continue;
        const dateCols = paneCols.filter(c => c.type === "date");
        const sessCols = paneCols.filter(c => c.type === "session");
        const digitCols = paneCols.filter(c => c.type === "digit");
        const fbCols = paneCols.filter(c => c.type === "fbtag");
        // look-ahead panes (some layouts push digits/FB to next pane)
        const nextPane = panes[pane.idx + 1];
        const nextNextPane = panes[pane.idx + 2];
        const nextDigitCols = nextPane ? nextPane.cols.filter(c => c.type === "digit") : [];
        const nextFbCols = nextPane ? nextPane.cols.filter(c => c.type === "fbtag") : [];
        const nextNextDigitCols = nextNextPane ? nextNextPane.cols.filter(c => c.type === "digit") : [];
        const nextNextFbCols = nextNextPane ? nextNextPane.cols.filter(c => c.type === "fbtag") : [];
        const digitColsExt1 = digitCols.concat(nextDigitCols);
        const fbColsExt1 = fbCols.concat(nextFbCols);
        const digitColsExt2 = digitCols.concat(nextDigitCols, nextNextDigitCols);
        const fbColsExt2 = fbCols.concat(nextFbCols, nextNextFbCols);
        if (ENABLE_DEBUG) {
            const s = { page: pageNum, pane: pane.idx, numDateCols: dateCols.length, numSessCols: sessCols.length, numDigitCols: digitCols.length, numFbCols: fbCols.length };
            console.log(`[PAGE ${pageNum}] pane ${pane.idx} colCounts`, s);
        }
        const sessions = sessCols
            .flatMap(c => c.items.filter(it => it.kind === "session"))
            .sort((a, b) => b.y - a.y || a.x - b.x);
        let debugRowCountForPane = 0;
        for (const s of sessions) {
            const sess = /M/i.test(s.str) ? "M" : "E";
            const yMid = s.y;
            const tolSet = paneTol[pane.idx] ?? { yTol: Y_TOL, yTolFB: Y_TOL_FB };
            const YT = tolSet.yTol, YTFB = tolSet.yTolFB;
            // nearest DATE column strictly to the left
            const dateColLeft = dateCols.filter(c => c.cx < s.x).sort((a, b) => b.cx - a.cx)[0];
            let bestDate = null;
            if (dateColLeft)
                bestDate = pickNearestY(dateColLeft, yMid, YT, c => toISO(c.str) !== null);
            if (!bestDate) {
                skipLogs.push({ page: pageNum, sessXY: { x: s.x, y: s.y }, reason: "noDateLeft", sessStr: s.str, paneIdx: pane.idx });
                continue;
            }
            const dateISO = toISO(bestDate.str);
            if (!dateISO) {
                skipLogs.push({ page: pageNum, sessXY: { x: s.x, y: s.y }, reason: "dateParseFail", sessStr: s.str, paneIdx: pane.idx });
                continue;
            }
            let fb = undefined;
            let fbTagTok = null;
            let fbDigitX;
            const FB_EX_RADIUS = 14;
            // FB in current/next panes
            let fbCol = fbCols.filter(c => c.cx > s.x).sort((a, b) => a.cx - b.cx)[0];
            if (fbCol) {
                const candTag = pickNearestY(fbCol, yMid, YTFB, c => /^FB:?$/i.test(c.str));
                if (candTag) {
                    fbTagTok = candTag;
                    const fbDigitTok = digitCols
                        .flatMap(dc => dc.items)
                        .filter(d => d.x > candTag.x && Math.abs(d.y - candTag.y) <= YTFB && isDigitToken(d.str))
                        .sort((a, b) => a.x - b.x)[0];
                    if (fbDigitTok) {
                        fb = Number(fbDigitTok.str);
                        fbDigitX = fbDigitTok.x;
                    }
                }
            }
            if (!fbTagTok && nextPane) {
                const fbCol2 = fbColsExt1.filter(c => c.cx > s.x).sort((a, b) => a.cx - b.cx)[0];
                if (fbCol2) {
                    const candTag2 = pickNearestY(fbCol2, yMid, YTFB, c => /^FB:?$/i.test(c.str));
                    if (candTag2) {
                        fbTagTok = candTag2;
                        const fbDigitTok2 = digitColsExt1
                            .flatMap(dc => dc.items)
                            .filter(d => d.x > candTag2.x && Math.abs(d.y - candTag2.y) <= YTFB && isDigitToken(d.str))
                            .sort((a, b) => a.x - b.x)[0];
                        if (fbDigitTok2) {
                            fb = Number(fbDigitTok2.str);
                            fbDigitX = fbDigitTok2.x;
                        }
                    }
                }
            }
            if (!fbTagTok && nextNextPane) {
                const fbCol3 = fbColsExt2.filter(c => c.cx > s.x).sort((a, b) => a.cx - b.cx)[0];
                if (fbCol3) {
                    const candTag3 = pickNearestY(fbCol3, yMid, YTFB, c => /^FB:?$/i.test(c.str));
                    if (candTag3) {
                        fbTagTok = candTag3;
                        const fbDigitTok3 = digitColsExt2
                            .flatMap(dc => dc.items)
                            .filter(d => d.x > candTag3.x && Math.abs(d.y - candTag3.y) <= YTFB && isDigitToken(d.str))
                            .sort((a, b) => a.x - b.x)[0];
                        if (fbDigitTok3) {
                            fb = Number(fbDigitTok3.str);
                            fbDigitX = fbDigitTok3.x;
                        }
                    }
                }
            }
            // balls on same baseline; try (A) session→FB window, (B) right of FB, (C) right of session if no FB
            let pickedDigits = [];
            let pickedXs = [];
            let pickedYs = [];
            let pickedSrcPanes = [];
            if (fbTagTok) {
                let r = pickN(DIGITS_PER_DRAW, digitCols, s.x, fbTagTok.x, yMid, YT);
                if (r) {
                    pickedDigits = r.digits;
                    pickedXs = r.xs;
                    pickedYs = r.ys;
                    pickedSrcPanes = r.panes;
                }
                if (pickedDigits.length !== DIGITS_PER_DRAW && nextPane) {
                    r = pickN(DIGITS_PER_DRAW, digitColsExt1, s.x, fbTagTok.x, yMid, YT);
                    if (r) {
                        pickedDigits = r.digits;
                        pickedXs = r.xs;
                        pickedYs = r.ys;
                        pickedSrcPanes = r.panes;
                    }
                }
                if (pickedDigits.length !== DIGITS_PER_DRAW && nextNextPane) {
                    r = pickN(DIGITS_PER_DRAW, digitColsExt2, s.x, fbTagTok.x, yMid, YT);
                    if (r) {
                        pickedDigits = r.digits;
                        pickedXs = r.xs;
                        pickedYs = r.ys;
                        pickedSrcPanes = r.panes;
                    }
                }
                if (pickedDigits.length !== DIGITS_PER_DRAW) {
                    const ex = (fbDigitX != null) ? { x: fbDigitX, radius: FB_EX_RADIUS } : undefined;
                    r = pickN(DIGITS_PER_DRAW, digitCols, fbTagTok.x, null, yMid, YT, ex);
                    if (r) {
                        pickedDigits = r.digits;
                        pickedXs = r.xs;
                        pickedYs = r.ys;
                        pickedSrcPanes = r.panes;
                    }
                }
                if (pickedDigits.length !== DIGITS_PER_DRAW && nextPane) {
                    const ex = (fbDigitX != null) ? { x: fbDigitX, radius: FB_EX_RADIUS } : undefined;
                    r = pickN(DIGITS_PER_DRAW, digitColsExt1, fbTagTok.x, null, yMid, YT, ex);
                    if (r) {
                        pickedDigits = r.digits;
                        pickedXs = r.xs;
                        pickedYs = r.ys;
                        pickedSrcPanes = r.panes;
                    }
                }
                if (pickedDigits.length !== DIGITS_PER_DRAW && nextNextPane) {
                    const ex = (fbDigitX != null) ? { x: fbDigitX, radius: FB_EX_RADIUS } : undefined;
                    r = pickN(DIGITS_PER_DRAW, digitColsExt2, fbTagTok.x, null, yMid, YT, ex);
                    if (r) {
                        pickedDigits = r.digits;
                        pickedXs = r.xs;
                        pickedYs = r.ys;
                        pickedSrcPanes = r.panes;
                    }
                }
                if (pickedDigits.length !== DIGITS_PER_DRAW) {
                    const ex = (fbDigitX != null) ? { x: fbDigitX, radius: FB_EX_RADIUS } : undefined;
                    const r2 = pickNByColumns(DIGITS_PER_DRAW, paneCols, { minX: pane.minX, maxX: pane.maxX }, yMid, YT, ex);
                    if (r2) {
                        pickedDigits = r2.digits;
                        pickedXs = r2.xs;
                        pickedYs = r2.ys;
                        pickedSrcPanes = r2.panes;
                    }
                }
            }
            else {
                let r = pickN(DIGITS_PER_DRAW, digitCols, s.x, null, yMid, YT);
                if (r) {
                    pickedDigits = r.digits;
                    pickedXs = r.xs;
                    pickedYs = r.ys;
                    pickedSrcPanes = r.panes;
                }
                if (pickedDigits.length !== DIGITS_PER_DRAW && nextPane) {
                    r = pickN(DIGITS_PER_DRAW, digitColsExt1, s.x, null, yMid, YT);
                    if (r) {
                        pickedDigits = r.digits;
                        pickedXs = r.xs;
                        pickedYs = r.ys;
                        pickedSrcPanes = r.panes;
                    }
                }
                if (pickedDigits.length !== DIGITS_PER_DRAW && nextNextPane) {
                    r = pickN(DIGITS_PER_DRAW, digitColsExt2, s.x, null, yMid, YT);
                    if (r) {
                        pickedDigits = r.digits;
                        pickedXs = r.xs;
                        pickedYs = r.ys;
                        pickedSrcPanes = r.panes;
                    }
                }
                if (pickedDigits.length !== DIGITS_PER_DRAW) {
                    const r2 = pickNByColumns(DIGITS_PER_DRAW, paneCols, { minX: pane.minX, maxX: pane.maxX }, yMid, YT);
                    if (r2) {
                        pickedDigits = r2.digits;
                        pickedXs = r2.xs;
                        pickedYs = r2.ys;
                        pickedSrcPanes = r2.panes;
                    }
                }
            }
            if (pickedDigits.length !== DIGITS_PER_DRAW) {
                skipLogs.push({ page: pageNum, sessXY: { x: s.x, y: s.y }, reason: fbTagTok ? "notEnoughDigitsBeforeFB" : "noFBButDigitsMissing", sessStr: s.str, paneIdx: pane.idx });
                continue;
            }
            const row = { dateISO, session: sess, digits: pickedDigits, fb, y: yMid, page: pageNum };
            if (ENABLE_DEBUG) {
                row._digitXs = pickedXs;
                row._digitYs = pickedYs;
                row._srcPanes = pickedSrcPanes;
            }
            rows.push(row);
            if (ENABLE_DEBUG && debugRowCountForPane < 5) {
                console.log(`[PAGE ${pageNum}] row#${debugRowCountForPane + 1} ${dateISO} ${sess} y=${Math.round(yMid)} fb=${fb ?? ""} xs=${pickedXs.map(v => Math.round(v)).join(",")} ys=${pickedYs.map(v => Math.round(v)).join(",")} panes=${pickedSrcPanes.join(",")}`);
                debugRowCountForPane++;
            }
        }
    }
    const numDateCols = cols.filter(c => c.type === "date").length;
    const numSessionCols = cols.filter(c => c.type === "session").length;
    const numDigitCols = cols.filter(c => c.type === "digit").length;
    const numFbCols = cols.filter(c => c.type === "fbtag").length;
    return { rows, skipLogs, summary: { page: pageNum, numDateCols, numSessionCols, numDigitCols, numFbCols } };
}
function tryBuildPage(pageCells, pageNum, debugTokens, dateHisto) {
    let params = { Y_TOL: 9, Y_TOL_FB: 12, xGroupEps: 8, gapMin: 35 };
    let bestOut = null;
    let bestScore = -1;
    for (let attempt = 0; attempt < 3; attempt++) {
        const out = assembleRowsFromPage(pageCells, pageNum, params, debugTokens, dateHisto);
        const built = out.rows.length;
        const skipped = out.skipLogs.length;
        const total = built + skipped;
        const rate = total ? skipped / total : 1;
        if (ENABLE_DEBUG) {
            console.log(`[PAGE ${pageNum}] attempt ${attempt + 1} params`, params, `→ built=${built}, skipped=${skipped}, skipRate=${rate.toFixed(2)}`);
        }
        const score = built - rate;
        if (score > bestScore) {
            bestOut = out;
            bestScore = score;
        }
        if (rate <= 0.25)
            break;
        if (attempt === 0)
            params = { ...params, Y_TOL: Math.min(13, params.Y_TOL + 2), Y_TOL_FB: Math.min(16, params.Y_TOL_FB + 2) };
        else if (attempt === 1)
            params = { ...params, xGroupEps: 10, gapMin: 28 };
    }
    return bestOut ?? assembleRowsFromPage(pageCells, pageNum, { Y_TOL: 11, Y_TOL_FB: 14, xGroupEps: 8, gapMin: 30 }, debugTokens, dateHisto);
}
async function buildRows(allCells) {
    const byPage = new Map();
    for (const c of allCells) {
        if (!byPage.has(c.page))
            byPage.set(c.page, []);
        byPage.get(c.page).push(c);
    }
    const debugLines = ["page,pane,colIndex,x,y,kind,text"];
    const dateHisto = new Map();
    const pageSummaries = [];
    const skipReasonSamples = [];
    let rows = [];
    for (const [pageNum, pageCells] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
        const out = tryBuildPage(pageCells, pageNum, debugLines, dateHisto);
        rows = rows.concat(out.rows);
        pageSummaries.push({ ...out.summary, numRowsBuilt: out.rows.length, numSkipped: out.skipLogs.length });
        skipReasonSamples.push(...out.skipLogs.slice(0, 10));
    }
    // Dedup by (date, session). Prefer rows including FB.
    const key = (r) => `${r.dateISO}|${r.session}`;
    const map = new Map();
    for (const r of rows) {
        const k = key(r);
        const prev = map.get(k);
        if (!prev) {
            map.set(k, r);
            continue;
        }
        const prefer = (r.fb != null) && (prev.fb == null);
        if (prefer)
            map.set(k, r);
    }
    const out = [...map.values()].sort((a, b) => a.dateISO.localeCompare(b.dateISO));
    if (ENABLE_DEBUG) {
        console.log("\n=== Per-page summary ===");
        for (const s of pageSummaries) {
            console.log(`page=${s.page} dateCols=${s.numDateCols} sessCols=${s.numSessionCols} digitCols=${s.numDigitCols} fbCols=${s.numFbCols} rows=${s.numRowsBuilt} skipped=${s.numSkipped}`);
        }
        const mTail = out.filter(r => r.session === "M").slice(-10);
        const eTail = out.filter(r => r.session === "E").slice(-10);
        console.log("\n[tail M] last 10 rows (date,digits,fb, digitXs):");
        for (const r of mTail)
            console.log(r.dateISO, r.digits.join("-"), r.fb ?? "", r._digitXs ?? []);
        console.log("[tail E] last 10 rows (date,digits,fb, digitXs):");
        for (const r of eTail)
            console.log(r.dateISO, r.digits.join("-"), r.fb ?? "", r._digitXs ?? []);
        const failed = [];
        for (const [raw, info] of dateHisto.entries()) {
            if (!info.ok)
                failed.push(`${raw} (x${info.count})`);
        }
        if (failed.length) {
            console.log("\nFirst 5 unparsed post-2020 date tokens:");
            for (const s of failed.slice(0, 5))
                console.log("  ·", s);
        }
        else {
            console.log("\nNo unparsed post-2020 date tokens.");
        }
        const top = [...dateHisto.entries()].sort((a, b) => b[1].count - a[1].count).slice(0, 20)
            .map(([raw, info]) => `${raw}: ${info.count}${info.ok ? "" : " (parseFail)"}`);
        if (top.length) {
            console.log("\nDate normalization histogram (sample):");
            for (const t of top)
                console.log("  ·", t);
        }
        if (skipReasonSamples.length) {
            console.log("\nSkipped row samples (first 10 overall):");
            for (const s of skipReasonSamples) {
                console.log(`  page=${s.page} pane=${s.paneIdx} sess=${s.sessStr} at (${Math.round(s.sessXY.x)},${Math.round(s.sessXY.y)}): ${s.reason}`);
            }
        }
        const outPath = path.resolve(process.cwd(), DEBUG_OUT);
        await fs.mkdir(path.dirname(outPath), { recursive: true });
        await fs.writeFile(outPath, debugLines.join("\n"), "utf8");
    }
    if (out.length === 0) {
        // Dump raw-ish tokens for inspection (helps when layouts drift)
        const rows = ["page,x,y,kind,text"];
        const byPage = new Map();
        for (const c of allCells) {
            if (!byPage.has(c.page))
                byPage.set(c.page, []);
            byPage.get(c.page).push(c);
        }
        for (const [p, arr] of [...byPage.entries()].sort((a, b) => a[0] - b[0])) {
            for (const c of arr.sort((a, b) => a.x - b.x || b.y - a.y)) {
                rows.push(`${p},${Math.round(c.x)},${Math.round(c.y)},${c.kind},"${String(c.str).replaceAll('"', '""')}"`);
            }
        }
        const rawPath = path.resolve(process.cwd(), "public/data/fl/p3_tokens_raw.csv");
        await fs.mkdir(path.dirname(rawPath), { recursive: true });
        await fs.writeFile(rawPath, rows.join("\n"), "utf8");
        console.log(`[debug] Wrote raw tokens → ${rawPath}`);
    }
    return out;
}
function makeCsv(rows) {
    const lines = rows.map(r => {
        const [b1, b2, b3] = r.digits;
        const fb = (r.fb == null ? "" : String(r.fb));
        return `${r.dateISO},${b1},${b2},${b3},${fb}`;
    });
    return HEADER + lines.join("\n") + "\n";
}
// ---------- Public API ----------
export async function buildFloridaPick3Csvs(outMiddayRel = OUT_MIDDAY, outEveningRel = OUT_EVENING, localPdfPath) {
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
    console.log(`[FL PICK3] Wrote ${m.length} midday rows → ${outM}`);
    console.log(`[FL PICK3] Wrote ${e.length} evening rows → ${outE}`);
}
// ---------- CLI ----------
if (typeof process !== "undefined" && process.argv && process.argv[1]) {
    const thisFile = path.resolve(fileURLToPath(import.meta.url));
    const invoked = path.resolve(process.argv[1]);
    if (thisFile === invoked) {
        const maybeLocal = process.argv[2]; // optional local PDF path
        buildFloridaPick3Csvs(undefined, undefined, maybeLocal).catch((e) => {
            console.error(e);
            process.exit(1);
        });
    }
}
