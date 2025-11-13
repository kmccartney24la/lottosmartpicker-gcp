// packages/lib/src/lotto/patternUtils.ts
import {
  getCurrentEraConfig,
} from './era.js';
import { nCk } from './stats.js';
import type {
  LottoRow,
  CashPopRow,
  CashPopPeriod,
  DigitRowEx,
} from './types.js';

// keep the 1–5 mains, and add the 6th main for games that store it in `special`
export function mainsFromRow(row: LottoRow, gameKey: string): number[] {
  const era = getCurrentEraConfig(gameKey as any);
  const mains = [row.n1, row.n2, row.n3, row.n4, row.n5].filter((n): n is number => Number.isFinite(n));

  const isSixMainGame =
    gameKey === 'ny_lotto' ||
    gameKey === 'fl_lotto' ||
    gameKey === 'fl_jackpot_triple_play' ||
    gameKey === 'tx_lotto_texas';

  if (era.mainPick > 5 && isSixMainGame && typeof row.special === 'number') {
    mains.push(row.special);
  }

  return mains.sort((a, b) => a - b);
}

export function comboKeyFromMains(mains: number[]): string {
  return mains.slice().sort((a, b) => a - b).join('-');
}

// cashpop: 1 number, small domain
export function buildCashPopLastSeen(rows: CashPopRow[], domainSize = 15) {
  const lastSeen = new Map<number, number>();
  for (let n = 1; n <= domainSize; n++) {
    lastSeen.set(n, Infinity);
  }
  for (let i = rows.length - 1, idx = 0; i >= 0; i--, idx++) {
    const v = rows[i]!.value;
    if (Number.isFinite(v)) {
      const prev = lastSeen.get(v) ?? Infinity;
      if (idx < prev) lastSeen.set(v, idx);
    }
  }
  return lastSeen;
}

// cashpop period normalization (frontend uses midday/evening/both)
export function normalizeCashPopPeriod(period: string | undefined): CashPopPeriod | 'all' {
  if (!period) return 'all';
  if (
    period === 'morning' ||
    period === 'matinee' ||
    period === 'afternoon' ||
    period === 'evening' ||
    period === 'latenight'
  ) {
    return period;
  }
  return 'all';
}

// last-seen for digits 0..9 based on reversed rows
export function buildDigitOverdue(rows: DigitRowEx[], k: number) {
  const lastSeen = new Map<number, number>();
  for (let d = 0; d <= 9; d++) {
    lastSeen.set(d, Infinity);
  }
  for (let i = rows.length - 1, idx = 0; i >= 0; i--, idx++) {
    const r = rows[i];
    if (!r) continue;
    for (let p = 0; p < k; p++) {
      const dv = r.digits[p];
      if (typeof dv === 'number' && Number.isFinite(dv)) {
        const prev = lastSeen.get(dv) ?? Infinity;
        if (idx < prev) lastSeen.set(dv, idx);
      }
    }
    if (typeof r.fb === 'number') {
      const fbPrev = lastSeen.get(r.fb) ?? Infinity;
      if (idx < fbPrev) lastSeen.set(r.fb, idx);
    }
  }
  return lastSeen;
}

// generic “draws since last seen” histogram, UI-friendly
export function buildRecencyHistogram(
  lastSeen: Map<number, number>,
  domainSize: number,
  maxDraws: number
): Array<{
  label: string;
  start: number;
  end: number;
  count: number;
  expected: number;
  members: number[];
}> {
  if (!domainSize || domainSize <= 0) return [];

  const gaps: number[] = [];
  for (let n = 1; n <= domainSize; n++) {
    const g = lastSeen.get(n);
    gaps.push(Number.isFinite(g) ? (g as number) : maxDraws);
  }

  if (gaps.length === 0) return [];

  const maxGap = Math.max(...gaps, 0);
  const autoBins = Math.ceil(domainSize / 8);
  const binCount = Math.min(12, Math.max(5, autoBins));
  const binWidth = maxGap === 0 ? 1 : Math.max(1, Math.ceil(maxGap / binCount));

  const bins: Array<{ start: number; end: number; count: number; members: number[] }> = [];
  for (let i = 0; i < binCount; i++) {
    const start = i * binWidth;
    const end = i === binCount - 1 ? Number.POSITIVE_INFINITY : (i + 1) * binWidth - 1;
    bins.push({ start, end, count: 0, members: [] });
  }

  for (let num = 1; num <= domainSize; num++) {
    const gapVal = gaps[num - 1];
    const capped = Math.min(typeof gapVal === 'number' ? gapVal : maxDraws, maxDraws);
    const idx = Math.min(Math.floor(capped / binWidth), binCount - 1);
    const bin = bins[idx];
    // TS: bins[idx] is possibly undefined — be defensive
    if (!bin) {
      continue;
    }
    bin.count += 1;
    bin.members.push(num);
  }

  const expectedPerBin = domainSize / binCount;

  return bins.map((b) => {
    const label =
      !Number.isFinite(b.end) ? `${b.start}+` : b.start === b.end ? `${b.start}` : `${b.start}–${b.end}`;
    return {
      label,
      start: b.start,
      end: b.end,
      count: b.count,
      expected: expectedPerBin,
      members: b.members,
    };
  });
}

// lotto / pool: group rows by exact mains combo and return UI-friendly buckets
export function buildLottoComboBuckets(
  rows: LottoRow[],
  gameKey: string
): {
  buckets: Array<{ key: string; mains: number[]; count: number; dates: string[] }>;
  totalCombos: number | null;
  distinctSeen: number;
} {
  if (!rows || rows.length === 0) {
    return { buckets: [], totalCombos: null, distinctSeen: 0 };
  }

  const era = getCurrentEraConfig(gameKey as any);
  const map = new Map<string, { key: string; mains: number[]; count: number; dates: string[] }>();

  for (const r of rows) {
    if (!r) continue;
    const mains = mainsFromRow(r, gameKey);
    const key = comboKeyFromMains(mains);
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
      existing.dates.push(r.date);
    } else {
      map.set(key, { key, mains, count: 1, dates: [r.date] });
    }
  }

  const buckets = Array.from(map.values()).sort(
    (a, b) => b.count - a.count || a.key.localeCompare(b.key)
  );

  // some historical eras may not have mainMax/mainPick – be defensive
  const totalCombos =
    typeof era.mainMax === 'number' && typeof era.mainPick === 'number'
      ? nCk(era.mainMax, era.mainPick)
      : null;

  return {
    buckets,
    totalCombos,
    distinctSeen: map.size,
  };
}

// group 1..mainMax into even ranges ("decades") and compare hits vs expected
export function buildLottoDecadeStrip(
  rows: LottoRow[],
  gameKey: string
): Array<{ label: string; hits: number; expected: number; ratio: number }> {
  if (!rows || rows.length === 0) return [];
  const era = getCurrentEraConfig(gameKey as any);
  const mainMax = typeof era.mainMax === 'number' ? era.mainMax : 0;
  const mainPick = typeof era.mainPick === 'number' ? era.mainPick : 0;
  if (!mainMax || !mainPick) return [];

  const segmentSize = mainMax >= 70 ? 10 : Math.ceil(mainMax / 7);

  const segments: Array<{ start: number; end: number; hits: number }> = [];
  for (let start = 1; start <= mainMax; ) {
    const end = Math.min(start + segmentSize - 1, mainMax);
    segments.push({ start, end, hits: 0 });
    start = end + 1;
  }

  for (const r of rows) {
    if (!r) continue;
    const mains = mainsFromRow(r, gameKey);
    for (const m of mains) {
      let idx = Math.floor((m - 1) / segmentSize);
      if (idx < 0) idx = 0;
      if (idx >= segments.length) idx = segments.length - 1;
      const seg = segments[idx];
      if (seg) {
        seg.hits += 1;
      }
    }
  }

  const totalDraws = rows.length;
  const out: Array<{ label: string; hits: number; expected: number; ratio: number }> = [];
  for (const seg of segments) {
    const segSize = seg.end - seg.start + 1;
    const prob = segSize / mainMax;
    const expected = totalDraws * (mainPick * prob);
    const ratio = expected > 0 ? seg.hits / expected : 1;
    out.push({
      label: `${seg.start}–${seg.end}`,
      hits: seg.hits,
      expected,
      ratio,
    });
  }

  return out;
}

// special-ball cycle tracker – average gap and last gap per special
export function buildSpecialBallCycles(
  rows: LottoRow[],
  gameKey: string
): Array<{ n: number; lastGap: number; avgGap: number; seen: number }> {
  if (!rows || rows.length === 0) return [];
  const era = getCurrentEraConfig(gameKey as any);
  const specialMax = typeof era.specialMax === 'number' ? era.specialMax : 0;
  if (!specialMax) return [];

  // index 0 unused so we can use 1..specialMax directly
  const gaps: Array<{ seen: number; lastGap: number }> = Array.from(
    { length: specialMax + 1 },
    () => ({ seen: 0, lastGap: Infinity })
  );

  // pass 1 (newest → oldest): figure out "how many draws ago did we last see this special?"
  for (let i = rows.length - 1, drawIdx = 0; i >= 0; i--, drawIdx++) {
    const r = rows[i];
    if (!r) continue;
    const s = r.special;
    if (typeof s === 'number' && s >= 1 && s <= specialMax) {
      const rec = gaps[s];
      if (rec) {
        if (rec.lastGap === Infinity) {
          rec.lastGap = drawIdx;
        }
        rec.seen += 1;
      }
    }
  }

  // pass 2 (oldest → newest): collect actual gaps between appearances for avg gap
  const indicesBySpecial: Array<number[]> = Array.from(
    { length: specialMax + 1 },
    () => []
  );
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    if (!r) continue;
    const s = r.special;
    if (typeof s === 'number' && s >= 1 && s <= specialMax) {
      const arr = indicesBySpecial[s];
      if (arr) {
        arr.push(i);
      }
    }
  }

  const perSpecialGaps: Array<number[]> = Array.from(
    { length: specialMax + 1 },
    () => []
  );
  for (let s = 1; s <= specialMax; s++) {
    const idxs = indicesBySpecial[s];
    // if there's no array yet, or fewer than 2 appearances, skip
    if (!idxs || idxs.length < 2) continue;

    // ensure we have an array to push into
    let gapsArr = perSpecialGaps[s];
    if (!gapsArr) {
      gapsArr = [];
      perSpecialGaps[s] = gapsArr;
    }

    for (let j = 1; j < idxs.length; j++) {
      const curr = idxs[j];
      const prev = idxs[j - 1];
      if (typeof curr === 'number' && typeof prev === 'number') {
        const gap = curr - prev;
        gapsArr.push(gap);
      }
    }
  }

  const out: Array<{ n: number; lastGap: number; avgGap: number; seen: number }> = [];
  for (let s = 1; s <= specialMax; s++) {
    const rec = gaps[s];
    const idxs = indicesBySpecial[s] || [];
    const gapArr = perSpecialGaps[s] || [];

    const lastGap =
      rec && rec.lastGap !== Infinity ? rec.lastGap : rows.length;

    const avgGap =
      gapArr.length > 0
        ? gapArr.reduce((sum, g) => sum + g, 0) / gapArr.length
        : rows.length; // if never/once, treat as long

    out.push({
      n: s,
      lastGap,
      avgGap,
      seen: rec ? rec.seen : idxs.length,
    });
  }

  // sort by longest-running first
  return out.sort((a, b) => b.lastGap - a.lastGap);
}



