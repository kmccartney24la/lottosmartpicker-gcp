// scripts/builders/fantasy5.ts
import * as fs from "node:fs/promises";
import * as path from "node:path";
import { toCanonicalCsv } from "../../lib/csv.mjs";

type Row = {
  draw_date: string;
  num1: number; num2: number; num3: number; num4: number; num5: number;
  special?: number | undefined;
};

/** Reads the scraper’s CSV, normalizes to canonical CSV. */
export async function buildGeorgiaFantasy5CsvFromLocalSeed(): Promise<string> {
  const file = path.join(process.cwd(), "public", "data", "ga", "fantasy5.csv");
  const text = await fs.readFile(file, "utf8");

  const lines = text.trim().split(/\r?\n/);
  if (!lines.length) throw new Error("Fantasy5 CSV empty");

  const header = lines.shift()!.toLowerCase();
  const cols = header.split(",").map((s) => s.trim());

  const idx = (name: string) => cols.indexOf(name);
  const iDate = idx("draw_date");
  const i1 = idx("num1") >= 0 ? idx("num1") : idx("m1");
  const i2 = idx("num2") >= 0 ? idx("num2") : idx("m2");
  const i3 = idx("num3") >= 0 ? idx("num3") : idx("m3");
  const i4 = idx("num4") >= 0 ? idx("num4") : idx("m4");
  const i5 = idx("num5") >= 0 ? idx("num5") : idx("m5");

  if ([iDate, i1, i2, i3, i4, i5].some((i) => i < 0)) {
    throw new Error("Fantasy5 CSV header missing columns");
  }

  const rows: Row[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const t = line.split(",").map((s) => s.trim());
    const d = new Date(t[iDate]);
    if (Number.isNaN(d.getTime())) continue;
    const draw_date = d.toISOString().slice(0, 10);

    const nums = [t[i1], t[i2], t[i3], t[i4], t[i5]].map((v) => parseInt(v, 10));
    if (nums.some((n) => !Number.isFinite(n))) continue;
    const [num1, num2, num3, num4, num5] = nums;

    rows.push({ draw_date, num1, num2, num3, num4, num5, special: undefined });
  }

  return toCanonicalCsv(rows);
}
