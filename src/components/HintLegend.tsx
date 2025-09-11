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
    <div className="card" style={{ padding: 10 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ fontWeight: 700 }}>Tag Legend</div>
      </div>

      <ul className="hint" style={{ margin: 6, paddingLeft: 0, listStyle: 'none' }}>
        {Object.entries(EXPLAIN).map(([label, tip]) => (
          <li
            key={label}
            style={{
              display: 'grid',
              gridTemplateColumns: '100px 1fr', // ✅ uniform pill column
              columnGap: 10,
              alignItems: 'start',              // ✅ top-align the row
              marginBottom: 8,
            }}
          >
            <Pill
              tone={classifyHint(label)}
              title={tip}
              wrap
              style={{ width: '100px' }}        // ✅ same as grid col for perfect alignment
            >
              {label}
            </Pill>

            <div style={{ maxWidth: '100%' }}>{tip}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}
