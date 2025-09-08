'use client';
import Info from '@components/Info'; // <-- fixed alias
import { GameKey, getCurrentEraConfig, eraTooltipFor } from '@lib/lotto';

export default function EraBanner({ game }: { game: GameKey }) {
  const era = getCurrentEraConfig(game);
  const tip = eraTooltipFor(game);
  return (
    <div className="card" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 8 }}>
      <div style={{ fontWeight: 700 }}>Current Era</div>
      <Info tip={tip} />
      <div className="hint">
        Using all draws since <span className="mono">{era.start}</span> ({era.label})
      </div>
    </div>
  );
}
