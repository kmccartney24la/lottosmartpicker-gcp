'use client';
import { CURRENT_ERA, GameKey } from '@lib/lotto';

const ORDER: { key: GameKey; label: string }[] = [
  { key: 'megamillions', label: 'Mega Millions' },
  { key: 'powerball',    label: 'Powerball' },
  { key: 'ga_cash4life', label: 'Cash4Life' },
  { key: 'ga_fantasy5',  label: 'Fantasy 5' },
];

export default function InfoOverview() {
  return (
    <section className="card" role="note" aria-label="Era overview" style={{ marginBottom: 8, background:'var(--info-bg)' }}>
      <div style={{ fontWeight:700, marginBottom:6 }}>Era Overview</div>
      <ul className="hint" style={{ margin:0, paddingLeft: 18 }}>
        {ORDER.map(o => {
          const era = CURRENT_ERA[o.key];
          return (
            <li key={o.key}>
              <strong>{o.label}:</strong> current era <em>{era.label}</em> since <strong>{era.start}</strong>
            </li>
          );
        })}
      </ul>
      <div className="hint" style={{ marginTop:6 }}>
        Mega Millions rules changed on <strong>Apr 8, 2025</strong>; stats and generation default to post-cutoff data.
      </div>
    </section>
  );
}
