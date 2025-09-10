// scripts/repair-lotto-csv.ts
/* eslint-disable no-console */
import fs from "node:fs";
import path from "node:path";

const CANON = "draw_date,num1,num2,num3,num4,num5,special";

const stripBOM = (s: string) =>
  s && s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;

function toYMD(s: unknown): string {
  if (s == null) return "";
  const m = String(s).match(/^(\d{4}-\d{2}-\d{2})/);
  if (m) return m[1];
  const d = new Date(String(s));
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

const toInt = (x: unknown) => {
  const n = parseInt(String(x).trim(), 10);
  return Number.isFinite(n) ? n : NaN;
};
const isInts5 = (arr: number[]) =>
  arr.length === 5 && arr.every((n) => Number.isInteger(n));

function choose<K extends string>(
  idx: Record<string, number>,
  ...names: K[]
): K | undefined {
  return names.find((n) => n in idx);
}

export function repairCsv(inPath: string, outPath: string) {
  if (!fs.existsSync(inPath) || fs.statSync(inPath).size === 0) {
    fs.writeFileSync(outPath, "", "utf8");
    return;
  }

  // Normalize CRLF so line ops are simple
  const text = fs.readFileSync(inPath, "utf8").replace(/\r/g, "");
  const rawLines = text.split("\n").filter((l) => l.length > 0);
  if (rawLines.length === 0) {
    fs.writeFileSync(outPath, "", "utf8");
    return;
  }

  let header = stripBOM(rawLines[0]).trim().toLowerCase();
  const cols = header.split(",").map((s) => s.trim());
  const idx: Record<string, number> = Object.fromEntries(
    cols.map((c, i) => [c, i])
  );

  // Case 0: already canonical — pass-through
  if (header === CANON) {
    // Ensure trailing newline
    fs.writeFileSync(outPath, rawLines.join("\n") + "\n", "utf8");
    return;
  }

  const out: string[] = [CANON];

  // Case A: Socrata legacy: draw_date + winning_numbers (+ special col name)
  if ("draw_date" in idx && "winning_numbers" in idx) {
    const sName = choose(idx, "special", "mega_ball", "cash_ball", "powerball");
    for (let i = 1; i < rawLines.length; i++) {
      const parts = rawLines[i].split(",");
      if (parts.length < 2) continue;
      const date = toYMD(parts[idx["draw_date"]]);
      const wn = String(parts[idx["winning_numbers"]] ?? "");
      const nums = (wn.match(/\d+/g) ?? []).map(Number);
      const whites = nums.slice(0, 5);
      let special = "";
      if (sName && sName !== "special" && idx[sName] != null) {
        const sv = toInt(parts[idx[sName]]);
        special = Number.isFinite(sv) ? String(sv) : "";
      } else if (nums.length >= 6) {
        special = String(nums[5]);
      }
      if (date && isInts5(whites)) {
        out.push(
          [date, whites[0], whites[1], whites[2], whites[3], whites[4], special].join(
            ","
          )
        );
      }
    }
    fs.writeFileSync(outPath, out.join("\n") + "\n", "utf8");
    return;
  }

  // Case B: same shape as canon but special column named differently — rename header only
  const hasNum1to5 = ["num1", "num2", "num3", "num4", "num5"].every(
    (k) => k in idx
  );
  const specialSyn = choose(idx, "special", "mega_ball", "cash_ball", "powerball");
  if ("draw_date" in idx && hasNum1to5 && specialSyn) {
    // Just rewrite header, keep body as-is
    const body = rawLines.slice(1);
    fs.writeFileSync(outPath, CANON + "\n" + body.join("\n") + "\n", "utf8");
    return;
  }

  // Case C: column-based numerics: support m1..m5 or n1..n5 (ignore extra columns like game, special_name)
  const dateCol = "draw_date" in idx ? idx["draw_date"] : undefined;
  const n1 = choose(idx, "num1", "m1", "n1");
  const n2 = choose(idx, "num2", "m2", "n2");
  const n3 = choose(idx, "num3", "m3", "n3");
  const n4 = choose(idx, "num4", "m4", "n4");
  const n5 = choose(idx, "num5", "m5", "n5");
const sCol = choose(idx, "special", "mega_ball", "cash_ball", "powerball");

if (
  dateCol != null &&
  n1 != null && n2 != null && n3 != null && n4 != null && n5 != null
) {
  for (let i = 1; i < rawLines.length; i++) {
    const parts = rawLines[i].split(",");
    const date = toYMD(parts[dateCol]);
    const whites = [parts[n1], parts[n2], parts[n3], parts[n4], parts[n5]].map(toInt);
    const specialV = sCol != null ? toInt(parts[sCol]) : NaN; // may be missing
    if (date && isInts5(whites)) {
      out.push([date, whites[0], whites[1], whites[2], whites[3], whites[4],
                Number.isFinite(specialV) ? specialV : ""].join(","));
    }
  }
  fs.writeFileSync(outPath, out.join("\n") + "\n", "utf8");
  return;
}

  // Unknown layout → fail so CI surfaces it
  console.error("Unrecognized header layout:", header);
  process.exit(2);
}

// CLI usage: npx tsx scripts/repair-lotto-csv.ts <in.csv> <out.csv>
if (require.main === module) {
  const [, , inArg, outArg] = process.argv;
  if (!inArg || !outArg) {
    console.error("Usage: npx tsx scripts/repair-lotto-csv.ts <in.csv> <out.csv>");
    process.exit(1);
  }
  repairCsv(path.resolve(inArg), path.resolve(outArg));
}
