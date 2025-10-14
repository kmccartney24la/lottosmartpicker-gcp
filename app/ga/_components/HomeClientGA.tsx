// app/ga/_components/HomeClientGA.tsx

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
  GameKey,
  LottoRow,
  fetchRowsWithCache,
  getCurrentEraConfig,
  analyzeGame,
} from '@lib/lotto';
import { useIsMobile } from '@lib/breakpoints';

const AdsLot = dynamic(() => import('src/components/ads/AdsLot'), { ssr: false });

// Canonical draw games only (no scratchers in this client)
type CanonicalDrawGame = Exclude<GameKey, 'ga_scratchers'>;
const GAME_OPTIONS: { key: CanonicalDrawGame; label: string }[] = [
  { key: 'multi_cash4life',    label: 'Cash4Life' },
  { key: 'multi_megamillions', label: 'Mega Millions'},
  { key: 'multi_powerball',    label: 'Powerball'},
  { key: 'ga_fantasy5',        label: 'Fantasy 5' },
];

export default function HomeClient() {
  // Narrow state so SelectedLatest/GameOverview accept it without cast
  const [game, setGame] = useState<CanonicalDrawGame>('multi_powerball');
  const [rows, setRows] = useState<LottoRow[]>([]);
  const [sortDir, setSortDir] = useState<'desc'|'asc'>('desc');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compact, setCompact] = useState<boolean>(true);
  const [showPast, setShowPast] = useState<boolean>(false);
  const isMobile = useIsMobile();
  const drawerMode = isMobile;
  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [analysisByGame, setAnalysisByGame] =
    useState<Partial<Record<CanonicalDrawGame, any>>>({});

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a,b) => sortDir === 'desc'
      ? (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
      : (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return arr;
  }, [rows, sortDir]);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const pageRows = useMemo(() => sortedRows.slice((page - 1) * pageSize, page * pageSize), [sortedRows, page]);

  // Shape-aware payload for the PastDrawsSidebar (canonical five-ball only in this client)
  const payload: PastDrawsPayload = useMemo(() => ({
    kind: 'five',
    rows: pageRows,
    game,
  }), [pageRows, game]);

  const rowsForGenerator = rows;

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const sinceEra = getCurrentEraConfig(game).start;
      const data = await fetchRowsWithCache({ game, since: sinceEra });
      setRows(data);
      setPage(1);
    } catch (e: any) {
      console.error('load() failed:', e);
      setError(e?.message || String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [game]);
  useEffect(() => { void load(); }, [load]);

  const ensureRecommendedForSelected = useCallback(async () => {
    const existing = analysisByGame[game];
    if (existing) return { recMain: existing.recMain, recSpec: existing.recSpec };
    const a = analyzeGame(rows, game);
    setAnalysisByGame(prev => ({ ...prev, [game]: a }));
    return { recMain: a.recMain, recSpec: a.recSpec };
  }, [analysisByGame, game, rows]);

  const openPastDraws = useCallback(() => { setShowPast(true); }, []);

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
            <section className="card card--reserve-topright">
              <div className="controls header-controls">
                <div
                  className="card game-select-card"
                  data-has-period="false" /* parity with NY (no period selector on GA) */
                >
                  <div className="card-title game-select-label">Game</div>
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
                  <Generator
                    game={game}
                    rowsForGenerator={rowsForGenerator}
                    analysisForGame={analysisByGame[game] ?? null}
                    anLoading={loading}
                    onEnsureRecommended={async () => {
                      const sinceEra = getCurrentEraConfig(game).start;
                      const rows = await fetchRowsWithCache({ game, since: sinceEra });
                      return analyzeGame(rows, game);
                    }}
                  />
                </div>
                <div className="ad-slot ad-slot--rect-280" aria-label="Advertisement">
                  {!loading && rows.length > 0 ? <AdsLot /> : null}
                </div>
              </section>
              <section className="vstack vstack--4">
                <div><HintLegend game={game} /></div>
                <div><AnalyzeSidebar
                      title="Analysis (All Games)"
                      canonical={['multi_powerball','multi_megamillions','multi_cash4life','ga_fantasy5']}
                      logical={[]}
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
              game={game}
              payload={payload}
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
