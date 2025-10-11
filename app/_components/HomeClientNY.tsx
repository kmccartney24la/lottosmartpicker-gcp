// app/_components/HomeClientNY.tsx
'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PastDrawsSidebar from 'src/components/PastDrawsSidebar';
import Generator from 'src/components/Generator';
import AnalyzeSidebar from 'src/components/AnalyzeSidebar';
import GameOverview from 'src/components/GameOverview';
import SelectedLatest from 'src/components/SelectedLatest';
import HintLegend from 'src/components/HintLegend';
import dynamic from 'next/dynamic';

import {
  // types + helpers from lotto.ts
  LottoRow,
  GameKey,
  LogicalGameKey,
  Period,
  fetchLogicalRows,
  analyzeGame,
  getCurrentEraConfig,     // used to compute era-aware analysis for rep game
  // use the “representative” helper to get one key for UI components when needed
  primaryKeyFor,
} from '@lib/lotto';

// Match the canonical-draw constraint used in HomeClient.tsx
type CanonicalDrawGame = Exclude<GameKey, 'ga_scratchers'>;

import { useIsMobile } from '@lib/breakpoints';

const AdsLot = dynamic(() => import('src/components/ads/AdsLot'), { ssr: false });

/** Games shown on the New York page (logical keys) */
const GAME_OPTIONS: { key: LogicalGameKey; label: string; supportsPeriod?: boolean }[] = [
  { key: 'ny_take5',   label: 'Take 5 (5/39)', supportsPeriod: true },
  { key: 'ny_numbers', label: 'Numbers (Pick 3)', supportsPeriod: true },
  { key: 'ny_win4',    label: 'Win 4', supportsPeriod: true },
  { key: 'ny_lotto',   label: 'NY Lotto', supportsPeriod: false },
  { key: 'ny_pick10',  label: 'Pick 10', supportsPeriod: false },
  { key: 'ny_quick_draw', label: 'Quick Draw', supportsPeriod: false },
  // Multi-state games also sold in NY
  { key: 'multi_powerball',    label: 'Powerball',        supportsPeriod: false },
  { key: 'multi_megamillions', label: 'Mega Millions',    supportsPeriod: false },
  { key: 'multi_cash4life',    label: 'Cash4Life',        supportsPeriod: false },
];

/**
 * Some components still expect a *GameKey* (canonical) to drive:
 * - special-ball tone (sidebar CSS)
 * - era-aware analysis defaults
 * - existing per-game labels
 *
 * We provide a representative “repGame” for each logical game.
 * You can refine this mapping later (e.g., add a dedicated rep for Pick 10).
 */
// Important: ensure none of these are 'ga_scratchers'
const REP_FOR_LOGICAL: Record<LogicalGameKey, CanonicalDrawGame> = {
  ny_take5: 'ny_take5',              // native canonical already exists
  ny_numbers: 'multi_cash4life',     // neutral era config; no special ball UX
  ny_win4: 'multi_cash4life',
  ny_lotto: 'multi_cash4life',
  ny_pick10: 'multi_cash4life',
  ny_quick_draw: 'multi_cash4life',
  multi_powerball: 'multi_powerball',
  multi_megamillions: 'multi_megamillions',
  multi_cash4life: 'multi_cash4life',
};

export default function HomeClientNY() {
  const [logical, setLogical] = useState<LogicalGameKey>('ny_take5');
  const [period, setPeriod] = useState<Period>('both'); // 'midday' | 'evening' | 'both'
  const [rows, setRows] = useState<LottoRow[]>([]);
  const [sortDir, setSortDir] = useState<'desc'|'asc'>('desc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compact, setCompact] = useState<boolean>(true);
  const [showPast, setShowPast] = useState<boolean>(false);
  const isMobile = useIsMobile();
  const drawerMode = isMobile;

  // One canonical “representative” key for components that need a GameKey
  // Narrow to CanonicalDrawGame so props accept it
  const repGame: CanonicalDrawGame = REP_FOR_LOGICAL[logical];

  // If a component needs *a single key string* (e.g., to label “latest”), use primaryKeyFor
  // This returns one of the underlying keys (may be e.g. 'ny_take5_midday').
  // We don't pass this where a GameKey is required; it's here if you need a label hook.
  const representativeUnderlying = useMemo(
    () => primaryKeyFor(logical, period),
    [logical, period]
  );

  // Fetch merged logical rows according to the current period
  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const data = await fetchLogicalRows({ logical, period });
      setRows(data);
    } catch (e: any) {
      console.error('NY load() failed:', e);
      setError(e?.message || String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [logical, period]);

  useEffect(() => { void load(); }, [load]);

  // Sorting & paging (same as GA/multi client)
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a,b) => sortDir === 'desc'
      ? (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
      : (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return arr;
  }, [rows, sortDir]);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const pageRows = useMemo(() => sortedRows.slice((page - 1) * pageSize, page * pageSize), [sortedRows, page]);

  // Analysis cache keyed by *representative* game
  const [analysisByRep, setAnalysisByRep] =
    useState<Partial<Record<CanonicalDrawGame, any>>>({});

  const ensureRecommendedForSelected = useCallback(async () => {
    const existing = analysisByRep[repGame];
    if (existing) return { recMain: existing.recMain, recSpec: existing.recSpec };
    // The analysis/generator logic is era-aware by GameKey. Since the rows here
    // are “shimmed” (for flexible sources) to a repGame, it will behave consistently.
    const a = analyzeGame(rows, repGame);
    setAnalysisByRep(prev => ({ ...prev, [repGame]: a }));
    return { recMain: a.recMain, recSpec: a.recSpec };
  }, [analysisByRep, repGame, rows]);

  const openPastDraws = useCallback(() => { setShowPast(true); }, []);
  const supportsPeriod = GAME_OPTIONS.find(g => g.key === logical)?.supportsPeriod;

  return (
    <main className="layout-rails">
      {/* Left rail */}
      <aside className="rail rail--left" aria-label="Sponsored">
        <div className="rail__inner">
          <div className="ad-slot ad-slot--rail-300x600"><AdsLot /></div>
          <div className="ad-slot ad-slot--rail-300x250"><AdsLot /></div>
        </div>
      </aside>

      {/* Center */}
      <div className="rails-center">
        <div className="center-clamp">
          <div className="vstack vstack--4">
            {/* Header controls */}
            <section className="card">
              <div className="controls header-controls">
                {/* Logical game picker */}
                <div className="card game-select-card">
                  <div className="card-title game-select-label">NY Game</div>
                  <select
                    aria-label="Select New York game"
                    value={logical}
                    onChange={(e) => {
                      setLogical(e.target.value as LogicalGameKey);
                      // reset period to 'both' when switching games
                      setPeriod('both');
                      setPage(1);
                    }}
                    className="compact-control"
                  >
                    {GAME_OPTIONS.map(opt => (
                      <option key={opt.key} value={opt.key}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Period picker (only for midday/evening games) */}
                {supportsPeriod ? (
                  <div className="card game-select-card">
                    <div className="card-title game-select-label">Draw Time</div>
                    <select
                      aria-label="Select draw time"
                      value={period}
                      onChange={(e) => { setPeriod(e.target.value as Period); setPage(1); }}
                      className="compact-control"
                    >
                      <option value="both">Midday + Evening</option>
                      <option value="midday">Midday only</option>
                      <option value="evening">Evening only</option>
                    </select>
                  </div>
                ) : null}

                <div className="latest-and-actions">
                  {/* These components currently expect a GameKey.
                      We pass our representative canonical key (repGame). */}
                  <SelectedLatest game={repGame} onOpenPastDraws={openPastDraws} showPast={showPast} />
                </div>
              </div>
            </section>

            {/* Two-column main */}
            <div className="layout-grid main-content">
              <section className="vstack vstack--4">
                <GameOverview game={repGame} logical={logical} period={period} />
                <div>
                  <Generator
                    game={repGame}                   // canonical rep (5-ball era config)
                    logical={logical}                // NEW: drives shape (digits/pick10/quickdraw)
                    rowsForGenerator={rows}
                    analysisForGame={analysisByRep[repGame] ?? null}
                    anLoading={loading}
                    onEnsureRecommended={async () => {
                        const era = getCurrentEraConfig(repGame);
                        return analyzeGame(rows, repGame);
                    }}
                    />
                </div>
                <div className="ad-slot ad-slot--rect-280" aria-label="Advertisement">
                  {!loading && rows.length > 0 ? <AdsLot /> : null}
                </div>
              </section>
              <section className="vstack vstack--4">
                <div><HintLegend game={repGame} /></div>
                <div><AnalyzeSidebar
                        title="Analysis (All Games)"
                        canonical={['multi_powerball','multi_megamillions','multi_cash4life']}
                        logical={['ny_take5','ny_numbers','ny_win4','ny_lotto','ny_pick10','ny_quick_draw']}
                        period={supportsPeriod ? period : 'both'}
                        /></div>
              </section>
            </div>

            {/* Drawer */}
            <PastDrawsSidebar
              open={showPast}
              onClose={() => setShowPast(false)}
              compact={compact}
              setCompact={setCompact}
              pageRows={pageRows}
              page={page}
              pageCount={pageCount}
              setPage={setPage}
              total={sortedRows.length}
              side="right"
              game={repGame}
              sortDir={sortDir}
              onToggleSort={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
            />
          </div>
        </div>
      </div>

      {/* Right rail */}
      <aside className="rail rail--right" aria-label="Sponsored">
        <div className="rail__inner">
          <div className="ad-slot ad-slot--rail-300x600"><AdsLot /></div>
          <div className="ad-slot ad-slot--rail-300x250"><AdsLot /></div>
        </div>
      </aside>
    </main>
  );
}
