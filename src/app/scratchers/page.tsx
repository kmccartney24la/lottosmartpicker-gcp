// app/scratchers/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import {
  fetchScratchersWithDelta,
  rankScratchers,
  DEFAULT_WEIGHTS,
  filters,
  sorters,
  type ActiveGame,
  type Weights,
  type SortKey,
} from 'lib/scratchers';

export default function ScratchersPage() {
  const [games, setGames] = useState<ActiveGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(undefined);

  // --- Filters & Sort ---
  const [q, setQ] = useState('');
  const [priceMin, setPriceMin] = useState<number>(1);
  const [priceMax, setPriceMax] = useState<number>(50);
  const [minTopAvail, setMinTopAvail] = useState<number>(0); // 0..1
  const [minTopRemain, setMinTopRemain] = useState<number>(0);
  const [lifecycle, setLifecycle] = useState<'all' | 'new' | 'continuing'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('best');

  // --- Weights (for "Best" score) ---
  const [w, setW] = useState<Weights>(DEFAULT_WEIGHTS);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { games, updatedAt } = await fetchScratchersWithDelta();
      setGames(games);
      setUpdatedAt(updatedAt);
      setLoading(false);
    })();
  }, []);

  const scored = useMemo(() => rankScratchers(games, w), [games, w]);

  const filtered = useMemo(() => {
    const fns = [
      filters.byPrice(priceMin, priceMax),
      filters.minTopPrizeAvailability(minTopAvail),
      filters.minTopPrizesRemaining(minTopRemain),
      filters.search(q),
      filters.lifecycle(lifecycle === 'all' ? undefined : lifecycle),
    ];
    return scored.filter(({ game }) => fns.every(fn => fn(game)));
  }, [scored, priceMin, priceMax, minTopAvail, minTopRemain, q, lifecycle]);

  const sorted = useMemo(() => {
    const sorter = sorters(sortKey, scored);
    return filtered.map(f => f.game).sort(sorter);
  }, [filtered, sortKey, scored]);

  return (
    <main>
      {/* Header with tabbar (same placement as home) */}
      <header style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>GA Scratchers</h1>
          {updatedAt && (
            <div className="hint" aria-live="polite" style={{ marginTop: 2 }}>
              Updated {new Date(updatedAt).toLocaleString()}
            </div>
          )}
        </div>
        <nav className="tabbar" aria-label="Primary">
          <Link className="btn" href="/" aria-selected="false">Draw Games</Link>
          <Link className="btn" href="/scratchers" aria-selected="true">GA Scratchers</Link>
        </nav>
      </header>

      <section className="grid" style={{ gridTemplateColumns: '300px 1fr' }}>
        {/* Left: sticky controls */}
        <aside className="card" style={{ position:'sticky', top:16, alignSelf:'start' }}>
          <div style={{ fontWeight:700, marginBottom:8 }}>Filters &amp; Sort</div>

          <label className="controls" style={{ display:'grid', gap:8 }}>
            <span>Search</span>
            <input value={q} onChange={e=>setQ(e.target.value)} placeholder="Name or Game #" />
          </label>

          <div className="grid" style={{ gridTemplateColumns:'1fr 1fr' }}>
            <label><span>Min Price</span>
              <input type="number" min={1} max={50} value={priceMin} onChange={e=>setPriceMin(Math.max(1, +e.target.value || 1))} />
            </label>
            <label><span>Max Price</span>
              <input type="number" min={1} max={50} value={priceMax} onChange={e=>setPriceMax(Math.max(1, +e.target.value || 50))} />
            </label>
          </div>

          <div className="grid" style={{ gridTemplateColumns:'1fr 1fr' }}>
            <label>
              <span>Min Top-Prize %</span>
              <input
                type="number"
                min={0} max={100}
                value={Math.round(minTopAvail * 100)}
                onChange={(e) => setMinTopAvail(Math.min(1, Math.max(0, (+e.target.value || 0) / 100)))}
              />
            </label>
            <label>
              <span>Min Top-Prizes Left</span>
              <input
                type="number"
                min={0}
                value={minTopRemain}
                onChange={(e) => setMinTopRemain(Math.max(0, +e.target.value || 0))}
              />
            </label>
          </div>

          <label><span>Status</span>
            <select
              value={lifecycle}
              onChange={(e)=>setLifecycle(e.target.value as 'all'|'new'|'continuing')}
            >
              <option value="all">All active</option>
              <option value="new">New only</option>
              <option value="continuing">Continuing only</option>
            </select>
          </label>

          <label><span>Sort by</span>
            <select value={sortKey} onChange={e=>setSortKey(e.target.value as SortKey)}>
              <option value="best">Best value (score)</option>
              <option value="adjusted">Adjusted odds</option>
              <option value="odds">Printed odds</option>
              <option value="topPrizeValue">Top prize $</option>
              <option value="topPrizesRemain">Top prizes remaining</option>
              <option value="price">Ticket price</option>
              <option value="launch">Launch date</option>
            </select>
          </label>

          {/* Weights */}
          <div style={{ marginTop:12, fontWeight:700 }}>Weights</div>
          {(
            [
              ['w_jackpot','Top prize $'],
              ['w_prizes','Top-prize availability %'],
              ['w_odds','Odds (1 / adjusted)'],
              ['w_price','Price (penalty)'],
              // w_value retained for compatibility but unused in current shape
            ] as [keyof Weights, string][]
          ).map(([k, label]) => (
            <label key={k}><span>{label}: {Number.isFinite(DEFAULT_WEIGHTS[k] as number) ? w[k].toFixed(2) : String(w[k])}</span>
              <input
                type="range"
                min={0} max={1} step={0.01}
                value={Number(w[k])}
                onChange={e=>setW({...w, [k]: +e.target.value})}
              />
            </label>
          ))}
          <button className="btn btn-ghost" onClick={()=>setW(DEFAULT_WEIGHTS)} style={{ marginTop:8 }}>
            Reset weights
          </button>
        </aside>

        {/* Right: results grid */}
        <section
          className="grid"
          style={{ gridTemplateColumns:'repeat(auto-fill, minmax(260px,1fr))' }}
          aria-busy={loading}
        >
          {loading && <div className="card">Loading scratchers…</div>}
          {!loading && sorted.map(g => <ScratcherCard key={g.gameNumber} g={g} />)}
          {!loading && sorted.length === 0 && <div className="card">No games match your filters.</div>}
        </section>
      </section>
    </main>
  );
}

function pctTopPrizesRemain(g: ActiveGame): number {
  const orig = g.topPrizesOriginal ?? 0;
  const rem  = g.topPrizesRemaining ?? 0;
  if (orig <= 0) return 0;
  return rem / orig;
}

function bar(pct: number) {
  const clamped = Math.max(0, Math.min(1, pct));
  return (
    <div style={{ height: 6, background: 'var(--card-bd)', borderRadius: 999 }}>
      <div style={{ width: `${clamped*100}%`, height: 6, borderRadius: 999, background: 'var(--accent)' }} />
    </div>
  );
}

function ScratcherCard({ g }: { g: ActiveGame }) {
  const [open, setOpen] = useState(false);
  const pctRemain = pctTopPrizesRemain(g);

  return (
    <article className="card" aria-expanded={open}>
      <div style={{ display:'flex', justifyContent:'space-between', gap:8 }}>
        <div>
          <div style={{ fontWeight:700, lineHeight:1.2 }}>
            {g.name}{' '}
            {g.lifecycle === 'new' && (
              <span className="pill" aria-label="New game" title="New game">New</span>
            )}
          </div>
          <div className="hint">
            #{g.gameNumber} • {g.price ? `$${g.price}` : '$—'} ticket •{' '}
            {g.overallOdds ? `1 in ${g.overallOdds}` : '—'} odds
          </div>
          {g.adjustedOdds && g.overallOdds && (
            <div className="hint">Adjusted: 1 in {g.adjustedOdds.toFixed(1)} • Printed: 1 in {g.overallOdds}</div>
          )}
        </div>
        <button className="btn" onClick={()=>setOpen(o=>!o)} aria-label={open ? 'Collapse details' : 'Expand details'}>
          {open ? 'Hide' : 'Details'}
        </button>
      </div>

      <div style={{ marginTop:8 }}>
        <div className="hint" style={{ marginBottom:4 }}>
          Top-prize availability
        </div>
        <div aria-label={`${Math.round(pctRemain*100)}% top prizes remaining`}>
          {bar(pctRemain)}
        </div>
      </div>

      {/* Compact “top prize” summary that matches available fields */}
      <div className="compact" style={{ marginTop:8 }}>
        <table>
          <thead>
            <tr>
              <th>Top prize</th>
              <th className="mono" style={{ textAlign:'right' }}>Remain</th>
              <th className="mono" style={{ textAlign:'right' }}>Original</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>{g.topPrizeValue ? `$${g.topPrizeValue.toLocaleString()}` : '—'}</td>
              <td className="mono" style={{ textAlign:'right' }}>
                {(g.topPrizesRemaining ?? 0).toLocaleString()}
              </td>
              <td className="mono" style={{ textAlign:'right' }}>
                {(g.topPrizesOriginal ?? 0).toLocaleString()}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {open && (
        <div className="compact" style={{ marginTop:8 }}>
          <table>
            <thead>
              <tr>
                <th>Images</th>
                <th className="mono" style={{ textAlign:'right' }}>Link</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Ticket</td>
                <td className="mono" style={{ textAlign:'right' }}>
                  {g.ticketImageUrl
                    ? <a href={g.ticketImageUrl} target="_blank" rel="noreferrer">Open</a>
                    : '—'}
                </td>
              </tr>
              <tr>
                <td>Odds</td>
                <td className="mono" style={{ textAlign:'right' }}>
                  {g.oddsImageUrl
                    ? <a href={g.oddsImageUrl} target="_blank" rel="noreferrer">Open</a>
                    : '—'}
                </td>
              </tr>
              {g.startDate && (
                <tr>
                  <td>Launch</td>
                  <td className="mono" style={{ textAlign:'right' }}>{g.startDate}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}
