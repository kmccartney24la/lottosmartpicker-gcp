// src/components/PatternCashPopView.tsx
'use client';

import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Line,
} from 'recharts';
import { buildCashPopLastSeen, buildRecencyHistogram } from '@lsp/lib';
import type { CashPopRow } from '@lsp/lib';

type Props = {
  rows: CashPopRow[];
};

export default function PatternCashPopView({ rows }: Props) {
  // we only need to remember which bar is active
  const [activeRecencyIndex, setActiveRecencyIndex] = useState<number | null>(null);

  const view = useMemo(() => {
    if (!rows || rows.length === 0) return null;

    const domainSize = 15;
    const lastSeen = buildCashPopLastSeen(rows, domainSize);
    const maxDraws = rows.length || 1;
    const recency = buildRecencyHistogram(lastSeen, domainSize, maxDraws);

    const freq = Array.from({ length: domainSize }, (_, i) => ({ n: i + 1, count: 0 }));
    let totalHits = 0;
    for (const r of rows) {
      if (r.value >= 1 && r.value <= domainSize) {
        freq[r.value - 1]!.count += 1;
        totalHits += 1;
      }
    }
    const avgCount = totalHits > 0 ? totalHits / domainSize : 0;

    const overdue = Array.from({ length: domainSize }, (_, i) => {
      const n = i + 1;
      return { n, drawsSince: lastSeen.get(n) ?? Infinity };
    }).sort((a, b) => (b.drawsSince ?? 0) - (a.drawsSince ?? 0));

    return {
      domainSize,
      overdue,
      recency,
      freq,
      maxCount: freq.reduce((m, f) => Math.max(m, f.count), 0) || 1,
      totalDraws: rows.length,
      avgCount,
    };
  }, [rows]);

  if (!view) return null;

  const activeBucket =
    activeRecencyIndex != null ? view.recency[activeRecencyIndex] : null;

  return (
    <div className="pattern-modal-body">
      {/* Overdue */}
      <section className="pattern-section">
        <h3 className="pattern-section-title">Overdue picks</h3>
        <p className="pattern-muted">
          Cash Pop draws one number per game from a small pool. These are ranked by how many draws
          ago they last appeared.
        </p>
        <div className="pattern-overdue-grid">
          {view.overdue.map((item) => (
            <div key={item.n} className="pattern-overdue-card">
              <div className="num">{item.n}</div>
              <div className="gap">
                {item.drawsSince === Infinity ? 'never' : `${item.drawsSince} draws ago`}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Recency histogram */}
      <section className="pattern-section">
        <h3 className="pattern-section-title">Recency histogram</h3>
        <p className="pattern-muted">
          Age-of-number view for Cash Pop. Bars show how many of the 1–{view.domainSize} picks are
          currently sitting at that “draws since last seen” range.
        </p>
        <div className="pattern-inline-explain">
          <p className="pattern-muted">What to look for:</p>
          <ul className="pattern-muted pattern-inline-list">
            <li>Left bars → refreshed recently.</li>
            <li>Right bars → haven’t shown in a bit.</li>
            <li>Dashed line → even spread baseline.</li>
          </ul>
        </div>
        <div
          className="pattern-recency-chart"
          aria-label="Histogram of draws since last seen for Cash Pop numbers"
        >
          {view.recency.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={view.recency}>
                <CartesianGrid stroke="var(--card-bd)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 10, fill: 'var(--muted)' }}
                  stroke="var(--muted)"
                  label={{
                    value: 'Amount of draws since last seen',
                    position: 'insideBottom',
                    offset: -4,
                    fill: 'var(--muted)',
                    fontSize: 10,
                  }}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'var(--muted)' }}
                  stroke="var(--muted)"
                  label={{
                    value: 'Count of picks',
                    angle: -90,
                    position: 'insideLeft',
                    fill: 'var(--muted)',
                    fontSize: 10,
                  }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{
                    background: 'var(--card)',
                    border: '1px solid var(--card-bd)',
                    borderRadius: '0.5rem',
                  }}
                  labelStyle={{ fontWeight: 600 }}
                  formatter={(val: any, key: any) => {
                    if (key === 'expected') {
                      return [val.toFixed ? val.toFixed(1) : val, 'expected (uniform)'];
                    }
                    return [val, 'numbers'];
                  }}
                />
                <Line
                  type="monotone"
                  dataKey="expected"
                  stroke="var(--muted)"
                  strokeDasharray="4 4"
                  strokeOpacity={0.35}
                  dot={false}
                  isAnimationActive={false}
                />
                <Bar
                  dataKey="count"
                  fill="var(--accent)"
                  radius={[4, 4, 0, 0]}
                  onClick={(_, idx) => setActiveRecencyIndex(idx)}
                  onMouseEnter={(_, idx) => setActiveRecencyIndex(idx)}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="pattern-muted">No recency data available.</p>
          )}
        </div>

        {activeBucket && activeBucket.members.length > 0 && (
          <div
            className="pattern-recency-panel"
            aria-label="Cash Pop numbers in this recency bucket"
          >
            <div className="pattern-recency-panel-head">
              <p className="pattern-recency-panel-title">
                Picks last seen {activeBucket.label} draws ago
              </p>
              <p className="pattern-recency-panel-hint">Tap a bar to pin. Scroll if there are many.</p>
            </div>
            <div className="pattern-recency-panel-body">
              {activeBucket.members.map((n) => (
                <span key={n} className="pattern-recency-pill">
                  {n}
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Frequency heatmap – tiny 1..15 */}
      <section className="pattern-section">
        <h3 className="pattern-section-title">Frequency heatmap</h3>
        <p className="pattern-muted">
          Quick glance at which picks have hit more in this window of{' '}
          {view.totalDraws.toLocaleString()} draws.
        </p>
        <div className="pattern-heatmap">
          {view.freq.map((f) => {
            const diff = f.count - view.avgCount;
            let intensity: 'hot' | 'warm' | 'neutral' | 'cold' = 'neutral';
            if (diff >= 3) {
              intensity = 'hot';
            } else if (diff >= 1.5) {
              intensity = 'warm';
            } else if (diff <= -2) {
              intensity = 'cold';
            }
            return (
              <div
                key={f.n}
                className={`pattern-heat ${intensity}`}
                title={`#${f.n} — ${f.count} hits`}
              >
                <span>{f.n}</span>
              </div>
            );
          })}
        </div>
        <div className="pattern-heat-legend" aria-label="Heatmap legend for cash pop frequency">
          <span className="pattern-heat-legend-item hot">well above avg</span>
          <span className="pattern-heat-legend-item warm">above avg</span>
          <span className="pattern-heat-legend-item neutral">ok</span>
          <span className="pattern-heat-legend-item cold">few</span>
        </div>
      </section>
    </div>
  );
}
