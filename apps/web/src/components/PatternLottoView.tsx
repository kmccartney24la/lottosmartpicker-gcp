// src/components/PatternLottoView.tsx
'use client';

import React, { useMemo, useState } from 'react';
import {
  computeStats,
  buildRecencyHistogram,
  buildLottoComboBuckets,
  getCurrentEraConfig,
  buildLottoDecadeStrip,
  buildSpecialBallCycles,
  resolveEraGame,
  filterRowsForCurrentEra,
} from '@lsp/lib';
import type { GameKey, LogicalGameKey, LottoRow } from '@lsp/lib';
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

type Props = {
  gameKey: GameKey | LogicalGameKey;
  rows: LottoRow[];
};

export default function PatternLottoView({ gameKey, rows }: Props) {
   // Filter feed rows to the current era for this game (helpers resolve eras internally)
  const eraRows = useMemo(() => {
    try {
      return Array.isArray(rows) ? filterRowsForCurrentEra(rows, gameKey as any) : [];
    } catch {
      return Array.isArray(rows) ? rows : [];
    }
  }, [rows, gameKey]);

  const [activeRecencyBin, setActiveRecencyBin] = useState<
    { kind: 'main' | 'special'; index: number } | null
  >(null);

  const stats = useMemo(() => {
    if (!eraRows.length) return null;
    try { return computeStats(eraRows, gameKey as any); } catch { return null; }
  }, [eraRows, gameKey]);

  const comboData = useMemo(() => {
    if (!eraRows.length) return { buckets: [], totalCombos: null, distinctSeen: 0 };
    try { return buildLottoComboBuckets(eraRows, gameKey); }
    catch { return { buckets: [], totalCombos: null, distinctSeen: 0 }; }
  }, [eraRows, gameKey]);

  // ✅ IMPORTANT: compute all hooks first; decide rendering later
  const hasLottoRows = eraRows.length > 0;
  const ready = !!stats && hasLottoRows;

  // is this one of those “6 mains, no separate special domain” games?
  const isSixMainNoSpecial =
    !!stats && stats.cfg.mainPick > 5 && (stats.cfg.specialMax ?? 0) === 0;

  // overdue (main)
  const overdueList = useMemo(() => {
    if (!ready || !stats) return [];
    return Array.from({ length: stats.cfg.mainMax }, (_, i) => {
      const n = i + 1;
      return { n, drawsSince: stats.lastSeenMain.get(n) ?? Infinity };
    })
      .sort((a, b) => (b.drawsSince ?? 0) - (a.drawsSince ?? 0))
      .slice(0, 12);
  }, [ready, stats]);

  // overdue (special)
  const specialOverdueList = useMemo(() => {
    if (!ready || !stats || !stats.cfg.specialMax) return [];
    const cfg = stats.cfg;
    const out: Array<{ n: number; drawsSince: number }> = [];
    for (let s = 1; s <= cfg.specialMax; s++) {
      out.push({ n: s, drawsSince: stats.lastSeenSpecial.get(s) ?? Infinity });
    }
    return out
      .sort((a, b) => (b.drawsSince ?? 0) - (a.drawsSince ?? 0))
      .slice(0, Math.min(6, cfg.specialMax));
  }, [ready, stats]);

  // recency histograms
  const mainRecencyHistogram = useMemo(() => {
    if (!stats) return [];
    const maxDraws = eraRows.length || 1;
    return buildRecencyHistogram(stats.lastSeenMain, stats.cfg.mainMax, maxDraws);
  }, [stats, eraRows]);

  const specialRecencyHistogram = useMemo(() => {
    if (!stats || !stats.cfg.specialMax) return [];
    const cfg = stats.cfg;
    const maxDraws = eraRows.length || 1;
    return buildRecencyHistogram(stats.lastSeenSpecial, cfg.specialMax, maxDraws);
  }, [stats, eraRows]);

    // decade / range strip for 1..mainMax
  const decadeStrip = useMemo(() => {
    if (!ready) return [];
    try { return buildLottoDecadeStrip(eraRows, gameKey as any); }
    catch { return []; }
  }, [ready, eraRows, gameKey]);

  // special-ball cycle tracker (only when a special domain exists)
  const specialCycles = useMemo(() => {
    if (!stats?.cfg.specialMax || stats.cfg.specialMax <= 0) return [];
    try { return buildSpecialBallCycles(eraRows, gameKey as any); }
    catch { return []; }
  }, [eraRows, gameKey, stats]);

  // hot/cold lists
  const hotCold = useMemo(() => {
    if (!stats) return [];
    return Array.from({ length: stats.cfg.mainMax }, (_, i) => {
      const n = i + 1;
      return { n, z: stats.zMain.get(n) ?? 0 };
    });
  }, [stats]);
  const hottest = hotCold.slice().sort((a, b) => b.z - a.z).slice(0, 10);
  const coldest = hotCold.slice().sort((a, b) => a.z - b.z).slice(0, 10);

  // combo repetition
  const repeatedTwice = comboData.buckets.filter((b) => b.count === 2);
  const repeated3plus = comboData.buckets.filter((b) => b.count >= 3);

  const era = getCurrentEraConfig(gameKey as any);

  // 🚪 Now it’s safe to bail out (all hooks above have run every render)
  if (!ready) return null;

  return (
    <div className="pattern-modal-body">
      {/* Overdue (main + special grouped) */}
      <section className="pattern-section">
        <h3 className="pattern-section-title">Overdue numbers</h3>
        {isSixMainNoSpecial ? (
          <p className="pattern-muted">
            Largest gaps since last seen. This game draws 6 main numbers and we treat the 6th as a
            normal main, so there is no separate special-ball list.
          </p>
        ) : (
          <p className="pattern-muted">Largest gaps since last seen, split by number domain.</p>
        )}

        {/* main overdue */}
        <div className="pattern-subsection">
          <div className="pattern-overdue-grid">
            {overdueList.map((item) => (
              <div key={item.n} className="pattern-overdue-card">
                <div className="num">{item.n}</div>
                <div className="gap">
                  {item.drawsSince === Infinity ? 'never' : `${item.drawsSince} draws ago`}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* special overdue – grouped here */}
        {specialOverdueList.length > 0 && (
          <div className="pattern-subsection pattern-subsection--special">
            <h4 className="pattern-subtitle pattern-subtitle--special">Special ball</h4>
            <p className="pattern-muted">Overdue numbers for the special-ball domain.</p>
            <div className="pattern-overdue-grid">
              {specialOverdueList.map((item) => (
                <div
                  key={item.n}
                  className="pattern-overdue-card pattern-overdue-card--special"
                >
                  <div className="num">{item.n}</div>
                  <div className="gap">
                    {item.drawsSince === Infinity ? 'never' : `${item.drawsSince} draws ago`}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Recency histogram */}
      <section className="pattern-section">
        <h3 className="pattern-section-title">Recency histogram</h3>
        <p className="pattern-muted">
          This is an <strong className="pattern-muted-inline-strong">age-of-number chart</strong>: each
          bar shows how many distinct numbers are currently sitting at that “draws since last seen”
          range. It<strong className="pattern-muted-inline-strong"> does not</strong> show how often
          they were drawn overall.
          {isSixMainNoSpecial && (
            <>
              {' '}
              Because this game draws 6 mains with no separate special ball, all 6 positions are
              included together here.
            </>
          )}
        </p>
        <div className="pattern-inline-explain">
          <p className="pattern-muted">What to look for:</p>
          <ul className="pattern-muted pattern-inline-list">
            <li>Left bars → numbers refreshed recently.</li>
            <li>Right bars → numbers that haven’t shown up in a while.</li>
            <li>Dashed line → what a perfectly even spread would look like.</li>
          </ul>
        </div>
        <div className="pattern-recency-notes">
          <p className="pattern-muted">How to read it:</p>
          <ul className="pattern-muted">
            <li>
              <span className="pattern-recency-note-label">Balanced / random</span> bars taper off
              evenly → game is cycling smoothly.
            </li>
            <li>
              <span className="pattern-recency-note-label">Right-skewed</span> high bars on the right
              → many overdue numbers piling up.
            </li>
            <li>
              <span className="pattern-recency-note-label">Left-skewed</span> high bars on the left →
              recent draws refreshed many numbers.
            </li>
          </ul>
        </div>

        <div
          className="pattern-recency-chart"
          aria-label="Histogram of the number of draws since last seen for main numbers"
        >
          {mainRecencyHistogram.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={mainRecencyHistogram}>
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
                    value: 'Count of numbers',
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
                    if (key === 'expected')
                      return [val.toFixed ? val.toFixed(1) : val, 'expected (uniform)'];
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
                  onClick={(_, idx) => setActiveRecencyBin({ kind: 'main', index: idx })}
                  onMouseEnter={(_, idx) => setActiveRecencyBin({ kind: 'main', index: idx })}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="pattern-muted">No recency data available.</p>
          )}
        </div>

        {activeRecencyBin?.kind === 'main' &&
          mainRecencyHistogram[activeRecencyBin.index] &&
          mainRecencyHistogram[activeRecencyBin.index].members.length > 0 && (
            <div className="pattern-recency-panel" aria-label="Numbers in this recency bucket">
              <div className="pattern-recency-panel-head">
                <p className="pattern-recency-panel-title">
                  Numbers last seen {mainRecencyHistogram[activeRecencyBin.index].label} draws ago
                </p>
                <p className="pattern-recency-panel-hint">Tap a bar to pin. Scroll if there are many.</p>
              </div>
              <div className="pattern-recency-panel-body">
                {mainRecencyHistogram[activeRecencyBin.index].members.map((n) => (
                  <span key={n} className="pattern-recency-pill">
                    {n}
                  </span>
                ))}
              </div>
            </div>
          )}
      </section>

      {/* Special ball recency, directly under main recency */}
      {specialRecencyHistogram.length > 0 && (
        <section className="pattern-section pattern-section--tight">
          <div className="pattern-subsection pattern-subsection--special">
            <h4 className="pattern-subtitle pattern-subtitle--special">Special ball recency</h4>
            <p className="pattern-muted">Similar to the main histogram, but for the special-ball domain only.</p>
            <div
              className="pattern-recency-chart pattern-recency-chart--special"
              aria-label="Histogram of the number of draws since last seen for special ball numbers"
            >
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={specialRecencyHistogram}>
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
                      value: 'Count of numbers',
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
                    formatter={(val: any, key: any) => {
                      if (key === 'expected') return [val.toFixed ? val.toFixed(1) : val, 'expected (uniform)'];
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
                    fill="var(--special-accent, var(--bubble-amber))"
                    radius={[4, 4, 0, 0]}
                    onClick={(_, idx) => setActiveRecencyBin({ kind: 'special', index: idx })}
                    onMouseEnter={(_, idx) => setActiveRecencyBin({ kind: 'special', index: idx })}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            {activeRecencyBin?.kind === 'special' &&
              specialRecencyHistogram[activeRecencyBin.index] &&
              specialRecencyHistogram[activeRecencyBin.index].members.length > 0 && (
                <div
                  className="pattern-recency-panel pattern-recency-panel--special"
                  aria-label="Special ball numbers in this recency bucket"
                >
                  <div className="pattern-recency-panel-head">
                    <p className="pattern-recency-panel-title">
                      Special numbers last seen {specialRecencyHistogram[activeRecencyBin.index].label} draws ago
                    </p>
                    <p className="pattern-recency-panel-hint">Tap a bar to pin. Scroll if there are many.</p>
                  </div>
                  <div className="pattern-recency-panel-body">
                    {specialRecencyHistogram[activeRecencyBin.index].members.map((n) => (
                      <span key={n} className="pattern-recency-pill">
                        {n}
                      </span>
                    ))}
                  </div>
                </div>
              )}
          </div>
        </section>
      )}

            {/* Decade / range strip */}
      {decadeStrip.length > 0 && (
        <section className="pattern-section">
          <h3 className="pattern-section-title">Ranges hit (1–{stats.cfg.mainMax})</h3>
          <p className="pattern-muted">
            Groups the board into even ranges and shows how often each range was hit vs. what a random
            draw would expect for a {stats.cfg.mainPick}-pick game.
          </p>
          <div className="pattern-range-strip" aria-label="Hits per number range">
            {decadeStrip.map((seg) => {
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
            aria-label="Legend for range strip"
          >
            <span className="pattern-heat-legend-item hot">well above expected</span>
            <span className="pattern-heat-legend-item warm">above expected</span>
            <span className="pattern-heat-legend-item neutral">expected</span>
            <span className="pattern-heat-legend-item cold">below expected</span>
          </div>
        </section>
      )}

      {/* Heatmap */}
      <section className="pattern-section">
        <h3 className="pattern-section-title">Frequency heatmap</h3>
        <p className="pattern-muted">Colorized by z-score (how far from expected).</p>
        <p className="pattern-muted pattern-muted-small">
          A positive z ≈ drawn more than this history would expect; a negative z ≈ drawn less. It’s a quick way to
          spot outliers, but randomness still rules.
        </p>
        <div className="pattern-heatmap">
          {Array.from({ length: stats.cfg.mainMax }, (_, i) => {
            const n = i + 1;
            const z = stats.zMain.get(n) ?? 0;
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

      {/* Special ball frequency heatmap */}
      {(() => {
        const zSpecial = stats.zSpecial;
        const cfg = stats.cfg;
        if (!zSpecial || !cfg.specialMax || cfg.specialMax <= 0) return null;
        return (
          <section className="pattern-section pattern-section--tight">
            <div className="pattern-subsection pattern-subsection--special">
              <h4 className="pattern-subtitle pattern-subtitle--special">Special ball frequency</h4>
              <p className="pattern-muted">Frequency heatmap, scoped to the special-ball domain.</p>
              <div className="pattern-heatmap pattern-heatmap-special">
                {Array.from({ length: cfg.specialMax }, (_, i) => {
                  const n = i + 1;
                  const z = zSpecial.get(n) ?? 0;
                  const intensity =
                    z >= 1.5 ? 'hot' : z >= 0.5 ? 'warm' : z <= -1 ? 'cold' : 'neutral';
                  return (
                    <div
                      key={n}
                      className={`pattern-heat ${intensity} pattern-heat--special`}
                      title={`special ${n} z=${z.toFixed(2)}`}
                    >
                      <span>{n}</span>
                    </div>
                  );
                })}
              </div>
              <div className="pattern-heat-legend" aria-label="Heatmap legend for special ball frequency">
                <span className="pattern-heat-legend-item hot">hot ≥ +1.5 z</span>
                <span className="pattern-heat-legend-item warm">warm ≥ +0.5 z</span>
                <span className="pattern-heat-legend-item neutral">neutral</span>
                <span className="pattern-heat-legend-item cold">cold ≤ −1 z</span>
              </div>
            </div>
          </section>
        );
      })()}

      {/* Combination repetition */}
      <section className="pattern-section">
        <h3 className="pattern-section-title">Combination repetition</h3>
        <p className="pattern-muted">
          Total possible combinations:{' '}
          {comboData.totalCombos ? comboData.totalCombos.toLocaleString() : 'n/a'} · draws:{' '}
          {rows.length.toLocaleString()} · distinct combinations seen:{' '}
          {comboData.distinctSeen.toLocaleString()}
        </p>
        <div className="pattern-combo-grid pattern-combo-scroll">
          <div className="pattern-combo-column">
            <h4 className="pattern-subtitle">Repeated 2×</h4>
            {repeatedTwice.length === 0 && <p className="pattern-muted">None.</p>}
            {repeatedTwice.slice(0, 15).map((c) => (
              <div key={c.key} className="pattern-combo-item">
                <div className="pattern-combo-main">{c.mains.join(', ')}</div>
                <div className="pattern-combo-dates">{c.dates.join(' • ')}</div>
              </div>
            ))}
            {repeatedTwice.length > 15 && (
              <p className="pattern-muted">+{repeatedTwice.length - 15} more…</p>
            )}
          </div>
          <div className="pattern-combo-column">
            <h4 className="pattern-subtitle">Repeated 3×+</h4>
            {repeated3plus.length === 0 && <p className="pattern-muted">None.</p>}
            {repeated3plus.slice(0, 15).map((c) => (
              <div key={c.key} className="pattern-combo-item">
                <div className="pattern-combo-main">
                  {c.mains.join(', ')} <span className="pattern-badge">{c.count}×</span>
                </div>
                <div className="pattern-combo-dates">{c.dates.join(' • ')}</div>
              </div>
            ))}
            {repeated3plus.length > 15 && (
              <p className="pattern-muted">+{repeated3plus.length - 15} more…</p>
            )}
          </div>
        </div>
      </section>

      {/* Hottest / coldest */}
      <section className="pattern-section">
        <h3 className="pattern-section-title">Hottest vs coldest</h3>
        <div className="pattern-hotcold">
          <div>
            <h4 className="pattern-subtitle">Top 10 hottest</h4>
            <ul>
              {hottest.map((h) => (
                <li key={h.n}>
                  #{h.n} — z={h.z.toFixed(2)}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h4 className="pattern-subtitle">Top 10 coldest</h4>
            <ul>
              {coldest.map((c) => (
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
