'use client';
import { useEffect, useRef, useState } from 'react';
import {
  GameKey, analyzeGame, fetchRowsWithCache, getCurrentEraConfig, 
  jackpotOdds, fetchJackpotWithCache, formatJackpotAmount, nextRefreshAtNYFor,
} from '@lib/lotto';

const ORDER: { key: GameKey; label: string }[] = [
  { key: 'powerball',    label: 'Powerball' },
  { key: 'megamillions', label: 'Mega Millions' },
  { key: 'ga_cash4life', label: 'Cash4Life' },
  { key: 'ga_fantasy5',  label: 'Fantasy 5' },
];

type A = ReturnType<typeof analyzeGame>;
type J = Awaited<ReturnType<typeof fetchJackpotWithCache>>;

export default function AnalyzeSidebar() {
  const [data, setData] = useState<Record<GameKey, A | null>>({
    powerball: null, megamillions: null, ga_cash4life: null, ga_fantasy5: null,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string|null>(null);
  const [okCount, setOkCount] = useState(0);
  const [jackpots, setJackpots] = useState<Record<GameKey, J | null>>({
    powerball: null, megamillions: null, ga_cash4life: null, ga_fantasy5: null,
  });
  const timeoutsRef = useRef<Record<GameKey, number | null>>({
    powerball: null, megamillions: null, ga_cash4life: null, ga_fantasy5: null,
  });

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

  // Fetch jackpots (and refresh every 5 min or when tab regains focus)
  useEffect(() => {
    let alive = true;
    const loadAll = async () => {
      const settled = await Promise.allSettled(ORDER.map(g => fetchJackpotWithCache(g.key)));
      if (!alive) return;
      const next: Partial<Record<GameKey, J>> = {};
      settled.forEach((r, i) => {
        if (r.status === 'fulfilled') next[ORDER[i].key] = r.value;
      });
      setJackpots(prev => ({ ...prev, ...next }));
    };
    loadAll();
    const iv = setInterval(loadAll, 5 * 60 * 1000);
    const onVis = () => { if (document.visibilityState === 'visible') void loadAll(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { alive = false; clearInterval(iv); document.removeEventListener('visibilitychange', onVis); };
  }, []);

  return (

    // Initial jackpot load, then schedule per-game refresh a few hours after next drawing
  useEffect(() => {
    let alive = true;
    // helper: fetch all jackpots right now
    const loadAll = async () => {
      const settled = await Promise.allSettled(ORDER.map(g => fetchJackpotWithCache(g.key)));
      if (!alive) return;
      const next: Partial<Record<GameKey, J>> = {};
      settled.forEach((r, i) => { if (r.status === 'fulfilled') next[ORDER[i].key] = r.value; });
      setJackpots(prev => ({ ...prev, ...next }));
    };
    // helper: schedule a one-shot timer for a game
    const scheduleFor = (g: GameKey, hoursAfter = 3) => {
      // clear prior
      if (timeoutsRef.current[g] != null) { clearTimeout(timeoutsRef.current[g]!); timeoutsRef.current[g] = null; }
      const when = nextRefreshAtNYFor(g, hoursAfter).getTime();
      const delay = Math.max(0, when - Date.now());
      timeoutsRef.current[g] = window.setTimeout(async () => {
        // refresh just this game’s quote
        try {
          const q = await fetchJackpotWithCache(g);
          if (alive) setJackpots(prev => ({ ...prev, [g]: q }));
        } finally {
          // schedule again for the *following* drawing
          scheduleFor(g, hoursAfter);
        }
      }, delay);
    };
    // initial now
    void loadAll();
    // schedule for each game
    ORDER.forEach(x => scheduleFor(x.key, 3)); // 3 hours after draw; tweak per game if you like
    // also: if user returns to the tab well after a draw, refresh immediately
    const onVis = () => { if (document.visibilityState === 'visible') void loadAll(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      alive = false;
      document.removeEventListener('visibilitychange', onVis);
      ORDER.forEach(x => { if (timeoutsRef.current[x.key] != null) clearTimeout(timeoutsRef.current[x.key]!); });
    };
  }, []));
    
  return (
    <aside aria-label="Analysis" className="card" style={{ position:'sticky', top: 8 }}>
      <div style={{ fontWeight:700, marginBottom: 8 }}>Analysis (All Games)</div>
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
                <li><strong>Jackpot odds:</strong> {`1 in ${jackpotOdds(g.key).toLocaleString()}`}</li>
                <li>
                    <strong>Next jackpot:</strong>{' '}
                    {formatJackpotAmount(jackpots[g.key]?.amount ?? null)}
                    {jackpots[g.key]?.source && (
                    <span className="mono" style={{ marginLeft: 6, opacity: 0.6 }}>
                        (live)
                    </span>
                    )}
                </li>
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