// scripts/builders/socrata.ts
import { fetch as undiciFetch } from "undici";
import { toCanonicalCsv } from "../../lib/csv.mjs";

type DatasetCfg = {
  id: string;
  dateField: string;
  winningField: string;
  specialField?: string;
};

const DATASETS: Record<
  "multi_powerball" | "multi_megamillions" | "multi_cash4life",
  DatasetCfg
> = {
  multi_powerball:    { id: "d6yy-54nr", dateField: "draw_date", winningField: "winning_numbers" },
  multi_megamillions: { id: "5xaw-6ayf", dateField: "draw_date", winningField: "winning_numbers", specialField: "mega_ball" },
  multi_cash4life:    { id: "kwxv-fwze", dateField: "draw_date", winningField: "winning_numbers", specialField: "cash_ball" },
};

const SOCRATA_BASE = "https://data.ny.gov/resource";

function parseTokens(s: unknown): number[] {
  return String(s)
    .replace(/[,-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => parseInt(t, 10))
    .filter(Number.isFinite);
}

export async function buildSocrataCsv(
  gameKey: keyof typeof DATASETS,
  token?: string
): Promise<string> {
  const cfg = DATASETS[gameKey];
  if (!cfg) throw new Error(`Unknown Socrata dataset key '${String(gameKey)}'`);

  const fields = [cfg.dateField, cfg.winningField];
  if (cfg.specialField) fields.push(cfg.specialField);

  const params = new URLSearchParams({
    $select: fields.join(","),
    $order: `${cfg.dateField} ASC`,
    $limit: "50000",
  });
  const url = `${SOCRATA_BASE}/${cfg.id}.json?${params}`;

  const res = await undiciFetch(url, {
    headers: token ? { "X-App-Token": token } : undefined,
  });
  if (!res.ok) throw new Error(`Socrata ${res.status} for ${gameKey}`);

  const json = (await res.json()) as Array<Record<string, unknown>>;

  const rows = [];
  for (const r of json) {
    const rawDate = r[cfg.dateField] as string | undefined;
    const date = rawDate ? new Date(rawDate) : new Date(NaN);
    if (Number.isNaN(date.getTime())) continue;
    const iso = date.toISOString().slice(0, 10);

    const nums = parseTokens(r[cfg.winningField]);
    if (nums.length < 5) continue;

    let special: number | undefined;
    if (cfg.specialField && r[cfg.specialField] != null) {
      const s = parseInt(String(r[cfg.specialField]), 10);
      if (Number.isFinite(s)) special = s;
    }
    if (special == null && nums.length >= 6) special = nums[5];
    if (special == null) continue;

    const [num1, num2, num3, num4, num5] = nums;
    rows.push({ draw_date: iso, num1, num2, num3, num4, num5, special });
  }

  return toCanonicalCsv(rows);
}
