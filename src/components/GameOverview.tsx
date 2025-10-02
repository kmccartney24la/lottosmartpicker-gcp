// src/components/GameOverview.tsx
'use client';
import { GameKey, CURRENT_ERA, drawNightsLabel, nextDrawLabelNYFor } from '@lib/lotto';
import { useEffect, } from 'react';

export default function GameOverview({ game }: { game: GameKey }) {
  const era = CURRENT_ERA[game];
  useEffect(() => {
    let alive = true;
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
      <div className="game-overview-title">Game Overview — {names[game]}</div>
      <ul className="game-overview-list">
        <li><strong>Current era:</strong> {era.label} (since <span className="mono">{era.start}</span>)</li>
        <li><strong>Draw nights:</strong> {drawNightsLabel(game)}</li>
        <li><strong>Next expected:</strong> {nextDrawLabelNYFor(game)}</li>
      </ul>
    </section>
  );
}