'use client';
import Info from 'src/components/Info';
import Pill from 'src/components/Pill';
import { HINT_EXPLAIN, classifyHint } from 'src/components/hints';

const EXPLAIN = HINT_EXPLAIN;

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
      <div style={{ display:'flex', flexWrap:'wrap', gap: 6, marginTop: 8 }}>
        {Object.keys(EXPLAIN).map(label => (
            <Pill key={label} tone={classifyHint(label)} title={EXPLAIN[label]}>{label}</Pill>
            ))}
      </div>
      <ul className="hint" style={{ margin: 6, paddingLeft: 18 }}>
        {Object.entries(EXPLAIN).map(([label, tip]) => (
          <li key={label} style={{ display: 'flex', gap: 8, alignItems: 'baseline' }}>
            <Pill tone={classifyHint(label)} title={tip}>{label}</Pill>
            <span>{tip}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
