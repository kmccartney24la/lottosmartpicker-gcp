'use client';
import { useEffect, useState } from 'react';
import {
  GameKey, analyzeGame, fetchRowsWithCache, getCurrentEraConfig,
} from '@lib/lotto';

const ORDER: { key: GameKey; label: string }[] = [
  { key: 'powerball',    label: 'Powerball' },
  { key: 'megamillions', label: 'Mega Millions' },
  { key: 'ga_cash4life', label: 'Cash4Life' },
  { key: 'ga_fantasy5',  label: 'Fantasy 5' },
];

type A = ReturnType<typeof analyzeGame>;

export default function AnalyzeSidebar() {
  const [data, setData] = useState<Record<GameKey, A | null>>({
    powerball: null, megamillions: null, ga_cash4life: null, ga_fantasy5: null,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string|null>(null);
  const [okCount, setOkCount] = useState(0);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setBusy(true); setErr(null);
        // Robust to per-game failures
        const settled = await Promise.allSettled(ORDER.map(async g => {
          const since = getCurrentEraConfig(g.key).start;
          const rows = await fetchRowsWithCache({ game: g.key, since });
          return [g.key, analyzeGame(rows, g.key)] as const;
        }));
        if (!alive) return;
        const next: Partial<Record<GameKey, A>> = {};
        let ok = 0;
        settled.forEach(r => {
          if (r.status === 'fulfilled') { const [k,v] = r.value; next[k] = v; ok++; }
        });
        setOkCount(ok);
        setData(prev => ({ ...prev, ...next }));
        if (ok === 0) setErr('No analysis available (data fetch failed).');
      } catch (e:any) {
        if (alive) setErr(e?.message || String(e));
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <aside aria-label="Analysis" className="card" style={{ position:'sticky', top: 8 }}>
      <div style={{ fontWeight:700, marginBottom: 8 }}>Analyze (All Games)</div>
      {err && <div className="hint" style={{ color:'var(--danger)' }}>{err}</div>}
      {!err && <div className="hint" aria-live="polite">Loaded {okCount}/4 games.</div>}
      {busy && <div className="hint">Analyzing…</div>}
      {!busy && ORDER.map(g => {
        const a = data[g.key];
        return (
          <div key={g.key} style={{ padding:'8px 0', borderTop:'1px solid var(--card-bd)' }}>
            <div style={{ fontWeight:600, marginBottom:4 }}>{g.label}</div>
            {a ? (
              <ul className="hint" style={{ margin:0, paddingLeft: 18 }}>
                <li><strong>Draws:</strong> {a.draws}</li>
                {a.eraCfg.specialMax>0 && (
                  <li><strong>Pick:</strong> mains <em>{a.recMain.mode}</em> (α={a.recMain.alpha.toFixed(2)}), special <em>{a.recSpec.mode}</em> (α={a.recSpec.alpha.toFixed(2)})</li>
                )}
                {a.eraCfg.specialMax===0 && (
                  <li><strong>Pick:</strong> mains <em>{a.recMain.mode}</em> (α={a.recMain.alpha.toFixed(2)})</li>
                )}
              </ul>
            ) : <div className="hint">Unavailable.</div>}
          </div>
        );
      })}
    </aside>
  );
}