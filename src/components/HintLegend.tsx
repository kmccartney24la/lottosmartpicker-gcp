// src/components/HintLegend.tsx
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
    <div className="card hint-legend">
      <div className="hint-legend-header">
        <div className="hint-legend-title">Tag Legend</div>
        <Info
          tip={'These tags are descriptive heuristics based on recent draw statistics.\nThey do not predict outcomes.'}
          label="How tags work"
        />
      </div>

      <ul className="hint-legend-list">
        {Object.entries(EXPLAIN).map(([label, tip]) => (
          <li key={label} className="hint-legend-item">
            <Pill tone={classifyHint(label)} title={tip} wrap>
              {label}
            </Pill>

            <div className="hint-legend-description">{tip}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
