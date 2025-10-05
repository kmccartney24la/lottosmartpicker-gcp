// src/components/GameOverview.tsx
'use client';
import './GameOverview.css';
import {
  GameKey, CURRENT_ERA, drawNightsLabel, nextDrawLabelNYFor,
  analyzeGame, fetchRowsWithCache, getCurrentEraConfig, jackpotOdds
} from '@lib/lotto';
import { useEffect, useState } from 'react';

export default function GameOverview({ game }: { game: GameKey }) {
  const era = CURRENT_ERA[game];
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [a, setA] = useState<ReturnType<typeof analyzeGame> | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setBusy(true); setErr(null); setA(null);
        const since = getCurrentEraConfig(game).start;
        const rows = await fetchRowsWithCache({ game, since });
        if (!alive) return;
        setA(analyzeGame(rows, game));
      } catch (e:any) {
        if (alive) setErr(e?.message || String(e));
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [game]);

  const names: Record<Exclude<GameKey,'ga_scratchers'>, string> = {
    multi_powerball: 'Powerball',
    multi_megamillions: 'Mega Millions',
    multi_cash4life: 'Cash4Life',
    ga_fantasy5: 'Fantasy 5',
  };
  return (
    <section className="card game-overview" role="note" aria-label="Game overview">
      <div className="card-title game-overview-title">Game Overview — {names[game]}</div>
      <ul className="game-overview-list">
        <li><strong>Current era:</strong> {era.label} (since <span className="mono">{era.start}</span>)</li>
        <li><strong>Draw nights:</strong> {drawNightsLabel(game)}</li>
        <li><strong>Next expected:</strong> {nextDrawLabelNYFor(game)}</li>
        {/* Inline analysis details styled like the rest of the overview */}
        {busy && !err && <li className="game-overview-note">Analyzing…</li>}
        {!busy && err && <li className="game-overview-note error">Analysis unavailable</li>}
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