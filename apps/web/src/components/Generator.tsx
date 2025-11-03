// src/components/Generator.tsx
'use client';
import './Generator.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import Info from 'apps/web/src/components/Info';
import Pill from './Pill';
import { ErrorBoundary } from 'apps/web/src/components/ErrorBoundary';
import { HINT_EXPLAIN, classifyHint, displayHint } from 'apps/web/src/components/hints';
import EvaluateTicket from './EvaluateTicket';
import {
  computeStatsAsync,
  generateTicketAsync,
  ticketHints,
  getCurrentEraConfig,
  filterRowsForCurrentEra,
  // Digits (Pick 3 / Win 4)
  fetchDigitRowsFor, computeDigitStatsAsync, recommendDigitsFromStats, ticketHintsDigits,
  // Pick 10 (10-from-80)
  fetchPick10RowsFor, computePick10StatsAsync, generatePick10TicketAsync, recommendPick10FromStats, ticketHintsPick10,
  // Quick Draw (Keno-style; 20-from-80 history, user selects “spots”)
  fetchQuickDrawRowsFor, computeQuickDrawStatsAsync, recommendQuickDrawFromStats, generateQuickDrawTicketAsync,
  // --- NEW: TX All or Nothing (12-from-24) ---
  fetchAllOrNothingRowsFor, computeAllOrNothingStatsAsync, generateAllOrNothingTicketAsync, recommendAllOrNothingFromStats,
  // Cash Pop (single value)
  fetchCashPopRows,
 } from '@lsp/lib';
 import type {
  LottoRow,
  GameKey,
  LogicalGameKey,
} from '@lsp/lib';
import {
  resolveGameMeta, isDigitShape, usesPlayTypeTags,
  specialToneClass, hasColoredSpecial, filterHintsForGame,
  boxVariantLabel, straightOnlyLabel,
  digitLogicalFor, effectivePeriod, coerceAnyPeriod,
  qdHas3Run, qdIsTight, playTypeLabelsForDigits, isGenerationReady,
  eraConfigFor,
} from '@lsp/lib';

/** Choose whether to show FL "Combo" / NY "Combination" chips; these are bet options (not implied by digits), so keep off ticket chips. */
function jurisdictionCoverAllLabel(_logical?: LogicalGameKey): null {
  return null; // intentionally not tagging per-ticket to avoid implying an outcome
}

function GeneratorInner({
  game,                 // keep: canonical rep for era/theming
  logical,              // NEW: logical game for shape detection
  rowsForGenerator,
  analysisForGame,
  anLoading,
  onEnsureRecommended,
  onActiveHints
}: {
  game: GameKey;        // canonical rep (e.g., multi_cash4life)
  logical?: LogicalGameKey; // NEW (optional) — if present, use for shape
  rowsForGenerator: LottoRow[];
  analysisForGame: { recMain:{mode:'hot'|'cold';alpha:number}; recSpec:{mode:'hot'|'cold';alpha:number} } | null;
  anLoading: boolean;
  onEnsureRecommended: () => Promise<{ recMain:{mode:'hot'|'cold';alpha:number}; recSpec:{mode:'hot'|'cold';alpha:number} } | null>;
  onActiveHints?: (labels: string[]) => void;
}) {
    // Use logical (if provided) to determine the game shape; fall back to canonical
  const meta = resolveGameMeta(game, logical);
  const isDigits   = isDigitShape(meta.shape);
  const isPick10   = meta.shape === 'pick10';
  const isQuickDraw= meta.shape === 'quickdraw';
  const isAllOrNothing = meta.shape === 'allornothing';
  const isCashPop  = meta.shape === 'cashpop';
  const isFiveBall = meta.shape === 'five' || meta.shape === 'six'; // six renders visually like five (no colored special)
  const isNyLotto  = !!meta.isNyLotto;

  // Modes are inferred from sliders: alpha >= 0.5 => 'hot', else 'cold'
  const [alphaMain, setAlphaMain] = useState(0.6);
  const [alphaSpecial, setAlphaSpecial] = useState(0.6);
  const modeMain: 'hot'|'cold' = alphaMain >= 0.5 ? 'hot' : 'cold';
  const modeSpecial: 'hot'|'cold' = alphaSpecial >= 0.5 ? 'hot' : 'cold';

  const [avoidCommon, setAvoidCommon] = useState(false);
  // String state so the box can be cleared while typing; default is "4"
  const [numInput, setNumInput] = useState('4');
  const [tickets, setTickets] = useState<{ mains: number[]; special?: number }[]>([]); // special optional for Fantasy 5
  // Non–5-ball tickets
  const [ticketsDigits, setTicketsDigits] = useState<{ digits: number[] }[]>([]);
  const [ticketsP10,    setTicketsP10]    = useState<{ values: number[] }[]>([]);
  const [ticketsQD,     setTicketsQD]     = useState<{ values: number[] }[]>([]);
  const [ticketsAON,    setTicketsAON]    = useState<{ values: number[] }[]>([]);
  const [ticketsCP,     setTicketsCP]     = useState<{ value: number }[]>([]);

  // Stats caches for non–5-ball
  // Use typeof import(...) so we don't import sync functions as values
  type DigitStatsT    = ReturnType<typeof import('@lsp/lib').computeDigitStats>;
  type Pick10StatsT   = ReturnType<typeof import('@lsp/lib').computePick10Stats>;
  type QuickDrawStatsT= ReturnType<typeof import('@lsp/lib').computeQuickDrawStats>;
  type AllOrNothingStatsT = ReturnType<typeof import('@lsp/lib').computeAllOrNothingStats>;
  const [digitStats, setDigitStats] = useState<DigitStatsT | null>(null);
  const [p10Stats,   setP10Stats]   = useState<Pick10StatsT | null>(null);
  const [qdStats,    setQdStats]    = useState<QuickDrawStatsT | null>(null);
  const [aonStats,   setAonStats]   = useState<AllOrNothingStatsT | null>(null);
  // Cash Pop: keep raw frequency counts (1..15)
  const [cpCounts,   setCpCounts]   = useState<number[] | null>(null); // length 16, index 1..15

  // Quick Draw: user-selectable “spots” (how many numbers to pick)
  const [qdSpots, setQdSpots] = useState<1|2|3|4|5|6|7|8|9|10>(10);

  const liveRef = useRef<HTMLDivElement|null>(null);
  const [showEvaluate, setShowEvaluate] = useState(false);
  // Track last applied recommendation so we don't re-apply redundantly
  // key covers game + shape so we don't overwrite user changes while staying on the same selection
  const lastAppliedRef = useRef<
    { key: string; aMain: number; aSpec?: number } | null
  >(null);
  // Track previous selection and whether we should auto-regenerate after a switch
  const prevSelectionRef = useRef<{ game: GameKey | null; logical?: LogicalGameKey | null }>({ game: null, logical: null });
  const needsAutoRegenRef = useRef(false);
  // Manage a single in-flight chain per selection to abort stale work
  const inflightRef = useRef<{ ac: AbortController | null; timer: any } | null>(null);

  // ---- Era-aware data & stats (only for five-ball) ----
const eraCfg = useMemo(
  () => (isFiveBall ? getCurrentEraConfig((logical ?? game) as any) : null),
  [game, logical, isFiveBall]
);

const rowsEra = useMemo(
  () =>
    isFiveBall && rowsForGenerator
      ? filterRowsForCurrentEra(rowsForGenerator, (logical ?? game) as any)
      : [],
  [rowsForGenerator, game, logical, isFiveBall]
);

// Five-ball stats (computed off-thread when enabled)
// computeStatsAsync resolves to the same shape as computeStats, so type against computeStats.
type FiveBallStatsT = ReturnType<typeof import('@lsp/lib').computeStats>;
const [stats, setStats] = useState<FiveBallStatsT | null>(null);
useEffect(() => {
  let ac: AbortController | null = null;
  async function go() {
    if (!isFiveBall || !eraCfg) { setStats(null); return; }
    ac = new AbortController();
    try {
      const s = await computeStatsAsync(rowsEra as any, game, {
        mainMax: eraCfg.mainMax,
        specialMax: eraCfg.specialMax,
        mainPick: eraCfg.mainPick,
      }, ac.signal);
      setStats(s);
    } catch {
      // leave stats as-is on abort/failure; UI remains resilient
    }
  }
  go();
  return () => { ac?.abort(); };
}, [isFiveBall, eraCfg?.mainMax, eraCfg?.specialMax, eraCfg?.mainPick, game, logical, rowsEra.length]);

// Respect registry flags (don’t infer from eraCfg):
// - PB/MM/C4L: colored special
// - FL LOTTO/JTP: 6 mains only (no colored special)
// - NY Lotto: handled separately (no colored special here)
const hasSpecial = hasColoredSpecial(meta);

  function applyRecommendation(rec: { recMain:{mode:'hot'|'cold';alpha:number}; recSpec:{mode:'hot'|'cold';alpha:number} }) {
    setAlphaMain(parseFloat(rec.recMain.alpha.toFixed(2)));
    setAlphaSpecial(parseFloat(rec.recSpec.alpha.toFixed(2)));
  }

  async function applyRecommendedPreset() {
  if (isFiveBall) {
    if (analysisForGame) { applyRecommendation(analysisForGame); return; }
    const rec = await onEnsureRecommended();
    if (rec) applyRecommendation(rec);
    return;
  }
  // NOTE: for non–five-ball shapes, this helper is used by the auto-apply effect below
  // to keep the manual button behavior consistent with auto-apply.
  // (We still keep this function callable by the user button.)
  if (isDigits && digitStats) {
    const r = recommendDigitsFromStats(digitStats);
    setAlphaMain(parseFloat(r.alpha.toFixed(2)));
    return;
  }
  if (isPick10 && p10Stats) {
    const r = recommendPick10FromStats(p10Stats);
    setAlphaMain(parseFloat(r.alpha.toFixed(2)));
    return;
  }
  if (isQuickDraw && qdStats) {
    const r = recommendQuickDrawFromStats(qdStats);
    setAlphaMain(parseFloat(r.alpha.toFixed(2)));
    return;
  }
}

  // Auto-apply for five-ball from analysis; for others, we compute local recs elsewhere
useEffect(() => {
  // Abort any previous chain and clear any pending debounce
  if (inflightRef.current?.ac) inflightRef.current.ac.abort();
  if (inflightRef.current?.timer) clearTimeout(inflightRef.current.timer);

  const ac = new AbortController();
  const signal = ac.signal;
  // Debounce ~200ms to kill quick-switch churn
  const timer = setTimeout(async () => {
    // Helper: bail fast if aborted
    const cancelled = () => signal.aborted;
    try {
      // ---- Load per-shape stats (digits / pick10 / quick draw / cash pop) ----
      if (isDigits) {
        const lg = digitLogicalFor(game, logical) ?? 'ny_numbers';
        const period = effectivePeriod(meta, coerceAnyPeriod(undefined));
        const rows = await fetchDigitRowsFor(lg, period);
        if (cancelled()) return;
        const k = meta.kDigits!;
        const s = await computeDigitStatsAsync(rows, k as 2|3|4|5, signal);
        if (cancelled()) return;
        setDigitStats(s);
      } else {
        setDigitStats(null);
      }

      if (isPick10) {
        const rows = await fetchPick10RowsFor('ny_pick10');
        if (cancelled()) return;
        const s = await computePick10StatsAsync(rows, signal);
        if (cancelled()) return;
        setP10Stats(s);
      } else {
        setP10Stats(null);
      }

      if (isQuickDraw) {
        const rows = await fetchQuickDrawRowsFor('ny_quick_draw');
        if (cancelled()) return;
        const s = await computeQuickDrawStatsAsync(rows, signal);
        if (cancelled()) return;
        setQdStats(s);
      } else {
        setQdStats(null);
      }

      // ---- TX All or Nothing (12-from-24) ----
      if (isAllOrNothing) {
        // logical is already 'tx_all_or_nothing' for this screen
        const rows = await fetchAllOrNothingRowsFor('tx_all_or_nothing', 'all');
        if (cancelled()) return;
        const s = await computeAllOrNothingStatsAsync(rows, signal);
        if (cancelled()) return;
        setAonStats(s);
      } else {
        setAonStats(null);
      }

      if (isCashPop) {
        const rows = await fetchCashPopRows('all');
        if (cancelled()) return;
        const counts = Array(16).fill(0);
        rows.forEach(r => { if (r.value >= 1 && r.value <= 15) counts[r.value]++; });
        setCpCounts(counts);
      } else {
        setCpCounts(null);
      }

      // ---- Five-ball: apply analyzed recommendation once rows are present ----
      if (isFiveBall && rowsEra && rowsEra.length > 0) {
        const rec = analysisForGame ?? (await onEnsureRecommended());
        if (cancelled() || !rec) return;
        const aMain = Number(rec.recMain.alpha.toFixed(2));
        const aSpec = Number(rec.recSpec.alpha.toFixed(2));
        const key = `${game}|fiveball`;
        const last = lastAppliedRef.current;
        if (!last || last.key !== key || last.aMain !== aMain || last.aSpec !== aSpec) {
          setAlphaMain(aMain);
          if (hasSpecial) setAlphaSpecial(aSpec);
          lastAppliedRef.current = { key, aMain, aSpec };
        }
      }
    } catch {
      /* swallow; ErrorBoundary covers render issues; network errors just no-op on abort */
    }
  }, 200);

  inflightRef.current = { ac, timer };
  return () => {
    ac.abort();
    clearTimeout(timer);
  };
 // include shape & rows length so we recalc when necessary, but keep the set small to avoid thrash
}, [game, logical, isFiveBall, isDigits, isPick10, isQuickDraw, isCashPop, rowsEra.length, analysisForGame, onEnsureRecommended, hasSpecial, meta]);

// --- Auto-apply recommended weighting for ALL other shapes on switch ---
// Trigger once the shape-specific stats have loaded for the current selection.
useEffect(() => {
  // helper: clamp to 2 decimals and update state only when it actually changes
  const setAlphaMainIfChanged = (next: number, key: string) => {
    const a = Number(next.toFixed(2));
    const last = lastAppliedRef.current;
    if (!last || last.key !== key || last.aMain !== a) {
      setAlphaMain(a);
      lastAppliedRef.current = { key, aMain: a };
    }
  };

  // CASH POP heuristic: derive a conservative alpha from dispersion of counts.
  // Scales 0.30..0.70 based on normalized standard deviation to avoid overreaction.
  const cpRecommendedAlpha = (counts: number[]) => {
    const vals = counts.slice(1); // 1..15
    const total = vals.reduce((a,b)=>a+b,0);
    if (total === 0) return 0.40;
    const mean = total / vals.length;
    const variance = vals.reduce((s,v)=> s + Math.pow(v-mean,2), 0) / vals.length;
    const sd = Math.sqrt(variance);
    const norm = mean > 0 ? Math.min(1, sd / Math.max(1, mean)) : 0; // rough CV cap at 1
    return 0.30 + 0.40 * norm; // 0.30 .. 0.70
  };

  if (isDigits && digitStats) {
    const r = recommendDigitsFromStats(digitStats);
    setAlphaMainIfChanged(r.alpha, `${game}|digits`);
    return;
  }
  if (isPick10 && p10Stats) {
    const r = recommendPick10FromStats(p10Stats);
    setAlphaMainIfChanged(r.alpha, `${game}|pick10`);
    return;
  }
  if (isQuickDraw && qdStats) {
    const r = recommendQuickDrawFromStats(qdStats);
    setAlphaMainIfChanged(r.alpha, `${game}|quickdraw`);
    return;
  }
  if (isAllOrNothing && aonStats) {
    // generic k-of-N tuning, N=24
    const r = recommendAllOrNothingFromStats(aonStats);
    setAlphaMainIfChanged(r.alpha, `${game}|allornothing`);
    return;
  }
  if (isCashPop && cpCounts) {
    const a = cpRecommendedAlpha(cpCounts);
    setAlphaMainIfChanged(a, `${game}|cashpop`);
    return;
  }
}, [
  game,
  // shape flags
  isDigits, isPick10, isQuickDraw, isCashPop,
  // readiness signals
  digitStats, p10Stats, qdStats, cpCounts
]);

// --- When the selected game changes and the user already had generated tickets,
  //     regenerate for the newly selected game once required data is ready. ---
  useEffect(() => {
    const prev = prevSelectionRef.current;
    const changed = prev.game !== game || prev.logical !== logical;
    if (!changed) return;
    // Always auto-regenerate after a switch (regardless of previous tickets)
    needsAutoRegenRef.current = true;
    // Clear any previously displayed tickets immediately to prevent stale chips/balls
    setTickets([]);
    setTicketsDigits([]);
    setTicketsP10([]);
    setTicketsQD([]);
    setTicketsAON([]);
    setTicketsCP([]);
    // Update previous selection snapshot
    prevSelectionRef.current = { game, logical };
    lastAppliedRef.current = null; // allow fresh auto-apply for the new selection
  }, [game, logical]);

  // After a switch, wait until shape-specific data is ready, then regenerate once.
  useEffect(() => {
    if (!needsAutoRegenRef.current) return;
    const ready = isGenerationReady(meta, { rowsEra, digitStats, p10Stats, qdStats, cpCounts });
    if (!ready) return;
    needsAutoRegenRef.current = false;
    try { generate(); } catch {}
  }, [meta, rowsEra.length, digitStats, p10Stats, qdStats, cpCounts]);


  async function generate(rows = rowsEra as any[]) {
    // Clear all buckets first
    setTickets([]); setTicketsDigits([]); setTicketsP10([]); setTicketsQD([]); setTicketsCP([]);
    setTicketsAON([]);

    // DIGITS (Pick 3 / Win4)
    if (isDigits) {
      if (!digitStats) return;
      const parsed = parseInt(numInput, 10);
      const target = Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 4;
      const k = meta.kDigits ?? 3;
      const rec = recommendDigitsFromStats(digitStats);          // decide default mode/alpha
      const mode = alphaMain >= 0.5 ? 'hot' : 'cold';            // allow user override via slider
      const alpha = alphaMain ?? rec.alpha;
      // Build digit weights 0..9 with smoothing (same spirit as buildWeights)
      const counts = new Map<number,number>();
      for (let d=0; d<10; d++) counts.set(d, digitStats.counts[d] || 0);
      const total = digitStats.counts.reduce((a,b)=>a+b,0);
      const avg = total/10;
      const eps = Math.min(0.5, Math.max(0.05, 0.05*avg));
      const arr = Array.from({length:10},(_,i)=>(counts.get(i)||0)+eps);
      const sum = arr.reduce((a,b)=>a+b,0);
      const freq = sum>0 ? arr.map(c=>c/sum) : Array(10).fill(1/10);
      const max = Math.max(...freq);
      const invRaw = freq.map(p=>(max-p)+1e-9);
      const invSum = invRaw.reduce((a,b)=>a+b,0);
      const chosen = (mode==='hot') ? freq : invRaw.map(x=>x/invSum);
      const base = Array(10).fill(1/10);
      const w = chosen.map((p,i)=>(1-alpha)*base[i] + alpha*p);
      const wSum = w.reduce((a,b)=>a+b,0);
      const weights = w.map(x=>x/wSum);
      const out: { digits:number[] }[] = [];
      const drawOne = () => {
        // sample k digits WITH replacement
        const pick = ():number => {
          let r = Math.random(); let acc=0;
          for (let i=0;i<10;i++){ acc += weights[i]; if (acc >= r) return i; }
          return 9;
        };
        const d: number[] = [];
        for (let i=0;i<k;i++) d.push(pick());
        return { digits: d };
      };
      const seen = new Set<string>();
      let guard = 0;
      while (out.length < target && guard < target * 60) {
        const t = drawOne();
        const key = t.digits.join('');
        if (!seen.has(key)) {
          // “Common” filters for digits (only for k=3/4 where hints are calibrated)
          if (!avoidCommon || !(k===3 || k===4)) {
            out.push(t);
          } else {
            const hints = ticketHintsDigits(t.digits, digitStats);
            const bad = hints.includes('Sequential digits')
                     || hints.includes('Palindrome')
                     || hints.includes('Sum outlier');
            if (!bad) out.push(t);
          }
          seen.add(key);
        }
        guard++;
      }
      setTicketsDigits(out);
      // PLAY-TYPE ONLY if registry says so
      if (onActiveHints) {
        const all = new Set<string>();
        for (const t of out) {
          const k = meta.kDigits!;
          const st = straightOnlyLabel(t.digits, k);     // e.g., 777 (k=3) → “Straight”
          const bx = boxVariantLabel(t.digits, k);       // “N-Way Box”
          if (usesPlayTypeTags(meta)) {
            if (st && HINT_EXPLAIN[st]) all.add(st);
            if (bx && HINT_EXPLAIN[bx]) all.add(bx);
          } else {
            // (If ever needed) fallback to pattern hints
          }
        }
        onActiveHints(Array.from(all));
      }
      if (liveRef.current) liveRef.current.textContent = `Generated ${out.length} tickets.`;
      return;
    }

    // CASH POP (single value)
    if (isCashPop) {
      if (!cpCounts) return;
      const parsed = parseInt(numInput, 10);
      const target = Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 4;
      // Build weighted distribution 1..15 with alpha bias
      const base = Array(16).fill(0).map((_,i)=> (i===0?0:1/15));
      const total = cpCounts.reduce((a,b)=>a+b,0) || 1;
      const freq  = cpCounts.map(c => c/total);
      // Normalize (index 1..15), and blend with base
      const chosen = alphaMain >= 0.5 ? freq : freq.map(p => (Math.max(...freq)-p)+1e-9);
      const chSum = chosen.slice(1).reduce((a,b)=>a+b,0);
      const chN   = chosen.map((p,i)=> i===0?0:p/chSum);
      const w = chN.map((p,i)=> i===0?0: (1-alphaMain)*base[i] + alphaMain*p);
      const wSum = w.slice(1).reduce((a,b)=>a+b,0);
      const weights = w.map((x,i)=> i===0?0: x/wSum);
      const draw = () => {
        let r = Math.random(); let acc = 0;
        for (let v=1; v<=15; v++){ acc += weights[v]; if (acc >= r) return v; }
        return 15;
      };
      const out: { value:number }[] = [];
      const seen = new Set<number>();
      let guard = 0;
      while (out.length < target && guard < target * 50) {
        const v = draw();
        // Allow duplicates (different tickets can be same number), but avoid exact repeats if avoidCommon
        if (!avoidCommon || !seen.has(v)) out.push({ value: v });
        seen.add(v);
        guard++;
      }
      setTicketsCP(out);
      if (liveRef.current) liveRef.current.textContent = `Generated ${out.length} tickets.`;
      return;
    }

    // PICK 10 (10-from-80)
    if (isPick10) {
      if (!p10Stats) return;
      const parsed = parseInt(numInput, 10);
      const target = Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 4;
      // use slider alphaMain to override recommendation strength
      const rec = recommendPick10FromStats(p10Stats);
      const mode = alphaMain >= 0.5 ? 'hot' : 'cold';
      const alpha = alphaMain ?? rec.alpha;
      const out: { values:number[] }[] = [];
      const seen = new Set<string>();
      let guard = 0;
      while (out.length < target && guard < target * 60) {
        const values = await generatePick10TicketAsync(p10Stats, { mode, alpha });
        const key = values.join('-');
        if (!seen.has(key)) {
          if (!avoidCommon) {
            out.push({ values });
          } else {
            const hints = ticketHintsPick10(values, p10Stats);
            const bad = hints.includes('3-in-a-row')
                     || hints.includes('Tight span')
                     || hints.includes('Birthday-heavy');
            if (!bad) out.push({ values });
          }
          seen.add(key);
        }
        guard++;
      }
      setTicketsP10(out);
      if (onActiveHints) {
        const all = new Set<string>();
        for (const t of out) {
          for (const h of ticketHintsPick10(t.values, p10Stats)) all.add(h);
        }
        onActiveHints(Array.from(all));
      }
      if (liveRef.current) liveRef.current.textContent = `Generated ${out.length} tickets.`;
      return;
    }

    // QUICK DRAW (Keno-style; player “spots” 1..10)
    if (isQuickDraw) {
      if (!qdStats) return;
      const parsed = parseInt(numInput, 10);
      const target = Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 4;
      const rec = recommendQuickDrawFromStats(qdStats);
      const mode = alphaMain >= 0.5 ? 'hot' : 'cold';
      const alpha = alphaMain ?? rec.alpha;
      const out: { values:number[] }[] = [];
      const seen = new Set<string>();
      let guard = 0;
      while (out.length < target && guard < target * 60) {
        const values = await generateQuickDrawTicketAsync(qdStats, qdSpots, { mode, alpha });
        const key = values.join('-');
        if (!seen.has(key)) {
          if (!avoidCommon) {
            out.push({ values });
          } else {
            // Light “common” filters for variable-k Keno
            const bad = qdHas3Run(values) || qdIsTight(values, 80);
            if (!bad) out.push({ values });
          }
          seen.add(key);
        }
        guard++;
      }
      setTicketsQD(out);
      if (onActiveHints) {
        const all = new Set<string>();
        for (const t of out) {
          const flags: string[] = [];
          if (qdHas3Run(t.values)) flags.push('3-in-a-row');
          if (qdIsTight(t.values, 80)) flags.push('Tight span');
          if (flags.length === 0) flags.push('Balanced');
          flags.forEach(h => all.add(h));
        }
        onActiveHints(Array.from(all));
      }
      if (liveRef.current) liveRef.current.textContent = `Generated ${out.length} tickets.`;
      return;
    }

    // ALL OR NOTHING (12-from-24)
    if (isAllOrNothing) {
      if (!aonStats) return;
      const parsed = parseInt(numInput, 10);
      const target = Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 4;
      // slider overrides, like Pick 10
      const rec = recommendAllOrNothingFromStats(aonStats);
      const mode = alphaMain >= 0.5 ? 'hot' : 'cold';
      const alpha = alphaMain ?? rec.alpha;
      const out: { values:number[] }[] = [];
      const seen = new Set<string>();
      let guard = 0;
      while (out.length < target && guard < target * 60) {
        const values = await generateAllOrNothingTicketAsync(aonStats, { mode, alpha });
        const key = values.join('-');
        if (!seen.has(key)) {
          if (!avoidCommon) {
            out.push({ values });
          } else {
            // optional: filter very tight spans or long runs, similar to Pick 10,
            // but tuned for 12-of-24 where span will naturally be smaller.
            const sorted = [...values].sort((a,b)=>a-b);
            const span = sorted[sorted.length-1]! - sorted[0]!;
            const has3Run = sorted.some((_,i)=> i>=2 && sorted[i-2]!+2===sorted[i-1]!+1 && sorted[i-1]!+1===sorted[i]);
            // 24 domain → "too tight" if span <= 6 is a decent default
            const tooTight = span <= 6;
            if (!has3Run && !tooTight) {
              out.push({ values });
            }
          }
          seen.add(key);
        }
        guard++;
      }
      setTicketsAON(out);
      if (onActiveHints) {
        const all = new Set<string>();
        for (const t of out) {
          // if you have ticketHintsAllOrNothing, use it; otherwise simple tags:
          // const hs = ticketHintsAllOrNothing(t.values, aonStats);
          const hs: string[] = [];
          const sorted = [...t.values].sort((a,b)=>a-b);
          const span = sorted[sorted.length-1]! - sorted[0]!;
          const has3Run = sorted.some((_,i)=> i>=2 && sorted[i-2]!+2===sorted[i-1]!+1 && sorted[i-1]!+1===sorted[i]);
          if (has3Run) hs.push('3-in-a-row');
          if (span <= 6) hs.push('Tight span');
          if (hs.length === 0) hs.push('Balanced');
          hs.forEach(h => all.add(h));
        }
        onActiveHints(Array.from(all));
      }
      if (liveRef.current) liveRef.current.textContent = `Generated ${out.length} tickets.`;
      return;
    }

    // FIVE-BALL (PB/MM/C4L/Fantasy5/Take5 ...) original path
    if (!rows || rows.length === 0) { setTickets([]); return; }
    const parsed = parseInt(numInput, 10);
    const target = Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 4; // clamp, fallback to 4
    const out: { mains: number[]; special?: number }[] = [];
    const seen = new Set<string>();
    let guard = 0;
    while (out.length < target && guard < target * 50) {
      // For six-mains-no-special (FL LOTTO/JTP), suppress special generation by overriding specialMax → 0.
      const cfg = eraConfigFor(meta, eraCfg);
      const t = await generateTicketAsync(
        rows as any, game,
        { modeMain, modeSpecial, alphaMain, alphaSpecial, avoidCommon },
        cfg
      ) as { mains:number[]; special?:number };
      const key = `${t.mains.join('-')}:${t.special ?? ''}`;
      if (!seen.has(key)) { seen.add(key); out.push(t); }
      guard++;
    }
    setTickets(out);
    if (onActiveHints) {
      // compute union of hint labels across generated tickets
      const all = new Set<string>();
      for (const t of out) {
        const hs = filterHintsForGame(
          meta,
          ticketHints(game, t.mains, (hasSpecial ? (t.special ?? 0) : 0), stats)
        );
        hs.forEach(h => all.add(h));
      }
      onActiveHints(Array.from(all));
    }
    if (liveRef.current) liveRef.current.textContent = `Generated ${out.length} tickets.`;
  }

  async function copyTicketsToClipboard() {
  let lines = '';
  if (isFiveBall) {
    lines = tickets.map(t => hasSpecial
      ? `${t.mains.join('-')} | ${t.special}`
      : `${t.mains.join('-')}`
    ).join('\n');
  } else if (isDigits) {
    lines = ticketsDigits.map(t => t.digits.join('')).join('\n'); // common format for digits
  } else if (isPick10) {
    lines = ticketsP10.map(t => t.values.join('-')).join('\n');
  } else if (isQuickDraw) {
    lines = ticketsQD.map(t => t.values.join('-')).join('\n');
    } else if (isAllOrNothing) {
    lines = ticketsAON.map(t => t.values.join('-')).join('\n');
    } else if (isCashPop) {
    lines = ticketsCP.map(t => String(t.value)).join('\n');
  }
  try { await navigator.clipboard.writeText(lines); } catch {}
}

  return (
    <section className="card generator-card">
      {/* Header */}
      <div className="card-title">Generator</div>
      {/* Recommended */}
      <div className="controls">
        <button
          className="btn btn-primary"
          onClick={applyRecommendedPreset}
          aria-label="Apply Recommended preset from analysis (auto-analyze if needed)"
          disabled={anLoading}
          title={
            anLoading ? 'Analyzing…' : (
              analysisForGame
                ? (
                    `Recommended from analysis: mains ${analysisForGame.recMain.mode} (α=${analysisForGame.recMain.alpha.toFixed(2)})`
                    + (hasSpecial
                        ? `, ${isNyLotto ? 'bonus' : 'special'} ${analysisForGame.recSpec.mode} (α=${analysisForGame.recSpec.alpha.toFixed(2)})`
                        : '')
                  )
                : 'Click to analyze and apply the recommended weights'
            )
          }
        >
          Recommended Weighting
        </button>
        <Info
          tip={
            'Recommended uses recent draw history to set weights automatically:\n' +
            '• Checks how uneven the numbers have been.\n' +
            '• Chooses “hot” (more frequent) or “cold” (less frequent) for mains and special.\n' +
            '• Sets α = how strongly to lean (0 = even, 1 = strong bias), with per-game limits.\n' +
            '• Adds light smoothing so small samples don’t overreact.\n' +
            'Note: This only biases random picks. It does not predict results.'
          }
        />
      </div>

      {/* Main numbers weighting */}
      <div className="generator-section">
        <div className="controls items-start">
          <div className="font-semibold">Main numbers weighting</div>
          <Info
            tip={
              'Main numbers weighting:\n' +
              '• hot = favor numbers that have hit more often\n' +
              '• cold = favor numbers that have hit less often\n' +
              '• α controls strength (0 = even, 1 = max bias)\n' +
              '• Light smoothing keeps small samples from being too spiky.'
            }
          />
        </div>
        <input
          aria-label="Main alpha"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={alphaMain}
          onChange={(e)=>setAlphaMain(parseFloat(e.target.value))}
          className="generator-range"
        />
        <div className="hint" aria-live="polite">alpha = {alphaMain.toFixed(2)} ({modeMain})</div>
      </div>

      {/* Special ball weighting (only for games that have a special) */}
      {hasSpecial && (
        <div className="generator-section generator-section--special">
          <div className="controls items-start">
            <div className="font-semibold">{isNyLotto ? 'Bonus weighting' : 'Special ball weighting'}</div>
            <Info
              tip={
                'Special ball weighting:\n' +
                (isNyLotto ? 'Bonus weighting:\n' : 'Special ball weighting:\n') +
                '• hot = favor specials that have hit more often\n' +
                '• cold = favor specials that have hit less often\n' +
                '• α controls strength (0 = even, 1 = max bias)\n' +
                '• Very small ranges (e.g., 1–4) use conservative limits.'
              }
            />
          </div>
          <input
            aria-label="Special alpha"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={alphaSpecial}
            onChange={(e)=>setAlphaSpecial(parseFloat(e.target.value))}
            className="generator-range"
          />
          <div className="hint" aria-live="polite">alpha = {alphaSpecial.toFixed(2)} ({modeSpecial})</div>
        </div>
      )}

      {/* Options */}
      <div className="generator-options">
        <div className="generator-checkbox-row">
          <label className="generator-checkbox-label" htmlFor="avoid-common">
            <input
              id="avoid-common"
              type="checkbox"
              checked={avoidCommon}
              onChange={(e)=>setAvoidCommon(e.target.checked)}
              className="generator-checkbox-input"
            />
            <span>Avoid common patterns</span>
          </label>
          {/* Keep the tooltip OUTSIDE the label to prevent toggling on tap/click */}
          <span
            className="generator-info-inline"
            onMouseDown={(e)=>e.preventDefault()}
            onClick={(e)=>e.stopPropagation()}
          >
          <Info
            tip={
              'Avoid common patterns:\n' +
              'Filters out tickets lots of people pick, like:\n' +
              '• 3+ consecutive numbers\n' +
              '• 4 or more numbers ≤ 31 (birthdays)\n' +
              '• Straight arithmetic sequences\n' +
              '• Very tight clusters\n' +
              'Goal: reduce shared picks—not to change odds.'
            }
          />
        </span>
      </div>
      </div>

      {/* Actions with Tickets input */}
      <div className="generator-actions">
        <div className="generator-tickets-control">
          <span>Tickets:</span>
          <input
            aria-label="Number of tickets"
            type="number"
            min={1}
            max={100}
            value={numInput}
            onChange={(e)=>setNumInput(e.target.value)}
            className="generator-number-input"
          />
        </div>
        {isQuickDraw && (
      <div className="generator-tickets-control">
        <span>Spots:</span>
        <select
          aria-label="Quick Draw spots"
          value={qdSpots}
          onChange={(e)=>setQdSpots(parseInt(e.target.value,10) as any)}
          className="generator-number-input"
        >
          {[1,2,3,4,5,6,7,8,9,10].map(s=>(
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
    )}
        <button
          onClick={()=>generate()}
          className="btn btn-primary"
        >
          Generate
        </button>
        <button
          onClick={copyTicketsToClipboard}
          className="btn btn-ghost"
          disabled={
            isFiveBall  ? tickets.length === 0
          : isDigits    ? ticketsDigits.length === 0
          : isPick10    ? ticketsP10.length === 0
          : isQuickDraw ? ticketsQD.length === 0
          : isCashPop  ? ticketsCP.length === 0
          : true
          }
          aria-label="Copy tickets to clipboard"
        >
          Copy tickets
        </button>
        <button
          className="btn btn-ghost"
          aria-pressed={showEvaluate}
          aria-controls="evaluate-panel"
          onClick={() => setShowEvaluate(v => !v)}
          title={showEvaluate ? 'Hide Evaluate My Numbers' : 'Show Evaluate My Numbers'}
        >
          Evaluate
        </button>
      </div>
      
{/* Evaluate My Numbers (togglable) */}
{showEvaluate && (
  <div id="evaluate-panel" className="generator-evaluate">
    <EvaluateTicket
      game={game}
      rowsForGenerator={rowsForGenerator}
      precomputedStats={stats}
      logical={logical}
      precomputedDigitStats={digitStats}
      precomputedPick10Stats={p10Stats}
      precomputedQuickDrawStats={qdStats}
      quickDrawSpots={qdSpots}
    />
  </div>
)}

{/* Results */}
<div aria-live="polite" ref={liveRef} className="visually-hidden" />
<div className="generator-results">
        {/* FIVE-BALL */}
  {isFiveBall && tickets.map((t, i) => {
   let hints = ticketHints(game, t.mains, t.special ?? 0, stats);
   if (!hasSpecial) {
     hints = hints.filter(h => h !== 'Hot special' && h !== 'Cold special');
   }
    return (
      <div key={`fb-${i}`} className="card">
        <div className="mono num-bubbles" aria-label={`Ticket ${i+1}`}>
          {t.mains.map((n, idx) => (
            <span key={`m-${idx}`} className="num-bubble" aria-label={`Main ${idx+1}`}>{n}</span>
          ))}
          {hasSpecial && (
            <>
              <span className="evaluate-separator" aria-hidden="true">|</span>
              <span className={`num-bubble ${specialToneClass(meta)}`} aria-label="Special">
                {t.special}
              </span>
            </>
          )}
        </div>
        <div className="chips">
          {hints.map(h => (
            <Pill key={h} tone={classifyHint(h)} title={HINT_EXPLAIN[h]}>
              {displayHint(h)}
            </Pill>
          ))}
        </div>
      </div>
    );
  })}

  {/* DIGITS */}
  {isDigits && ticketsDigits.map((t, i) => (
    <div key={`dg-${i}`} className="card">
      <div className="mono num-bubbles" aria-label={`Ticket ${i+1}`}>
        {t.digits.map((d, idx) => (
          <span key={`d-${idx}`} className="num-bubble">{d}</span>
        ))}
      </div>
      {/* Hints for Digits: show play-type variants ONLY (no regular pattern hints) */}
      {digitStats && (
        <div className="chips">
          {playTypeLabelsForDigits(t.digits, meta)
            .filter(h => HINT_EXPLAIN[h]) // keep registry pure; UI filters to what we explain
            .map(h => (
              <Pill key={h} tone={classifyHint(h)} title={HINT_EXPLAIN[h]}>
                {displayHint(h)}
              </Pill>
            ))
          }
        </div>
      )}
    </div>
  ))}

  {/* PICK 10 */}
  {isPick10 && ticketsP10.map((t, i) => (
    <div key={`p10-${i}`} className="card">
      <div className="mono num-bubbles" aria-label={`Ticket ${i+1}`}>
        {t.values.map((n, idx) => (
          <span key={`p-${idx}`} className="num-bubble">{n}</span>
        ))}
      </div>
      {/* Hints for Pick 10 */}
      {p10Stats && (
        <div className="chips">
          {ticketHintsPick10(t.values, p10Stats).map(h => (
            <Pill key={h} tone={classifyHint(h)} title={HINT_EXPLAIN[h]}>
              {displayHint(h)}
            </Pill>
          ))}
        </div>
      )}
    </div>
  ))}

  {/* ALL OR NOTHING (12-from-24) */}
  {isAllOrNothing && ticketsAON.map((t, i) => (
    <div key={`aon-${i}`} className="card">
      <div className="mono num-bubbles" aria-label={`Ticket ${i+1}`}>
        {t.values.map((n, idx) => (
          <span key={`a-${idx}`} className="num-bubble">{n}</span>
        ))}
      </div>
      <div className="chips">
        {(() => {
          const sorted = [...t.values].sort((a,b)=>a-b);
          const span = sorted[sorted.length-1]! - sorted[0]!;
          const has3Run = sorted.some((_,i)=> i>=2 && sorted[i-2]!+2===sorted[i-1]!+1 && sorted[i-1]!+1===sorted[i]);
          const flags: string[] = [];
          if (has3Run) flags.push('3-in-a-row');
          if (span <= 6) flags.push('Tight span');
          if (flags.length === 0) flags.push('Balanced');
          return flags.map(h => (
            <Pill key={h} tone={classifyHint(h)} title={HINT_EXPLAIN[h]}>
              {displayHint(h)}
            </Pill>
          ));
        })()}
      </div>
    </div>
  ))}

  {/* QUICK DRAW */}
  {isQuickDraw && ticketsQD.map((t, i) => (
    <div key={`qd-${i}`} className="card">
      <div className="mono num-bubbles" aria-label={`Ticket ${i+1}`}>
        {t.values.map((n, idx) => (
          <span key={`q-${idx}`} className="num-bubble">{n}</span>
        ))}
      </div>
      {/* Hints for Quick Draw (variable k) */}
      <div className="chips">
        {(() => {
          const flags: string[] = [];
          if (qdHas3Run(t.values)) flags.push('3-in-a-row');
          if (qdIsTight(t.values, 80)) flags.push('Tight span');
          if (flags.length === 0) flags.push('Balanced');
          return flags.map(h => (
            <Pill key={h} tone={classifyHint(h)} title={HINT_EXPLAIN[h]}>
              {displayHint(h)}
            </Pill>
          ));
        })()}
      </div>
    </div>
  ))}

  {/* CASH POP */}
  {isCashPop && ticketsCP.map((t, i) => (
    <div key={`cp-${i}`} className="card">
      <div className="mono num-bubbles" aria-label={`Ticket ${i+1}`}>
        <span className="num-bubble">{t.value}</span>
      </div>
    </div>
  ))}

  {/* Empty */}
  {isFiveBall && tickets.length===0 && <div className="hint">No tickets yet.</div>}
  {isDigits   && ticketsDigits.length===0 && <div className="hint">No tickets yet.</div>}
  {isPick10   && ticketsP10.length===0 && <div className="hint">No tickets yet.</div>}
  {isQuickDraw&& ticketsQD.length===0 && <div className="hint">No tickets yet.</div>}
  {isAllOrNothing && ticketsAON.length===0 && <div className="hint">No tickets yet.</div>}
  {isCashPop && ticketsCP.length===0 && <div className="hint">No tickets yet.</div>}
      </div>
    </section>
  );
}

// --- Component-level Error Boundary wrapper ---
export default function Generator(props: {
  game: GameKey;
  logical?: LogicalGameKey;
  rowsForGenerator: LottoRow[];
  analysisForGame: { recMain:{mode:'hot'|'cold';alpha:number}; recSpec:{mode:'hot'|'cold';alpha:number} } | null;
  anLoading: boolean;
  onEnsureRecommended: () => Promise<{ recMain:{mode:'hot'|'cold';alpha:number}; recSpec:{mode:'hot'|'cold';alpha:number} } | null>;
  onActiveHints?: (labels: string[]) => void;
}) {
  // Reset the boundary when the selected game/logical changes
  const boundaryKey = `${props.game}::${props.logical ?? 'none'}`;
  const Fallback = (
    <div className="rounded-lg border p-4 text-sm">
      <div className="font-medium mb-2">Generator had a hiccup.</div>
      <p className="mb-2">This section failed to render. You can retry just the Generator without affecting the rest of the page.</p>
      <button
        className="mt-1 rounded bg-black text-white px-3 py-1"
        // ErrorBoundary’s default fallback already resets on click,
        // but we include this button for clarity and styling.
        onClick={() => { /* handled inside ErrorBoundary */ }}
      >
        Retry
      </button>
    </div>
  );
  return (
    <ErrorBoundary key={boundaryKey} fallback={Fallback}>
      <GeneratorInner {...props} />
    </ErrorBoundary>
  );
}
