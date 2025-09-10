// scripts/sources/fantasy5.mjs
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import cheerio from "cheerio";
import got from "got";

// CSV header to match your other files
const HEADER = "draw_date,num1,num2,num3,num4,num5,special\n";

const THIS_YEAR = new Date().getFullYear();
const FIRST_YEAR = 1994; // GA Fantasy 5 launched in the 1990s; adjust if needed

// Simple helper: normalize “MMM DD, YYYY” -> “YYYY-MM-DD”
function normalizeDate(s) {
  // try a few formats defensively
  const d = new Date(s.replace(/(\d+)(st|nd|rd|th)/g, "$1"));
  if (Number.isNaN(d.getTime())) return null;
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// extract exactly 5 integers (1–42 historically; 1–41 more recently) from a string
function parseFiveNumbers(text) {
  const nums = (text.match(/\d+/g) || []).map(n => parseInt(n, 10));
  // keep only plausible Fantasy 5 ball values
  const filtered = nums.filter(n => n >= 1 && n <= 42);
  if (filtered.length < 5) return null;
  return filtered.slice(0, 5);
}

// Scrape a year page from a site that renders HTML statically (no JS required).
// Site A and Site B should both have "year archive" pages with tables of draws.
async function fetchYearFromSite({ base, year }) {
  const url = `${base}${year}`;
  const res = await got(url, {
    timeout: { request: 15000 },
    headers: {
      "user-agent": "Mozilla/5.0 (+GitHub Actions; Fantasy5 updater)",
      "accept": "text/html,application/xhtml+xml",
    },
    retry: { limit: 2 }
  }).text();

  const $ = cheerio.load(res);

  // Heuristic row detection:
  // Pick rows that contain a date-like cell and exactly 5 numbers.
  // This works across many “results archive” table layouts.
  const rows = [];
  $("table tr").each((_, tr) => {
    const tds = $(tr).find("td");
    if (tds.length < 2) return;

    // date text: typically first or second cell
    const dateCand = $(tds[0]).text().trim() || $(tds[1]).text().trim();
    const iso = normalizeDate(dateCand);
    if (!iso) return;

    // numbers may be in a single cell or 5 separate cells
    const rowText = $(tr).text().replace(/\s+/g, " ").trim();
    const five = parseFiveNumbers(rowText);
    if (!five) return;

    rows.push([iso, ...five]);
  });

  // unique by date (keep last occurrence)
  const map = new Map();
  for (const [d, a, b, c, d2, e] of rows) {
    map.set(d, [d, a, b, c, d2, e]);
  }

  return [...map.values()]
    .sort((a, b) => a[0].localeCompare(b[0])); // ascending by date
}

// Cross-validate: Only trust a date if both sites agree on all 5 numbers.
// If one site is down, we still accept single-source rows but only if we have many of them for that year (reduces “50 identical rows” failure).
function mergeValidate(primary, secondary) {
  const secMap = new Map(secondary.map(r => [r[0], r.slice(1).join(",")]));
  const both = [];
  const onlyPrimary = [];

  for (const row of primary) {
    const [date, ...nums] = row;
    const sig = nums.join(",");
    const secSig = secMap.get(date);
    if (secSig && secSig === sig) {
      both.push(row);
    } else {
      onlyPrimary.push(row);
    }
  }

  // If we have a decent number of double-confirmed rows for the year, prefer those.
  // Else (e.g., site B missing that year), accept primary rows but still useful overall.
  if (both.length >= 20 || (both.length > 0 && both.length >= Math.floor(primary.length * 0.6))) {
    return both;
  }
  // Fallback: accept primary rows, but they’ll still be de-duped globally later.
  return primary;
}

export async function buildFantasy5Csv(outRelPath = "public/data/ga/fantasy5.csv") {
  const baseA = "https://www.lotteryextreme.com/usa/georgia/fantasy-5-"; // e.g. ...fantasy-5-2025
  const baseB = "https://www.galottery.com/en-us/winning-numbers/fantasy-5/past-draws/"; // e.g. .../2025 (example path; yearly pages)

  const all = [];

  for (let y = FIRST_YEAR; y <= THIS_YEAR; y++) {
    // site A
    let a = [];
    try { a = await fetchYearFromSite({ base: baseA, year: y }); } catch {}
    // site B
    let b = [];
    try { b = await fetchYearFromSite({ base: baseB, year: y }); } catch {}

    let mergedYear = [];
    if (a.length && b.length) mergedYear = mergeValidate(a, b);
    else mergedYear = a.length ? a : b;

    if (!mergedYear.length) {
      console.log(`Fantasy 5: no rows parsed for year ${y}`);
      continue;
    }

    // Append with trailing empty 'special' column to match header
    for (const [date, n1, n2, n3, n4, n5] of mergedYear) {
      all.push(`${date},${n1},${n2},${n3},${n4},${n5},`);
    }
  }

  // Global de-dupe and sort just in case
  const uniq = Array.from(new Set(all)).sort();

  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const outPath = path.resolve(__dirname, "..", "..", outRelPath);

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, HEADER + uniq.join("\n") + (uniq.length ? "\n" : ""), "utf8");

  console.log(`Fantasy 5 rows: ${uniq.length} → ${outRelPath}`);
}
