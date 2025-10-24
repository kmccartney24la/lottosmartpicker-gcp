'use client';
import './HintLegend.css';
import Info from 'apps/web/src/components/Info';
import Pill from 'apps/web/src/components/Pill';
import { HINT_EXPLAIN, classifyHint, displayHint } from 'apps/web/src/components/hints';
import { useMemo, useState } from 'react';
import {
  resolveGameMeta,
  isDigitShape,
  usesPlayTypeTags,
  hasColoredSpecial,     // NEW
  legendGroupsFor,       // NEW
} from '@lsp/lib';

const EXPLAIN = HINT_EXPLAIN;

export default function HintLegend({ game }: { game?: string }) {
  const [openCommon, setOpenCommon] = useState(false);
  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({});
  const toggleGroup = (k: string) => setOpenGroups(s => ({ ...s, [k]: !s[k] }));

  const meta = useMemo(() => resolveGameMeta((game as any) ?? undefined, undefined), [game]);
  const mode = isDigitShape(meta.shape) ? 'playtypes' : 'patterns';
  const isPlaytypes = usesPlayTypeTags(meta);

  // Always-visible tags
  // For play-type games, we suppress the generic/pattern tags entirely;
  // the play-type labels will be rendered directly below (not in a dropdown).
  const CORE: string[] = isPlaytypes
    ? []
    : [
        'Balanced',
        'Hot mains',
        'Cold mains',
        ...(hasColoredSpecial(meta) ? ['Hot special', 'Cold special'] : []),
        'Common pattern',
      ].filter(k => EXPLAIN[k]);

  // Ask registry for exactly what to show in the collapsible “common” block
  const GROUPS = useMemo(() => legendGroupsFor(meta, { gameStr: game }), [meta, game]);
  const COMMON = GROUPS[0]; // there is always 1 group (either playtypes or patterns)
  const hasCommon = !isPlaytypes && !!COMMON && COMMON.items.some(it => EXPLAIN[it.label] || it.children?.some(c => EXPLAIN[c]));


  return (
    <div className="card hint-legend" data-mode={mode}>
      <div className="hint-legend-header">
        <div className="card-title hint-legend-title">Tag Legend</div>
        <Info
          tip={'Tags describe how a ticket compares to recent history (e.g., Hot numbers, Cold special).\nThey are descriptive only — not predictions.'}
          label="How tags work"
        />
      </div>

      {/* Always-visible section */}
      {!isPlaytypes && (
        <ul className="hint-legend-list">
          {CORE.map(label => {
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

      {/* For play-type games: render Play Types directly (no group/dropdown), keeping Box expandable */}
      {isPlaytypes && COMMON && (
        <ul className="hint-legend-list">
          {COMMON.items.map(({ label, children }) => {
            const childList = (children ?? []).filter(c => EXPLAIN[c]);
            // Expandable "Box" (or any item with multiple children)
            if (childList.length > 1) {
              const isOpen = !!openGroups[label];
              const parentTip = EXPLAIN[label];
              const isBox = label === 'Box';
              return (
                <li
                  key={label}
                  className={
                    "hint-legend-item hint-legend-item--group " +
                    (isBox ? "hint-legend-item--group-inline" : "hint-legend-item--group-vertical")
                  }
                  data-mode={mode}
                >
                  <button
                    className={"chip-button legend-toggle--mini " + (isBox ? "chip-button--full" : "")}
                    aria-expanded={isOpen}
                    onClick={() => toggleGroup(label)}
                    title={parentTip}
                  >
                    <span className="chip-button__label">{displayHint(label)}</span>
                    <span className="legend-toggle-caret" aria-hidden>▾</span>
                  </button>
                  {isBox && parentTip && (
                    <div className="hint-legend-description">{parentTip}</div>
                  )}
                  {isOpen && (
                    <ul className="hint-legend-list hint-legend-list--tiny hint-legend-list--span">
                      {childList.map(child => {
                        const tip = EXPLAIN[child];
                        return (
                          <li key={child} className="hint-legend-item">
                            <Pill tone={classifyHint(child)} title={tip} wrap>
                              {displayHint(child)}
                            </Pill>
                            <div className="hint-legend-description">{tip}</div>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            }
            // Single child → render the child directly
            if (childList.length === 1) {
              const only = childList[0];
              const tip = EXPLAIN[only];
              if (!tip) return null;
              return (
                <li key={only} className="hint-legend-item">
                  <Pill tone={classifyHint(only)} title={tip} wrap>
                    {displayHint(only)}
                  </Pill>
                  <div className="hint-legend-description">{tip}</div>
                </li>
              );
            }
            // No children → simple item
            const tip = EXPLAIN[label];
            if (!tip) return null;
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

      {/* Collapsible block only for non-playtype games (Common Patterns) */}
      {hasCommon && !isPlaytypes && (
        <div className="hint-legend-common" data-mode={mode}>
          <button
            className="legend-toggle legend-toggle--sub"
            aria-expanded={openCommon}
            onClick={() => setOpenCommon(v => !v)}
          >
            <span className="legend-toggle-label legend-toggle-label--sub" data-mode={mode}>
              {COMMON.title}
            </span>
            <span className="legend-toggle-caret" aria-hidden>▾</span>
          </button>

          {openCommon && (
            <ul className="hint-legend-list hint-legend-list--indent">
              {COMMON.items.map(({ label, children }) => {
                const childList = (children ?? []).filter(c => EXPLAIN[c]);

                // Single child → render child directly (your previous special-case)
                if (childList.length === 1) {
                  const only = childList[0];
                  const tip = EXPLAIN[only];
                  return (
                    <li key={only} className="hint-legend-item">
                      <Pill tone={classifyHint(only)} title={tip} wrap>
                        {displayHint(only)}
                      </Pill>
                      <div className="hint-legend-description">{tip}</div>
                    </li>
                  );
                }

                // Multiple children → collapsible sub-group
                if (childList.length > 1) {
                  const isOpen = !!openGroups[label];
                  const parentTip = EXPLAIN[label];
                  const isBox = label === 'Box';
                  return (
                    <li
                      key={label}
                      className={
                        "hint-legend-item hint-legend-item--group " +
                        (isBox ? "hint-legend-item--group-inline" :
                          (mode === 'playtypes' ? "hint-legend-item--group-vertical" : ""))
                      }
                      data-mode={mode}
                    >
                      <button
                        className={"chip-button legend-toggle--mini " + (isBox ? "chip-button--full" : "")}
                        aria-expanded={isOpen}
                        onClick={() => toggleGroup(label)}
                        title={parentTip}
                      >
                        <span className="chip-button__label">{displayHint(label)}</span>
                        <span className="legend-toggle-caret" aria-hidden>▾</span>
                      </button>
                      {isBox && parentTip && (
                        <div className="hint-legend-description">{parentTip}</div>
                      )}
                      {isOpen && (
                        <ul className="hint-legend-list hint-legend-list--tiny hint-legend-list--span">
                          {childList.map(child => {
                            const tip = EXPLAIN[child];
                            return (
                              <li key={child} className="hint-legend-item">
                                <Pill tone={classifyHint(child)} title={tip} wrap>
                                  {displayHint(child)}
                                </Pill>
                                <div className="hint-legend-description">{tip}</div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </li>
                  );
                }

                // No children → simple item
                const tip = EXPLAIN[label];
                if (!tip) return null; // guard against labels not present in HINT_EXPLAIN
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
