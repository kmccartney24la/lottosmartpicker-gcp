// app/ny/_components/HomeClientNY.tsx
'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PastDrawsSidebar from 'src/components/PastDrawsSidebar';
import type { PastDrawsPayload } from 'src/components/PastDrawsSidebar';
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
  analyzeGameAsync,
  getCurrentEraConfig,     // used to compute era-aware analysis for rep game
  // use the “representative” helper to get one key for UI components when needed
  primaryKeyFor,
  fetchDigitRowsFor,
  fetchPick10RowsFor,
  fetchQuickDrawRowsFor,
  fetchNyLottoExtendedRows,
} from 'packages/lib/lotto';
import { useIsMobile } from 'packages/lib/breakpoints';
import { ErrorBoundary } from 'src/components/ErrorBoundary';

type NyPeriod = 'midday' | 'evening' | 'both';

export function toNyPeriod(p: Period): NyPeriod {
  // Map anything non-NY (including 'all' and Cash Pop periods) to 'both'
  return (p === 'midday' || p === 'evening' || p === 'both') ? p : 'both';
}

// Match the canonical-draw constraint used in HomeClient.tsx
type CanonicalDrawGame = Exclude<GameKey, 'ga_scratchers'>;

// NY page supports only these logical keys
const NY_KEYS = [
  'multi_cash4life',
  'multi_megamillions',
  'multi_powerball',
  'ny_numbers',
  'ny_lotto',
  'ny_pick10',
  'ny_quick_draw',
  'ny_take5',
  'ny_win4',
] as const;

type NyLogicalKey = typeof NY_KEYS[number]; // subtype of LogicalGameKey

const AdsLot = dynamic(() => import('src/components/ads/AdsLot'), { ssr: false });

/** Games shown on the New York page (logical keys) */
const GAME_OPTIONS: { key: NyLogicalKey; label: string; supportsPeriod?: boolean }[] = [
  { key: 'multi_cash4life',    label: 'Cash4Life',        supportsPeriod: false },
  { key: 'multi_megamillions', label: 'Mega Millions',    supportsPeriod: false },
  { key: 'multi_powerball',    label: 'Powerball',        supportsPeriod: false },
  { key: 'ny_numbers',         label: 'Numbers (Pick 3)', supportsPeriod: true  },
  { key: 'ny_lotto',           label: 'NY Lotto',         supportsPeriod: false },
  { key: 'ny_pick10',          label: 'Pick 10',          supportsPeriod: false },
  { key: 'ny_quick_draw',      label: 'Quick Draw',       supportsPeriod: false },
  { key: 'ny_take5',           label: 'Take 5 (5/39)',    supportsPeriod: true  },
  { key: 'ny_win4',            label: 'Win 4',            supportsPeriod: true  },
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
const REP_FOR_LOGICAL: Record<NyLogicalKey, CanonicalDrawGame> = {
  ny_take5: 'ny_take5',
  ny_numbers: 'multi_cash4life',
  ny_win4: 'multi_cash4life',
  ny_lotto: 'ny_lotto',
  ny_pick10: 'multi_cash4life',
  ny_quick_draw: 'multi_cash4life',
  multi_powerball: 'multi_powerball',
  multi_megamillions: 'multi_megamillions',
  multi_cash4life: 'multi_cash4life',
};


export default function HomeClientNY() {
  const [logical, setLogical] = useState<LogicalGameKey>('multi_powerball');
  const [period, setPeriod] = useState<Period>('both'); // 'midday' | 'evening' | 'both'
  const [rows, setRows] = useState<LottoRow[]>([]);
  const [sortDir, setSortDir] = useState<'desc'|'asc'>('desc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compact, setCompact] = useState<boolean>(true);
  const [showPast, setShowPast] = useState<boolean>(false);
  const [payload, setPayload] = useState<PastDrawsPayload | undefined>(undefined);
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

  // NEW: Build PastDrawsSidebar payload based on logical/period
  useEffect(() => {
    let cancelled = false;
    async function buildPayload() {
      let next: PastDrawsPayload | undefined;
      if (logical === 'ny_numbers' || logical === 'ny_win4') {
        const k = logical === 'ny_win4' ? 4 : 3;
        const rows = await fetchDigitRowsFor(logical as 'ny_numbers' | 'ny_win4', period);
        if (!cancelled) next = { kind: 'digits', rows, k };
      } else if (logical === 'ny_pick10') {
        const rows = await fetchPick10RowsFor('ny_pick10');
        if (!cancelled) next = { kind: 'pick10', rows };
      } else if (logical === 'ny_quick_draw') {
        const rows = await fetchQuickDrawRowsFor('ny_quick_draw');
        if (!cancelled) next = { kind: 'quickdraw', rows };
      } else if (logical === 'ny_lotto') {
        // 6 mains + explicit Bonus (no zeros)
        const rows = await fetchNyLottoExtendedRows();
        if (!cancelled) next = { kind: 'ny_lotto', rows };
      } else {
        next = undefined; // PB/MM/C4L/Take 5 → legacy 5-ball path
      }
      if (!cancelled) setPayload(next);
    }
    buildPayload();
    return () => { cancelled = true; };
  }, [logical, period]);

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
    const a = await analyzeGameAsync(rows, repGame);
    setAnalysisByRep(prev => ({ ...prev, [repGame]: a }));
    return { recMain: a.recMain, recSpec: a.recSpec };
  }, [analysisByRep, repGame, rows]);

  const openPastDraws = useCallback(() => { setShowPast(true); }, []);
  const supportsPeriod = GAME_OPTIONS.find(g => g.key === logical)?.supportsPeriod;

  return (
    <ErrorBoundary>
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
                <div
                  className="card card--reserve-topright game-select-card"
                  data-has-period={supportsPeriod ? 'true' : 'false'}
                >
                  <div className="card-title game-select-label">Pick Your Game</div>
                  <select
                    aria-label="Select New York game"
                    value={logical}
                    onChange={(e) => {
                      const next = e.target.value as NyLogicalKey; // or LogicalGameKey
                      setLogical(next);       // <-- update the selected logical game
                      setPeriod('both');      // reset period on game change
                      setPage(1);             // reset pagination
                    }}
                    className="compact-control"
                  >
                    {GAME_OPTIONS.map(opt => (
                      <option key={opt.key} value={opt.key}>{opt.label}</option>
                    ))}
                  </select>


                {/* Period picker (only for midday/evening games) */}
                {/* inside the same .game-select-card as the game dropdown */}
                {supportsPeriod && (
                   <div className="card-topright-anchor game-select-period-anchor">
                    <label htmlFor="ny-period" className="visually-hidden">Draw Time</label>
                    <select
                    id="ny-period"
                    aria-label="Select draw time"
                    value={period}
                    onChange={(e) => { setPeriod(e.target.value as Period); setPage(1); }}
                    className="game-select-period compact-control"
                    >
                    <option value="both">Midday + Evening</option>
                    <option value="midday">Midday only</option>
                    <option value="evening">Evening only</option>
                    </select>
                </div>
                )}
            </div>


                <div className="latest-and-actions">
                  {/* These components currently expect a GameKey.
                      We pass our representative canonical key (repGame). */}
                  <SelectedLatest
                    game={repGame}
                    logical={logical}
                    period={supportsPeriod ? toNyPeriod(period) : 'both'}
                    onOpenPastDraws={openPastDraws}
                    showPast={showPast}
                  />
                </div>
              </div>
            </section>

            {/* Two-column main */}
            <div className="layout-grid main-content">
              <section className="vstack vstack--4">
                <GameOverview game={repGame} logical={logical} period={period} />
                <div>
                  <ErrorBoundary
                    fallback={
                      <div className="card p-3 text-sm">
                        <div className="font-medium mb-1">Generator temporarily unavailable.</div>
                        <div>Try changing the game/period or reload the page.</div>
                      </div>
                    }
                  >
                    <Generator
                    game={repGame}                   // canonical rep (5-ball era config)
                    logical={logical}                // NEW: drives shape (digits/pick10/quickdraw)
                    rowsForGenerator={rows}
                    analysisForGame={analysisByRep[repGame] ?? null}
                    anLoading={loading}
                    onEnsureRecommended={async () => {
                        const era = getCurrentEraConfig(repGame);
                        return analyzeGameAsync(rows, repGame);
                    }}
                    />
                  </ErrorBoundary>
                </div>
                <div className="ad-slot ad-slot--rect-280" aria-label="Advertisement">
                  {!loading && rows.length > 0 ? <AdsLot /> : null}
                </div>
              </section>
              <section className="vstack vstack--4">
                <div><HintLegend game={logical} /></div>
                <div><AnalyzeSidebar
                        title="Analysis (All Games)"
                        canonical={['multi_powerball','multi_megamillions','multi_cash4life']}
                        logical={['ny_take5','ny_numbers','ny_win4','ny_lotto','ny_pick10','ny_quick_draw']}
                        period={supportsPeriod ? toNyPeriod(period) : 'both'}
                        state="ny"
                        /></div>
              </section>
            </div>

            {/* Drawer */}
            <ErrorBoundary
              fallback={
                <div className="card p-3 text-sm">
                  <div className="font-medium mb-1">Past Draws failed to load.</div>
                  <button className="mt-1 rounded bg-black text-white px-3 py-1"
                          onClick={() => setShowPast(false)}>
                    Close
                  </button>
                </div>
              }
            >
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
                logical={logical}
                payload={payload}
                sortDir={sortDir}
                onToggleSort={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
              />
            </ErrorBoundary>
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
    </ErrorBoundary>
  );
}
