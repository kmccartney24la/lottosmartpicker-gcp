// app/fl/_components/HomeClientFL.tsx
'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import PastDrawsSidebar from 'apps/web/src/components/PastDrawsSidebar';
import type { PastDrawsPayload } from 'apps/web/src/components/PastDrawsSidebar';
import Generator from 'apps/web/src/components/Generator';
import AnalyzeSidebar from 'apps/web/src/components/AnalyzeSidebar';
import GameOverview from 'apps/web/src/components/GameOverview';
import SelectedLatest from 'apps/web/src/components/SelectedLatest';
import HintLegend from 'apps/web/src/components/HintLegend';
import dynamic from 'next/dynamic';
import {
  // types + helpers from lotto.ts
  LottoRow,
  GameKey,
  LogicalGameKey,
  Period,
  fetchLogicalRows,
  fetchDigitRowsFor,
  fetchCashPopRows,
  analyzeGameAsync,
  getCurrentEraConfig,
  primaryKeyFor,
} from '@lsp/lib';
import { useIsMobile } from '@lsp/lib/react/breakpoints';
import { ErrorBoundary } from 'apps/web/src/components/ErrorBoundary';

const AdsLot = dynamic(() => import('apps/web/src/components/ads/AdsLot'), { ssr: false });

/** Two-period subset for components that only understand midday/evening/both. */
type TwoPeriod = 'midday' | 'evening' | 'both';
const toTwoPeriod = (p: Period): TwoPeriod =>
  (p === 'midday' || p === 'evening' || p === 'both') ? p : 'both';

// ---- FL page logical options (MUST match lotto.ts LogicalGameKey) ----
const FL_KEYS = [
  'multi_megamillions',
  'multi_powerball',
  'multi_cash4life',
  'fl_fantasy5',
  'fl_pick2',
  'fl_pick3',
  'fl_pick4',
  'fl_pick5',
  'fl_cashpop',
] as const;

type FlLogicalKey = typeof FL_KEYS[number];

// supportsPeriod: 'none' = single source; 'two' = Midday/Evening; 'five' = Cash Pop dayparts
const GAME_OPTIONS: { key: FlLogicalKey; label: string; supportsPeriod: 'none'|'two'|'five' }[] = [
  { key: 'multi_cash4life',    label: 'Cash4Life',            supportsPeriod: 'none' },
  { key: 'multi_megamillions', label: 'Mega Millions',        supportsPeriod: 'none' },
  { key: 'multi_powerball',    label: 'Powerball',            supportsPeriod: 'none' },
  { key: 'fl_cashpop',         label: 'Cash Pop',             supportsPeriod: 'five' },
  { key: 'fl_fantasy5',        label: 'Fantasy 5',            supportsPeriod: 'two'  },
  { key: 'fl_pick2',           label: 'Pick 2',               supportsPeriod: 'two'  },
  { key: 'fl_pick3',           label: 'Pick 3',               supportsPeriod: 'two'  },
  { key: 'fl_pick4',           label: 'Pick 4',               supportsPeriod: 'two'  },
  { key: 'fl_pick5',           label: 'Pick 5',               supportsPeriod: 'two'  },
];

/**
 * Representative canonical GameKey for components that expect a GameKey:
 * - Use actual canonical files from lotto.ts (Fantasy 5 EVENING is a safe rep for FL non-multi games)
 * - Multi-state map to themselves
 */
const REP_FOR_LOGICAL: Record<FlLogicalKey, GameKey> = {
  multi_cash4life: 'multi_cash4life',
  multi_powerball: 'multi_powerball',
  multi_megamillions: 'multi_megamillions',
  // Use Fantasy 5 (evening file) as a neutral 5-ball rep where needed
  fl_fantasy5: 'fl_fantasy5_evening',
  fl_pick2:    'fl_fantasy5_evening',
  fl_pick3:    'fl_fantasy5_evening',
  fl_pick4:    'fl_fantasy5_evening',
  fl_pick5:    'fl_fantasy5_evening',
  fl_cashpop:  'fl_fantasy5_evening',
};

export default function HomeClientFL() {
  const [logical, setLogical] = useState<LogicalGameKey>('multi_powerball');
  const [period, setPeriod] = useState<Period>('both'); // includes 'all' and 5-part dayparts per lotto.ts
  // Keep ALL rows for generator/analysis
  const [rowsAll, setRowsAll] = useState<LottoRow[]>([]);
  const [sortDir, setSortDir] = useState<'desc'|'asc'>('desc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compact, setCompact] = useState<boolean>(true);
  const [showPast, setShowPast] = useState<boolean>(false);
  const [payload, setPayload] = useState<PastDrawsPayload | undefined>(undefined);
  const UI_CAP = 2000; // hard cap for what the sidebar should render
  const isMobile = useIsMobile();
  const drawerMode = isMobile;

  const repGame: GameKey = REP_FOR_LOGICAL[logical as FlLogicalKey];

  // If a component needs *one underlying key* string (e.g., labels), use primaryKeyFor
  const representativeUnderlying = useMemo(
    () => primaryKeyFor(logical, period),
    [logical, period]
  );

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const data = await fetchLogicalRows({ logical, period });
      setRowsAll(data); // keep full for generator/analysis
      // Build a shape-aware payload for digit games & Cash Pop
      // so PastDrawsSidebar renders the correct bubbles.
      if (logical === 'fl_pick2' || logical === 'fl_pick3' || logical === 'fl_pick4' || logical === 'fl_pick5') {
        const k = logical === 'fl_pick5' ? 5 : logical === 'fl_pick4' ? 4 : logical === 'fl_pick3' ? 3 : 2;
        const per: 'midday'|'evening'|'both' = (period === 'midday' || period === 'evening') ? period : 'both';
        const digitRows = await fetchDigitRowsFor(logical, per);
        const ui = digitRows.slice(0, UI_CAP);
        setPayload({
          kind: 'digits_fb',
          k,
          rows: ui.map(r => ({ date: r.date, digits: r.digits, fb: r.fb })),
        });
      } else if (logical === 'fl_cashpop') {
        const per = (period === 'morning' || period === 'matinee' || period === 'afternoon' || period === 'evening' || period === 'latenight') ? period : 'all';
        const cp = await fetchCashPopRows(per);
        const ui = cp.slice(0, UI_CAP);
        setPayload({
          kind: 'cashpop',
          rows: ui.map(r => ({ date: r.date, value: r.value })),
        });
      } else {
        // Five-ball canonical games (PB/MM/C4L/Fantasy5): let sidebar use pageRows
        setPayload(undefined);
      }
    } catch (e: any) {
      console.error('FL load() failed:', e);
      setError(e?.message || String(e));
      setRowsAll([]);
      setPayload(undefined);
    } finally {
      setLoading(false);
    }
  }, [logical, period]);

  useEffect(() => { void load(); }, [load]);

  // Sorting & paging
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const sortedRowsAll = useMemo(() => {
    const arr = [...rowsAll];
    arr.sort((a,b) => sortDir === 'desc'
      ? (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
      : (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return arr;
  }, [rowsAll, sortDir]);
  // For legacy five-ball path (no payload), cap UI rows derived from ALL rows
  const rowsUI = useMemo(() => sortedRowsAll.slice(0, UI_CAP), [sortedRowsAll]);
  // Effective counts for the sidebar footer:
  // - If payload provided (digits/cashpop), base on payload.rows (already capped).
  // - Else base on rowsUI (capped legacy five-ball).
  const uiTotal = useMemo(() => {
    if (payload && 'rows' in payload) return (payload.rows as any[]).length;
    return rowsUI.length;
  }, [payload, rowsUI.length]);
  const pageCount = Math.max(1, Math.ceil(uiTotal / pageSize));
  const pageRows = useMemo(() => {
    const source = (payload && 'rows' in payload) ? (payload.rows as any[]) : rowsUI;
    const start = (page - 1) * pageSize;
    return source.slice(start, start + pageSize) as any;
  }, [payload, rowsUI, page]);

  // Analysis cache keyed by representative canonical GameKey
  const [analysisByRep, setAnalysisByRep] =
    useState<Partial<Record<GameKey, any>>>({});

  const ensureRecommendedForSelected = useCallback(async () => {
    const existing = analysisByRep[repGame];
    if (existing) return { recMain: existing.recMain, recSpec: existing.recSpec };
    const a = await analyzeGameAsync(rowsAll, repGame);
    setAnalysisByRep(prev => ({ ...prev, [repGame]: a }));
    return { recMain: a.recMain, recSpec: a.recSpec };
  }, [analysisByRep, repGame, rowsAll]);

  const openPastDraws = useCallback(() => { setShowPast(true); }, []);
  const periodSupport = GAME_OPTIONS.find(g => g.key === (logical as FlLogicalKey))?.supportsPeriod ?? 'none';

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
                  data-has-period={periodSupport !== 'none' ? 'true' : 'false'}
                >
                  <div className="card-title game-select-label">Pick Your Game</div>
                  <select
                    aria-label="Select Florida game"
                    value={logical}
                    onChange={(e) => {
                      const next = e.target.value as LogicalGameKey;
                      setLogical(next);
                      // Reset to a sane default period on game switch
                      setPeriod('both');
                      setPage(1);
                    }}
                    className="compact-control"
                  >
                    {GAME_OPTIONS.map(opt => (
                      <option key={opt.key} value={opt.key}>{opt.label}</option>
                    ))}
                  </select>

                  {/* Period picker */}
                  {periodSupport !== 'none' && (
                    <div className="card-topright-anchor game-select-period-anchor">
                      <label htmlFor="fl-period" className="visually-hidden">Draw Time</label>

                      {/* Two-period control */}
                      {periodSupport === 'two' && (
                        <select
                          id="fl-period"
                          aria-label="Select draw time"
                          value={toTwoPeriod(period)}
                          onChange={(e) => { setPeriod(e.target.value as Period); setPage(1); }}
                          className="game-select-period compact-control"
                        >
                          <option value="both">Midday + Evening</option>
                          <option value="midday">Midday only</option>
                          <option value="evening">Evening only</option>
                        </select>
                      )}

                      {/* Five-period control (Cash Pop) */}
                      {periodSupport === 'five' && (
                        <select
                          id="fl-period"
                          aria-label="Select draw time (Cash Pop)"
                          value={period}
                          onChange={(e) => { setPeriod(e.target.value as Period); setPage(1); }}
                          className="game-select-period compact-control"
                        >
                          <option value="all">All periods</option>
                          <option value="morning">Morning</option>
                          <option value="matinee">Matinee</option>
                          <option value="afternoon">Afternoon</option>
                          <option value="evening">Evening</option>
                          <option value="latenight">Late Night</option>
                        </select>
                      )}
                    </div>
                  )}
                </div>

                <div className="latest-and-actions">
                  {/* Components that still expect a canonical GameKey */}
                  <SelectedLatest
                    game={repGame}
                    logical={logical}
                    // Keep SelectedLatest in a two-period-safe range for Cash Pop
                    period={periodSupport === 'two' ? toTwoPeriod(period) : 'both'}
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
                    game={repGame}
                    logical={logical}
                    rowsForGenerator={rowsAll}  // full rows for generator/analysis
                    analysisForGame={analysisByRep[repGame] ?? null}
                    anLoading={loading}
                    onEnsureRecommended={async () => {
                      const era = getCurrentEraConfig(repGame);
                      return analyzeGameAsync(rowsAll, repGame);
                    }}
                  />
                  </ErrorBoundary>
                </div>
                <div className="ad-slot ad-slot--rect-280" aria-label="Advertisement">
                  {!loading && rowsAll.length > 0 ? <AdsLot /> : null}
                </div>
              </section>

              <section className="vstack vstack--4">
                <div><HintLegend game={logical} /></div>
                <div>
                  <AnalyzeSidebar
                    title="Analysis (All Games)"
                    canonical={['multi_powerball','multi_megamillions','multi_cash4life']}
                    logical={[
                      'fl_fantasy5',
                      'fl_pick2','fl_pick3','fl_pick4','fl_pick5',
                      'fl_cashpop',
                    ]}
                    period={periodSupport === 'two' ? toTwoPeriod(period) : 'both'}
                    state="fl"
                  />
                </div>
              </section>
            </div>
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
              total={uiTotal}         
              side="right"
              game={repGame}
              logical={logical}
              payload={payload}   // undefined for FL → default Past Draws behavior
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
