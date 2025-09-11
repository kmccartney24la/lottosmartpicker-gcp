'use client';
import Info from 'src/components/Info'; // <-- fixed alias
import { GameKey, getCurrentEraConfig, eraTooltipFor } from '@lib/lotto';

export default function EraBanner({ game }: { game: GameKey }) {
  const era = getCurrentEraConfig(game);
  const tip = eraTooltipFor(game);
  const key = `eraBanner.dismissed.${game}`;
  const dismissed = typeof window !== 'undefined' && localStorage.getItem(key) === '1';
  if (dismissed) return null;
  return (
    <div className="card" role="note" aria-live="polite" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8 }}>
      <div style={{ fontWeight: 700 }}>Current Era</div>
      <Info tip={tip} />
      <div className="hint">
        Using all draws since <span className="mono">{era.start}</span> ({era.label})
      </div>
      {game === 'megamillions' && (
        <div className="hint" style={{ marginLeft: 8 }}>
          <strong>Note:</strong> New rules from <span className="mono">2025-04-05</span>. See details in Info.
        </div>
      )}
      <button
        className="btn btn-ghost"
        onClick={() => { localStorage.setItem(key, '1'); location.reload(); }}
        aria-label="Dismiss current era notice"
        style={{ marginLeft: 'auto' }}
      >
        Dismiss
      </button>
    </div>
  );
}
