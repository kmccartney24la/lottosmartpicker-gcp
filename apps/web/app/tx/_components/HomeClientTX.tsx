// app/tx/_components/HomeClientTX.tsx
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
  analyzeGameAsync,
  fetchDigitRowsFor,
  fetchAllOrNothingRows,
  fetchRowsWithCache,
} from '@lsp/lib';
import type {
  LottoRow,
  GameKey,
  LogicalGameKey,
  Period,
} from '@lsp/lib';
import { useIsMobile } from '@lsp/lib/react/breakpoints';
import { ErrorBoundary } from 'apps/web/src/components/ErrorBoundary';

// Texas has 4-per-day periods for digits and All or Nothing.
export type TxPeriod = 'morning' | 'day' | 'evening' | 'night' | 'all';

type TxSelectableKey =
  | 'multi_powerball'
  | 'multi_megamillions'
  | 'tx_lotto_texas'
  | 'tx_texas_two_step'
  | 'tx_cash5'
  | 'tx_all_or_nothing'
  | 'tx_pick3'
  | 'tx_daily4';

function toAnyPeriodTX(p: TxPeriod): 'midday' | 'evening' | 'both' {
  return 'both';
}

function toTxPeriod(p: Period): TxPeriod {
  // Coerce any non-TX periods to 'all' for safety.
  if (p === 'morning' || p === 'day' || p === 'evening' || p === 'night') return p;
  return 'all';
}

// Match the canonical-draw constraint used elsewhere
// (exclude scratchers etc.)
type CanonicalDrawGame = GameKey;

// TX page supports these logical keys
const TX_KEYS = [
  'multi_powerball',
  'multi_megamillions',
  'tx_lotto_texas',
  'tx_texas_two_step',
  'tx_cash5',
  'tx_all_or_nothing',
  'tx_pick3',
  'tx_daily4',
] as const;

type TxLogicalKey = typeof TX_KEYS[number]; // subtype of LogicalGameKey

const AdsLot = dynamic(() => import('apps/web/src/components/ads/AdsLot'), { ssr: false });

/** Games shown on the Texas page (logical keys) */
const GAME_OPTIONS: { key: TxLogicalKey; label: string; supportsPeriod?: boolean }[] = [
  { key: 'multi_powerball',     label: 'Powerball' },
  { key: 'multi_megamillions',  label: 'Mega Millions' },
  { key: 'tx_lotto_texas',      label: 'Lotto Texas' },
  { key: 'tx_texas_two_step',   label: 'Texas Two Step' },
  { key: 'tx_cash5',            label: 'Cash Five' },
  { key: 'tx_pick3',            label: 'Pick 3', supportsPeriod: true },
  { key: 'tx_daily4',           label: 'Daily 4', supportsPeriod: true },
  { key: 'tx_all_or_nothing',   label: 'All or Nothing', supportsPeriod: true },
];

/** Representative canonical GameKey per logical for tones/era/labels */
const REP_FOR_LOGICAL: Record<TxLogicalKey, GameKey> = {
  multi_powerball:    'multi_powerball',
  multi_megamillions: 'multi_megamillions',
  tx_lotto_texas:     'tx_lotto_texas',
  tx_texas_two_step:  'tx_texas_two_step',
  tx_cash5:           'tx_cash5',
  tx_pick3:           'tx_cash5',
  tx_daily4:          'tx_cash5',
  tx_all_or_nothing:  'tx_cash5',
};

/**
 * Only pass a LogicalGameKey to children that actually accept it.
 * TX canonical singles (Lotto Texas, Two Step, Cash Five) are NOT part of the LogicalGameKey union,
 * so we send `undefined` for them.
 */
const toLogicalForProps = (k: TxSelectableKey): LogicalGameKey | undefined => {
  switch (k) {
    case 'tx_lotto_texas':
    case 'tx_texas_two_step':
    case 'tx_cash5':
      return undefined;
    default:
      return k as LogicalGameKey;
  }
};

export default function HomeClientTX() {
  const [logical, setLogical] = useState<TxSelectableKey>('multi_powerball');
  const [period, setPeriod] = useState<Period>('all'); // TX supports 4-per-day + all
  const [rowsAll, setRowsAll] = useState<LottoRow[]>([]); // used for legacy 5/6-ball path
  const [sortDir, setSortDir] = useState<'desc'|'asc'>('desc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compact, setCompact] = useState<boolean>(true);
  const [showPast, setShowPast] = useState<boolean>(false);
  const [payload, setPayload] = useState<PastDrawsPayload | undefined>(undefined);
  const UI_CAP = 2000;
  const isMobile = useIsMobile();
  const drawerMode = isMobile;

  const logicalForProps = toLogicalForProps(logical);

  const repGame: CanonicalDrawGame = REP_FOR_LOGICAL[logical as TxLogicalKey];

  // Generic merged logical rows (used for 5/6-ball legacy sidebar only)
  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      // 5/6-ball canonical singles → use fetchRowsWithCache
            if (
        logical === 'multi_powerball' ||
        logical === 'multi_megamillions' ||
        logical === 'tx_lotto_texas' ||
        logical === 'tx_texas_two_step' ||
        logical === 'tx_cash5'
      ) {
        const rows = await fetchRowsWithCache({ game: logical, latestOnly: false });
        // normalize to newest → oldest
        const normalized = [...rows].sort((a, b) =>
          a.date < b.date ? 1 : a.date > b.date ? -1 : 0
        );
        setRowsAll(normalized);
      } else {
        // Digits / AON use shape-specific payloads; no canonical rows needed
        setRowsAll([]);
      }
    } catch (e: any) {
      console.error('TX load() failed:', e);
      setError(e?.message || String(e));
      setRowsAll([]);
    } finally { setLoading(false); }
  }, [logical]);

  useEffect(() => { void load(); }, [load]);

  // Build PastDrawsSidebar payload for special shapes
  useEffect(() => {
    let cancelled = false;
    async function buildPayload() {
      let next: PastDrawsPayload | undefined;
      if (logical === 'tx_pick3' || logical === 'tx_daily4') {
        const k = logical === 'tx_daily4' ? 4 : 3;
        const r = await fetchDigitRowsFor(logical as 'tx_pick3' | 'tx_daily4', toTxPeriod(period));
        // fetchers often return oldest → newest; we want the newest UI_CAP
        const ui =
          r.length > UI_CAP ? r.slice(-UI_CAP) : r;
        if (!cancelled) next = { kind: 'digits', rows: ui, k };
      } else if (logical === 'tx_all_or_nothing') {
        const per = toTxPeriod(period); // 'morning' | 'day' | 'evening' | 'night' | 'all'
        const r = await fetchAllOrNothingRows(per);
        const ui =
          r.length > UI_CAP ? r.slice(-UI_CAP) : r;
        // PastDrawsSidebar supports an AON shape payload; use 'all_or_nothing' kind.
        if (!cancelled) next = { kind: 'all_or_nothing', rows: ui };
      } else {
        next = undefined; // 5/6-ball path (PB/MM/C4L/Lotto Texas/Two Step/Cash Five)
      }
      if (!cancelled) setPayload(next);
    }
    buildPayload();
    return () => { cancelled = true; };
  }, [logical, period]);

  // Sorting / paging (same as NY)
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const rowsUI = useMemo(() => {
    if (rowsAll.length <= UI_CAP) return rowsAll;
    // rowsAll is now newest → oldest; take the newest UI_CAP
    return rowsAll.slice(0, UI_CAP);
  }, [rowsAll]);
  const sortedRows = useMemo(() => {
    const arr = [...rowsAll];
    arr.sort((a,b) => sortDir === 'desc'
      ? (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
      : (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return arr;
  }, [rowsAll, sortDir]);

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

  // Analysis cache keyed by representative game
  const [analysisByRep, setAnalysisByRep] =
    useState<Partial<Record<CanonicalDrawGame, any>>>({});

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
                      aria-label="Select Texas game"
                      value={logical}
                      onChange={(e) => {
                        const next = e.target.value as TxSelectableKey;
                        setLogical(next);
                        setPeriod('all');
                        setPage(1);
                      }}
                      className="compact-control"
                    >
                      {GAME_OPTIONS.map(opt => (
                        <option key={opt.key} value={opt.key}>{opt.label}</option>
                      ))}
                    </select>

                    {/* Period picker (TX 4-per-day) */}
                    {supportsPeriod && (
                      <div className="card-topright-anchor game-select-period-anchor">
                        <label htmlFor="tx-period" className="visually-hidden">Draw Time</label>
                        <select
                          id="tx-period"
                          aria-label="Select draw time"
                          value={toTxPeriod(period)}
                          onChange={(e) => { setPeriod(e.target.value as Period); setPage(1); }}
                          className="game-select-period compact-control"
                        >
                          <option value="all">All times</option>
                          <option value="morning">Morning</option>
                          <option value="day">Day</option>
                          <option value="evening">Evening</option>
                          <option value="night">Night</option>
                        </select>
                      </div>
                    )}
                  </div>

                  <div className="latest-and-actions">
                    <SelectedLatest
                      game={repGame}
                      logical={logicalForProps}
                      period={toAnyPeriodTX(toTxPeriod(period))}
                      onOpenPastDraws={openPastDraws}
                      showPast={showPast}
                    />
                  </div>
                </div>
              </section>

              {/* Two-column main */}
              <div className="layout-grid main-content">
                <section className="vstack vstack--4">
                  <GameOverview game={repGame} logical={logicalForProps} period={period} />
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
                        logical={logicalForProps}
                        rowsForGenerator={rowsAll}
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
                  <div><HintLegend game={logical} /></div>
                  <div>
                    <AnalyzeSidebar
                      title="Analysis (All Games)"
                      canonical={['multi_powerball','multi_megamillions', 'tx_cash5', 'tx_lotto_texas', 'tx_texas_two_step']}
                      logical={['tx_pick3','tx_daily4','tx_all_or_nothing']}
                      period={'both'}
                      state="tx"
                    />
                  </div>
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
                  total={uiTotal}
                  side="right"
                  game={repGame}
                  logical={logicalForProps}
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