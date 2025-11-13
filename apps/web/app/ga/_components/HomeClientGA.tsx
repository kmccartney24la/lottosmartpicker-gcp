// app/ga/_components/HomeClientGA.tsx

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
  fetchRowsWithCache,
  getCurrentEraConfig,
  analyzeGameAsync,
} from '@lsp/lib';
import type {
  LottoRow,
  GameKey,
} from '@lsp/lib';
import { ErrorBoundary } from 'apps/web/src/components/ErrorBoundary';

const AdsLot = dynamic(() => import('apps/web/src/components/ads/AdsLot'), { ssr: false });

// Canonical draw games only (no scratchers in this client)
type CanonicalDrawGame = Exclude<GameKey, 'ga_scratchers'>;
const GAME_OPTIONS: { key: CanonicalDrawGame; label: string }[] = [
  { key: 'multi_cash4life',    label: 'Cash4Life' },
  { key: 'multi_megamillions', label: 'Mega Millions'},
  { key: 'multi_powerball',    label: 'Powerball'},
  { key: 'ga_fantasy5',        label: 'Fantasy 5 (GA)' },
];

export default function HomeClient() {
  // Narrow state so SelectedLatest/GameOverview accept it without cast
  const [game, setGame] = useState<CanonicalDrawGame>('multi_powerball');
  const [rowsAll, setRowsAll] = useState<LottoRow[]>([]);
  const [sortDir, setSortDir] = useState<'desc'|'asc'>('desc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compact, setCompact] = useState<boolean>(true);
  const [showPast, setShowPast] = useState<boolean>(false);
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const UI_CAP = 2000; // hard cap for what the sidebar should render
  const [analysisByGame, setAnalysisByGame] =
    useState<Partial<Record<CanonicalDrawGame, any>>>({});

  // Sort full dataset for deterministic paging, then cap for UI
  const sortedRowsAll = useMemo(() => {
    const arr = [...rowsAll];
    arr.sort((a,b) => sortDir === 'desc'
      ? (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
      : (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return arr;
  }, [rowsAll, sortDir]);
  const rowsUI = useMemo(() => sortedRowsAll.slice(0, UI_CAP), [sortedRowsAll]);
  const uiTotal = rowsUI.length;
  const pageCount = Math.max(1, Math.ceil(uiTotal / pageSize));
  const pageRows = useMemo(() => rowsUI.slice((page - 1) * pageSize, page * pageSize), [rowsUI, page]);

  // Shape-aware payload for the PastDrawsSidebar (canonical five-ball only in this client)
  const payload: PastDrawsPayload = useMemo(() => ({
    kind: 'five',
    rows: pageRows,
    game,
  }), [pageRows, game]);

  const rowsForGenerator = rowsAll; // generator/analysis use full dataset

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const sinceEra = getCurrentEraConfig(game).start;
      const data = await fetchRowsWithCache({ game, since: sinceEra });
      setRowsAll(data); // keep full for generator/analysis
      setPage(1);
    } catch (e: any) {
      console.error('load() failed:', e);
      setError(e?.message || String(e));
      setRowsAll([]);
    } finally {
      setLoading(false);
    }
  }, [game]);
  useEffect(() => { void load(); }, [load]);

  const openPastDraws = useCallback(() => { setShowPast(true); }, []);

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
            <section className="card card--reserve-topright">
              <div className="controls header-controls">
                <div
                  className="card game-select-card"
                  data-has-period="false" /* parity with NY (no period selector on GA) */
                >
                  <div className="card-title game-select-label">Pick Your Game</div>
                  <select
                    aria-label="Select game"
                    value={game}
                    onChange={(e) => setGame(e.target.value as CanonicalDrawGame)}
                    className="compact-control"
                  >
                    {GAME_OPTIONS.map(opt => (
                      <option key={opt.key} value={opt.key}>{opt.label}</option>
                    ))}
                  </select>
                </div>
                <div className="latest-and-actions">
                  {/* Keep prop shape consistent with NY (where applicable) */}
                  <SelectedLatest
                    game={game}
                    onOpenPastDraws={openPastDraws}
                    showPast={showPast}
                  />
                </div>
              </div>
            </section>

            {/* Two-column main */}
            <div className="layout-grid main-content">
              <section className="vstack vstack--4">
                <div><GameOverview game={game} /></div>
                <div>
                  <ErrorBoundary
                    fallback={
                      <div className="card p-3 text-sm">
                        <div className="font-medium mb-1">Generator temporarily unavailable.</div>
                        <div>Try changing the game or reloading the page.</div>
                      </div>
                    }
                  >
                  <Generator
                    game={game}
                    rowsForGenerator={rowsForGenerator}
                    analysisForGame={analysisByGame[game] ?? null}
                    anLoading={loading}
                    onEnsureRecommended={async () => {
                      const sinceEra = getCurrentEraConfig(game).start;
                      const rows = await fetchRowsWithCache({ game, since: sinceEra });
                      const a = await analyzeGameAsync(rows, game);
                      // Cache per-game so subsequent openings are instant
                      setAnalysisByGame(prev => ({
                        ...prev,
                        [game]: a,
                      }));
                      return a;
                    }}
                  />
                  </ErrorBoundary>
                </div>
                <div className="ad-slot ad-slot--rect-280" aria-label="Advertisement">
                  {!loading && rowsAll.length > 0 ? <AdsLot /> : null}
                </div>
              </section>
              <section className="vstack vstack--4">
                <div><HintLegend game={game} /></div>
                <div><AnalyzeSidebar
                      title="Analysis (All Games)"
                      canonical={['multi_powerball','multi_megamillions','multi_cash4life','ga_fantasy5']}
                      state="ga" 
                    /></div>
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
              game={game}
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
