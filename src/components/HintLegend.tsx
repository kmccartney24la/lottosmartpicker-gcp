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
        <div style={{ fontWeight: 700 }}>Tag Legend</div>
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
