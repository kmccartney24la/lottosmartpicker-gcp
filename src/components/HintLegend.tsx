// src/components/HintLegend.tsx
'use client';
import './HintLegend.css';
import Info from 'src/components/Info';
import Pill from 'src/components/Pill';
import { HINT_EXPLAIN, classifyHint, displayHint } from 'src/components/hints';
import { useMemo, useState } from 'react';

const EXPLAIN = HINT_EXPLAIN;

// Lightweight game-shape detector (no lib changes needed)
function gameShapeFor(game?: string): 'five' | 'digit3' | 'digit4' | 'pick10' | 'quickdraw' {
  const g = (game || '').toLowerCase();
  if (g.includes('numbers')) return 'digit3';
  if (g.includes('win4') || g.includes('win_4') || g.includes('win-4')) return 'digit4';
  if (g.includes('pick10') || g.includes('pick_10') || g.includes('pick-10')) return 'pick10';
  if (g.includes('quick_draw') || g.includes('quick draw') || g.includes('quickdraw')) return 'quickdraw';
  return 'five';
}

// Static core sets per shape — only include labels that exist in HINT_EXPLAIN
function commonSetFor(shape: 'five'|'digit3'|'digit4'|'pick10'|'quickdraw') {
  const byShape: Record<typeof shape, string[]> = {
    five: [
      '3-in-a-row',
      '4-in-a-row',
      'Arithmetic sequence',
      'Birthday-heavy',
      'Tight span',
    ],
    digit3: [
      'Sequential digits',
      'Pair',
      'Triple',
      'Palindrome',
      'Low-heavy',
      'High-heavy',
      'Sum outlier',
    ],
    digit4: [
      'Sequential digits',
      'Pair',
      'Triple',
      'Quad',
      'Palindrome',
      'Low-heavy',
      'High-heavy',
      'Sum outlier',
    ],
    /* Pick 10 ticket hints already emit these */
    pick10: [
      '3-in-a-row',
      'Tight span',
      'Birthday-heavy',
    ],
    /* Quick Draw (variable k) uses the same flags as Evaluate/Generator */
    quickdraw: [
      '3-in-a-row',
      'Tight span',
    ],
  };
  return byShape[shape].filter(k => EXPLAIN[k]);
}

export function explainHint(hint: string): string | undefined {
  return EXPLAIN[hint];
}

export default function HintLegend({ game }: { game?: string }) {
  const [openCommon, setOpenCommon] = useState(false);

  // Always-visible tags (not the per-game common group)
  const CORE: string[] = [
    'Balanced',
    'Hot mains',    // displays as "Hot numbers"
    'Cold mains',   // displays as "Cold numbers"
    'Hot special',
    'Cold special',
    'Common pattern', // umbrella still present per your current hint.ts
  ].filter(k => EXPLAIN[k]);

  const shape = useMemo(() => gameShapeFor(game), [game]);
  const COMMON_CORE = useMemo(() => commonSetFor(shape), [shape]);

  return (
    <div className="card hint-legend">
      <div className="hint-legend-header">
        <div className="card-title hint-legend-title">Tag Legend</div>
        <Info
          tip={
            'Tags describe how a ticket compares to recent history (e.g., Hot numbers, Cold special).\nThey are descriptive only — not predictions.'
          }
          label="How tags work"
        />
      </div>

      {/* Always-visible tags */}
      <ul className="hint-legend-list">
        {CORE.map((label) => {
          const tip = EXPLAIN[label];
          return (
            <li key={label} className="hint-legend-item">
              <Pill tone={classifyHint(label)} title={tip} wrap>
                {displayHint(label)}
              </Pill>
              <div className="hint-legend-description">{tip}</div>
            </li>
          );
        })}
      </ul>

      {/* Common Patterns (collapsible, static per selected game) */}
      {COMMON_CORE.length > 0 && (
        <div className="hint-legend-common">
          <button
            className="legend-toggle legend-toggle--sub"
            aria-expanded={openCommon}
            onClick={() => setOpenCommon(v => !v)}
          >
            <span className="legend-toggle-label legend-toggle-label--sub">
              Common Patterns
            </span>
            <span className="legend-toggle-caret" aria-hidden>▾</span>
          </button>

          {openCommon && (
            <ul className="hint-legend-list hint-legend-list--indent">
              {COMMON_CORE.map((label) => {
                const tip = EXPLAIN[label];
                return (
                  <li key={label} className="hint-legend-item">
                    <Pill tone={classifyHint(label)} title={tip} wrap>
                      {displayHint(label)}
                    </Pill>
                    <div className="hint-legend-description">{tip}</div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
