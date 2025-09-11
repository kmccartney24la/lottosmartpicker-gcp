'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ThemeSwitcher from 'src/components/ThemeSwitcher';
import Info from 'src/components/Info';
import PastDrawsSidebar from 'src/components/PastDrawsSidebar';
import Generator from 'src/components/Generator';
import ExportCsvButton from 'src/components/ExportCsvButton';
import LatestStrip from 'src/components/LatestStrip';
import AnalyzeSidebar from 'src/components/AnalyzeSidebar';
import InfoOverview from 'src/components/InfoOverview';
import {
  GameKey,
  LottoRow,
  fetchRowsWithCache,        // ⬅️ use the cache-aware fetch
  nextDrawLabelNYFor,
  drawNightsLabel,
  getCurrentEraConfig,
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

  const sortedRows = useMemo(() => {
    const arr = [...rows];
    arr.sort((a,b) => sortDir === 'desc'
      ? (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)
      : (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
    return arr;
  }, [rows, sortDir]);
  const pageCount = Math.max(1, Math.ceil(sortedRows.length / pageSize));
  const pageRows = useMemo(() => sortedRows.slice((page - 1) * pageSize, page * pageSize), [sortedRows, page]);

  const rowsForGenerator = rows

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

      {/* Latest draws at a glance */}
      <LatestStrip />

      <section className="card">
        <div className="controls" style={{ gap: 12 }}>
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

          {/* CSV export */}
          <div className="flex-1" />
          <ExportCsvButton game={game} />

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

      <section className="grid" style={{ gridTemplateColumns: '1fr 1fr', marginTop: 12 }}>
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Powerball</div>
          {analysisPB ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li><strong>Draws:</strong> {analysisPB.draws}</li>
              <li><strong>Recent mains:</strong> {(analysisPB.recencyHotFracMain*100).toFixed(1)}%</li>
              <li><strong>Recent special:</strong> {(analysisPB.recencyHotFracSpec*100).toFixed(1)}%</li>
              <li><strong>Pick:</strong> mains <em>{analysisPB.recMain.mode}</em> (α={analysisPB.recMain.alpha.toFixed(2)}), special <em>{analysisPB.recSpec.mode}</em> (α={analysisPB.recSpec.alpha.toFixed(2)})</li>
            </ul>
          ) : <div className="hint">No analysis yet.</div>}
        </div>
        <div className="card">
          <div style={{ fontWeight: 700, marginBottom: 6 }}>Mega Millions</div>
          {analysisMM ? (
            <ul style={{ margin: 0, paddingLeft: 18 }}>
              <li><strong>Draws:</strong> {analysisMM.draws}</li>
              <li><strong>Recent mains:</strong> {(analysisMM.recencyHotFracMain*100).toFixed(1)}%</li>
              <li><strong>Recent special:</strong> {(analysisMM.recencyHotFracSpec*100).toFixed(1)}%</li>
              <li><strong>Pick:</strong> mains <em>{analysisMM.recMain.mode}</em> (α={analysisMM.recMain.alpha.toFixed(2)}), special <em>{analysisMM.recSpec.mode}</em> (α={analysisMM.recSpec.alpha.toFixed(2)})</li>
            </ul>
          ) : <div className="hint">No analysis yet.</div>}
        </div>
      </section>

      {/* Main two-column: left = generator, right = info + analysis */}
      <div className="grid" style={{ gridTemplateColumns:'minmax(0,1fr) 340px', gap: 12 }}>
        <section>
          <Generator
            game={game}
            rowsForGenerator={rowsForGenerator}
            analysisForGame={null}
            anLoading={false}
            onEnsureRecommended={async ()=>null}
          />
        </section>
        <section>
          <InfoOverview />
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
