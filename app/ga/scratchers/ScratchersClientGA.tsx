// app/ga/scratchers/ScratchersClient.tsx

'use client';
/* eslint-disable no-console */
import { useMemo, useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import FiltersPanel, { type Filters } from 'src/components/scratchers/FiltersPanel';
import ScratchersTable from 'src/components/scratchers/ScratchersTable';
import { useScratchersIndex } from 'src/components/scratchers/useScratchersIndex';
import type { ActiveGame, SortKey } from 'src/components/scratchers/types';
import type { DisplayMode } from 'src/components/scratchers/DisplayModeSwitcher';
import { useIsMobile, useDrawerMode } from 'packages/lib/breakpoints';
import { comparators } from 'src/components/scratchers/sort';

const LS_SHOW_ODDS = 'lsp.showOddsByDefault';
const AdsLot = dynamic(() => import('src/components/ads/AdsLot'), { ssr: false });

export default function ScratchersClient() {
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const { games, updatedAt, loading } = useScratchersIndex();
  const isMobile = useIsMobile();
  const drawerPref = useDrawerMode();
  const [adMode, setAdMode] = useState<'desktop'|'laptop'|'column'>('desktop');
  const [filtersMode, setFiltersMode] = useState<'panel'|'drawer'>(drawerPref || isMobile ? 'drawer' : 'panel');
  const [containerView, setContainerView] = useState<'table'|'cards'>('table');
  useEffect(() => {
    const el = shellRef.current; if (!el) return;
    const num = (v: string | null, fb: number) => v ? (Number.parseFloat(v) || fb) : fb;
    const applyStage = (mode: 'desktop'|'laptop'|'column', filters: 'panel'|'drawer', view: 'table'|'cards') => {
      if (adMode !== mode) setAdMode(mode);
      if (filtersMode !== filters) setFiltersMode(filters);
      if (containerView !== view) setContainerView(view);
      el.setAttribute('data-ad-mode', mode);
      el.setAttribute('data-filters', filters);
      el.setAttribute('data-view', view);
    };
    const hasHorizOverflow = () => {
      const tol = Math.max(6, (window.devicePixelRatio || 1));
      const delta = (node: HTMLElement | null) => node ? Math.ceil(node.scrollWidth) - Math.ceil(node.clientWidth) : 0;
      const card = el.querySelector('.layout-grid.sidebar-content > .card') as HTMLElement | null;
      const tbl  = el.querySelector('.scratchers-table') as HTMLElement | null;
      const diff = Math.max(delta(card), delta(tbl));
      if (diff > tol) return true;
      const center = el.querySelector('.rails-center') as HTMLElement | null;
      if (center && center.clientWidth < 980) return true;
      return false;
    };
    const update = () => {
      const w = el.clientWidth;
      if (w >= 1024 && w <= 1384) {
        el.setAttribute('data-band', 'tablet');
        el.setAttribute('data-allow-center-rect', 'on');
      } else {
        el.removeAttribute('data-band');
        el.removeAttribute('data-allow-center-rect');
      }
      const cs = getComputedStyle(el);
      const thDesktop = num(cs.getPropertyValue('--th-desktop'), 1700);
      const thLaptop  = num(cs.getPropertyValue('--th-laptop'), 1385);
      const thColumn  = num(cs.getPropertyValue('--th-column'), 1200);
      const thDrawer  = num(cs.getPropertyValue('--th-drawer'),  900);
      const thCards   = num(cs.getPropertyValue('--th-cards'),   768);
      if (w >= thDesktop)      { applyStage('desktop','panel','table'); }
      else if (w >= thLaptop)  { applyStage('laptop','panel','table'); }
      else if (w >= thColumn)  { applyStage('column','panel','table'); }
      else if (w >= thDrawer)  { applyStage('column','drawer','table'); }
      else                     { applyStage('column','drawer','cards'); }
      if (hasHorizOverflow()) {
        const keepFilters: 'panel'|'drawer' = w >= thColumn ? 'panel' : 'drawer';
        const keepView: 'table'|'cards' = w < thCards ? 'cards' : 'table';
        applyStage('column', keepFilters, keepView);
      }
    };
    const ro = new ResizeObserver(() => update());
    update(); ro.observe(el); return () => ro.disconnect();
  }, [drawerPref, isMobile, adMode, filtersMode, containerView]);

  const [filters, setFilters] = useState<Filters>({
    q: '', priceMin: 1, priceMax: 50, minTopAvail: 0, minTopRemain: 0, lifecycle: 'all', sortKey: 'best', updatedAt,
  });
  const [displayMode, setDisplayMode] = useState<DisplayMode>('detailed');
  const [showFilters, setShowFilters] = useState<boolean>(false);
  const [isSortReversed, setIsSortReversed] = useState<boolean>(false);
  const LS_GLOBAL_IMG = 'lsp.globalImageKind';
  type ThumbKind = 'ticket' | 'odds';
  const [globalImageKind, setGlobalImageKind] = useState<ThumbKind>('ticket');
  useEffect(() => { const v = localStorage.getItem(LS_GLOBAL_IMG); if (v === 'odds') setGlobalImageKind('odds'); }, []);
  const maxPriceFromGames = useMemo(() => {
    let max = -Infinity;
    for (const g of games) { if (typeof g.price === 'number' && Number.isFinite(g.price)) { if (g.price > max) max = g.price; } }
    return Number.isFinite(max) ? max : 50;
  }, [games]);
  useEffect(() => { setFilters(prev => (prev.updatedAt === updatedAt ? prev : { ...prev, updatedAt })); }, [updatedAt]);
  useEffect(() => {
    if (!games.length) return;
    setFilters(prev => {
      const ceil = maxPriceFromGames;
      const needsMax = prev.priceMax === 50 || prev.priceMax > ceil;
      if (!needsMax && prev.priceMin <= prev.priceMax) return prev;
      const nextMax = needsMax ? ceil : prev.priceMax;
      const nextMin = Math.min(prev.priceMin, nextMax);
      if (nextMax === prev.priceMax && nextMin === prev.priceMin) return prev;
      return { ...prev, priceMax: nextMax, priceMin: nextMin };
    });
  }, [games, maxPriceFromGames]);
  const pctTopPrizesRemain = (g: ActiveGame) => {
    const orig = g.topPrizesOriginal ?? 0, rem = g.topPrizesRemaining ?? 0;
    return orig > 0 ? rem / orig : 0;
  };
  const filtered = useMemo(() => {
    const s = filters.q.trim().toLowerCase();
    const cutoff = new Date(); cutoff.setMonth(cutoff.getMonth() - 6);
    return games.filter((g) => {
      if (g.price != null && (g.price < filters.priceMin || g.price > filters.priceMax)) return false;
      const isNewByDate = (() => { if (!g.startDate) return false; const d = new Date(g.startDate); return !Number.isNaN(d.getTime()) && d >= cutoff; })();
      if (filters.lifecycle === 'new' && !isNewByDate) return false;
      if (filters.lifecycle === 'continuing' && isNewByDate) return false;
      const orig = g.topPrizesOriginal ?? 0; const rem  = g.topPrizesRemaining ?? 0;
      const pct  = orig > 0 ? rem / orig : 0;
      if (pct < filters.minTopAvail) return false;
      if (rem < filters.minTopRemain) return false;
      if (s) { const hay = `${g.name} ${g.gameNumber}`.toLowerCase(); if (!hay.includes(s)) return false; }
      return true;
    });
  }, [games, filters]);
  const sorted = useMemo(() => {
    const out = filtered.slice();
    const key: SortKey = filters.sortKey;
    out.sort((a, b) => {
      const adjA = a.adjustedOdds ?? Infinity, adjB = b.adjustedOdds ?? Infinity;
      const odA  = a.overallOdds  ?? Infinity, odB  = b.overallOdds  ?? Infinity;
      const pA   = a.price        ?? -Infinity, pB  = b.price        ?? -Infinity;
      const tpvA = a.topPrizeValue ?? -Infinity, tpvB = b.topPrizeValue ?? -Infinity;
      const remA = a.topPrizesRemaining ?? -Infinity, remB = b.topPrizesRemaining ?? -Infinity;
      const pctA = pctTopPrizesRemain(a), pctB = pctTopPrizesRemain(b);
      let result = 0;
      switch (key) {
        case 'best': {
          // Shared GA/NY “Best v2”: odds → %top → %total → #top → #total → jackpot → price → recency → name
          result = comparators.best(a, b);
          break;
        }
        case 'adjusted':       result = adjA === adjB ? a.gameNumber - b.gameNumber : adjA - adjB; break;
        case 'odds':           result = odA === odB   ? a.gameNumber - b.gameNumber : odA - odB; break;
        case 'price':          result = pA === pB     ? a.gameNumber - b.gameNumber : pB - pA; break;
        case 'topPrizeValue':  result = tpvA === tpvB ? a.gameNumber - b.gameNumber : tpvB - tpvA; break;
        case 'topPrizesRemain':result = remA === remB ? a.gameNumber - b.gameNumber : remB - remA; break;
        case '%topAvail':      result = pctA === pctB ? a.gameNumber - b.gameNumber : pctB - pctA; break;
        case 'startDate': {
          // Robust: newest date first; missing dates sink; tie → higher gameNumber first.
          result = comparators.startDate(a, b);
          break;
        }
        case 'name': default:  result = a.name.localeCompare(b.name); break;
      }
      return isSortReversed ? -result : result;
    });
    return out;
  }, [filtered, filters.sortKey, isSortReversed]);

  return (
    <div ref={shellRef} className="scratchers-shell" data-page="scratchers">
      <main className="layout-rails" data-page="scratchers">
        <aside className="rail rail--left" aria-label="Sponsored">
          <div className="rail__inner">
            <div className="ad-slot ad-slot--rail-300x600"><AdsLot /></div>
            <div className="ad-slot ad-slot--rail-300x250"><AdsLot /></div>
          </div>
        </aside>

        <div className="rails-center">
          <div className="center-clamp">
            <div className="vstack vstack--4">
              <section className={`layout-grid sidebar-content ${filtersMode === 'drawer' ? 'use-drawer' : 'use-sidebar'}`}>
                {filtersMode === 'panel' && (
                  <FiltersPanel
                    {...filters}
                    onChange={(patch) => setFilters(prev => ({ ...prev, ...patch }))}
                    isSortReversed={isSortReversed}
                    onToggleSortReverse={() => setIsSortReversed(v => !v)}
                    onSetSortReversed={(v) => setIsSortReversed(!!v)}
                    className="filters-panel"
                    drawerMode={false}
                    open={false}
                    side="right"
                  />
                )}
                <section className="card" aria-busy={loading} data-scroll-host="true">
                  <ScratchersTable
                    ref={tableScrollRef}
                    games={sorted}
                    loading={loading}
                    displayMode={displayMode}
                    globalImageKind={globalImageKind}
                    onOpenFilters={() => setShowFilters(true)}
                    forcedView={containerView}
                    onChangeDisplayMode={(v) => {
                      setDisplayMode(v);
                      try { localStorage.setItem('lsp.displayMode', v); } catch {}
                      window.dispatchEvent(new CustomEvent('ui:set-display-mode', { detail: v }));
                    }}
                    onToggleGlobalImageKind={() => {
                      setGlobalImageKind(prev => {
                        const next = prev === 'odds' ? 'ticket' : 'odds';
                        try { localStorage.setItem(LS_GLOBAL_IMG, next); } catch {}
                        return next;
                      });
                    }}
                  />
                </section>
              </section>

              {filtersMode === 'drawer' && (
                <FiltersPanel
                  {...filters}
                  onChange={(patch) => setFilters(prev => ({ ...prev, ...patch }))}
                  isSortReversed={isSortReversed}
                  onToggleSortReverse={() => setIsSortReversed(v => !v)}
                  onSetSortReversed={(v) => setIsSortReversed(!!v)}
                  drawerMode={true}
                  open={showFilters}
                  onClose={() => setShowFilters(false)}
                  side="right"
                />
              )}

              <div className="ad-slot ad-slot--rect-280" aria-label="Advertisement">
                {!loading && sorted.length > 0 ? <AdsLot /> : null}
              </div>
            </div>
          </div>
        </div>

        <aside className="rail rail--right" aria-label="Sponsored">
          <div className="rail__inner">
            <div className="ad-slot ad-slot--rail-300x600"><AdsLot /></div>
            <div className="ad-slot ad-slot--rail-300x250"><AdsLot /></div>
          </div>
        </aside>
      </main>
    </div>
  );
}
