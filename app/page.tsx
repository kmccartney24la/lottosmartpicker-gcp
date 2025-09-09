'use client';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import ThemeSwitcher from '@components/ThemeSwitcher';
import Info from '@components/Info';
import PastDrawsSidebar from '@components/PastDrawsSidebar';
import Generator from '@components/Generator';
import ExportCsvButton from '@components/ExportCsvButton';
import EraBanner from '@components/EraBanner';
import {
  GameKey,
  LottoRow,
  fetchRowsWithCache,        // ⬅️ use the cache-aware fetch
  nextDrawLabelNYFor,
  drawNightsLabel,
  analyzeGame,
  getCurrentEraConfig,
} from '@lib/lotto';
import { useAutoRefresh } from '@hooks/useAutoRefresh';

const GAME_OPTIONS: { key: GameKey; label: string }[] = [
  { key: 'powerball',    label: 'Powerball (5/69 + 1/26)' },
  { key: 'megamillions', label: 'Mega Millions (5/70 + 1/24)' },
  { key: 'ga_cash4life', label: 'Cash4Life (5/60 + Cash Ball 1–4)' },
  { key: 'ga_fantasy5',  label: 'Fantasy 5 (GA) (5/42)' },
];

function normalizeToLottoRows(rows: any[]): LottoRow[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((r) => {
    const draw_date: string = r.draw_date ?? r.date ?? r.drawDate ?? '';
    const mains: number[] =
      Array.isArray(r.mains) && r.mains.length
        ? r.mains.map((n: any) => Number(n)).filter(Number.isFinite)
        : [r.n1, r.n2, r.n3, r.n4, r.n5]
            .map((n: any) => Number(n))
            .filter(Number.isFinite);

    const specialRaw = r.special ?? r.special_ball ?? r.pb ?? r.mb ?? undefined;
    const special = specialRaw !== undefined && specialRaw !== null ? Number(specialRaw) : undefined;

    return { ...(r as any), draw_date, mains, special } as LottoRow;
  }).filter(r => r.draw_date && r.mains?.length >= 5);
}

export default function Page() {
  const [game, setGame] = useState<GameKey>('powerball');

  // removed since/until state entirely
  const [latestOnly, setLatestOnly] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(false);

  const [rows, setRows] = useState<LottoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [analysisPB, setAnalysisPB] = useState<any|null>(null);
  const [analysisMM, setAnalysisMM] = useState<any|null>(null);
  const [anLoading, setAnLoading] = useState(false);
  const [anError, setAnError] = useState<string | null>(null);

  const [compact, setCompact] = useState<boolean>(true);
  const [showPast, setShowPast] = useState<boolean>(false);

  const [page, setPage] = useState(1);
  const pageSize = 25;

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const pageRows = useMemo(() => rows.slice((page - 1) * pageSize, page * pageSize), [rows, page]);

  // When latestOnly is on, we still fetch with latestOnly to avoid extra payloads.
  const rowsForGenerator = latestOnly ? rows.slice(0, 1) : rows;

  const load = useCallback(async () => {
    try {
      setLoading(true); setError(null);
      const sinceEra = getCurrentEraConfig(game).start; // current era only
      // ⬇️ cache-aware fetching; respects latestOnly (won’t cache that path)
      const data = await fetchRowsWithCache({ game, since: sinceEra, latestOnly });
      const normalized = normalizeToLottoRows(data);
      setRows(normalized); setPage(1);
    } catch (e: any) {
      console.error('load() failed:', e);
      setError(e?.message || String(e));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [game, latestOnly]);

  useEffect(() => { void load(); }, [load]);
  useAutoRefresh(autoRefresh, game, load);

  async function analyzeBoth() {
    try {
      setAnLoading(true); setAnError(null);
      // Fetch both games from THEIR respective current-era starts
      const pbSince = getCurrentEraConfig('powerball').start;
      const mmSince = getCurrentEraConfig('megamillions').start;
      const [pb, mm] = await Promise.all([
        fetchRowsWithCache({ game: 'powerball', since: pbSince }),
        fetchRowsWithCache({ game: 'megamillions', since: mmSince }),
      ]);
      setAnalysisPB(analyzeGame(pb, 'powerball'));
      setAnalysisMM(analyzeGame(mm, 'megamillions'));
    } catch (e:any) {
      setAnError(e?.message || String(e));
    } finally {
      setAnLoading(false);
    }
  }

  async function ensureRecommendedForSelected() {
    const a = game === 'powerball' ? analysisPB : analysisMM;
    if (a) return { recMain: a.recMain, recSpec: a.recSpec };
    await analyzeBoth();
    const b = game === 'powerball' ? analysisPB : analysisMM;
    return b ? { recMain: b.recMain, recSpec: b.recSpec } : null;
  }

  return (
    <main>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800 }}>LottoSmartPicker</h1>
        <div className="controls" style={{ gap: 8 }}>
          <ThemeSwitcher />
          <div className="hint">Accessible, high-contrast UI</div>
          <button
            className="btn btn-ghost"
            onClick={() => setShowPast(true)}
            aria-controls="past-draws"
            aria-expanded={showPast}
            aria-label="Open Past Draws panel"
          >
            Past Draws
          </button>
        </div>
      </header>

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

          {/* Current-era banner + CSV export */}
          <EraBanner game={game} />
          <div className="flex-1" />
          <ExportCsvButton game={game} />

          <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <input
              aria-label="Latest only"
              type="checkbox"
              checked={latestOnly}
              onChange={(e) => setLatestOnly(e.target.checked)}
            />
            <span>Latest only</span>
            <Info tip={'If on, fetches only the most recent draw and also uses that single draw for generator weights.'} />
          </label>

          <label style={{ display: 'flex', gap: 8, alignItems: 'center', marginLeft: 'auto' }}>
            <input
              aria-label="Auto-refresh on draw nights"
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
            />
            <span className="hint">Auto-refresh on {drawNightsLabel(game)} 10:30p–1:30a ET</span>
            <Info tip={'Efficient: refreshes more often during draw-night windows for the *selected game* only. Otherwise, refreshes less often.'} />
          </label>

          <button onClick={load} className="btn btn-primary" aria-label="Refresh results">Refresh</button>
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
          {latestOnly && <div><strong>Generator source:</strong> latest draw only</div>}
        </div>
      </section>

      <section className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontWeight: 700 }}>Analyze both (current era)</div>
          <button onClick={analyzeBoth} className="btn btn-primary">Analyze now</button>
        </div>
        {anLoading && <div className="hint" style={{ marginTop: 8 }}>Analyzing…</div>}
        {anError && <div className="hint" style={{ marginTop: 8, color: 'var(--danger)' }}>Error: {anError}</div>}
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

      <section style={{ marginTop: 16 }}>
        <Generator
          game={game}
          rowsForGenerator={rowsForGenerator}
          analysisForGame={(game==='powerball'?analysisPB:analysisMM)
            ? { recMain:(game==='powerball'?analysisPB:analysisMM).recMain, recSpec:(game==='powerball'?analysisPB:analysisMM).recSpec }
            : null}
          anLoading={anLoading}
          onEnsureRecommended={ensureRecommendedForSelected}
        />
      </section>

      <PastDrawsSidebar
        open={showPast}
        onClose={() => setShowPast(false)}
        compact={compact}
        setCompact={setCompact}
        pageRows={pageRows}
        page={page}
        pageCount={pageCount}
        setPage={setPage}
        total={rows.length}
      />
    </main>
  );
}
