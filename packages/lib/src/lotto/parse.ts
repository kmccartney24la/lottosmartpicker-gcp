// packages/lib/src/lotto/parse.ts

// Type-only import so we don't create a runtime cycle while the monolith façade still exists.
// This should resolve to your current public lib façade (which still re-exports the monolith).
import type { GameKey, LottoRow } from './types.js';

/* ===========================
   Tokens
   =========================== */

export function parseTokens(s: string): number[] {
  return s
    .replace(/[,;\-|]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => parseInt(t, 10))
    .filter((n) => Number.isFinite(n));
}

/* ===========================
   Canonical CSV parser (one game per file)
   =========================== */

export function parseCanonicalCsv(csv: string, game: GameKey): LottoRow[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length === 0) return [];

  const header = lines.shift()!;
  const cols = header.split(',').map((s) => s.trim().toLowerCase());
  const idx = (name: string) => cols.indexOf(name);

  const iDate = idx('draw_date');

  // detect main columns
  const i1 = idx('num1') >= 0 ? idx('num1') : idx('m1');
  const i2 = idx('num2') >= 0 ? idx('num2') : idx('m2');
  const i3 = idx('num3') >= 0 ? idx('num3') : idx('m3');
  const i4 = idx('num4') >= 0 ? idx('num4') : idx('m4');
  const i5raw = idx('num5') >= 0 ? idx('num5') : idx('m5');

  // optional: accept common aliases for special/bonus ball
  let iSpec = idx('special');
  if (iSpec < 0) iSpec = idx('bonus');

  // optional: allow 6th main to stand in for special (Lotto-style 6 mains)
  const i6 = idx('num6') >= 0 ? idx('num6') : idx('m6');

  // must have a date
  if (iDate < 0) return [];

  // how many main columns do we actually have?
  // we always require 1..4, because all your games have at least 4
  const have4 = [i1, i2, i3, i4].every((i) => i >= 0);
  const have5 = have4 && i5raw >= 0;

  // if we don't even have 4, bail
  if (!have4) return [];

  const out: LottoRow[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const t = line.split(',').map((s) => s.trim());

    const dStr = t[iDate] ?? '';
    if (!dStr) continue;
    const d = new Date(dStr);
    if (Number.isNaN(d.getTime())) continue;
    const date = d.toISOString().slice(0, 10);

    // read 4 mandatory mains
    const m1 = parseInt(t[i1] ?? '', 10);
    const m2 = parseInt(t[i2] ?? '', 10);
    const m3 = parseInt(t[i3] ?? '', 10);
    const m4 = parseInt(t[i4] ?? '', 10);
    if (![m1, m2, m3, m4].every(Number.isFinite)) continue;

    // optional 5th main
    let m5: number | undefined = undefined;
    if (have5) {
      const v = parseInt(t[i5raw] ?? '', 10);
      if (Number.isFinite(v)) m5 = v;
    }

    // special / bonus / or 6th main
    let special: number | undefined;
    const specRaw = iSpec >= 0 ? t[iSpec] : undefined;
    if (specRaw != null && specRaw !== '') {
      const s = parseInt(specRaw, 10);
      if (Number.isFinite(s)) special = s;
    } else {
      const sixRaw = i6 >= 0 ? t[i6] : undefined;
      if (sixRaw != null && sixRaw !== '') {
        const s6 = parseInt(sixRaw, 10);
        if (Number.isFinite(s6)) special = s6;
      }
    }

    // normalize to LottoRow shape (always n1..n5)
    out.push({
      game,
      date,
      n1: m1,
      n2: m2,
      n3: m3,
      n4: m4,
      n5: m5 ?? NaN, // or undefined, but keep it numeric if the rest of your code likes numbers
      special,
    });
  }

  return out
    // Normalize sort order to ascending date (matches parseFlexibleCsv)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/* ===========================
   Flexible CSV parser (dynamic n1..nN[,special])
   =========================== */

type FlexibleRow = { date: string; values: number[]; special?: number };

export function parseFlexibleCsv(csv: string): FlexibleRow[] {
  const lines = csv.trim().split(/\r?\n/);
  if (lines.length < 2) return [];
  const header = lines
    .shift()!
    .split(',')
    .map((s) => s.trim().toLowerCase());
  const find = (n: string) => header.indexOf(n);
  const iDate = ['draw_date', 'date'].map(find).find((i) => i >= 0) ?? -1;
  if (iDate < 0) return [];

  // discover columns for values:
  // 1) n1..nN, 2) m1..mN, 3) num1..numN, 4) ball1..ballN
  const nIdx: number[] = [];
  const trySeq = (prefix: string) => {
    const acc: number[] = [];
    for (let i = 1; i <= 40; i++) {
      const j = find(`${prefix}${i}`);
      if (j >= 0) acc.push(j);
      else break;
    }
    return acc;
  };
  let seq = trySeq('n');
  if (seq.length === 0) seq = trySeq('m');
  if (seq.length === 0) seq = trySeq('num');
  if (seq.length === 0) seq = trySeq('ball');
  nIdx.push(...seq);

  // optional special column
  // Support common aliases: 'special', 'bonus', 'fb' (Florida/Texas Fireball), 'fireball'
  let iSpec = find('special');
  if (iSpec < 0) iSpec = find('bonus');
  if (iSpec < 0) iSpec = find('fb');
  if (iSpec < 0) iSpec = find('fireball');

  // optional single string column of winning numbers
  const iWinning = find('winning_numbers');

  const out: FlexibleRow[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const t = line.split(',').map((s) => s.trim());
    const dStr = t[iDate] ?? '';
    if (!dStr) continue;
    const d = new Date(dStr);
    if (Number.isNaN(d.getTime())) continue;
    const date = d.toISOString().slice(0, 10);

    let values = nIdx
      .map((i) => parseInt(t[i] ?? '', 10))
      .filter(Number.isFinite);

    // fallback: parse "winning_numbers" token list if no numbered columns found
    if (values.length === 0 && iWinning >= 0 && t[iWinning]) {
      values = t[iWinning]
        .replace(/[,;|]/g, ' ')
        .split(/\s+/)
        .map((s) => parseInt(s, 10))
        .filter(Number.isFinite);
    }

    let special: number | undefined;
    const sRaw = iSpec >= 0 ? t[iSpec] : undefined;
    if (sRaw != null && sRaw !== '') {
      const s = parseInt(sRaw, 10);
      if (Number.isFinite(s)) special = s;
    }

    out.push({ date, values, special });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/* ===========================
   Async wrappers (worker-offload when enabled)
   =========================== */

export const USE_WORKER =
  typeof window !== 'undefined' &&
  ((window as any).__LSP_USE_WORKER__ === true ||
    ((typeof process !== 'undefined') &&
      // @ts-ignore (process in browser during build)
      (process as any).env?.NEXT_PUBLIC_USE_WORKER === '1'));

async function _bridge(): Promise<typeof import('../workers/workerBridge.js')> {
  // Path is relative to this file: packages/lib/src/lotto/parse.ts
  // workerBridge lives at:        packages/lib/src/workers/workerBridge.js
  return await import('../workers/workerBridge.js');
}

export async function parseCanonicalCsvAsync(
  csv: string,
  game: GameKey,
  signal?: AbortSignal
) {
  if (!USE_WORKER) return parseCanonicalCsv(csv, game);
  const { runTask } = await _bridge();
  return runTask<{ csv: string; game: GameKey }, ReturnType<typeof parseCanonicalCsv>>(
    'parseCanonicalCsv',
    { csv, game },
    signal
  );
}

export async function parseFlexibleCsvAsync(csv: string, signal?: AbortSignal) {
  if (!USE_WORKER) return parseFlexibleCsv(csv);
  const { runTask } = await _bridge();
  return runTask<{ csv: string }, ReturnType<typeof parseFlexibleCsv>>(
    'parseFlexibleCsv',
    { csv },
    signal
  );
}
