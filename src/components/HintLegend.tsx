'use client';
import Info from './Info';

const EXPLAIN: Record<string, string> = {
  'Balanced':
    'No strong hot/cold signals; no obvious sequences or tight clusters.',
  'Pattern looks common':
    'Contains patterns many people choose (long runs, many ≤31 “date” numbers, arithmetic sequences, or tight clusters). We avoid these to reduce shared-jackpot risk.',
  'Uncommon mix (many rare mains)':
    'At least 3 mains have appeared ≤1 time in the current era sample — a colder mix.',
  'Hot-heavy mains':
    'At least 3 mains show z-score > 1 (hit more than expected recently).',
  'Hot special':
    'Special ball shows z-score > 1 in the current era (more frequent lately).',
  'Cold special':
    'Special ball shows z-score < -1 in the current era (less frequent lately).',
};

export function explainHint(hint: string): string | undefined {
  return EXPLAIN[hint];
}

export default function HintLegend() {
  return (
    <div className="card" style={{ padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Ticket tag legend</div>
        <Info tip="Hover any tag to see its meaning. These tags come from current-era statistics (z-scores, dispersion) and pattern checks." />
      </div>
      <ul className="hint" style={{ margin: 6, paddingLeft: 18 }}>
        {Object.entries(EXPLAIN).map(([label, tip]) => (
          <li key={label}><strong>{label}:</strong> {tip}</li>
        ))}
      </ul>
    </div>
  );
}
