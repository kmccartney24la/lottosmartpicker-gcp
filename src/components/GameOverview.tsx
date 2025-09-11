'use client';
import { GameKey, CURRENT_ERA, drawNightsLabel, nextDrawLabelNYFor } from '@lib/lotto';
import { useEffect, } from 'react';

export default function GameOverview({ game }: { game: GameKey }) {
  const era = CURRENT_ERA[game];
  useEffect(() => {
    let alive = true;
    return () => { alive = false; };
  }, [game]);
  const names: Record<GameKey, string> = {
    powerball: 'Powerball',
    megamillions: 'Mega Millions',
    ga_cash4life: 'Cash4Life',
    ga_fantasy5: 'Fantasy 5',
  };
  return (
    <section className="card" role="note" aria-label="Game overview" style={{ marginBottom: 8, background:'var(--info-bg)' }}>
      <div style={{ fontWeight:700, marginBottom:6 }}>Game Overview — {names[game]}</div>
      <ul className="hint" style={{ margin:0, paddingLeft: 18 }}>
        <li><strong>Current era:</strong> {era.label} (since <span className="mono">{era.start}</span>)</li>
        <li><strong>Draw nights:</strong> {drawNightsLabel(game)}</li>
        <li><strong>Next expected:</strong> {nextDrawLabelNYFor(game)}</li>
      </ul>
    </section>
  );
}