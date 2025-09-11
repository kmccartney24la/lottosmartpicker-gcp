'use client';
import Info from 'src/components/Info';
import { GameKey, eraTooltipFor, getCurrentEraConfig } from '@lib/lotto';

export default function EraBanner({ game }: { game: GameKey }) {
  const era = getCurrentEraConfig(game);
  const tip = eraTooltipFor(game);
  return (
    <div className="card" role="note" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8 }}>
      <div style={{ fontWeight: 700 }}>Current Era</div>
      <Info tip={tip} />
      <div className="hint">
        Using all draws since <span className="mono">{era.start}</span> ({era.label})
      </div>
      {game === 'megamillions' && (
        <div className="hint" style={{ marginLeft: 8 }}>
          <strong>Note:</strong> New rules from <span className="mono">{era.start}</span>. See details in Info.
        </div>
      )}
      {/* Era note is permanent by design (no dismiss). */}
      <div style={{ marginLeft: 'auto' }} />
    </div>
  );
}
