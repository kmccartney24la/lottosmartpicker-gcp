// src/components/PatternDigitsView.tsx
'use client';

import React, { useMemo } from 'react';
import type { GameKey, LogicalGameKey, DigitRowEx } from '@lsp/lib';
import { buildDigitOverdue } from '@lsp/lib';

type Props = {
  gameKey: GameKey | LogicalGameKey;
  rows: DigitRowEx[];
};

export default function PatternDigitsView({ gameKey, rows }: Props) {
  const digitView = useMemo(() => {
    if (!rows || !gameKey || rows.length === 0) return null;

    const k = rows[0].digits.length;

    // per-position frequency
    const perPos: Array<{ pos: number; counts: number[] }> = [];
    for (let p = 0; p < k; p++) {
      const counts = Array(10).fill(0);
      for (const r of rows) {
        const dv = r.digits[p];
        if (Number.isFinite(dv)) counts[dv] += 1;
      }
      perPos.push({ pos: p, counts });
    }

    // exact-sequence repeats
    const patternMap = new Map<string, { seq: number[]; count: number; dates: string[] }>();
    for (const r of rows) {
      const key = r.digits.join('-');
      const ex = patternMap.get(key);
      if (ex) {
        ex.count += 1;
        ex.dates.push(r.date);
      } else {
        patternMap.set(key, { seq: r.digits.slice(), count: 1, dates: [r.date] });
      }
    }
    const normalizedPatterns = Array.from(patternMap.values()).map((p) => {
      const sortedDates = p.dates.slice().sort((a, b) => b.localeCompare(a));
      return {
        ...p,
        dates: sortedDates,
      };
    });

    const repeatPatterns = normalizedPatterns
      .filter((p) => p.count > 1)
      .sort((a, b) => b.count - a.count || a.seq.join('-').localeCompare(b.seq.join('-')));

    // overdue digits 0..9
    const lastSeen = buildDigitOverdue(rows, k);
    const overdueDigits = Array.from({ length: 10 }, (_, d) => ({
      digit: d,
      drawsSince: lastSeen.get(d) ?? Infinity,
    }))
      .sort((a, b) => (b.drawsSince ?? 0) - (a.drawsSince ?? 0))
      .slice(0, 10);

    // fireball usage
    let fbCount = 0;
    const fbDigits = new Map<number, number>();
    for (const r of rows) {
      if (typeof r.fb === 'number') {
        fbCount += 1;
        fbDigits.set(r.fb, (fbDigits.get(r.fb) ?? 0) + 1);
      }
    }
    const fbTop = Array.from(fbDigits.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([digit, count]) => ({ digit, count }));

    return {
      k,
      perPos,
      repeatPatterns,
      overdueDigits,
      fbCount,
      fbTop,
      totalDraws: rows.length,
    };
  }, [rows, gameKey]);

  if (!digitView) return null;

  return (
    <div className="pattern-modal-body">
      {/* per-position frequency */}
      <section className="pattern-section">
        <h3 className="pattern-section-title">Per-position frequency</h3>
        <p className="pattern-muted">
          Each row is a position; darker cells = digit appeared more often in that position. Rows use the
          max count for that position as 100%.
        </p>
        <div className="pattern-digit-matrix-wrap">
          <div className="pattern-digit-matrix" role="grid" aria-label="Digit frequency by position">
            {/* header row */}
            <div className="pattern-digit-matrix-row pattern-digit-matrix-row--header" role="row">
              <div className="pattern-digit-matrix-cell pattern-digit-matrix-cell--corner" />
              {Array.from({ length: 10 }, (_, d) => (
                <div
                  key={d}
                  className="pattern-digit-matrix-cell pattern-digit-matrix-cell--header"
                  role="columnheader"
                >
                  {d}
                </div>
              ))}
            </div>
            {digitView.perPos.map((pos) => {
              const max = Math.max(...pos.counts, 1);
              return (
                <div key={pos.pos} className="pattern-digit-matrix-row" role="row">
                  <div className="pattern-digit-matrix-cell pattern-digit-matrix-cell--pos" role="rowheader">
                    P{pos.pos + 1}
                  </div>
                  {pos.counts.map((ct, d) => {
                    const pct = max > 0 ? ct / max : 0;
                    let band = 0;
                    if (pct > 0) {
                      if (pct < 0.4) band = 1;
                      else if (pct < 0.65) band = 2;
                      else if (pct < 0.85) band = 3;
                      else band = 4;
                    }
                    return (
                      <div
                        key={d}
                        className={
                          'pattern-digit-matrix-cell pattern-digit-matrix-cell--value ' +
                          `pattern-digit-matrix-cell--band-${band}`
                        }
                        role="gridcell"
                        aria-label={`Position ${pos.pos + 1}, digit ${d}, ${ct} hits`}
                        data-pct={pct.toFixed(2)}
                      >
                        <span className="pattern-digit-matrix-count">{ct}</span>
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
        <div className="pattern-digit-matrix-legend" aria-label="Digit position frequency legend">
          <span className="pattern-digit-matrix-legend-label">Relative frequency</span>
          <span className="pattern-digit-matrix-legend-swatch pattern-digit-matrix-cell--band-0">0</span>
          <span className="pattern-digit-matrix-legend-swatch pattern-digit-matrix-cell--band-1">low</span>
          <span className="pattern-digit-matrix-legend-swatch pattern-digit-matrix-cell--band-2">med</span>
          <span className="pattern-digit-matrix-legend-swatch pattern-digit-matrix-cell--band-3">high</span>
          <span className="pattern-digit-matrix-legend-swatch pattern-digit-matrix-cell--band-4">max</span>
        </div>
      </section>

      {/* repeat pattern counts */}
      <section className="pattern-section">
        <h3 className="pattern-section-title">Repeat patterns</h3>
        <p className="pattern-muted">Exact digit sequences that appeared more than once.</p>
        <div className="pattern-digit-patterns pattern-digit-patterns-scroll" role="list">
          {digitView.repeatPatterns.map((p) => (
            <div key={p.seq.join('-')} className="pattern-digit-pattern-item" role="listitem">
              <span className="pattern-repeat-dot" aria-hidden="true"></span>
              <div className="pattern-digit-pattern-content">
                <div className="pattern-digit-pattern-seq">{p.seq.join(' • ')}</div>
                <div className="pattern-digit-pattern-meta">
                  <span className="pattern-badge pattern-badge-strong">{p.count}×</span>
                  <span className="pattern-muted pattern-digit-pattern-dates">{p.dates.join(' • ')}</span>
                </div>
              </div>
            </div>
          ))}
          {digitView.repeatPatterns.length === 0 && (
            <p className="pattern-muted">No repeats found in this window.</p>
          )}
        </div>
      </section>

      {/* overdue digits */}
      <section className="pattern-section">
        <h3 className="pattern-section-title">Overdue digits</h3>
        <p className="pattern-muted">Digits 0–9 ranked by the number of draws since last seen in any position.</p>
        <div className="pattern-overdue-grid">
          {digitView.overdueDigits.map((d) => (
            <div key={d.digit} className="pattern-overdue-card">
              <div className="num">{d.digit}</div>
              <div className="gap">
                {d.drawsSince === Infinity ? 'never' : `${d.drawsSince} draws ago`}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* fireball / bonus usage – only if present */}
      {digitView.fbCount > 0 && (
        <section className="pattern-section">
          <h3 className="pattern-section-title">Fireball / bonus usage</h3>
          <p className="pattern-muted">
            Rows with Fireball/bonus: {digitView.fbCount.toLocaleString()} of{' '}
            {digitView.totalDraws.toLocaleString()}.
          </p>
          <ul className="pattern-fb-list">
            {digitView.fbTop.map((fb) => (
              <li key={fb.digit}>
                FB {fb.digit}: {fb.count}×
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
