// scripts/sources/tx_cash5.ts
// Node 18+ ESM.
// Scrapes Texas Cash Five past winning numbers into a canonical CSV:
// draw_date,num1,num2,num3,num4,num5
//
// Output (default): public/data/tx/cash5.csv
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
const HISTORY_URL = process.env.TX_CASH5_HISTORY_URL?.trim() ||
    "https://www.texaslottery.com/export/sites/lottery/Games/Cash_Five/Winning_Numbers/index.html_2013354932.html";
const FALLBACK_URL = "https://www.texaslottery.com/export/sites/lottery/Games/Cash_Five/Winning_Numbers/index.html";
const HTTP_TIMEOUT_MS = Number(process.env.TX_HTTP_TIMEOUT_MS ?? 20000);
const HEADER = "draw_date,num1,num2,num3,num4,num5\n";
const MAX_NUM = Number(process.env.TX_CASH5_MAX ?? 35); // Cash Five is 5/35
const BASE_HEADERS = {
    "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "accept-language": "en-US,en;q=0.9",
};
function toISO(dateLike) {
    // mm/dd/yyyy
    const m = dateLike.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (!m)
        return null;
    const [, mm, dd, yyyy] = m;
    const d = new Date(Date.UTC(Number(yyyy), Number(mm) - 1, Number(dd)));
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}
function parseNums(cellText) {
    // Example: "11 - 17 - 25 - 29 - 33"
    const parts = cellText.split(/[-–—]/).map((s) => s.trim());
    const nums = parts
        .map((p) => Number(p.replace(/[^\d]/g, "")))
        .filter((n) => Number.isFinite(n));
    if (nums.length !== 5)
        return null;
    // Cash Five uses 1..35, distinct
    const distinct = new Set(nums);
    if (distinct.size !== 5)
        return null;
    if (!nums.every((n) => n >= 1 && n <= MAX_NUM))
        return null;
    return nums;
}
async function fetchText(url) {
    const res = await fetch(url, {
        signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
        headers: BASE_HEADERS,
    });
    if (!res.ok)
        throw new Error(`HTTP ${res.status} ${res.statusText} for ${url}`);
    return await res.text();
}
/**
 * Minimal, dependency-free extractor:
 *  - Find rows containing `<a class="detailsLink">DATE</a>`
 *  - Take the next <td> as the numbers cell.
 */
function extractRowsFromHtml(html) {
    const rows = [];
    const trRe = /<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
    let trMatch;
    while ((trMatch = trRe.exec(html))) {
        const tr = trMatch[1];
        const dateAnchorRe = /<a[^>]*class=["'][^"']*detailsLink[^"']*["'][^>]*>([^<]+)<\/a>/i;
        const dm = dateAnchorRe.exec(tr);
        if (!dm)
            continue;
        const dateText = dm[1].trim();
        const dateISO = toISO(dateText);
        if (!dateISO)
            continue;
        const tds = [...tr.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map((m) => m[1]);
        if (tds.length < 2)
            continue;
        const numsCell = tds[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
        const nums = parseNums(numsCell);
        if (!nums)
            continue;
        rows.push({ dateISO, nums });
    }
    // de-dupe by date (latest occurrence wins)
    const byDate = new Map();
    for (const r of rows)
        byDate.set(r.dateISO, r);
    return [...byDate.values()];
}
function makeCsvLine(dateISO, vals) {
    const [n1, n2, n3, n4, n5] = vals;
    return `${dateISO},${n1},${n2},${n3},${n4},${n5}\n`;
}
/** Public API */
export async function buildTexasCash5Csv(outRelPath = "public/data/tx/cash5.csv") {
    const outPath = path.isAbsolute(outRelPath)
        ? outRelPath
        : path.resolve(process.cwd(), outRelPath);
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    let html;
    try {
        html = await fetchText(HISTORY_URL);
    }
    catch {
        html = await fetchText(FALLBACK_URL);
    }
    const rows = extractRowsFromHtml(html);
    if (!rows.length) {
        throw new Error("No Cash Five rows were extracted — page structure may have changed.");
    }
    const lines = rows
        .map((r) => makeCsvLine(r.dateISO, r.nums))
        .sort((a, b) => a.slice(0, 10).localeCompare(b.slice(0, 10)));
    await fs.writeFile(outPath, HEADER + lines.join(""), "utf8");
    console.log(`[TX Cash Five] Wrote ${rows.length} draws to: ${outPath}`);
}
// ---------- CLI ----------
if (typeof process !== "undefined" && process.argv && process.argv[1]) {
    const thisFile = path.resolve(fileURLToPath(import.meta.url));
    const invoked = path.resolve(process.argv[1]);
    if (thisFile === invoked) {
        buildTexasCash5Csv().catch((e) => {
            console.error(e);
            process.exitCode = 1;
        });
    }
}
