// app/scratchers/page.tsx
'use client';
import { useMemo, useState, useEffect } from 'react';
import ThemeSwitcher from 'src/components/ThemeSwitcher';
import FiltersPanel, { type Filters } from 'src/components/scratchers/FiltersPanel';
import ScratchersTable from 'src/components/scratchers/ScratchersTable';
import { useScratchersIndex } from 'src/components/scratchers/useScratchersIndex';
import type { ActiveGame, SortKey } from 'src/components/scratchers/types';
import DisplayModeSwitcher, { type DisplayMode } from 'src/components/scratchers/DisplayModeSwitcher';

const LS_SHOW_ODDS = 'lsp.showOddsByDefault';

export default function ScratchersPage() {
  const { games, updatedAt, loading } = useScratchersIndex();

  // filters/sort state
  const [filters, setFilters] = useState<Filters>({
    q: '',
    priceMin: 1,
    priceMax: 50,
    minTopAvail: 0,
    minTopRemain: 0,
    lifecycle: 'all',
    sortKey: 'best',
    updatedAt,
  });

  const [displayMode, setDisplayMode] = useState<DisplayMode>('detailed');
  type ThumbKind = 'ticket' | 'odds';
  const LS_GLOBAL_IMG = 'lsp.globalImageKind';
  const [globalImageKind, setGlobalImageKind] = useState<ThumbKind>(() => {
    if (typeof window === 'undefined') return 'ticket';
    const v = localStorage.getItem(LS_GLOBAL_IMG);
    return v === 'odds' ? 'odds' : 'ticket';
  });

  const LS_SHOW_ODDS = 'lsp.showOddsByDefault';
  const [showOddsByDefault, setShowOddsByDefault] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(LS_SHOW_ODDS) === '1';
  });

  // keep updatedAt in panel when it arrives (no mutation during render)
  useEffect(() => {
    setFilters(prev => (prev.updatedAt === updatedAt ? prev : { ...prev, updatedAt }));
  }, [updatedAt]);

  const pctTopPrizesRemain = (g: ActiveGame) => {
    const orig = g.topPrizesOriginal ?? 0;
    const rem  = g.topPrizesRemaining ?? 0;
    return orig > 0 ? rem / orig : 0;
  };

  const filtered = useMemo(() => {
    const s = filters.q.trim().toLowerCase();
    return games.filter((g) => {
      if (g.price != null && (g.price < filters.priceMin || g.price > filters.priceMax)) return false;
      if (filters.lifecycle !== 'all' && g.lifecycle !== filters.lifecycle) return false;

      const orig = g.topPrizesOriginal ?? 0;
      const rem  = g.topPrizesRemaining ?? 0;
      const pct  = orig > 0 ? rem / orig : 0;
      if (pct < filters.minTopAvail) return false;
      if (rem < filters.minTopRemain) return false;

      if (s) {
        const hay = `${g.name} ${g.gameNumber}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [games, filters]);

  const sorted = useMemo(() => {
    const out = filtered.slice();
    const key: SortKey = filters.sortKey;
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

      switch (key) {
        case 'best':
          if (pA !== pB) return pB - pA;
          if (adjA !== adjB) return adjA - adjB;
          if (odA !== odB) return odA - odB;
          return a.gameNumber - b.gameNumber;
        case 'adjusted':       return adjA === adjB ? a.gameNumber - b.gameNumber : adjA - adjB;
        case 'odds':           return odA === odB   ? a.gameNumber - b.gameNumber : odA - odB;
        case 'price':          return pA === pB     ? a.gameNumber - b.gameNumber : pB - pA;
        case 'topPrizeValue':  return tpvA === tpvB ? a.gameNumber - b.gameNumber : tpvB - tpvA;
        case 'topPrizesRemain':return remA === remB ? a.gameNumber - b.gameNumber : remB - remA;
        case '%topAvail':      return pctA === pctB ? a.gameNumber - b.gameNumber : pctB - pctA;
        case 'name': default:  return a.name.localeCompare(b.name);
      }
    });
    return out;
  }, [filtered, filters.sortKey]);

  return (
    <main>
      <div data-binder-tabs>
        <header style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0 }}>LottoSmartPicker 9000</h1>
            <nav
              className="tabbar"
              aria-label="Primary"
              role="tablist"
            >
              <a className="btn" href="/" role="tab" aria-selected="false" tabIndex={-1}>Draw Games</a>
              <a className="btn" href="/scratchers" role="tab" aria-selected="true" aria-controls="binder-panel">GA Scratchers</a>
            </nav>
          </div>
          <div className="controls header-controls" style={{ gap: 8 }}>
            {displayMode === 'expanded' && (
              <label title="Swap all thumbnails between Ticket and Odds">
                <span>Images</span><br/>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => {
                    setGlobalImageKind(prev => {
                      const next = prev === 'odds' ? 'ticket' : 'odds';
                      if (typeof window !== 'undefined') localStorage.setItem(LS_GLOBAL_IMG, next);
                      return next;
                    });
                  }}
                >
                  {globalImageKind === 'odds' ? 'Show tickets' : 'Show odds'}
                </button>
              </label>
            )}

            <DisplayModeSwitcher value={displayMode} onChange={setDisplayMode} />
            <ThemeSwitcher />
            </div>
        </header>
    </div>
      <section id="binder-panel" role="tabpanel" className="grid" style={{ gridTemplateColumns:'260px 1fr', gap:'var(--stack-gap)' }}>
        <FiltersPanel
          {...filters}
          onChange={(patch) => setFilters(prev => ({ ...prev, ...patch }))}
        />
        <section className="card" aria-busy={loading}>
          <ScratchersTable
            games={sorted}
            loading={loading}
            displayMode={displayMode}
            globalImageKind={globalImageKind}
          />
        </section>
      </section>
    </main>
  );
}
