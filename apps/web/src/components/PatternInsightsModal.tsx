// src/components/PatternInsightsModal.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Line, LineChart } from 'recharts';
import './PatternInsightsModal.css';
import type {
  GameKey,
  LogicalGameKey,
  LottoRow,
  DigitRowEx,
  Pick10Row,
  AllOrNothingRow,
  QuickDrawRow,
  CashPopRow,
  CashPopPeriod,
} from '@lsp/lib';
import {
  // common/5-6 games
  fetchRowsWithCache,
  computeStats,
  getCurrentEraConfig,
  resolveGameMeta,
  filterRowsForCurrentEra,
  nCk,
  repForLogical,
  // digits
  fetchDigitRowsFor,
  isDigitShape,
  digitLogicalFor,
  // k-of-N fetchers
  fetchPick10RowsFor,
  fetchQuickDrawRowsFor,
  fetchAllOrNothingRowsFor,
  fetchCashPopRows,
  // k-of-N family (Pick10, QuickDraw, All or Nothing)
  computeKOfNStats,
  computePick10Stats,
  computeQuickDrawStats,
  computeAllOrNothingStats,
  displayNameFor,
} from '@lsp/lib';

type Props = {
  open: boolean;
  gameKey: GameKey | LogicalGameKey | null;
  onClose: () => void;
  period?: 'midday' | 'evening' | 'both';
};

// ──────────────────────────────────────────────────────────
// helpers
// ──────────────────────────────────────────────────────────

function mainsFromRow(row: LottoRow, gameKey: GameKey | LogicalGameKey): number[] {
  const era = getCurrentEraConfig(gameKey);

  // keep the 1–5 mains, but don’t use Boolean here — be explicit
  const mains = [row.n1, row.n2, row.n3, row.n4, row.n5]
    .filter((n): n is number => Number.isFinite(n));

  // match stats.ts: only these store the 6th main in `special`
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

function comboKeyFromMains(mains: number[]): string {
  return mains.slice().sort((a, b) => a - b).join('-');
}

// cashpop: 1 number, small domain (typically 1..15). we want a gap map like the other modes.
function buildCashPopLastSeen(rows: CashPopRow[], domainSize = 15) {
  const lastSeen = new Map<number, number>();
  for (let n = 1; n <= domainSize; n++) {
    lastSeen.set(n, Infinity);
  }
  // newest → oldest
  for (let i = rows.length - 1, idx = 0; i >= 0; i--, idx++) {
    const v = rows[i]!.value;
    if (Number.isFinite(v)) {
      const prev = lastSeen.get(v) ?? Infinity;
      if (idx < prev) lastSeen.set(v, idx);
    }
  }
  return lastSeen;
}

// normalize the period prop (midday/evening/both) to something cashpop understands
// cashpop has: morning | matinee | afternoon | evening | latenight | all
function normalizeCashPopPeriod(period: string | undefined): CashPopPeriod | 'all' {
  if (!period) return 'all';
  if (
    period === 'morning' ||
    period === 'matinee' ||
    period === 'afternoon' ||
    period === 'evening' ||
    period === 'latenight'
  ) return period;
  return 'all';
}

// last-seen for digits 0..9 based on reversed rows
function buildDigitOverdue(rows: DigitRowEx[], k: number) {
  const lastSeen = new Map<number, number>();
  for (let d = 0; d <= 9; d++) {
    lastSeen.set(d, Infinity);
  }
  // newest → oldest (we’ll count how far back each digit appears)
  for (let i = rows.length - 1, idx = 0; i >= 0; i--, idx++) {
    const r = rows[i];
    for (let p = 0; p < k; p++) {
      const dv = r.digits[p];
      if (Number.isFinite(dv)) {
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

// build a true histogram of "draws since last seen"
// - lastSeen: Map of number → drawsSince
// - domainSize: how many numbers are in this domain (e.g. 69 for PB mains, 26 for specials)
// - maxDraws: cap for Infinity values (we'll treat "never seen in this era" as maxDraws)
// we auto-scale bin count so smaller games get tighter bin widths
// we also keep track of WHICH numbers fell into each bin so we can show them on hover/click
function buildRecencyHistogram(
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

  // auto bin count: more numbers → more bins (bounded)
  // e.g. 35 numbers → ~5 bins, 69 numbers → ~9 bins
  const autoBins = Math.ceil(domainSize / 8);
  const binCount = Math.min(12, Math.max(5, autoBins));

  // avoid division by 0
  const binWidth = maxGap === 0 ? 1 : Math.max(1, Math.ceil(maxGap / binCount));

  const bins: Array<{ start: number; end: number; count: number; members: number[] }> = [];
  for (let i = 0; i < binCount; i++) {
    const start = i * binWidth;
    const end = i === binCount - 1 ? Number.POSITIVE_INFINITY : (i + 1) * binWidth - 1;
    bins.push({ start, end, count: 0, members: [] });
  }

  // tally
  for (let num = 1; num <= domainSize; num++) {
    const g = gaps[num - 1] ?? maxDraws;
    const capped = Math.min(g, maxDraws);
    const idx = Math.min(Math.floor(capped / binWidth), binCount - 1);
    bins[idx].count += 1;
    bins[idx].members.push(num);
  }

  // expected baseline if numbers were spread evenly
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

export default function PatternInsightsModal({
  open,
  gameKey,
  onClose,
  period = 'both',
}: Props) {
  const [rows, setRows] = useState<LottoRow[] | null>(null);
  const [digitRows, setDigitRows] = useState<DigitRowEx[] | null>(null);
  const [kofnRows, setKofnRows] = useState<Array<Pick10Row | QuickDrawRow | AllOrNothingRow> | null>(null);
  const [cashpopRows, setCashpopRows] = useState<CashPopRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [activeRecencyBin, setActiveRecencyBin] = useState<{ kind: 'main' | 'special' | 'cashpop'; index: number } | null>(null);

  // close on ESC
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  // lock background scroll while modal is open
  useEffect(() => {
    if (!open) return;
    const prevBodyOverflow = document.body.style.overflow;
    const prevHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prevBodyOverflow;
      document.documentElement.style.overflow = prevHtmlOverflow;
    };
  }, [open]);

  // fetch data
  useEffect(() => {
    if (!open || !gameKey) {
      setRows(null);
      setDigitRows(null);
      setErr(null);
      setCashpopRows(null);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        setLoading(true);
        setErr(null);

        const meta = resolveGameMeta(
          gameKey as GameKey | undefined,
          gameKey as LogicalGameKey | undefined
        );

        // DIGIT GAMES ---------------------------------------------------
        if (isDigitShape(meta.shape)) {
          const digLogical = digitLogicalFor(undefined, gameKey as LogicalGameKey);
          if (!digLogical) {
            throw new Error('Digit logical could not be resolved for ' + String(gameKey));
          }
          const got = await fetchDigitRowsFor(digLogical as any, period);
          if (!cancelled) {
            setDigitRows(got);
            setRows(null);
          }
          return;
        }

        // CASHPOP -------------------------------------------------------
        if (meta.shape === 'cashpop') {
          const cpPeriod = normalizeCashPopPeriod(period);
          const got = await fetchCashPopRows(cpPeriod as CashPopPeriod | 'all');
          if (!cancelled) {
            setCashpopRows(got);
            setRows(null);
            setDigitRows(null);
            setKofnRows(null);
          }
          return;
        }

        // K-OF-N GAMES (fetch with the right fetcher) -------------------
        if (meta.shape === 'pick10') {
          const got = await fetchPick10RowsFor(gameKey as any);
          if (!cancelled) {
            setKofnRows(got);
            setRows(null);
            setDigitRows(null);
          }
          return;
        }

        if (meta.shape === 'quickdraw') {
          const got = await fetchQuickDrawRowsFor(gameKey as any);
          if (!cancelled) {
            setKofnRows(got);
            setRows(null);
            setDigitRows(null);
          }
          return;
        }

        // TX All or Nothing isn’t marked with a special shape in all places,
        // so detect by key too.
        if (gameKey === 'tx_all_or_nothing') {
          const got = await fetchAllOrNothingRowsFor('tx_all_or_nothing', 'all');
          if (!cancelled) {
            setKofnRows(got);
            setRows(null);
            setDigitRows(null);
          }
          return;
        }

        // LOTTO / POOL GAMES -------------------------------------------
        const fetched = await fetchRowsWithCache({ game: gameKey as GameKey });
        // era filter uses the key we’re showing insights for
        const filtered = filterRowsForCurrentEra(fetched, gameKey as GameKey);
        if (!cancelled) {
          setRows(filtered);
          setKofnRows(null);
          setDigitRows(null);
          setCashpopRows(null);
        }
      } catch (e: any) {
        if (!cancelled) setErr(e?.message || 'Failed to load game rows.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, gameKey, period]);

  // decide what kind of non-digit game we have
  const meta = gameKey
    ? resolveGameMeta(gameKey as GameKey | undefined, gameKey as LogicalGameKey | undefined)
    : null;
  const isCashPop = meta?.shape === 'cashpop';

    // canonical, registry-backed display name
  const displayName = gameKey ? displayNameFor(gameKey) : '';

  // ----- LOTTO / POOL ANALYTICS ---------------------------------------
  const stats = useMemo(() => {
    if (!rows || !gameKey) return null;
    // in your setup, computeStats is happy with the key we’re displaying
    return computeStats(rows, gameKey as GameKey);
  }, [rows, gameKey]);

  // some states (NY Lotto, FL Lotto, FL Jackpot Triple Play, Lotto Texas)
  // draw 6 mains but store the 6th in the `special` slot for CSV compatibility.
  // in those cases, there is NO separate special domain to show.
  const isSixMainNoSpecial =
    !!stats && stats.cfg.mainPick > 5 && (stats.cfg.specialMax ?? 0) === 0;

  // ----- K-OF-N ANALYTICS (Pick10 / QuickDraw / All or Nothing) -------
  const kOfNStats = useMemo(() => {
    if (!kofnRows || !gameKey || kofnRows.length === 0) return null;

    // infer k and N from the actual data
    const first = kofnRows[0] as any;
    const values = Array.isArray(first.values)
      ? (first.values as number[]).filter((n) => Number.isFinite(n))
      : [];
    const k = values.length;
    const N = kofnRows.reduce((acc, r: any) => {
      const vs = Array.isArray(r.values) ? r.values : [];
      const localMax = vs.reduce((m: number, n: number) => (Number.isFinite(n) ? Math.max(m, n) : m), 0);
      return Math.max(acc, localMax);
    }, 0);

    const key = String(gameKey).toLowerCase();

    // prefer explicit game-aware stat fns
    if (key.includes('pick10') || key.includes('pick_10') || (k === 10 && N === 80)) {
      return computePick10Stats(kofnRows as Pick10Row[]);
    }
    if (key.includes('quick') || key.includes('draw') || key.includes('keno') || (k === 20 && N === 80)) {
      return computeQuickDrawStats(kofnRows as QuickDrawRow[]);
    }
    if ((key.includes('all') && key.includes('nothing')) || (k === 12 && N === 24)) {
      return computeAllOrNothingStats(kofnRows as AllOrNothingRow[]);
    }

    // fallback: generic k-of-N
    if (k > 0 && N > 0) {
      return computeKOfNStats(
        kofnRows.map((r: any) => ({ values: (r.values as number[]) || [] })),
        k,
        N
      );
    }

    return null;
  }, [kofnRows, gameKey]);

  const kOfNOverdue = useMemo(() => {
    if (!kOfNStats) return [];
    const out: Array<{ n: number; drawsSince: number }> = [];
    // lastSeen is 1..N
    for (const [num, gap] of kOfNStats.lastSeen.entries()) {
      out.push({ n: num, drawsSince: gap ?? Infinity });
    }
    return out
      .sort((a, b) => (b.drawsSince ?? 0) - (a.drawsSince ?? 0))
      .slice(0, 12);
  }, [kOfNStats]);

  const kOfNHotCold = useMemo(() => {
    if (!kOfNStats) return { hottest: [], coldest: [] as Array<{ n: number; z: number }> };
    const arr = Array.from(kOfNStats.z.entries()).map(([n, z]) => ({ n, z: z ?? 0 }));
    const hottest = arr.slice().sort((a, b) => b.z - a.z).slice(0, 10);
    const coldest = arr.slice().sort((a, b) => a.z - b.z).slice(0, 10);
    return { hottest, coldest };
  }, [kOfNStats]);

  // k-of-N "hits vs expected from hot set" sparkline
  // idea: define a hot set from top z-scores, then for each draw count how many of that draw's
  // numbers were in that hot set; compare to the expected count for a k-of-N game.
  const kOfNHotSetHits = useMemo(() => {
    if (!kofnRows || !kOfNStats || kofnRows.length === 0) return null;

    // infer k and N from rows (same approach as other k-of-N memos)
    const first = kofnRows[0] as any;
    const firstVals = Array.isArray(first?.values)
      ? (first.values as number[]).filter((n) => Number.isFinite(n))
      : [];
    const k = firstVals.length;
    const N = kofnRows.reduce((acc, r: any) => {
      const vs = Array.isArray(r.values) ? r.values : [];
      const localMax = vs.reduce(
        (m: number, n: number) => (Number.isFinite(n) ? Math.max(m, n) : m),
        0
      );
      return Math.max(acc, localMax);
    }, 0);

    if (!k || !N) return null;

    // build hot set from z-scores
    const zEntries = Array.from(kOfNStats.z.entries()).map(([num, z]) => ({ num, z: z ?? 0 }));
    // choose a sensible hot size:
    // - at least 4
    // - at most 20
    // - around 25% of board for small boards
    const targetBySize = Math.floor(N * 0.25);
    const hotSize = Math.max(4, Math.min(20, targetBySize || 4));
    const hotSet = new Set(
      zEntries
        .sort((a, b) => b.z - a.z)
        .slice(0, hotSize)
        .map((e) => e.num)
    );

    const expectedPerDraw = k * (hotSet.size / N);

    // build chronological series (oldest → newest) so the chart reads left→right
    const series: Array<{ idx: number; hits: number; expected: number }> = [];
    for (let i = 0; i < kofnRows.length; i++) {
      const vals = Array.isArray((kofnRows[i] as any).values)
        ? ((kofnRows[i] as any).values as number[]).filter((n) => Number.isFinite(n))
        : [];
      let hits = 0;
      for (const v of vals) {
        if (hotSet.has(v)) hits += 1;
      }
      series.push({
        idx: i + 1,
        hits,
        expected: expectedPerDraw,
      });
    }

    // keep the last 60 points for readability
    const trimmed = series.length > 60 ? series.slice(series.length - 60) : series;
    return { data: trimmed, hotSize: hotSet.size, expectedPerDraw, total: series.length };
  }, [kofnRows, kOfNStats]);

  // k-of-N range / "decade" strip (pick10, quickdraw/keno, all or nothing)
  const kOfNSegments = useMemo(() => {
    if (!kofnRows || kofnRows.length === 0) return null;

    // infer k and N, same way we did above
    const first = kofnRows[0] as any;
    const firstValues = Array.isArray(first?.values)
      ? (first.values as number[]).filter((n) => Number.isFinite(n))
      : [];
    const k = firstValues.length;
    const N = kofnRows.reduce((acc, r: any) => {
      const vs = Array.isArray(r.values) ? r.values : [];
      const localMax = vs.reduce(
        (m: number, n: number) => (Number.isFinite(n) ? Math.max(m, n) : m),
        0
      );
      return Math.max(acc, localMax);
    }, 0);

    if (!k || !N) return null;

    // choose segment size based on board size
    //  - 80-board (quickdraw/pick10) → 10s
    //  - 24-board (all or nothing) → 6s
    //  - otherwise → ~6 segments
    let segmentSize: number;
    if (N >= 80) {
      segmentSize = 10;
    } else if (N === 24) {
      segmentSize = 6;
    } else {
      segmentSize = Math.ceil(N / 6);
    }

    const segments: Array<{ start: number; end: number; hits: number; expected: number }> = [];
    for (let start = 1; start <= N; ) {
      const end = Math.min(start + segmentSize - 1, N);
      segments.push({ start, end, hits: 0, expected: 0 });
      start = end + 1;
    }

    const totalDraws = kofnRows.length;

    // tally actual hits into segments
    for (const r of kofnRows) {
      const vals = Array.isArray((r as any).values)
        ? ((r as any).values as number[]).filter((n) => Number.isFinite(n))
        : [];
      for (const v of vals) {
        let idx = Math.floor((v - 1) / segmentSize);
        if (idx < 0) idx = 0;
        if (idx >= segments.length) idx = segments.length - 1;
        segments[idx]!.hits += 1;
      }
    }

    // compute expected hits per segment: draws * (k * (segSize / N))
    for (const seg of segments) {
      const segSize = seg.end - seg.start + 1;
      const prob = segSize / N;
      seg.expected = totalDraws * (k * prob);
    }

    const data = segments.map((seg) => {
      const ratio = seg.expected > 0 ? seg.hits / seg.expected : 1;
      return {
        label: `${seg.start}–${seg.end}`,
        hits: seg.hits,
        expected: seg.expected,
        ratio,
      };
    });

    return { N, k, segmentSize, data, totalDraws };
  }, [kofnRows]);

  // draw-to-draw overlap histogram for k-of-N games
  const kOfNOverlap = useMemo(() => {
    if (!kofnRows || kofnRows.length < 2) return null;

    // infer k from the first row
    const first = kofnRows[0] as any;
    const baseValues = Array.isArray(first.values)
      ? (first.values as number[]).filter((n) => Number.isFinite(n))
      : [];
    const k = baseValues.length;
    if (k === 0) return null;

    // counts for overlap = 0..k
    const counts = Array.from({ length: k + 1 }, () => 0);

    for (let i = 1; i < kofnRows.length; i++) {
      const prevVals = new Set(
        Array.isArray((kofnRows[i - 1] as any).values)
          ? ((kofnRows[i - 1] as any).values as number[]).filter((n) => Number.isFinite(n))
          : []
      );
      const currVals = Array.isArray((kofnRows[i] as any).values)
        ? ((kofnRows[i] as any).values as number[]).filter((n) => Number.isFinite(n))
        : [];
      let overlap = 0;
      for (const v of currVals) {
        if (prevVals.has(v)) overlap += 1;
      }
      if (overlap >= 0 && overlap <= k) {
        counts[overlap] += 1;
      }
    }

    const data = counts.map((count, overlap) => ({
      overlap,
      count,
    }));

    return { k, data, draws: kofnRows.length - 1 };
  }, [kofnRows]);

  // all-or-nothing specific: balance of draws between 1–12 and 13–24
  // we treat "distance from center" as "how many of the 12 selected numbers came from the low half (1–12)"
  // so x-axis is 0..12, y-axis is how many draws had exactly that low-half count.
  const allOrNothingBalance = useMemo(() => {
    if (!kofnRows || kofnRows.length === 0) return null;

    // infer k and N quickly
    const first = kofnRows[0] as any;
    const vals = Array.isArray(first?.values)
      ? (first.values as number[]).filter((n) => Number.isFinite(n))
      : [];
    const k = vals.length;
    const N = kofnRows.reduce((acc, r: any) => {
      const vs = Array.isArray(r.values) ? r.values : [];
      const localMax = vs.reduce(
        (m: number, n: number) => (Number.isFinite(n) ? Math.max(m, n) : m),
        0
      );
      return Math.max(acc, localMax);
    }, 0);

    // only apply to the canonical 12/24 "all or nothing" shape
    if (!(k === 12 && N === 24)) return null;

    // we count, for each draw, how many of its 12 fell into 1..12
    const counts = Array.from({ length: k + 1 }, () => 0);

    for (const r of kofnRows) {
      const drawVals = Array.isArray((r as any).values)
        ? ((r as any).values as number[]).filter((n) => Number.isFinite(n))
        : [];
      let lowHits = 0;
      for (const v of drawVals) {
        if (v >= 1 && v <= 12) lowHits += 1;
      }
      if (lowHits >= 0 && lowHits <= k) {
        counts[lowHits] += 1;
      }
    }

    const data = counts.map((count, lowHits) => ({
      lowHits,
      count,
    }));

    return {
      k,
      N,
      data,
      draws: kofnRows.length,
    };
  }, [kofnRows]);

  // ----- CASHPOP ANALYTICS --------------------------------------------
  const cashpopView = useMemo(() => {
    if (!cashpopRows || !isCashPop) return null;
    const domainSize = 15; // FL Cash Pop is 1..15 in your types
    const lastSeen = buildCashPopLastSeen(cashpopRows, domainSize);
    const overdue = Array.from({ length: domainSize }, (_, i) => {
      const n = i + 1;
      return { n, drawsSince: lastSeen.get(n) ?? Infinity };
    })
      .sort((a, b) => (b.drawsSince ?? 0) - (a.drawsSince ?? 0))
      .slice(0, domainSize);

    const maxDraws = cashpopRows.length || 1;
    const recency = buildRecencyHistogram(lastSeen, domainSize, maxDraws);

    // frequency: simple count of each value 1..15
    const freq: Array<{ n: number; count: number }> = Array.from({ length: domainSize }, (_, i) => ({
      n: i + 1,
      count: 0,
    }));
    let totalHits = 0;
    for (const r of cashpopRows) {
      if (r.value >= 1 && r.value <= domainSize) {
        freq[r.value - 1]!.count += 1;
        totalHits += 1;
      }
    }
    const maxCount = freq.reduce((m, f) => Math.max(m, f.count), 0) || 1;
    const avgCount = totalHits > 0 ? totalHits / domainSize : 0;

    return {
      domainSize,
      overdue,
      recency,
      freq,
      maxCount,
      totalDraws: cashpopRows.length,
      avgCount,
    };
  }, [cashpopRows, isCashPop]);

  const comboData = useMemo(() => {
    if (!rows || !gameKey) {
      return {
        buckets: [] as Array<{ key: string; mains: number[]; count: number; dates: string[] }>,
        totalCombos: null as number | null,
        distinctSeen: 0,
      };
    }

    const era = getCurrentEraConfig(gameKey as GameKey);

    const map = new Map<string, { key: string; mains: number[]; count: number; dates: string[] }>();
    for (const r of rows) {
      const mains = mainsFromRow(r, gameKey as GameKey);
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
    const totalCombos = nCk(era.mainMax, era.mainPick);
    return {
      buckets,
      totalCombos,
      distinctSeen: map.size,
    };
  }, [rows, gameKey]);

  const overdueList =
    stats
      ? Array.from({ length: stats.cfg.mainMax }, (_, i) => {
          const n = i + 1;
          return { n, drawsSince: stats.lastSeenMain.get(n) ?? Infinity };
        })
          .sort((a, b) => (b.drawsSince ?? 0) - (a.drawsSince ?? 0))
          .slice(0, 12)
      : [];

  // special-ball overdue (only for games whose era has a special domain, e.g. PB/MM/C4L/CA SLP/TX Two Step)
  const specialOverdueList = useMemo(() => {
    if (!stats) return [];
    const cfg = stats.cfg;
    if (!cfg.specialMax || cfg.specialMax <= 0) return [];
    const out: Array<{ n: number; drawsSince: number }> = [];
    for (let s = 1; s <= cfg.specialMax; s++) {
      out.push({
        n: s,
        drawsSince: stats.lastSeenSpecial.get(s) ?? Infinity,
      });
    }
    return out
      .sort((a, b) => (b.drawsSince ?? 0) - (a.drawsSince ?? 0))
      // specials are small domains; top 6 is usually enough
      .slice(0, Math.min(6, cfg.specialMax));
  }, [stats]);

  // main-number recency histogram for true vertical chart
  const mainRecencyHistogram = useMemo(() => {
    if (!stats || !rows) return [];
    const maxDraws = rows.length || 1;
    return buildRecencyHistogram(stats.lastSeenMain, stats.cfg.mainMax, maxDraws);
  }, [stats, rows]);

  // special-ball recency histogram (when special domain exists)
  const specialRecencyHistogram = useMemo(() => {
    if (!stats || !rows) return [];
    const cfg = stats.cfg;
    if (!cfg.specialMax || cfg.specialMax <= 0) return [];
    const maxDraws = rows.length || 1;
    return buildRecencyHistogram(
      stats.lastSeenSpecial,
      cfg.specialMax,
      maxDraws
    );
  }, [stats, rows]);

  const hotCold =
    stats
      ? Array.from({ length: stats.cfg.mainMax }, (_, i) => {
          const n = i + 1;
          return { n, z: stats.zMain.get(n) ?? 0 };
        })
      : [];

  const hottest = hotCold.slice().sort((a, b) => b.z - a.z).slice(0, 10);
  const coldest = hotCold.slice().sort((a, b) => a.z - b.z).slice(0, 10);

  const repeatedTwice = comboData.buckets.filter((b) => b.count === 2);
  const repeated3plus = comboData.buckets.filter((b) => b.count >= 3);

  // ----- DIGIT ANALYTICS ----------------------------------------------
  const digitView = useMemo(() => {
    if (!digitRows || !gameKey || digitRows.length === 0) return null;

    const k = digitRows[0].digits.length;
    // per-position frequency
    const perPos: Array<{ pos: number; counts: number[] }> = [];
    for (let p = 0; p < k; p++) {
      const counts = Array(10).fill(0);
      for (const r of digitRows) {
        const dv = r.digits[p];
        if (Number.isFinite(dv)) counts[dv] += 1;
      }
      perPos.push({ pos: p, counts });
    }

    // exact-sequence repeats
    const patternMap = new Map<string, { seq: number[]; count: number; dates: string[] }>();
    for (const r of digitRows) {
      const key = r.digits.join('-');
      const ex = patternMap.get(key);
      if (ex) {
        ex.count += 1;
        ex.dates.push(r.date);
      } else {
        patternMap.set(key, { seq: r.digits.slice(), count: 1, dates: [r.date] });
      }
    }
    // normalize date order per pattern: most recent → least recent
    // assuming ISO-like date strings from the rows (YYYY-MM-DD), string compare works
    const normalizedPatterns = Array.from(patternMap.values()).map((p) => {
      const sortedDates = p.dates.slice().sort((a, b) => b.localeCompare(a));
      return {
        ...p,
        dates: sortedDates,
      };
    });

    // show *all* repeats (count > 1), we will scroll this in the UI
    const repeatPatterns = normalizedPatterns
      .filter((p) => p.count > 1)
      .sort((a, b) => b.count - a.count || a.seq.join('-').localeCompare(b.seq.join('-')));

    // overdue digits 0..9
    const lastSeen = buildDigitOverdue(digitRows, k);
    const overdueDigits = Array.from({ length: 10 }, (_, d) => ({
      digit: d,
      drawsSince: lastSeen.get(d) ?? Infinity,
    }))
      .sort((a, b) => (b.drawsSince ?? 0) - (a.drawsSince ?? 0))
      .slice(0, 10);

    // fireball usage
    let fbCount = 0;
    const fbDigits = new Map<number, number>();
    for (const r of digitRows) {
      if (typeof r.fb === 'number') {
        fbCount += 1;
        fbDigits.set(r.fb, (fbDigits.get(r.fb) ?? 0) + 1);
      }
    }
    const fbTop = Array.from(fbDigits.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([digit, count]) => ({ digit, count }));

    return {
      k,
      perPos,
      repeatPatterns,
      overdueDigits,
      fbCount,
      fbTop,
      totalDraws: digitRows.length,
    };
  }, [digitRows, gameKey]);

  if (!open || !gameKey) return null;

  const handleBackdropClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const isDigits = meta ? isDigitShape(meta.shape) : false;

  return (
    <div className="pattern-modal-backdrop" onClick={handleBackdropClick}>
      <div
        className="pattern-modal"
        ref={containerRef}
        role="dialog"
        aria-modal="true"
        aria-label="Pattern insights dashboard"
      >
        <header className="pattern-modal-header">
          <div>
            <h2 className="pattern-modal-title">Pattern Insights</h2>
            <p className="pattern-modal-sub">Game: {displayName}</p>
          </div>
          <button type="button" className="pattern-modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        {loading && <div className="pattern-modal-loading">Loading rows…</div>}
        {err && <div className="pattern-modal-error">{err}</div>}

        {/* DIGIT VIEW */}
        {!loading && !err && isDigits && digitView && (
          <div className="pattern-modal-body">
            {/* per-position frequency */}
            <section className="pattern-section">
              <h3 className="pattern-section-title">Per-position frequency</h3>
              <p className="pattern-muted">
                Each row is a position; darker cells = digit appeared more often in that position. Rows use the
                max count for that position as 100%.
              </p>
              {/* wrap in a scroll container so wide matrices don’t get clipped on mobile */}
              <div className="pattern-digit-matrix-wrap">
                <div className="pattern-digit-matrix" role="grid" aria-label="Digit frequency by position">
                {/* header row */}
                <div className="pattern-digit-matrix-row pattern-digit-matrix-row--header" role="row">
                  <div className="pattern-digit-matrix-cell pattern-digit-matrix-cell--corner" />
                  {Array.from({ length: 10 }, (_, d) => (
                    <div key={d} className="pattern-digit-matrix-cell pattern-digit-matrix-cell--header" role="columnheader">
                      {d}
                    </div>
                  ))}
                </div>
                {digitView.perPos.map((pos) => {
                  const max = Math.max(...pos.counts, 1);
                  return (
                    <div key={pos.pos} className="pattern-digit-matrix-row" role="row">
                      <div className="pattern-digit-matrix-cell pattern-digit-matrix-cell--pos" role="rowheader">
                        P{pos.pos + 1}
                      </div>
                      {pos.counts.map((ct, d) => {
                        const pct = max > 0 ? ct / max : 0;
                        // discrete bands make the colors easier to read, but digit games often have
                        // values clustered near the max. So widen the mid bands so fewer cells look "max".
                        // 0 = empty, 1 = low (<40%), 2 = med (<65%), 3 = high (<85%), 4 = top (>=85%)
                        let band = 0;
                        if (pct > 0) {
                          if (pct < 0.4) band = 1;
                          else if (pct < 0.65) band = 2;
                          else if (pct < 0.85) band = 3;
                          else band = 4;
                        }
                        return (
                          <div
                            key={d}
                            className={
                              'pattern-digit-matrix-cell pattern-digit-matrix-cell--value ' +
                              `pattern-digit-matrix-cell--band-${band}`
                            }
                            role="gridcell"
                            aria-label={`Position ${pos.pos + 1}, digit ${d}, ${ct} hits`}
                            data-pct={pct.toFixed(2)}
                          >
                            <span className="pattern-digit-matrix-count">{ct}</span>
                          </div>
                        );
                      })}
                    </div>
                  );
                })}
              </div>
              </div>
              <div className="pattern-digit-matrix-legend" aria-label="Digit position frequency legend">
                <span className="pattern-digit-matrix-legend-label">Relative frequency</span>
                <span className="pattern-digit-matrix-legend-swatch pattern-digit-matrix-cell--band-0">0</span>
                <span className="pattern-digit-matrix-legend-swatch pattern-digit-matrix-cell--band-1">low</span>
                <span className="pattern-digit-matrix-legend-swatch pattern-digit-matrix-cell--band-2">med</span>
                <span className="pattern-digit-matrix-legend-swatch pattern-digit-matrix-cell--band-3">high</span>
                <span className="pattern-digit-matrix-legend-swatch pattern-digit-matrix-cell--band-4">max</span>
              </div>
            </section>

            {/* repeat pattern counts */}
            <section className="pattern-section">
              <h3 className="pattern-section-title">Repeat patterns</h3>
              <p className="pattern-muted">Exact digit sequences that appeared more than once.</p>
              <div className="pattern-digit-patterns pattern-digit-patterns-scroll" role="list">
                {digitView.repeatPatterns.map((p) => (
                  <div key={p.seq.join('-')} className="pattern-digit-pattern-item" role="listitem">
                    <span className="pattern-repeat-dot" aria-hidden="true"></span>
                    <div className="pattern-digit-pattern-content">
                      <div className="pattern-digit-pattern-seq">{p.seq.join(' • ')}</div>
                      <div className="pattern-digit-pattern-meta">
                        <span className="pattern-badge pattern-badge-strong">{p.count}×</span>
                        <span className="pattern-muted pattern-digit-pattern-dates">
                          {p.dates.join(' • ')}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
                {digitView.repeatPatterns.length === 0 && (
                  <p className="pattern-muted">No repeats found in this window.</p>
                )}
              </div>
            </section>

            {/* overdue digits */}
            <section className="pattern-section">
              <h3 className="pattern-section-title">Overdue digits</h3>
              <p className="pattern-muted">Digits 0–9 ranked by the number of draws since last seen in any position.</p>
              <div className="pattern-overdue-grid">
                {digitView.overdueDigits.map((d) => (
                  <div key={d.digit} className="pattern-overdue-card">
                    <div className="num">{d.digit}</div>
                    <div className="gap">
                      {d.drawsSince === Infinity ? 'never' : `${d.drawsSince} draws ago`}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* fireball / bonus usage – only if present */}
            {digitView.fbCount > 0 && (
              <section className="pattern-section">
              <h3 className="pattern-section-title">Fireball / bonus usage</h3>
              <p className="pattern-muted">
                Rows with Fireball/bonus: {digitView.fbCount.toLocaleString()} of{' '}
                {digitView.totalDraws.toLocaleString()}.
              </p>
              {digitView.fbCount === 0 ? (
                <p className="pattern-muted">No Fireball/bonus values detected.</p>
              ) : (
                <ul className="pattern-fb-list">
                  {digitView.fbTop.map((fb) => (
                    <li key={fb.digit}>
                      FB {fb.digit}: {fb.count}×
                    </li>
                  ))}
                </ul>
              )}
            </section>
            )}
          </div>
        )}

        {/* CASHPOP VIEW */}
        {!loading && !err && isCashPop && cashpopView && (
          <div className="pattern-modal-body">
            {/* Overdue */}
            <section className="pattern-section">
              <h3 className="pattern-section-title">Overdue picks</h3>
              <p className="pattern-muted">
                Cash Pop draws one number per game from a small pool. These are ranked by how many draws ago they last appeared.
              </p>
              <div className="pattern-overdue-grid">
                {cashpopView.overdue.map((item) => (
                  <div key={item.n} className="pattern-overdue-card">
                    <div className="num">{item.n}</div>
                    <div className="gap">
                      {item.drawsSince === Infinity ? 'never' : `${item.drawsSince} draws ago`}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Recency histogram */}
            <section className="pattern-section">
              <h3 className="pattern-section-title">Recency histogram</h3>
              <p className="pattern-muted">
                Age-of-number view for Cash Pop. Bars show how many of the 1–{cashpopView.domainSize} picks are currently sitting at that “draws since last seen” range.
              </p>
              <div className="pattern-inline-explain">
                <p className="pattern-muted">What to look for:</p>
                <ul className="pattern-muted pattern-inline-list">
                  <li>Left bars → refreshed recently.</li>
                  <li>Right bars → haven’t shown in a bit.</li>
                  <li>Dashed line → even spread baseline.</li>
                </ul>
              </div>
              <div
                className="pattern-recency-chart"
                aria-label="Histogram of draws since last seen for Cash Pop numbers"
              >
                {cashpopView.recency.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={cashpopView.recency}>
                      <CartesianGrid stroke="var(--card-bd)" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: 'var(--muted)' }}
                        stroke="var(--muted)"
                        label={{
                          value: 'Amount of draws since last seen',
                          position: 'insideBottom',
                          offset: -4,
                          fill: 'var(--muted)',
                          fontSize: 10,
                        }}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: 'var(--muted)' }}
                        stroke="var(--muted)"
                        label={{
                          value: 'Count of picks',
                          angle: -90,
                          position: 'insideLeft',
                          fill: 'var(--muted)',
                          fontSize: 10,
                        }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          background: 'var(--card)',
                          border: '1px solid var(--card-bd)',
                          borderRadius: '0.5rem',
                        }}
                        labelStyle={{ fontWeight: 600 }}
                        formatter={(val: any, key: any) => {
                          if (key === 'expected')
                            return [val.toFixed ? val.toFixed(1) : val, 'expected (uniform)'];
                          return [val, 'numbers'];
                        }}
                      />
                      <Line
                        type="monotone"
                        dataKey="expected"
                        stroke="var(--muted)"
                        strokeDasharray="4 4"
                        strokeOpacity={0.35}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Bar
                        dataKey="count"
                       fill="var(--accent)"
                        radius={[4, 4, 0, 0]}
                        onClick={(_, idx) => setActiveRecencyBin({ kind: 'cashpop', index: idx })}
                        onMouseEnter={(_, idx) => setActiveRecencyBin({ kind: 'cashpop', index: idx })}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="pattern-muted">No recency data available.</p>
                )}
              </div>
              {activeRecencyBin?.kind === 'cashpop' &&
                cashpopView.recency[activeRecencyBin.index] &&
                cashpopView.recency[activeRecencyBin.index].members.length > 0 && (
                  <div className="pattern-recency-panel" aria-label="Cash Pop numbers in this recency bucket">
                    <div className="pattern-recency-panel-head">
                      <p className="pattern-recency-panel-title">
                        Picks last seen {cashpopView.recency[activeRecencyBin.index].label} draws ago
                      </p>
                      <p className="pattern-recency-panel-hint">Tap a bar to pin. Scroll if there are many.</p>
                    </div>
                    <div className="pattern-recency-panel-body">
                      {cashpopView.recency[activeRecencyBin.index].members.map((n) => (
                        <span key={n} className="pattern-recency-pill">
                          {n}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
            </section>

            {/* Frequency heatmap – tiny 1..15 */}
            <section className="pattern-section">
              <h3 className="pattern-section-title">Frequency heatmap</h3>
              <p className="pattern-muted">
                Quick glance at which picks have hit more in this window of {cashpopView.totalDraws.toLocaleString()} draws.
              </p>
              <div className="pattern-heatmap">
                {cashpopView.freq.map((f) => {
                  // make the cashpop heatmap more sensitive than a straight max-ratio
                  // domain is tiny (1..15), so small differences matter more
                  const diff = f.count - cashpopView.avgCount;
                  let intensity: 'hot' | 'warm' | 'neutral' | 'cold' = 'neutral';
                  // tuned thresholds for small cashpop windows
                  if (diff >= 3) {
                    intensity = 'hot';
                  } else if (diff >= 1.5) {
                    intensity = 'warm';
                  } else if (diff <= -2) {
                    intensity = 'cold';
                  }
                  return (
                    <div key={f.n} className={`pattern-heat ${intensity}`} title={`#${f.n} — ${f.count} hits`}>
                      <span>{f.n}</span>
                    </div>
                  );
                })}
              </div>
              <div className="pattern-heat-legend" aria-label="Heatmap legend for cash pop frequency">
                <span className="pattern-heat-legend-item hot">well above avg</span>
                <span className="pattern-heat-legend-item warm">above avg</span>
                <span className="pattern-heat-legend-item neutral">ok</span>
                <span className="pattern-heat-legend-item cold">few</span>
              </div>
            </section>
          </div>
        )}

        {/* K-OF-N VIEW (Pick 10, Quick Draw, All or Nothing) */}
        {!loading && !err && !isDigits && !rows && kofnRows && kOfNStats && (
          <div className="pattern-modal-body">
            {/* Overdue */}
            <section className="pattern-section">
              <h3 className="pattern-section-title">Overdue numbers</h3>
              <p className="pattern-muted">
                Numbers with the largest gap since last seen across {kOfNStats.totalDraws.toLocaleString()} draws.
              </p>
              <div className="pattern-overdue-grid">
                {kOfNOverdue.map((item) => (
                  <div key={item.n} className="pattern-overdue-card">
                    <div className="num">{item.n}</div>
                    <div className="gap">
                      {item.drawsSince === Infinity ? 'never' : `${item.drawsSince} draws ago`}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* Draw-to-draw overlap */}
            {kOfNOverlap && (
              <section className="pattern-section">
                <h3 className="pattern-section-title">Draw-to-draw overlap</h3>
                <p className="pattern-muted">
                  How many numbers each draw reused from the previous draw. 0 means it pulled a fresh set; {kOfNOverlap.k} means it repeated the whole thing (rare).
                </p>
                <div className="pattern-inline-explain">
                  <p className="pattern-muted">What to look for:</p>
                  <ul className="pattern-muted pattern-inline-list">
                    <li>Left bars → draws refreshed a lot.</li>
                    <li>Right bars → draws were “sticky”.</li>
                  </ul>
                </div>
                <div
                  className="pattern-recency-chart"
                  aria-label="Histogram of overlap between consecutive k-of-N draws"
                >
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={kOfNOverlap.data}>
                      <CartesianGrid stroke="var(--card-bd)" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="overlap"
                        tick={{ fontSize: 10, fill: 'var(--muted)' }}
                        stroke="var(--muted)"
                        label={{
                          value: 'Numbers reused from previous draw',
                          position: 'insideBottom',
                          offset: -4,
                          fill: 'var(--muted)',
                          fontSize: 10,
                        }}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: 'var(--muted)' }}
                        stroke="var(--muted)"
                        label={{
                          value: 'Draw count',
                          angle: -90,
                          position: 'insideLeft',
                          fill: 'var(--muted)',
                          fontSize: 10,
                        }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{ background: 'var(--card)', border: '1px solid var(--card-bd)', borderRadius: '0.5rem' }}
                        labelStyle={{ fontWeight: 600 }}
                        formatter={(val: any) => [val, 'draws']}
                      />
                      <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="pattern-muted pattern-muted-small">
                  Based on {kOfNOverlap.draws.toLocaleString()} consecutive draw comparisons.
                </p>
              </section>
            )}

            {allOrNothingBalance && (
              <section className="pattern-section">
                <h3 className="pattern-section-title">Half-board balance (1–12 vs 13–24)</h3>
                <p className="pattern-muted">
                  For All or Nothing, each draw picks 12 of 24 numbers. This shows how many of those 12 landed in
                  the low half (1–12). A value of 6 means the draw was perfectly centered; higher bars on the left or
                  right mean the draw leaned into one half of the board.
                </p>
                <div className="pattern-inline-explain">
                  <p className="pattern-muted">What to look for:</p>
                  <ul className="pattern-muted pattern-inline-list">
                    <li>Peak around 6 → balanced board.</li>
                    <li>Peaks at 8–9 → draws favoring 1–12.</li>
                    <li>Peaks at 3–4 → draws favoring 13–24.</li>
                  </ul>
                </div>
                <div
                  className="pattern-recency-chart"
                  aria-label="Histogram of All or Nothing low-half counts"
                >
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart data={allOrNothingBalance.data}>
                      <CartesianGrid stroke="var(--card-bd)" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="lowHits"
                        tick={{ fontSize: 10, fill: 'var(--muted)' }}
                        stroke="var(--muted)"
                        label={{
                          value: 'Numbers from 1–12 in this draw',
                          position: 'insideBottom',
                          offset: -4,
                          fill: 'var(--muted)',
                          fontSize: 10,
                        }}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: 'var(--muted)' }}
                        stroke="var(--muted)"
                        label={{
                          value: 'Draw count',
                          angle: -90,
                          position: 'insideLeft',
                          fill: 'var(--muted)',
                          fontSize: 10,
                        }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{ background: 'var(--card)', border: '1px solid var(--card-bd)', borderRadius: '0.5rem' }}
                        labelStyle={{ fontWeight: 600 }}
                        formatter={(val: any) => [val, 'draws']}
                      />
                      <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <p className="pattern-muted pattern-muted-small">
                  Based on {allOrNothingBalance.draws.toLocaleString()} draws from a 12/24 game.
                </p>
              </section>
            )}

            {kOfNHotSetHits && (
              <section className="pattern-section">
                <h3 className="pattern-section-title">Hits vs expected (hot set)</h3>
                <p className="pattern-muted">
                  For each recent draw, this shows how many of its numbers were in the current hot set (
                  {kOfNHotSetHits.hotSize.toLocaleString()} numbers chosen by z-score) versus what a
                  {` ${kOfNHotSetHits.data.length > 0 ? '' : ''}`} random draw would expect.
                </p>
                <div className="pattern-inline-explain">
                  <p className="pattern-muted">What to look for:</p>
                  <ul className="pattern-muted pattern-inline-list">
                    <li>Points above the dashed line → draw leaned into hot numbers.</li>
                    <li>Points below it → draw pulled more from neutral/cold.</li>
                  </ul>
                </div>
                <div
                  className="pattern-recency-chart"
                  aria-label="Sparkline of hot-set hits per k-of-N draw"
                >
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={kOfNHotSetHits.data}>
                      <CartesianGrid stroke="var(--card-bd)" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="idx"
                        tick={{ fontSize: 9, fill: 'var(--muted)' }}
                        stroke="var(--muted)"
                        label={{
                          value: 'Draw (old → new)',
                          position: 'insideBottom',
                          offset: -4,
                          fill: 'var(--muted)',
                          fontSize: 10,
                        }}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 10, fill: 'var(--muted)' }}
                        stroke="var(--muted)"
                        label={{ value: 'Hot hits', angle: -90, position: 'insideLeft', fill: 'var(--muted)', fontSize: 10 }}
                      />
                      <Tooltip
                        contentStyle={{ background: 'var(--card)', border: '1px solid var(--card-bd)', borderRadius: '0.5rem' }}
                        labelStyle={{ fontWeight: 600 }}
                      />
                      <Line type="monotone" dataKey="expected" stroke="var(--muted)" strokeDasharray="4 4" dot={false} isAnimationActive={false} />
                      <Line type="monotone" dataKey="hits" stroke="var(--accent)" dot={false} isAnimationActive={false} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <p className="pattern-muted pattern-muted-small">
                  Showing last {kOfNHotSetHits.data.length.toLocaleString()} draws (of {kOfNHotSetHits.total.toLocaleString()} total in window).
                </p>
              </section>
            )}

            {kOfNSegments && (
              <section className="pattern-section">
                <h3 className="pattern-section-title">Range / decade strip</h3>
                <p className="pattern-muted">
                  Board 1–{kOfNSegments.N} grouped into even ranges. Each tile shows how often that range was
                  hit in {kOfNSegments.totalDraws.toLocaleString()} draws, vs. what would be expected for a{' '}
                  {kOfNSegments.k}-pick game.
                </p>
                <div className="pattern-range-strip" aria-label="Hits per number range">
                  {kOfNSegments.data.map((seg) => {
                    // keep thresholds close to your heatmap to stay visually consistent
                    let tone = 'neutral';
                    if (seg.ratio >= 1.25) tone = 'hot';
                    else if (seg.ratio >= 1.05) tone = 'warm';
                    else if (seg.ratio <= 0.75) tone = 'cold';
                    return (
                      <div key={seg.label} className={`pattern-range-segment ${tone}`}>
                        <div className="pattern-range-label">{seg.label}</div>
                        <div className="pattern-range-metric">
                          {seg.hits.toLocaleString()} hits
                        </div>
                        <div className="pattern-range-ratio">
                          {(seg.ratio * 100).toFixed(0)}% of expected
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div
                  className="pattern-heat-legend pattern-range-legend"
                  aria-label="Legend for k-of-N range strip"
                >
                  <span className="pattern-heat-legend-item hot">well above expected</span>
                  <span className="pattern-heat-legend-item warm">above expected</span>
                  <span className="pattern-heat-legend-item neutral">expected</span>
                  <span className="pattern-heat-legend-item cold">below expected</span>
                </div>
              </section>
            )}

            {/* Heatmap */}
            <section className="pattern-section">
              <h3 className="pattern-section-title">Frequency heatmap</h3>
              <p className="pattern-muted">
                Colorized by z-score for this k-of-N game (higher = drawn more than expected).
              </p>
              <div className="pattern-heatmap">
                {Array.from({ length: kOfNStats.lastSeen.size }, (_, i) => {
                  const n = i + 1;
                  const z = kOfNStats.z.get(n) ?? 0;
                  const intensity =
                    z >= 1.5 ? 'hot' : z >= 0.5 ? 'warm' : z <= -1 ? 'cold' : 'neutral';
                  return (
                    <div key={n} className={`pattern-heat ${intensity}`} title={`#${n} z=${z.toFixed(2)}`}>
                      <span>{n}</span>
                    </div>
                  );
                })}
              </div>
              {/* legend */}
              <div className="pattern-heat-legend" aria-label="Heatmap legend for number frequency">
                <span className="pattern-heat-legend-item hot">hot ≥ +1.5 z</span>
                <span className="pattern-heat-legend-item warm">warm ≥ +0.5 z</span>
                <span className="pattern-heat-legend-item neutral">neutral</span>
                <span className="pattern-heat-legend-item cold">cold ≤ −1 z</span>
              </div>
            </section>

            {/* Hottest / coldest */}
            <section className="pattern-section">
              <h3 className="pattern-section-title">Hottest vs coldest</h3>
              <div className="pattern-hotcold">
                <div>
                  <h4 className="pattern-subtitle">Top 10 hottest</h4>
                  <ul>
                    {kOfNHotCold.hottest.map((h) => (
                      <li key={h.n}>
                        #{h.n} — z={h.z.toFixed(2)}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="pattern-subtitle">Top 10 coldest</h4>
                  <ul>
                    {kOfNHotCold.coldest.map((c) => (
                      <li key={c.n}>
                        #{c.n} — z={c.z.toFixed(2)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            {/* Era info if available */}
            {gameKey && (
              <section className="pattern-section">
                <h3 className="pattern-section-title">Current era</h3>
                <p className="pattern-muted">
                  {(() => {
                    const era = getCurrentEraConfig(gameKey as GameKey);
                    return `${era.label} · effective ${era.start}`;
                  })()}
                </p>
              </section>
            )}
          </div>
        )}

        {/* LOTTO / POOL VIEW */}
        {!loading && !err && !isDigits && !isCashPop && rows && stats && (
          <div className="pattern-modal-body">
            {/* Overdue (main + special grouped) */}
            <section className="pattern-section">
              <h3 className="pattern-section-title">Overdue numbers</h3>
              {isSixMainNoSpecial ? (
                <p className="pattern-muted">
                  Largest gaps since last seen. This game draws 6 main numbers and we treat the 6th as a normal
                  main, so there is no separate special-ball list.
                </p>
              ) : (
                <p className="pattern-muted">Largest gaps since last seen, split by number domain.</p>
              )}

              {/* main overdue */}
              <div className="pattern-subsection">
                <div className="pattern-overdue-grid">
                  {overdueList.map((item) => (
                    <div key={item.n} className="pattern-overdue-card">
                      <div className="num">{item.n}</div>
                      <div className="gap">
                        {item.drawsSince === Infinity ? 'never' : `${item.drawsSince} draws ago`}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* special overdue – grouped here */}
              {specialOverdueList.length > 0 && (
                <div className="pattern-subsection pattern-subsection--special">
                  <h4 className="pattern-subtitle pattern-subtitle--special">Special ball</h4>
                  <p className="pattern-muted">Overdue numbers for the special-ball domain.</p>
                  <div className="pattern-overdue-grid">
                    {specialOverdueList.map((item) => (
                      <div key={item.n} className="pattern-overdue-card pattern-overdue-card--special">
                        <div className="num">{item.n}</div>
                        <div className="gap">
                          {item.drawsSince === Infinity ? 'never' : `${item.drawsSince} draws ago`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>

            {/* Recency histogram */}
            <section className="pattern-section">
              <h3 className="pattern-section-title">Recency histogram</h3>
              <p className="pattern-muted">
                This is an <strong className="pattern-muted-inline-strong">age-of-number chart</strong>: each bar shows how many distinct numbers are currently sitting at that “draws since last seen” range. It
                <strong className="pattern-muted-inline-strong"> does not</strong> show how often they were drawn overall.
                {isSixMainNoSpecial && (
                  <>
                    {' '}
                    Because this game draws 6 mains with no separate special ball, all 6 positions are included
                    together here.
                  </>
                )}
              </p>
              <div className="pattern-inline-explain">
                <p className="pattern-muted">What to look for:</p>
                <ul className="pattern-muted pattern-inline-list">
                  <li>Left bars → numbers refreshed recently.</li>
                  <li>Right bars → numbers that haven’t shown up in a while.</li>
                  <li>Dashed line → what a perfectly even spread would look like.</li>
                </ul>
              </div>
              {/* moved “How to read it” to sit right under “What to look for” */}
              <div className="pattern-recency-notes">
                <p className="pattern-muted">How to read it:</p>
                <ul className="pattern-muted">
                  <li><span className="pattern-recency-note-label">Balanced / random</span> bars taper off evenly → game is cycling smoothly.</li>
                  <li><span className="pattern-recency-note-label">Right-skewed</span> high bars on the right → many overdue numbers piling up.</li>
                  <li><span className="pattern-recency-note-label">Left-skewed</span> high bars on the left → recent draws refreshed many numbers.</li>
                </ul>
              </div>

              <div className="pattern-recency-chart" aria-label="Histogram of the number of draws since last seen for main numbers">
                {mainRecencyHistogram.length > 0 ? (
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={mainRecencyHistogram}>
                      <CartesianGrid stroke="var(--card-bd)" strokeDasharray="3 3" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: 'var(--muted)' }}
                        stroke="var(--muted)"
                        label={{ value: 'Amount of draws since last seen', position: 'insideBottom', offset: -4, fill: 'var(--muted)', fontSize: 10 }}
                      />
                      <YAxis
                        tick={{ fontSize: 10, fill: 'var(--muted)' }}
                        stroke="var(--muted)"
                        label={{ value: 'Count of numbers', angle: -90, position: 'insideLeft', fill: 'var(--muted)', fontSize: 10 }}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{ background: 'var(--card)', border: '1px solid var(--card-bd)', borderRadius: '0.5rem' }}
                        labelStyle={{ fontWeight: 600 }}
                        formatter={(val: any, key: any) => {
                          if (key === 'expected') return [val.toFixed ? val.toFixed(1) : val, 'expected (uniform)'];
                          return [val, 'numbers'];
                        }}
                      />
                      {/* faint expected baseline if draws were uniform */}
                      <Line
                        type="monotone"
                        dataKey="expected"
                        stroke="var(--muted)"
                        strokeDasharray="4 4"
                        strokeOpacity={0.35}
                        dot={false}
                        isAnimationActive={false}
                      />
                      <Bar
                        dataKey="count"
                        fill="var(--accent)"
                        radius={[4, 4, 0, 0]}
                        onClick={(_, idx) => setActiveRecencyBin({ kind: 'main', index: idx })}
                        onMouseEnter={(_, idx) => setActiveRecencyBin({ kind: 'main', index: idx })}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="pattern-muted">No recency data available.</p>
                )}
              </div>
              {activeRecencyBin?.kind === 'main' &&
                mainRecencyHistogram[activeRecencyBin.index] &&
                mainRecencyHistogram[activeRecencyBin.index].members.length > 0 && (
                  <div className="pattern-recency-panel" aria-label="Numbers in this recency bucket">
                    <div className="pattern-recency-panel-head">
                      <p className="pattern-recency-panel-title">
                        Numbers last seen {mainRecencyHistogram[activeRecencyBin.index].label} draws ago
                      </p>
                      <p className="pattern-recency-panel-hint">Tap a bar to pin. Scroll if there are many.</p>
                    </div>
                    <div className="pattern-recency-panel-body">
                      {mainRecencyHistogram[activeRecencyBin.index].members.map((n) => (
                        <span key={n} className="pattern-recency-pill">
                          {n}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
            </section>

            {/* Special ball recency, directly under main recency */}
            {specialRecencyHistogram.length > 0 && (
              <section className="pattern-section pattern-section--tight">
                <div className="pattern-subsection pattern-subsection--special">
                  <h4 className="pattern-subtitle pattern-subtitle--special">Special ball recency</h4>
                  <p className="pattern-muted">
                    Similar to the main histogram, but for the special-ball domain only.
                  </p>
                  <div
                    className="pattern-recency-chart pattern-recency-chart--special"
                    aria-label="Histogram of the number of draws since last seen for special ball numbers"
                  >
                    <ResponsiveContainer width="100%" height={180}>
                      <BarChart data={specialRecencyHistogram}>
                        <CartesianGrid stroke="var(--card-bd)" strokeDasharray="3 3" />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 10, fill: 'var(--muted)' }}
                          stroke="var(--muted)"
                          label={{ value: 'Amount of draws since last seen', position: 'insideBottom', offset: -4, fill: 'var(--muted)', fontSize: 10 }}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: 'var(--muted)' }}
                          stroke="var(--muted)"
                          label={{ value: 'Count of numbers', angle: -90, position: 'insideLeft', fill: 'var(--muted)', fontSize: 10 }}
                          allowDecimals={false}
                        />
                        <Tooltip
                          contentStyle={{ background: 'var(--card)', border: '1px solid var(--card-bd)', borderRadius: '0.5rem' }}
                          labelStyle={{ fontWeight: 600 }}
                          formatter={(val: any, key: any) => {
                            if (key === 'expected') return [val.toFixed ? val.toFixed(1) : val, 'expected (uniform)'];
                            return [val, 'numbers'];
                          }}
                        />
                        <Line
                          type="monotone"
                          dataKey="expected"
                          stroke="var(--muted)"
                          strokeDasharray="4 4"
                          strokeOpacity={0.35}
                          dot={false}
                          isAnimationActive={false}
                        />
                        <Bar
                          dataKey="count"
                          fill="var(--special-accent, var(--bubble-amber))"
                          radius={[4, 4, 0, 0]}
                          onClick={(_, idx) => setActiveRecencyBin({ kind: 'special', index: idx })}
                          onMouseEnter={(_, idx) => setActiveRecencyBin({ kind: 'special', index: idx })}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  {activeRecencyBin?.kind === 'special' &&
                    specialRecencyHistogram[activeRecencyBin.index] &&
                    specialRecencyHistogram[activeRecencyBin.index].members.length > 0 && (
                      <div className="pattern-recency-panel pattern-recency-panel--special" aria-label="Special ball numbers in this recency bucket">
                        <div className="pattern-recency-panel-head">
                          <p className="pattern-recency-panel-title">
                            Special numbers last seen {specialRecencyHistogram[activeRecencyBin.index].label} draws ago
                          </p>
                          <p className="pattern-recency-panel-hint">Tap a bar to pin. Scroll if there are many.</p>
                        </div>
                        <div className="pattern-recency-panel-body">
                          {specialRecencyHistogram[activeRecencyBin.index].members.map((n) => (
                            <span key={n} className="pattern-recency-pill">
                              {n}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              </section>
            )}

            {/* Heatmap */}
            <section className="pattern-section">
              <h3 className="pattern-section-title">Frequency heatmap</h3>
              <p className="pattern-muted">Colorized by z-score (how far from expected).</p>
              <p className="pattern-muted pattern-muted-small">
                A positive z ≈ drawn more than this history would expect; a negative z ≈ drawn less. It’s a quick way to spot outliers, but randomness still rules.
              </p>
              <div className="pattern-heatmap">
                {Array.from({ length: stats.cfg.mainMax }, (_, i) => {
                  const n = i + 1;
                  const z = stats.zMain.get(n) ?? 0;
                  const intensity =
                    z >= 1.5 ? 'hot' : z >= 0.5 ? 'warm' : z <= -1 ? 'cold' : 'neutral';
                  return (
                    <div key={n} className={`pattern-heat ${intensity}`} title={`#${n} z=${z.toFixed(2)}`}>
                      <span>{n}</span>
                    </div>
                  );
                })}
              </div>
              <div className="pattern-heat-legend" aria-label="Heatmap legend for number frequency">
                <span className="pattern-heat-legend-item hot">hot ≥ +1.5 z</span>
                <span className="pattern-heat-legend-item warm">warm ≥ +0.5 z</span>
                <span className="pattern-heat-legend-item neutral">neutral</span>
                <span className="pattern-heat-legend-item cold">cold ≤ −1 z</span>
              </div>
            </section>

            {/* Special ball frequency heatmap — grouped with main frequency */}
            {(() => {
              const zSpecial = stats.zSpecial;
              const cfg = stats.cfg;
              if (!zSpecial || !cfg.specialMax || cfg.specialMax <= 0) return null;
              return (
                <section className="pattern-section pattern-section--tight">
                  <div className="pattern-subsection pattern-subsection--special">
                    <h4 className="pattern-subtitle pattern-subtitle--special">Special ball frequency</h4>
                    <p className="pattern-muted">Frequency heatmap, scoped to the special-ball domain.</p>
                    <div className="pattern-heatmap pattern-heatmap-special">
                      {Array.from({ length: cfg.specialMax }, (_, i) => {
                        const n = i + 1;
                        const z = zSpecial.get(n) ?? 0;
                        const intensity =
                          z >= 1.5 ? 'hot' : z >= 0.5 ? 'warm' : z <= -1 ? 'cold' : 'neutral';
                        return (
                          <div
                            key={n}
                            className={`pattern-heat ${intensity} pattern-heat--special`}
                            title={`special ${n} z=${z.toFixed(2)}`}
                          >
                            <span>{n}</span>
                          </div>
                        );
                      })}
                    </div>
                    <div className="pattern-heat-legend" aria-label="Heatmap legend for special ball frequency">
                      <span className="pattern-heat-legend-item hot">hot ≥ +1.5 z</span>
                      <span className="pattern-heat-legend-item warm">warm ≥ +0.5 z</span>
                      <span className="pattern-heat-legend-item neutral">neutral</span>
                      <span className="pattern-heat-legend-item cold">cold ≤ −1 z</span>
                    </div>
                  </div>
                </section>
              );
            })()}

            {/* Combination repetition */}
            <section className="pattern-section">
              <h3 className="pattern-section-title">Combination repetition</h3>
              <p className="pattern-muted">
                Total possible combinations:{' '}
                {comboData.totalCombos ? comboData.totalCombos.toLocaleString() : 'n/a'} · draws:{' '}
                {(rows ? rows.length : 0).toLocaleString()} · distinct combinations seen:{' '}
                {comboData.distinctSeen.toLocaleString()}
              </p>
              <div className="pattern-combo-grid pattern-combo-scroll">
                <div className="pattern-combo-column">
                  <h4 className="pattern-subtitle">Repeated 2×</h4>
                  {repeatedTwice.length === 0 && <p className="pattern-muted">None.</p>}
                  {repeatedTwice.slice(0, 15).map((c) => (
                    <div key={c.key} className="pattern-combo-item">
                      <div className="pattern-combo-main">{c.mains.join(', ')}</div>
                      <div className="pattern-combo-dates">{c.dates.join(' • ')}</div>
                    </div>
                  ))}
                  {repeatedTwice.length > 15 && (
                    <p className="pattern-muted">+{repeatedTwice.length - 15} more…</p>
                  )}
                </div>
                  <div className="pattern-combo-column">
                  <h4 className="pattern-subtitle">Repeated 3×+</h4>
                  {repeated3plus.length === 0 && <p className="pattern-muted">None.</p>}
                  {repeated3plus.slice(0, 15).map((c) => (
                    <div key={c.key} className="pattern-combo-item">
                      <div className="pattern-combo-main">
                        {c.mains.join(', ')} <span className="pattern-badge">{c.count}×</span>
                      </div>
                      <div className="pattern-combo-dates">{c.dates.join(' • ')}</div>
                    </div>
                  ))}
                  {repeated3plus.length > 15 && (
                    <p className="pattern-muted">+{repeated3plus.length - 15} more…</p>
                  )}
                </div>
              </div>
            </section>

            {/* Hottest / coldest */}
            <section className="pattern-section">
              <h3 className="pattern-section-title">Hottest vs coldest</h3>
              <div className="pattern-hotcold">
                <div>
                  <h4 className="pattern-subtitle">Top 10 hottest</h4>
                  <ul>
                    {hottest.map((h) => (
                      <li key={h.n}>
                        #{h.n} — z={h.z.toFixed(2)}
                      </li>
                    ))}
                  </ul>
                </div>
                <div>
                  <h4 className="pattern-subtitle">Top 10 coldest</h4>
                  <ul>
                    {coldest.map((c) => (
                      <li key={c.n}>
                        #{c.n} — z={c.z.toFixed(2)}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </section>

            {/* Era info */}
            <section className="pattern-section">
              <h3 className="pattern-section-title">Current era</h3>
              <p className="pattern-muted">
                {(() => {
                  const era = getCurrentEraConfig(gameKey as GameKey);
                  return `${era.label} · effective ${era.start}`;
                })()}
              </p>
            </section>
          </div>
        )}
      </div>
    </div>
  );
}
