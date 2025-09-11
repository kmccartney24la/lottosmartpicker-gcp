// app/scratchers/page.tsx
'use client';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  fetchScratchersWithCache,
  rankScratchers,
  DEFAULT_WEIGHTS,
  filters,
  sorters,
  type ScratcherGame,
  type Weights,
  type SortKey
} from 'lib/scratchers';

export default function ScratchersPage() {
  const [games, setGames] = useState<ScratcherGame[]>([]);
  const [loading, setLoading] = useState(false);

  // Filters / sorts
  const [priceMin, setPriceMin] = useState(1);
  const [priceMax, setPriceMax] = useState(50);
  const [activeOnly, setActiveOnly] = useState(true);
  const [minJackpot, setMinJackpot] = useState(0);
  const [minPct, setMinPct] = useState(0); // 0..1
  const [q, setQ] = useState('');
  const [sortKey, setSortKey] = useState<SortKey>('best');

  // Weights
  const [w, setW] = useState<Weights>(DEFAULT_WEIGHTS);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setGames(await fetchScratchersWithCache({ activeOnly: false }));
      setLoading(false);
    })();
  }, []);

  const scored = useMemo(() => rankScratchers(games, w), [games, w]);
  const filtered = useMemo(() => {
    const fns = [
      filters.byPrice(priceMin, priceMax),
      filters.activeOnly(activeOnly),
      filters.minJackpotRemaining(minJackpot),
      filters.minPercentRemaining(minPct),
      filters.search(q),
    ];
    return scored
      .map(s => s) // keep parts for tooltips
      .filter(({ game }) => fns.every(fn => fn(game)));
  }, [scored, priceMin, priceMax, activeOnly, minJackpot, minPct, q]);

  const sorted = useMemo(() => {
    const plain = filtered.map(f => f.game);
    const sorter = sorters(sortKey, scored);
    return plain.sort(sorter);
  }, [filtered, sortKey, scored]);

  return (
    <main>
      {/* Header with tabbar (same placement as home) */}
      <header style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <h1 style={{ fontSize: 26, fontWeight: 800 }}>GA Scratchers</h1>
        <nav className="tabbar" aria-label="Primary">
          <Link className="btn" href="/" aria-selected="false">Draw Games</Link>
          <Link className="btn" href="/scratchers" aria-selected="true">GA Scratchers</Link>
        </nav>
      </header>

      <section className="grid" style={{ gridTemplateColumns: '300px 1fr' }}>
        {/* Left: sticky controls */}
        <aside className="card" style={{ position:'sticky', top:16, alignSelf:'start' }}>
          <div style={{ fontWeight:700, marginBottom:8 }}>Filters & Sort</div>

          <label className="controls" style={{ display:'grid', gap:8 }}>
            <span>Search</span>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Name or Game ID" />
          </label>

          <div className="grid" style={{ gridTemplateColumns:'1fr 1fr' }}>
            <label><span>Min Price</span><input type="number" min={1} max={50} value={priceMin} onChange={e=>setPriceMin(+e.target.value||1)} /></label>
            <label><span>Max Price</span><input type="number" min={1} max={50} value={priceMax} onChange={e=>setPriceMax(+e.target.value||50)} /></label>
          </div>

          <div className="grid" style={{ gridTemplateColumns:'1fr 1fr' }}>
            <label><span>Min Jackpots</span><input type="number" min={0} value={minJackpot} onChange={e=>setMinJackpot(+e.target.value||0)} /></label>
            <label><span>Min % Remaining (all)</span><input type="number" min={0} max={100} value={Math.round(minPct*100)} onChange={e=>setMinPct(Math.min(1, Math.max(0, (+e.target.value||0)/100)))} /></label>
          </div>

          <label><span>Status</span>
            <select value={activeOnly ? 'active' : 'all'} onChange={e=>setActiveOnly(e.target.value==='active')}>
              <option value="active">Active only</option>
              <option value="all">All games</option>
            </select>
          </label>

          <label><span>Sort by</span>
            <select value={sortKey} onChange={e=>setSortKey(e.target.value as any)}>
              <option value="best">Best value (score)</option>
              <option value="%remaining">% prizes remaining</option>
              <option value="jackpot">Jackpot remaining</option>
              <option value="odds">Overall odds</option>
              <option value="price">Ticket price</option>
              <option value="launch">Launch date</option>
            </select>
          </label>

          {/* Weights */}
          <div style={{ marginTop:12, fontWeight:700 }}>Weights</div>
          {(
            [
              ['w_jackpot','Jackpot weight'],
              ['w_value','Total prize value remaining'],
              ['w_prizes','% prizes remaining'],
              ['w_odds','Overall odds'],
              ['w_price','Price (penalty)'],
            ] as [keyof Weights, string][]
          ).map(([k, label]) => (
            <label key={k}><span>{label}: {w[k].toFixed(2)}</span>
              <input type="range" min={0} max={1} step={0.01} value={w[k]} onChange={e=>setW({...w, [k]: +e.target.value})} />
            </label>
          ))}
          <button className="btn btn-ghost" onClick={()=>setW(DEFAULT_WEIGHTS)} style={{ marginTop:8 }}>Reset weights</button>
        </aside>

        {/* Right: results grid */}
        <section
            className="grid"
            style={{ gridTemplateColumns:'repeat(auto-fill, minmax(260px,1fr))' }}
            aria-busy={loading}
        >
          {loading && <div className="card">Loading scratchers…</div>}
          {!loading && sorted.map(g => <ScratcherCard key={g.gameId} g={g} />)}
          {!loading && sorted.length === 0 && <div className="card">No games match your filters.</div>}
        </section>
      </section>
    </main>
  );
}

function bar(pct: number) {
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div style={{ height: 6, background: 'var(--card-bd)', borderRadius: 999 }}>
      <div style={{ width: `${clamped*100}%`, height: 6, borderRadius: 999, background: 'var(--accent)' }} />
    </div>
  );
}

function ScratcherCard({ g }: { g: import('lib/scratchers').ScratcherGame }) {
  const [open, setOpen] = useState(false);
  const pctRemain = g.totalPrizesRemaining / Math.max(1, g.totalPrizesStart);
  return (
    <article className="card" aria-expanded={open}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
        <div>
          <div style={{ fontWeight:700, lineHeight:1.2 }}>{g.name}</div>
          <div className="hint">#{g.gameId} • ${g.price} ticket • {g.overallOdds ? `1 in ${g.overallOdds}` : '—'} odds</div>
        </div>
        <button className="btn" onClick={()=>setOpen(o=>!o)} aria-label="Expand prize tiers">{open ? 'Hide' : 'Expand'}</button>
      </div>

      <div style={{ marginTop:8 }}>
        <div className="hint" style={{ marginBottom:4 }}>% prizes remaining</div>
        {bar(pctRemain)}
      </div>

      {/* Compact top tiers */}
      <div className="compact" style={{ marginTop:8 }}>
        <table>
        <thead><tr><th>Tier</th><th className="mono" style={{ textAlign:'right' }}>Remain</th></tr></thead>
        <tbody>
          {g.tiers
            .slice() // copy
            .sort((a,b)=> b.prizeValue - a.prizeValue)
            .slice(0,3)
            .map(t => (
            <tr key={t.name}>
              <td>${t.prizeValue.toLocaleString()}</td>
              <td className="mono" style={{ textAlign:'right' }}>{t.remainingCount.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
    </table>
</div>
      {open && (
        <div className="compact" style={{ marginTop:8 }}>
           <table>
            <thead><tr><th>Prize</th><th className="mono" style={{ textAlign:'right' }}>Total</th><th className="mono" style={{ textAlign:'right' }}>Remain</th></tr></thead>
            <tbody>
              {g.tiers
                .slice().sort((a,b)=> b.prizeValue - a.prizeValue)
                .map(t => (
                <tr key={t.name}>
                  <td>${t.prizeValue.toLocaleString()}</td>
                  <td className="mono" style={{ textAlign:'right' }}>{t.totalCount.toLocaleString()}</td>
                  <td className="mono" style={{ textAlign:'right' }}>{t.remainingCount.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
