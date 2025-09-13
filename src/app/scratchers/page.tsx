// app/scratchers/page.tsx
'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

/** --- Types that mirror /data/ga_scratchers/index.latest.json --- */
type ActiveGame = {
  gameNumber: number;
  name: string;
  price?: number;
  topPrizeValue?: number;
  topPrizesOriginal?: number;
  topPrizesRemaining?: number;
  overallOdds?: number | null;
  adjustedOdds?: number | null;
  startDate?: string;
  oddsImageUrl?: string;
  ticketImageUrl?: string;
  updatedAt: string;
  lifecycle?: 'new' | 'continuing';
};

type IndexPayload = {
  updatedAt: string;
  count: number;
  games: ActiveGame[];
};

type SortKey =
  | 'best'            // price desc, then adjusted asc, then printed asc (matches generator’s stable sort)
  | 'adjusted'
  | 'odds'
  | 'price'
  | 'topPrizeValue'
  | 'topPrizesRemain'
  | '%topAvail'
  | 'name';

export default function ScratchersPage() {
  const [games, setGames] = useState<ActiveGame[]>([]);
  const [loading, setLoading] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<string | undefined>(undefined);

  // --- Filters & Sort ---
  const [q, setQ] = useState('');
  const [priceMin, setPriceMin] = useState<number>(1);
  const [priceMax, setPriceMax] = useState<number>(50);
  const [minTopAvail, setMinTopAvail] = useState<number>(0);    // 0..1
  const [minTopRemain, setMinTopRemain] = useState<number>(0);  // integer
  const [lifecycle, setLifecycle] = useState<'all'|'new'|'continuing'>('all');
  const [sortKey, setSortKey] = useState<SortKey>('best');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        // Load the R2-published JSON (no-cache to keep it fresh)
        const res = await fetch('/data/ga_scratchers/index.latest.json', { cache: 'no-store' });
        if (!res.ok) throw new Error(`scratchers ${res.status}`);
        const payload: IndexPayload = await res.json();
        setGames(payload.games || []);
        setUpdatedAt(payload.updatedAt);
      } catch (err) {
        console.error(err);
        setGames([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  /** Helpers */
  const pctTopPrizesRemain = (g: ActiveGame) => {
    const orig = g.topPrizesOriginal ?? 0;
    const rem = g.topPrizesRemaining ?? 0;
    return orig > 0 ? rem / orig : 0;
  };

  /** Filtering */
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    return games.filter((g) => {
      if (g.price != null && (g.price < priceMin || g.price > priceMax)) return false;
      if (lifecycle !== 'all' && g.lifecycle !== lifecycle) return false;

      const pct = pctTopPrizesRemain(g);
      if (pct < minTopAvail) return false;
      if ((g.topPrizesRemaining ?? 0) < minTopRemain) return false;

      if (s) {
        const hay = `${g.name} ${g.gameNumber}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [games, q, priceMin, priceMax, lifecycle, minTopAvail, minTopRemain]);

  /** Sorting */
  const sorted = useMemo(() => {
    const out = filtered.slice();
    out.sort((a, b) => {
      const adjA = a.adjustedOdds ?? Infinity;
      const adjB = b.adjustedOdds ?? Infinity;
      const odA = a.overallOdds ?? Infinity;
      const odB = b.overallOdds ?? Infinity;
      const pA = a.price ?? -Infinity;
      const pB = b.price ?? -Infinity;
      const tpvA = a.topPrizeValue ?? -Infinity;
      const tpvB = b.topPrizeValue ?? -Infinity;
      const remA = a.topPrizesRemaining ?? -Infinity;
      const remB = b.topPrizesRemaining ?? -Infinity;
      const pctA = pctTopPrizesRemain(a);
      const pctB = pctTopPrizesRemain(b);

      switch (sortKey) {
        case 'best':
          // Mirrors generator’s “stable sort” idea: price ↓, adjusted ↑, printed ↑, id ↑
          if (pA !== pB) return pB - pA;
          if (adjA !== adjB) return adjA - adjB;
          if (odA !== odB) return odA - odB;
          return a.gameNumber - b.gameNumber;

        case 'adjusted':       return adjA === adjB ? a.gameNumber - b.gameNumber : adjA - adjB;      // asc (lower = better)
        case 'odds':           return odA === odB   ? a.gameNumber - b.gameNumber : odA - odB;        // asc
        case 'price':          return pA === pB     ? a.gameNumber - b.gameNumber : pB - pA;          // desc
        case 'topPrizeValue':  return tpvA === tpvB ? a.gameNumber - b.gameNumber : tpvB - tpvA;      // desc
        case 'topPrizesRemain':return remA === remB ? a.gameNumber - b.gameNumber : remB - remA;      // desc
        case '%topAvail':      return pctA === pctB ? a.gameNumber - b.gameNumber : pctB - pctA;      // desc
        case 'name': default:  return a.name.localeCompare(b.name);
      }
    });
    return out;
  }, [filtered, sortKey]);

  return (
    <main>
      {/* Header with tabbar */}
      <header style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>GA Scratchers</h1>
          {updatedAt && (
            <div className="hint" aria-live="polite" style={{ marginTop: 2 }}>
              Updated {updatedAt}
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
          <div style={{ fontWeight:700, marginBottom:8 }}>Filters & Sort</div>

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
              <option value="best">Best (price ↓ then adjusted ↑)</option>
              <option value="adjusted">Adjusted odds (lower=better)</option>
              <option value="odds">Printed odds (lower=better)</option>
              <option value="price">Ticket price</option>
              <option value="topPrizeValue">Top prize $</option>
              <option value="topPrizesRemain">Top prizes remaining</option>
              <option value="%topAvail">% top-prizes remaining</option>
              <option value="name">Name (A→Z)</option>
            </select>
          </label>
        </aside>

        {/* Right: results table */}
        <section className="card" aria-busy={loading} style={{ overflowX:'auto' }}>
          {loading && <div>Loading scratchers…</div>}
          {!loading && sorted.length === 0 && <div>No games match your filters.</div>}

          {!loading && sorted.length > 0 && (
            <table className="compact" role="table" aria-label="GA Scratchers comparison">
              <thead>
                <tr>
                  <th style={{ minWidth: 220, textAlign:'left' }}>Name</th>
                  <th className="mono" style={{ textAlign:'right' }}>Game #</th>
                  <th className="mono" style={{ textAlign:'right' }}>Price</th>
                  <th className="mono" style={{ textAlign:'right' }}>Adjusted odds</th>
                  <th className="mono" style={{ textAlign:'right' }}>Printed odds</th>
                  <th className="mono" style={{ textAlign:'right' }}>Top prize</th>
                  <th className="mono" style={{ textAlign:'right' }}>Remain / Orig</th>
                  <th className="mono" style={{ textAlign:'right' }}>% Top-prize left</th>
                  <th>Lifecycle</th>
                </tr>
              </thead>
              <tbody>
                {sorted.map((g) => {
                  const pct = pctTopPrizesRemain(g);
                  return (
                    <tr key={g.gameNumber}>
                      <td style={{ whiteSpace:'nowrap' }}>
                        <div style={{ fontWeight:700, lineHeight:1.2 }}>
                          {g.name}{' '}
                          {g.lifecycle === 'new' && (
                            <span className="pill" title="New game">New</span>
                          )}
                        </div>
                        <div className="hint" style={{ marginTop:2 }}>
                          {g.startDate ? `Launch: ${g.startDate}` : ''}
                          {g.ticketImageUrl ? (
                            <>
                              {' '}&middot; <a href={g.ticketImageUrl} target="_blank" rel="noreferrer">Ticket</a>
                            </>
                          ) : null}
                          {g.oddsImageUrl ? (
                            <>
                              {' '}&middot; <a href={g.oddsImageUrl} target="_blank" rel="noreferrer">Odds img</a>
                            </>
                          ) : null}
                        </div>
                      </td>
                      <td className="mono" style={{ textAlign:'right' }}>{g.gameNumber}</td>
                      <td className="mono" style={{ textAlign:'right' }}>{g.price != null ? `$${g.price}` : '—'}</td>
                      <td className="mono" style={{ textAlign:'right' }}>
                        {g.adjustedOdds != null ? `1 in ${Number(g.adjustedOdds).toFixed(2)}` : '—'}
                      </td>
                      <td className="mono" style={{ textAlign:'right' }}>
                        {g.overallOdds != null ? `1 in ${g.overallOdds}` : '—'}
                      </td>
                      <td className="mono" style={{ textAlign:'right' }}>
                        {g.topPrizeValue != null ? `$${g.topPrizeValue.toLocaleString()}` : '—'}
                      </td>
                      <td className="mono" style={{ textAlign:'right' }}>
                        {(g.topPrizesRemaining ?? 0).toLocaleString()} / {(g.topPrizesOriginal ?? 0).toLocaleString()}
                      </td>
                      <td className="mono" style={{ textAlign:'right' }}>
                        {`${Math.round(pct * 100)}%`}
                      </td>
                      <td>{g.lifecycle ? (g.lifecycle[0].toUpperCase() + g.lifecycle.slice(1)) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </section>
    </main>
  );
}
