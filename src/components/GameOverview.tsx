// src/components/GameOverview.tsx
'use client';
import './GameOverview.css';
import { ErrorBoundary } from 'src/components/ErrorBoundary';
import {
  GameKey, drawNightsLabel, nextDrawLabelFor,
  fetchRowsWithCache, fetchLogicalRows,
  defaultSinceFor,
  getCurrentEraConfig, jackpotOdds, jackpotOddsForLogical,
  // new helpers for other draw types
  fetchDigitRowsFor, computeDigitStats,
  fetchPick10RowsFor, computePick10Stats,
  analyzeGameAsync,
  // types for branching
  type Period, type LogicalGameKey
} from 'packages/lib/lotto';
import { useEffect, useRef, useState } from 'react';
import {
  resolveGameMeta,
    isDigitShape,
    coerceAnyPeriod,
    displayNameFor,
    overviewPlanFor,
    overviewStepsFor,
} from 'packages/lib/gameRegistry';

// Canonical-only; never used for scratchers
type CanonicalDrawGame = Exclude<GameKey, 'ga_scratchers'>;

type Props = {
  game: CanonicalDrawGame;
  // Optional: pass when this overview represents an NY logical game on the NY page
  logical?: LogicalGameKey;
  period?: Period; // 'midday' | 'evening' | 'both'
};

function GameOverviewInner({ game, logical, period = 'both' }: Props) {
  const era = getCurrentEraConfig(game);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [a, setA] = useState<ReturnType<typeof import('packages/lib/lotto').analyzeGame> | null>(null);
  const [digitStats, setDigitStats] = useState<ReturnType<typeof computeDigitStats> | null>(null);
  const [pick10Stats, setPick10Stats] = useState<ReturnType<typeof computePick10Stats> | null>(null);
  const [howOpen, setHowOpen] = useState(false);
  // One in-flight chain at a time (debounced + abortable)
  const inflightRef = useRef<{ ac: AbortController | null; timer: any } | null>(null);

  // Registry-driven plan (one stop)
  const plan = overviewPlanFor(game, logical, coerceAnyPeriod(period));
  const labelKey = plan.labelKey;
  const headerKey = plan.headerKey;

  useEffect(() => {
    // Abort previous run and clear any pending debounce
    if (inflightRef.current?.ac) inflightRef.current.ac.abort();
    if (inflightRef.current?.timer) clearTimeout(inflightRef.current.timer);

    const ac = new AbortController();
    const signal = ac.signal;
    const cancelled = () => signal.aborted;

    const timer = setTimeout(async () => {
      try {
        if (cancelled()) return;
        const hadData = !!(a || digitStats || pick10Stats);
        setBusy(true); setErr(null);
        setRefreshing(hadData);
        // Only clear on first load (no data yet). Keep old UI during refresh.
        if (!hadData) { setA(null); setDigitStats(null); setPick10Stats(null); }

        // Registry-driven branching via plan
        const meta = resolveGameMeta(game, logical);
        
        if (plan.mode === 'digits') {
          const per: 'midday'|'evening' = (plan.effPeriod === 'midday' ? 'midday' : 'evening');
          const rows = await fetchDigitRowsFor(plan.digitLogical!, per);
          if (cancelled()) return;
          const k = plan.kDigits!;
          if (k === 3 || k === 4) {
            setDigitStats(computeDigitStats(rows, k));
            return;
          }
          // Proxy to nearest supported k (3 or 4) to keep UI populated gracefully
          const proxyK: 3|4 = (k === 2 ? 3 : 4);
          const proxyRows = rows.map(r => ({
            date: r.date,
            digits: (k === 2)
              ? [r.digits[0] ?? 0, r.digits[1] ?? 0, r.digits[1] ?? 0]
              : r.digits.slice(0, 4),
          }));
          setDigitStats(computeDigitStats(proxyRows as any, proxyK));
          return;
        }

        if (plan.mode === 'pick10') {
          const rows = await fetchPick10RowsFor('ny_pick10');
          if (cancelled()) return;
          setPick10Stats(computePick10Stats(rows));
          return;
        }

        // 5/6-ball style (logical-aware)
        if (plan.mode === 'fiveSix') {
          if (logical && plan.repKey) {
            const since = defaultSinceFor(plan.repKey) ?? undefined;
            const rowsL = await fetchLogicalRows({ logical, period: plan.effPeriod, since });
            if (cancelled()) return;
            setA(await analyzeGameAsync(rowsL, plan.repKey, signal));
            return;
          }
          // Canonical fallback
          const since = defaultSinceFor(game) ?? getCurrentEraConfig(game).start;
          const rows = await fetchRowsWithCache({ game, since });
          if (cancelled()) return;
          setA(await analyzeGameAsync(rows, game, signal));
          return;
        }
      } catch (e:any) {
        if (!cancelled()) setErr(e?.message || String(e));
      } finally {
        if (!cancelled()) { setBusy(false); setRefreshing(false); }
      }
    }, 200);

    inflightRef.current = { ac, timer };
    return () => {
      ac.abort();
      clearTimeout(timer);
    };
  }, [game, logical, period]);

  // --- How to Play content, now data-driven from the registry ---
  function howToPlay(): JSX.Element | null {
    const metaForHowTo = resolveGameMeta(game, logical);
    const steps = overviewStepsFor(plan.family, metaForHowTo);
    if (!steps.length) return null;
    return (
      <ul className="game-overview-list">
        {steps.map((s, i) => <li key={i}>{s.replace('FIREBALL','\u00A0FIREBALL')}</li>)}
      </ul>
    );
  }
  return (
    <section className="card game-overview" role="note" aria-label="Game overview">
      <div className="card-title game-overview-title">Game Overview — {displayNameFor(headerKey)}</div>
      {refreshing && !err && (
        <div className="go-refreshing" aria-live="polite">Refreshing…</div>
      )}
      <ul className="game-overview-list">
        <li><strong>Draw schedule:</strong> {drawNightsLabel(labelKey)}</li>
        <li><strong>Next expected:</strong> {nextDrawLabelFor(labelKey)}</li>
        {/* Inline analysis details styled like the rest of the overview */}
        {busy && !err && <li className="game-overview-note">Refreshing overview…</li>}
        {!busy && err && <li className="game-overview-note error">Analysis unavailable</li>}

        {/* Digits */}
        {!busy && !err && digitStats && (
          <>
            <li><strong>Jackpot odds:</strong> 1 in {jackpotOddsForLogical(logical!).toLocaleString()}</li>
          </>
        )}

        {/* Pick 10 (10-from-80) */}
        {!busy && !err && pick10Stats && (
          <>
            <li><strong>Jackpot odds:</strong> 1 in {jackpotOddsForLogical('ny_pick10')!.toLocaleString()}</li>
          </>
        )}

        {/* Classic 5-ball overview */}
        {!busy && !err && a && (
          <>
            <li><strong>Jackpot odds:</strong> {
              logical
                ? <>1 in { (jackpotOddsForLogical(logical) ?? jackpotOdds(game)).toLocaleString() }</>
                : <>1 in {jackpotOdds(game).toLocaleString()}</>
            }</li>
          </>
        )}
      </ul>
      {/* How to Play (collapsible) */}
      <div className="game-overview-howto">
        <button
          className="go-toggle go-toggle--sub"
          aria-expanded={howOpen}
          onClick={() => setHowOpen(v => !v)}
        >
          <span className="game-overview-title">How to Play</span>
          <span className="go-caret" aria-hidden>▾</span>
        </button>
        {howOpen && (
          <div className="game-overview-howto-body">
            {howToPlay()}
          </div>
        )}
      </div>
    </section>
  );
}

// --- Component-level Error Boundary wrapper ---
export default function GameOverview(props: Props) {
  // Remount (reset) the boundary when key inputs change.
  const resetKey = JSON.stringify({
    game: props.game,
    logical: props.logical ?? null,
    period: props.period ?? 'both',
  });

  const Fallback = (
    <div className="rounded-lg border p-4 text-sm">
      <div className="font-medium mb-2">Game overview hit an error.</div>
      <p className="mb-2">Retry just this section without reloading the whole page.</p>
      <button
        className="mt-1 rounded bg-black text-white px-3 py-1"
        onClick={() => { /* ErrorBoundary’s built-in Retry via state reset */ }}
      >
        Retry
      </button>
    </div>
  );

  return (
    <ErrorBoundary key={resetKey} fallback={Fallback}>
      <GameOverviewInner {...props} />
    </ErrorBoundary>
  );
}