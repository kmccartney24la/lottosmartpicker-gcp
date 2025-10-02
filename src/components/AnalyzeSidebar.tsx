// src/components/AnalyzeSidebar.tsx
'use client';
import { useEffect, useState } from 'react';
import {
  GameKey, analyzeGame, fetchRowsWithCache, getCurrentEraConfig,
  jackpotOdds,
} from '@lib/lotto';

const ORDER: { key: GameKey; label: string }[] = [
  { key: 'multi_powerball',    label: 'Powerball' },
  { key: 'multi_megamillions', label: 'Mega Millions' },
  { key: 'multi_cash4life', label: 'Cash4Life' },
  { key: 'ga_fantasy5',  label: 'Fantasy 5' },
];

type A = ReturnType<typeof analyzeGame>;

export default function AnalyzeSidebar() {
  const [data, setData] = useState<Record<Exclude<GameKey,'ga_scratchers'>, A | null>>({
    multi_powerball: null, multi_megamillions: null, multi_cash4life: null, ga_fantasy5: null,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string|null>(null);
  const [okCount, setOkCount] = useState(0);

  // Load per-game analysis (current era only)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setBusy(true); setErr(null);
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
    <section className="card analyze-sidebar ticket-grid" role="note" aria-label="Analysis">
      <div className="card-title">Analysis (All Games)</div>
      {err && <div className="analyze-error">{err}</div>}
      {busy && <div className="analyze-loading">Analyzing…</div>}
      {!busy && !err && <div className="analyze-status" aria-live="polite">Loaded {okCount}/4 games.</div>}
      <div className="analyze-games">
        {!busy && ORDER.map(g => {
          const a = data[g.key];
          return (
            <div key={g.key} className="analyze-game">
              <div className="analyze-game-title">{g.label}</div>
              {a ? (
                <div className="analyze-game-details card-content-text">
                  <div className="analyze-detail">
                    <span className="analyze-label">Past draws:</span>
                    <span className="analyze-value mono">{a.draws}</span>
                  </div>
                  <div className="analyze-detail">
                    <span className="analyze-label">Jackpot odds:</span>
                    <span className="analyze-value mono">1 in {jackpotOdds(g.key).toLocaleString()}</span>
                  </div>
                  <div className="analyze-detail analyze-recommendation">
                    <span className="analyze-label">Recommended:</span>
                    <span className="analyze-value mono">
                      mains <em>{a.recMain.mode}</em> (α={a.recMain.alpha.toFixed(2)})
                      {a.eraCfg.specialMax > 0 && (
                        <>, special <em>{a.recSpec.mode}</em> (α={a.recSpec.alpha.toFixed(2)})</>
                      )}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="analyze-unavailable">Unavailable.</div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

