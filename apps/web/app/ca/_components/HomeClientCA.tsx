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
  fetchLogicalRows,
  fetchDigitRowsFor,
  analyzeGameAsync,
  primaryKeyFor,
} from '@lsp/lib';
import type {
  LottoRow,
  GameKey,
  LogicalGameKey,
  Period,
} from '@lsp/lib';
import { useIsMobile } from '@lsp/lib/react/breakpoints';
import { ErrorBoundary } from 'apps/web/src/components/ErrorBoundary';

const AdsLot = dynamic(() => import('apps/web/src/components/ads/AdsLot'), { ssr: false });

/** Two-period subset for components that only understand midday/evening/both. */
type TwoPeriod = 'midday' | 'evening' | 'both';
const toTwoPeriod = (p: Period): TwoPeriod =>
  p === 'midday' || p === 'evening' || p === 'both' ? p : 'both';

// ---- CA page logical options (subset of LogicalGameKey) ----
const CA_KEYS = [
  'multi_megamillions',
  'multi_powerball',
  'ca_superlotto_plus', // canonical-style 5-ball (single daily file)
  'ca_fantasy5',        // canonical-style 5-ball (single daily file)
  'ca_daily3',          // digits (midday/evening)
  'ca_daily4',          // digits (single daily file)
] as const;

type CaLogicalKey = typeof CA_KEYS[number];

// supportsPeriod: 'none' = single source; 'two' = Midday/Evening
const GAME_OPTIONS: { key: CaLogicalKey; label: string; supportsPeriod: 'none' | 'two' }[] = [
  { key: 'multi_megamillions', label: 'Mega Millions',      supportsPeriod: 'none' },
  { key: 'multi_powerball',    label: 'Powerball',          supportsPeriod: 'none' },
  { key: 'ca_superlotto_plus', label: 'SuperLotto Plus',    supportsPeriod: 'none' },
  { key: 'ca_fantasy5',        label: 'Fantasy 5 (CA)',          supportsPeriod: 'none' },
  { key: 'ca_daily3',          label: 'Daily 3',            supportsPeriod: 'two'  },
  { key: 'ca_daily4',          label: 'Daily 4',            supportsPeriod: 'none' },
];

/**
 * Representative canonical GameKey for components that expect a GameKey:
 * - Multi-state map to themselves
 * - CA five-ball games map to themselves
 * - CA digits use Fantasy 5 (canonical, single file) as a neutral 5-ball rep
 */
const REP_FOR_LOGICAL: Record<CaLogicalKey, GameKey> = {
  multi_powerball:    'multi_powerball',
  multi_megamillions: 'multi_megamillions',
  ca_superlotto_plus: 'ca_superlotto_plus',
  ca_fantasy5:        'ca_fantasy5',
  ca_daily3:          'ca_fantasy5',
  ca_daily4:          'ca_fantasy5',
};

export default function HomeClientCA() {
  const [logical, setLogical] = useState<LogicalGameKey>('multi_powerball');
  const [period, setPeriod] = useState<Period>('both'); // includes midday/evening/all (digits ignore 'all')
  // Keep ALL rows for generator/analysis
  const [rowsAll, setRowsAll] = useState<LottoRow[]>([]);
  const [sortDir, setSortDir] = useState<'desc' | 'asc'>('desc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compact, setCompact] = useState<boolean>(true);
  const [showPast, setShowPast] = useState<boolean>(false);
  const [payload, setPayload] = useState<PastDrawsPayload | undefined>(undefined);
  const UI_CAP = 2000; // hard cap for what the sidebar should render
  const isMobile = useIsMobile();
  const drawerMode = isMobile;

  const repGame: GameKey = REP_FOR_LOGICAL[logical as CaLogicalKey];

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const data = await fetchLogicalRows({ logical, period });
      setRowsAll(data); // keep full for generator/analysis

      // Build a shape-aware payload for digit games so PastDrawsSidebar renders correct bubbles.
      if (logical === 'ca_daily3' || logical === 'ca_daily4') {
        const k = logical === 'ca_daily4' ? 4 : 3;
        const per: TwoPeriod = toTwoPeriod(period); // Daily 3 respects midday/evening; Daily 4 uses its single file
        const digitRows = await fetchDigitRowsFor(logical as 'ca_daily3' | 'ca_daily4', per);
        const ui =
          digitRows.length > UI_CAP ? digitRows.slice(-UI_CAP) : digitRows;
        setPayload({
          kind: 'digits', // CA digits have no Fireball
          k,
          rows: ui.map((r) => ({ date: r.date, digits: r.digits })), // cap payload for UI
        });
      } else {
        // Five-ball canonical games: let sidebar use pageRows
        setPayload(undefined);
      }
    } catch (e: any) {
      console.error('CA load() failed:', e);
      setError(e?.message || String(e));
      setRowsAll([]);
      setPayload(undefined);
    } finally {
      setLoading(false);
    }
  }, [logical, period]);

  useEffect(() => {
    void load();
  }, [load]);

  // Sorting & paging
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const sortedRowsAll = useMemo(() => {
    const arr = [...rowsAll];
    arr.sort((a, b) =>
      sortDir === 'desc'
        ? a.date < b.date
          ? 1
          : a.date > b.date
          ? -1
          : 0
        : a.date < b.date
        ? -1
        : a.date > b.date
        ? 1
        : 0
    );
    return arr;
  }, [rowsAll, sortDir]);
  // For legacy five-ball path (no payload), cap UI rows derived from ALL rows
  const rowsUI = useMemo(() => sortedRowsAll.slice(0, UI_CAP), [sortedRowsAll]);
  // Effective counts for the sidebar footer:
  // - If payload provided (digits), base on payload.rows (already capped).
  // - Else base on rowsUI (capped five-ball).
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
  const [analysisByRep, setAnalysisByRep] = useState<Partial<Record<GameKey, any>>>({});

  const openPastDraws = useCallback(() => {
    setShowPast(true);
  }, []);
  const periodSupport = GAME_OPTIONS.find((g) => g.key === (logical as CaLogicalKey))?.supportsPeriod ?? 'none';

  return (
    <ErrorBoundary>
      <main className="layout-rails">
        {/* Left rail */}
        <aside className="rail rail--left" aria-label="Sponsored">
          <div className="rail__inner">
            <div className="ad-slot ad-slot--rail-300x600">
              <AdsLot />
            </div>
            <div className="ad-slot ad-slot--rail-300x250">
              <AdsLot />
            </div>
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
                      aria-label="Select California game"
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
                      {GAME_OPTIONS.map((opt) => (
                        <option key={opt.key} value={opt.key}>
                          {opt.label}
                        </option>
                      ))}
                    </select>

                    {/* Period picker (Daily 3 only) */}
                    {periodSupport !== 'none' && (
                      <div className="card-topright-anchor game-select-period-anchor">
                        <label htmlFor="ca-period" className="visually-hidden">
                          Draw Time
                        </label>

                        {/* Two-period control */}
                        {periodSupport === 'two' && (
                          <select
                            id="ca-period"
                            aria-label="Select draw time"
                            value={toTwoPeriod(period)}
                            onChange={(e) => {
                              setPeriod(e.target.value as Period);
                              setPage(1);
                            }}
                            className="game-select-period compact-control"
                          >
                            <option value="both">Midday + Evening</option>
                            <option value="midday">Midday only</option>
                            <option value="evening">Evening only</option>
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
                  <div>
                    <HintLegend game={logical} />
                  </div>
                  <div>
                    <AnalyzeSidebar
                      title="Analysis (All Games)"
                      canonical={['multi_powerball', 'multi_megamillions', 'ca_superlotto_plus', 'ca_fantasy5']}
                      logical={['ca_daily3', 'ca_daily4']}
                      period={periodSupport === 'two' ? toTwoPeriod(period) : 'both'}
                      state="ca"
                    />
                  </div>
                </section>
              </div>

              <ErrorBoundary
                fallback={
                  <div className="card p-3 text-sm">
                    <div className="font-medium mb-1">Past Draws failed to load.</div>
                    <button
                      className="mt-1 rounded bg-black text-white px-3 py-1"
                      onClick={() => setShowPast(false)}
                    >
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
                  payload={payload} // undefined for 5-ball games
                  sortDir={sortDir}
                  onToggleSort={() => setSortDir((d) => (d === 'desc' ? 'asc' : 'desc'))}
                />
              </ErrorBoundary>
            </div>
          </div>
        </div>

        {/* Right rail */}
        <aside className="rail rail--right" aria-label="Sponsored">
          <div className="rail__inner">
            <div className="ad-slot ad-slot--rail-300x600">
              <AdsLot />
            </div>
            <div className="ad-slot ad-slot--rail-300x250">
              <AdsLot />
            </div>
          </div>
        </aside>
      </main>
    </ErrorBoundary>
  );
}
