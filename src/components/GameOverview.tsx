// src/components/GameOverview.tsx
'use client';
import './GameOverview.css';
import {
  GameKey, drawNightsLabel, nextDrawLabelNYFor,
  analyzeGame, fetchRowsWithCache, getCurrentEraConfig, jackpotOdds,
  // new helpers for other draw types
  fetchDigitRowsFor, computeDigitStats,
  fetchPick10RowsFor, computePick10Stats,
  // types for branching
  type Period, type LogicalGameKey
} from '@lib/lotto';
import { jackpotOddsForLogical } from '@lib/lotto';
import { useEffect, useState } from 'react';

// Canonical-only; never used for scratchers
type CanonicalDrawGame = Exclude<GameKey, 'ga_scratchers'>;

type Props = {
  game: CanonicalDrawGame;
  // Optional: pass when this overview represents an NY logical game on the NY page
  logical?: LogicalGameKey;
  period?: Period; // 'midday' | 'evening' | 'both'
};

export default function GameOverview({ game, logical, period = 'both' }: Props) {
  const era = getCurrentEraConfig(game);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [a, setA] = useState<ReturnType<typeof analyzeGame> | null>(null);
  const [digitStats, setDigitStats] = useState<ReturnType<typeof computeDigitStats> | null>(null);
  const [pick10Stats, setPick10Stats] = useState<ReturnType<typeof computePick10Stats> | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setBusy(true); setErr(null); setA(null); setDigitStats(null); setPick10Stats(null);

        // Branch: if a logical NY digit game or Pick 10 was provided, compute those stats.
        if (logical === 'ny_numbers') {
          const rows = await fetchDigitRowsFor('ny_numbers', period);
          if (!alive) return;
          setDigitStats(computeDigitStats(rows, 3));
          return;
        }
        if (logical === 'ny_win4') {
          const rows = await fetchDigitRowsFor('ny_win4', period);
          if (!alive) return;
          setDigitStats(computeDigitStats(rows, 4));
          return;
        }
        if (logical === 'ny_pick10') {
          const rows = await fetchPick10RowsFor('ny_pick10');
          if (!alive) return;
          setPick10Stats(computePick10Stats(rows));
          return;
        }

        // Default: 5-ball canonical analysis (PB/MM/C4L/Fantasy5/Take5)
        const rows = await fetchRowsWithCache({ game, since: getCurrentEraConfig(game).start });
        if (!alive) return;
        setA(analyzeGame(rows, game));
      } catch (e:any) {
        if (alive) setErr(e?.message || String(e));
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [game, logical, period]);

  // Provide known friendly names, but don't force exhaustive coverage.
  const names: Partial<Record<CanonicalDrawGame, string>> = {
    multi_powerball: 'Powerball',
    multi_megamillions: 'Mega Millions',
    multi_cash4life: 'Cash4Life',
    ga_fantasy5: 'Fantasy 5',
    ny_take5: 'Take 5',
  };

  const displayName = (g: CanonicalDrawGame): string => {
    if (names[g]) return names[g]!;
    // Reasonable fallbacks for any future canonical draw games:
    if (g === 'ny_numbers') return 'Numbers';
    if (g === 'ny_win4') return 'Win 4';
    if (g === 'ny_lotto' || g === 'ny_nylotto') return 'NY Lotto';
    if (g === 'ny_pick10' || g === 'ny_pick10_rep') return 'Pick 10';
    if (g === 'ny_quick_draw' || g === 'ny_quick_draw_rep') return 'Quick Draw';
    // Default to the raw key if nothing matches (debug-friendly)
    return String(g);
  };
  return (
    <section className="card game-overview" role="note" aria-label="Game overview">
      <div className="card-title game-overview-title">Game Overview — {displayName(game)}</div>
      <ul className="game-overview-list">
        <li><strong>Current era:</strong> {era.label} (since <span className="mono">{era.start}</span>)</li>
        <li><strong>Draw nights:</strong> {drawNightsLabel(game)}</li>
        <li><strong>Next expected:</strong> {nextDrawLabelNYFor(game)}</li>
        {/* Inline analysis details styled like the rest of the overview */}
        {busy && !err && <li className="game-overview-note">Analyzing…</li>}
        {!busy && err && <li className="game-overview-note error">Analysis unavailable</li>}

        {/* Digits (Numbers / Win4) */}
        {!busy && !err && digitStats && (
          <>
            <li><strong>Total draws analyzed:</strong> {digitStats.totalDraws.toLocaleString()}</li>
            <li><strong>Digit domain:</strong> 0–9 × {digitStats.k} digits</li>
            <li><strong>Jackpot odds:</strong> 1 in {jackpotOddsForLogical(logical!).toLocaleString()}</li>
          </>
        )}

        {/* Pick 10 (10-from-80) */}
        {!busy && !err && pick10Stats && (
          <>
            <li><strong>Total draws analyzed:</strong> {pick10Stats.totalDraws.toLocaleString()}</li>
            <li><strong>Number domain:</strong> 1–80 · pick 10</li>
            <li><strong>Jackpot odds:</strong> 1 in {jackpotOddsForLogical('ny_pick10')!.toLocaleString()}</li>
          </>
        )}

        {/* Classic 5-ball overview */}
        {!busy && !err && a && (
          <>
            <li><strong>Total draws analyzed:</strong> {a.draws.toLocaleString()}</li>
            <li><strong>Jackpot odds:</strong> 1 in {jackpotOdds(game).toLocaleString()}</li>
            <li>
              <strong>Recommended weighting:</strong>{' '}
              mains <em>{a.recMain.mode}</em> (α={a.recMain.alpha.toFixed(2)})
              {a.eraCfg.specialMax > 0 && (
                <> · special <em>{a.recSpec.mode}</em> (α={a.recSpec.alpha.toFixed(2)})</>
              )}
            </li>
          </>
        )}
      </ul>
    </section>
  );
}