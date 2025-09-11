'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ThemeSwitcher from 'src/components/ThemeSwitcher';
import PastDrawsSidebar from 'src/components/PastDrawsSidebar';
import Generator from 'src/components/Generator';
import ExportCsvButton from 'src/components/ExportCsvButton';
import AnalyzeSidebar from 'src/components/AnalyzeSidebar';
import InfoOverview from 'src/components/InfoOverview';
import GameOverview from 'src/components/GameOverview';
import SelectedLatest from 'src/components/SelectedLatest';
import {
  GameKey,
  LottoRow,
  fetchRowsWithCache,        // ⬅️ use the cache-aware fetch
  nextDrawLabelNYFor,
  getCurrentEraConfig,
  analyzeGame,
} from '@lib/lotto';

const GAME_OPTIONS: { key: GameKey; label: string }[] = [
  { key: 'powerball',    label: 'Powerball (5/69 + 1/26)' },
  { key: 'megamillions', label: 'Mega Millions (5/70 + 1/24)' },
  { key: 'ga_cash4life', label: 'Cash4Life (5/60 + Cash Ball 1–4)' },
  { key: 'ga_fantasy5',  label: 'Fantasy 5 (GA) (5/42)' },
];

export default function Page() {
  const [game, setGame] = useState<GameKey>('powerball');

  const [rows, setRows] = useState<LottoRow[]>([]);
  const [sortDir, setSortDir] = useState<'desc'|'asc'>('desc'); // newest first by default
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [analysisPB, setAnalysisPB] = useState<any|null>(null);
  const [analysisMM, setAnalysisMM] = useState<any|null>(null);
  const [anLoading, setAnLoading] = useState(false);
  const [anError, setAnError] = useState<string | null>(null);

  const [compact, setCompact] = useState<boolean>(true);
  const [showPast, setShowPast] = useState<boolean>(false);
  const [isMobile, setIsMobile] = useState<boolean>(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const apply = () => setIsMobile(mq.matches);
    apply(); mq.addEventListener?.('change', apply);
    return () => mq.removeEventListener?.('change', apply);
  }, []);

  const [page, setPage] = useState(1);
  const pageSize = 25;
  const [analysisByGame, setAnalysisByGame] = useState<Partial<Record<GameKey, any>>>({});

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a,b) => sortDir === 'desc'
      ? (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
      : (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return arr;
  }, [rows, sortDir]);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const pageRows = useMemo(() => sortedRows.slice((page - 1) * pageSize, page * pageSize), [sortedRows, page]);

  const rowsForGenerator = rows;

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const sinceEra = getCurrentEraConfig(game).start; // current era only
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
    // Use cached analysis if present; otherwise compute from loaded rows.
    const existing = analysisByGame[game];
    if (existing) return { recMain: existing.recMain, recSpec: existing.recSpec };
    // analyzeGame internally filters to current era; rows are already era-only as well.
    const a = analyzeGame(rows, game);
    setAnalysisByGame(prev => ({ ...prev, [game]: a }));
    return { recMain: a.recMain, recSpec: a.recSpec };
  }, [analysisByGame, game, rows]);

  return (
    <main>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800 }}>LottoSmartPicker</h1>
        <div className="controls" style={{ gap: 8 }}>
          <ThemeSwitcher />
          <div className="hint">Accessible, high-contrast UI</div>
          <button className="btn btn-ghost" onClick={() => setShowPast(true)} aria-controls="past-draws" aria-expanded={showPast}>
            Past Draws
          </button>
        </div>
      </header>

      <section className="card">
        <div className="controls" style={{ gap: 12, alignItems:'flex-end' }}>
          <label>
            <span>Game</span><br/>
            <select
              aria-label="Select game"
              value={game}
              onChange={(e) => setGame(e.target.value as GameKey)}
            >
              {GAME_OPTIONS.map(opt => (
                <option key={opt.key} value={opt.key}>{opt.label}</option>
              ))}
            </select>
          </label>
          <div className="card" style={{ padding: 12, minHeight: 92 }}>
            <label>
              <span>Game</span><br/>
              <select
                aria-label="Select game"
                value={game}
                onChange={(e) => setGame(e.target.value as GameKey)}
              >
                {GAME_OPTIONS.map(opt => (
                  <option key={opt.key} value={opt.key}>{opt.label}</option>
                ))}
              </select>
            </label>
          </div>
          {/* Latest for selected game only */}
          <SelectedLatest game={game} />

          {/* CSV export */}
          <div className="flex-1" />
          <ExportCsvButton game={game} />
        </div>

        <div className="hint" style={{ marginTop: 8, display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div>
            <strong>Status:</strong>{' '}
            {loading
            ? 'Loading…'
            : error
            ? <span style={{ color: 'var(--danger)' }}>Error: {error}</span>
            : 'Idle'}
            </div>
          <div><strong>Rows (current era):</strong> {rows.length}</div>
          <div><strong>Next expected draw:</strong> {nextDrawLabelNYFor(game)}</div>
        </div>
      </section>

      {/* Main two-column: left = generator, right = info + analysis */}
       <div className="grid" style={{ gridTemplateColumns:'2fr 1fr', gap: 12 }}>
        <section>
          <Generator
            game={game}
            rowsForGenerator={rowsForGenerator}
            analysisForGame={analysisByGame[game] ?? null}
            anLoading={false}
            onEnsureRecommended={ensureRecommendedForSelected}
          />
        </section>
        <section>
          <GameOverview game={game} />
          <AnalyzeSidebar />
        </section>
      </div>

      {/* Panels (mutually exclusive). On mobile, render as bottom sheets; on desktop, as right drawers. */}
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
        side={isMobile ? 'bottom' : 'right'}
        sortDir={sortDir}
        onToggleSort={() => setSortDir(d => d === 'desc' ? 'asc' : 'desc')}
      />

    </main>
  );
}
