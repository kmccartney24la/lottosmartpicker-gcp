// src/components/PatternKOfNView.tsx
'use client';

import React, { useMemo } from 'react';
import {
  computeKOfNStats,
  computePick10Stats,
  computeQuickDrawStats,
  computeAllOrNothingStats,
  computeKOfNOverlapHistogram,
  computeKOfNRangeStrip,
  buildKOfNHotSetHitsSeries,
  computeAllOrNothingHalfBalance,
  inferKAndNFromKOfNRows,
  getCurrentEraConfig,
} from '@lsp/lib';
import type {
  GameKey,
  LogicalGameKey,
  Pick10Row,
  QuickDrawRow,
  AllOrNothingRow,
} from '@lsp/lib';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  LineChart,
  Line,
} from 'recharts';

type AnyKOfNRow = Pick10Row | QuickDrawRow | AllOrNothingRow | { values: number[] };

type Props = {
  gameKey: GameKey | LogicalGameKey;
  rows: AnyKOfNRow[];
};

export default function PatternKOfNView({ gameKey, rows }: Props) {
  // 1) decide which stats builder to use
  const kOfNStats = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const key = String(gameKey).toLowerCase();
    const inferred = inferKAndNFromKOfNRows(rows as any);

    // shape-first
    if (inferred?.k === 20 && inferred?.N === 80) {
      return computeQuickDrawStats(rows as QuickDrawRow[]);
    }
    if (inferred?.k === 12 && inferred?.N === 24) {
      return computeAllOrNothingStats(rows as AllOrNothingRow[]);
    }
    if (inferred?.k === 10 && inferred?.N === 80) {
      return computePick10Stats(rows as Pick10Row[]);
    }

    // name-based
    if (key.includes('pick10') || key.includes('pick_10')) {
      return computePick10Stats(rows as Pick10Row[]);
    }
    if (key.includes('quick') || key.includes('draw') || key.includes('keno')) {
      return computeQuickDrawStats(rows as QuickDrawRow[]);
    }
    if (key.includes('all') && key.includes('nothing')) {
      return computeAllOrNothingStats(rows as AllOrNothingRow[]);
    }

    // generic fallback
    if (inferred?.k && inferred?.N) {
      return computeKOfNStats(
        rows.map((r: any) => ({ values: (r.values as number[]) || [] })),
        inferred.k,
        inferred.N
      );
    }

    return null;
  }, [rows, gameKey]);

  // 2) derived k-of-N analytics
  const kOfNOverlap = useMemo(() => {
    if (!rows || rows.length < 2) return null;
    return computeKOfNOverlapHistogram(rows as any);
  }, [rows]);

  const kOfNSegments = useMemo(() => {
    if (!rows || !kOfNStats) return null;
    return computeKOfNRangeStrip(rows as any, kOfNStats);
  }, [rows, kOfNStats]);

  const kOfNHotSetHits = useMemo(() => {
    if (!rows || !kOfNStats) return null;
    return buildKOfNHotSetHitsSeries(rows as any, kOfNStats, {
      hotFraction: 0.25,
      maxPoints: 60,
    });
  }, [rows, kOfNStats]);

  // only really meaningful for 12/24
  const allOrNothingBalance = useMemo(() => {
    if (!rows || rows.length === 0) return null;
    const inferred = inferKAndNFromKOfNRows(rows as any);
    if (inferred?.k === 12 && inferred?.N === 24) {
      return computeAllOrNothingHalfBalance(rows as AllOrNothingRow[]);
    }
    return null;
  }, [rows]);

  // 3) lists for UI
  const kOfNOverdue = useMemo(() => {
    if (!kOfNStats) return [];
    const out: Array<{ n: number; drawsSince: number }> = [];
    for (const [num, gap] of kOfNStats.lastSeen.entries()) {
      out.push({ n: num, drawsSince: gap ?? Infinity });
    }
    return out
      .sort((a, b) => (b.drawsSince ?? 0) - (a.drawsSince ?? 0))
      .slice(0, 12);
  }, [kOfNStats]);

  const kOfNHotCold = useMemo(() => {
    if (!kOfNStats) return { hottest: [] as Array<{ n: number; z: number }>, coldest: [] as Array<{ n: number; z: number }> };
    const arr = Array.from(kOfNStats.z.entries()).map(([n, z]) => ({ n, z: z ?? 0 }));
    const hottest = arr.slice().sort((a, b) => b.z - a.z).slice(0, 10);
    const coldest = arr.slice().sort((a, b) => a.z - b.z).slice(0, 10);
    return { hottest, coldest };
  }, [kOfNStats]);

  if (!kOfNStats) return null;

  const era = getCurrentEraConfig(gameKey as GameKey);

  return (
    <div className="pattern-modal-body">
      {/* Overdue */}
      <section className="pattern-section">
        <h3 className="pattern-section-title">Overdue numbers</h3>
        <p className="pattern-muted">
          Numbers with the largest gap since last seen across {kOfNStats.totalDraws.toLocaleString()} draws.
        </p>
        <div className="pattern-overdue-grid">
          {kOfNOverdue.map((item) => (
            <div key={item.n} className="pattern-overdue-card">
              <div className="num">{item.n}</div>
              <div className="gap">
                {item.drawsSince === Infinity ? 'never' : `${item.drawsSince} draws ago`}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Draw-to-draw overlap */}
      {kOfNOverlap && (
        <section className="pattern-section">
          <h3 className="pattern-section-title">Draw-to-draw overlap</h3>
          <p className="pattern-muted">
            How many numbers each draw reused from the previous draw. 0 means it pulled a fresh set;{' '}
            {kOfNOverlap.k} means it repeated the whole thing (rare).
          </p>
          <div className="pattern-inline-explain">
            <p className="pattern-muted">What to look for:</p>
            <ul className="pattern-muted pattern-inline-list">
              <li>Left bars → draws refreshed a lot.</li>
              <li>Right bars → draws were “sticky”.</li>
            </ul>
          </div>
          <div
            className="pattern-recency-chart"
            aria-label="Histogram of overlap between consecutive k-of-N draws"
          >
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={kOfNOverlap.data}>
                <CartesianGrid stroke="var(--card-bd)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="overlap"
                  tick={{ fontSize: 10, fill: 'var(--muted)' }}
                  stroke="var(--muted)"
                  label={{
                    value: 'Numbers reused from previous draw',
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
                    value: 'Draw count',
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
                  formatter={(val: any) => [val, 'draws']}
                />
                <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="pattern-muted pattern-muted-small">
            Based on {kOfNOverlap.draws.toLocaleString()} consecutive draw comparisons.
          </p>
        </section>
      )}

      {/* All-or-nothing balance (only when 12/24) */}
      {allOrNothingBalance && (
        <section className="pattern-section">
          <h3 className="pattern-section-title">Half-board balance (1–12 vs 13–24)</h3>
          <p className="pattern-muted">
            For All or Nothing, each draw picks 12 of 24 numbers. This shows how many of those 12 landed in
            the low half (1–12).
          </p>
          <div className="pattern-inline-explain">
            <p className="pattern-muted">What to look for:</p>
            <ul className="pattern-muted pattern-inline-list">
              <li>Peak around 6 → balanced board.</li>
              <li>Peaks at 8–9 → draws favoring 1–12.</li>
              <li>Peaks at 3–4 → draws favoring 13–24.</li>
            </ul>
          </div>
          <div
            className="pattern-recency-chart"
            aria-label="Histogram of All or Nothing low-half counts"
          >
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={allOrNothingBalance.data}>
                <CartesianGrid stroke="var(--card-bd)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="lowHits"
                  tick={{ fontSize: 10, fill: 'var(--muted)' }}
                  stroke="var(--muted)"
                  label={{
                    value: 'Numbers from 1–12 in this draw',
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
                    value: 'Draw count',
                    angle: -90,
                    position: 'insideLeft',
                    fill: 'var(--muted)',
                    fontSize: 10,
                  }}
                  allowDecimals={false}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--card-bd)', borderRadius: '0.5rem' }}
                  labelStyle={{ fontWeight: 600 }}
                  formatter={(val: any) => [val, 'draws']}
                />
                <Bar dataKey="count" fill="var(--accent)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <p className="pattern-muted pattern-muted-small">
            Based on {allOrNothingBalance.draws.toLocaleString()} draws from a 12/24 game.
          </p>
        </section>
      )}

      {/* Hot-set hits sparkline */}
      {kOfNHotSetHits && (
        <section className="pattern-section">
          <h3 className="pattern-section-title">Hits vs expected (hot set)</h3>
          <p className="pattern-muted">
            For each recent draw, this shows how many of its numbers were in the current hot set (
            {kOfNHotSetHits.hotSize.toLocaleString()} numbers chosen by z-score) versus a random draw.
          </p>
          <div className="pattern-inline-explain">
            <p className="pattern-muted">What to look for:</p>
            <ul className="pattern-muted pattern-inline-list">
              <li>Points above the dashed line → draw leaned into hot numbers.</li>
              <li>Points below it → draw was more neutral/cold.</li>
            </ul>
          </div>
          <div
            className="pattern-recency-chart"
            aria-label="Sparkline of hot-set hits per k-of-N draw"
          >
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={kOfNHotSetHits.data}>
                <CartesianGrid stroke="var(--card-bd)" strokeDasharray="3 3" />
                <XAxis
                  dataKey="idx"
                  tick={{ fontSize: 9, fill: 'var(--muted)' }}
                  stroke="var(--muted)"
                  label={{
                    value: 'Draw (old → new)',
                    position: 'insideBottom',
                    offset: -4,
                    fill: 'var(--muted)',
                    fontSize: 10,
                  }}
                />
                <YAxis
                  allowDecimals={false}
                  tick={{ fontSize: 10, fill: 'var(--muted)' }}
                  stroke="var(--muted)"
                  label={{
                    value: 'Hot hits',
                    angle: -90,
                    position: 'insideLeft',
                    fill: 'var(--muted)',
                    fontSize: 10,
                  }}
                />
                <Tooltip
                  contentStyle={{ background: 'var(--card)', border: '1px solid var(--card-bd)', borderRadius: '0.5rem' }}
                  labelStyle={{ fontWeight: 600 }}
                />
                <Line
                  type="monotone"
                  dataKey="expected"
                  stroke="var(--muted)"
                  strokeDasharray="4 4"
                  dot={false}
                  isAnimationActive={false}
                />
                <Line
                  type="monotone"
                  dataKey="hits"
                  stroke="var(--accent)"
                  dot={false}
                  isAnimationActive={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="pattern-muted pattern-muted-small">
            Showing last {kOfNHotSetHits.data.length.toLocaleString()} draws (of{' '}
            {kOfNHotSetHits.total.toLocaleString()} total in window).
          </p>
        </section>
      )}

      {/* Range / decade strip */}
      {kOfNSegments && (
        <section className="pattern-section">
          <h3 className="pattern-section-title">Range / decade strip</h3>
          <p className="pattern-muted">
            Board 1–{kOfNSegments.N} grouped into even ranges. Each tile shows how often that range was
            hit in {kOfNSegments.totalDraws.toLocaleString()} draws, vs. what would be expected for a{' '}
            {kOfNSegments.k}-pick game.
          </p>
          <div className="pattern-range-strip" aria-label="Hits per number range">
            {kOfNSegments.data.map((seg) => {
              let tone = 'neutral';
              if (seg.ratio >= 1.25) tone = 'hot';
              else if (seg.ratio >= 1.05) tone = 'warm';
              else if (seg.ratio <= 0.75) tone = 'cold';
              return (
                <div key={seg.label} className={`pattern-range-segment ${tone}`}>
                  <div className="pattern-range-label">{seg.label}</div>
                  <div className="pattern-range-metric">{seg.hits.toLocaleString()} hits</div>
                  <div className="pattern-range-ratio">
                    {(seg.ratio * 100).toFixed(0)}% of expected
                  </div>
                </div>
              );
            })}
          </div>
          <div
            className="pattern-heat-legend pattern-range-legend"
            aria-label="Legend for k-of-N range strip"
          >
            <span className="pattern-heat-legend-item hot">well above expected</span>
            <span className="pattern-heat-legend-item warm">above expected</span>
            <span className="pattern-heat-legend-item neutral">expected</span>
            <span className="pattern-heat-legend-item cold">below expected</span>
          </div>
        </section>
      )}

      {/* Frequency heatmap */}
      <section className="pattern-section">
        <h3 className="pattern-section-title">Frequency heatmap</h3>
        <p className="pattern-muted">Colorized by z-score for this k-of-N game (higher = drawn more than expected).</p>
        <div className="pattern-heatmap">
          {Array.from({ length: kOfNStats.lastSeen.size }, (_, i) => {
            const n = i + 1;
            const z = kOfNStats.z.get(n) ?? 0;
            const intensity =
              z >= 1.5 ? 'hot' : z >= 0.5 ? 'warm' : z <= -1 ? 'cold' : 'neutral';
            return (
              <div key={n} className={`pattern-heat ${intensity}`} title={`#${n} z=${z.toFixed(2)}`}>
                <span>{n}</span>
              </div>
            );
          })}
        </div>
        <div className="pattern-heat-legend" aria-label="Heatmap legend for number frequency">
          <span className="pattern-heat-legend-item hot">hot ≥ +1.5 z</span>
          <span className="pattern-heat-legend-item warm">warm ≥ +0.5 z</span>
          <span className="pattern-heat-legend-item neutral">neutral</span>
          <span className="pattern-heat-legend-item cold">cold ≤ −1 z</span>
        </div>
      </section>

      {/* Hottest / coldest */}
      <section className="pattern-section">
        <h3 className="pattern-section-title">Hottest vs coldest</h3>
        <div className="pattern-hotcold">
          <div>
            <h4 className="pattern-subtitle">Top 10 hottest</h4>
            <ul>
              {kOfNHotCold.hottest.map((h) => (
                <li key={h.n}>
                  #{h.n} — z={h.z.toFixed(2)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="pattern-subtitle">Top 10 coldest</h4>
            <ul>
              {kOfNHotCold.coldest.map((c) => (
                <li key={c.n}>
                  #{c.n} — z={c.z.toFixed(2)}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </div>
  );
}
