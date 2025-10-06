// app/scratchers/page.tsx
'use client';
// Route-specific styles for Scratchers (layer: pages)
/* eslint-disable no-console */
import { useMemo, useState, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import FiltersPanel, { type Filters } from 'src/components/scratchers/FiltersPanel';
import ScratchersTable from 'src/components/scratchers/ScratchersTable';
import { useScratchersIndex } from 'src/components/scratchers/useScratchersIndex';
import type { ActiveGame, SortKey } from 'src/components/scratchers/types';
import type { DisplayMode } from 'src/components/scratchers/DisplayModeSwitcher';
import { useIsMobile, useDrawerMode } from '@lib/breakpoints';

const LS_SHOW_ODDS = 'lsp.showOddsByDefault';
const AdsLot = dynamic(() => import('src/components/ads/AdsLot'), { ssr: false });

export default function ScratchersPage() {
  const tableScrollRef = useRef<HTMLDivElement | null>(null);
  const shellRef = useRef<HTMLDivElement | null>(null);
  const { games, updatedAt, loading } = useScratchersIndex();
  const isMobile = useIsMobile();
  const drawerPref = useDrawerMode();
  // Container-driven orchestration state (attributes also set on the shell)
  const [adMode, setAdMode] = useState<'desktop'|'laptop'|'column'>('desktop');
  const [filtersMode, setFiltersMode] = useState<'panel'|'drawer'>(drawerPref || isMobile ? 'drawer' : 'panel');
  const [containerView, setContainerView] = useState<'table'|'cards'>('table');
  // Observe the real available width of the shell (ads & layout taken into account)
  useEffect(() => {
    const el = shellRef.current;
    if (!el) return;
    const debug = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debug') === 'shell';
    const num = (v: string | null, fallback: number) => v ? (Number.parseFloat(v) || fallback) : fallback;
    const applyStage = (mode: 'desktop'|'laptop'|'column', filters: 'panel'|'drawer', view: 'table'|'cards') => {
      if (adMode !== mode) setAdMode(mode);
      if (filtersMode !== filters) setFiltersMode(filters);
      if (containerView !== view) setContainerView(view);
      el.setAttribute('data-ad-mode', mode);
      el.setAttribute('data-filters', filters);
      el.setAttribute('data-view', view);
      if (debug) el.setAttribute('data-mode', mode);
    };
    const hasHorizOverflow = () => {
       // Absorb sub-pixel & gutter rounding; also tolerate native scrollbar width.
       const tolerance = Math.max(6, (window.devicePixelRatio || 1)); // ≈6px or 1dp minimum
       const delta = (node: HTMLElement | null) =>
         node ? Math.ceil(node.scrollWidth) - Math.ceil(node.clientWidth) : 0;
       // Prefer measuring the card that contains the table (our scroller above 768px)
       const card = el.querySelector('.layout-grid.sidebar-content > .card') as HTMLElement | null;
       const tbl  = el.querySelector('.scratchers-table') as HTMLElement | null;
       const diff = Math.max(delta(card), delta(tbl));
       if (diff > tolerance) return true;
       // Extra guard: only degrade if the center track is *actually* too small.
       // Rough safe minimum ≈ sidebar(260) + gap(~16–24) + table min(720) ~= 980px.
       const center = el.querySelector('.rails-center') as HTMLElement | null;
       if (center && center.clientWidth < 980) return true;
       return false;
     };
    const update = () => {
      const w = el.clientWidth;
      // Mark tablet band (1024–1384) for CSS to switch ad strategy
      if (w >= 1024 && w <= 1384) {
        el.setAttribute('data-band', 'tablet');
        el.setAttribute('data-allow-center-rect', 'on'); // opt-in to show center 280 on desktop widths
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
      if (debug) { el.setAttribute('data-debug', 'on'); el.setAttribute('data-w', String(w)); }
      // Initial stage by width thresholds
      if (w >= thDesktop) { applyStage('desktop','panel','table'); }
      else if (w >= thLaptop) { applyStage('laptop','panel','table'); }
      else if (w >= thColumn) { applyStage('column','panel','table'); }
      else if (w >= thDrawer) { applyStage('column','drawer','table'); }
      else { applyStage('column','drawer','cards'); }
      // Anti-overflow correction: if table still overflows horizontally,
      // degrade ad mode to 'column' (full-width band) and keep filters as panel/drawer by width.
      const overflowing = hasHorizOverflow();
      if (debug) {
        const card = el.querySelector('.layout-grid.sidebar-content > .card') as HTMLElement | null;
        const tbl  = el.querySelector('.scratchers-table') as HTMLElement | null;
        const center = el.querySelector('.rails-center') as HTMLElement | null;
        if (card) { el.setAttribute('data-card-sw', String(card.scrollWidth)); el.setAttribute('data-card-cw', String(card.clientWidth)); }
        if (tbl)  { el.setAttribute('data-table-sw', String(tbl.scrollWidth)); el.setAttribute('data-table-cw', String(tbl.clientWidth)); }
        if (center){ el.setAttribute('data-center-w', String(center.clientWidth)); }
        el.setAttribute('data-reason', overflowing ? 'overflow|center-too-small' : 'ok');
      }
      if (overflowing) {
        const keepFilters: 'panel'|'drawer' = w >= thColumn ? 'panel' : 'drawer';
        const keepView: 'table'|'cards' = w < thCards ? 'cards' : 'table';
        applyStage('column', keepFilters, keepView);
      }
    };
    const ro = new ResizeObserver((entries: ReadonlyArray<ResizeObserverEntry>) => {
      if (!entries.length) return;
      update();
    });
    update();      // run once on mount
    ro.observe(el); // and then on size changes
    return () => ro.disconnect();
  // include state deps since applyStage reads them; guard with internal equality above
  }, [drawerPref, isMobile, adMode, filtersMode, containerView]);

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
  const [showFilters, setShowFilters] = useState<boolean>(false);
  type ThumbKind = 'ticket' | 'odds';
  const [isSortReversed, setIsSortReversed] = useState<boolean>(false);
  const LS_GLOBAL_IMG = 'lsp.globalImageKind';
  const [globalImageKind, setGlobalImageKind] = useState<ThumbKind>('ticket');

  useEffect(() => {
    const v = localStorage.getItem(LS_GLOBAL_IMG);
    if (v === 'odds') {
      setGlobalImageKind('odds');
    }
  }, []);

  // Highest ticket price from the loaded dataset (fallback to 50 if unknown)
  const maxPriceFromGames = useMemo(() => {
    let max = -Infinity;
    for (const g of games) {
      if (typeof g.price === 'number' && Number.isFinite(g.price)) {
        if (g.price > max) max = g.price;
      }
    }
    return Number.isFinite(max) ? max : 50;
  }, [games]);

useEffect(() => {
  // initialize from LS if present
  const saved = (typeof window !== 'undefined' && localStorage.getItem('lsp.displayMode')) as DisplayMode | null;
  if (saved === 'compact' || saved === 'detailed' || saved === 'expanded') {
    setDisplayMode(saved);
  }

  // respond to header switcher changes
  function onSetMode(e: Event) {
    const v = (e as CustomEvent<DisplayMode>).detail;
    if (v === 'compact' || v === 'detailed' || v === 'expanded') {
      setDisplayMode(v);
      localStorage.setItem('lsp.displayMode', v);
    }
  }
  window.addEventListener('ui:set-display-mode', onSetMode as EventListener);
  return () => window.removeEventListener('ui:set-display-mode', onSetMode as EventListener);
}, []);

  // keep updatedAt in panel when it arrives (no mutation during render)
  useEffect(() => {
    setFilters(prev => (prev.updatedAt === updatedAt ? prev : { ...prev, updatedAt }));
  }, [updatedAt]);

   // When games load/update, set default max price to dataset ceiling (and keep clamped)
  useEffect(() => {
    if (!games.length) return;
    setFilters(prev => {
      const ceil = maxPriceFromGames;
      // Only adjust if (a) still at default 50, or (b) above data ceiling.
      // Also keep min <= max to satisfy cross-field rule.
      const needsMaxUpdate = prev.priceMax === 50 || prev.priceMax > ceil;
      if (!needsMaxUpdate && prev.priceMin <= prev.priceMax) return prev;
      const nextMax = needsMaxUpdate ? ceil : prev.priceMax;
      const nextMin = Math.min(prev.priceMin, nextMax);
      if (nextMax === prev.priceMax && nextMin === prev.priceMin) return prev;
      return { ...prev, priceMax: nextMax, priceMin: nextMin };
    });
  }, [games, maxPriceFromGames]);

  const pctTopPrizesRemain = (g: ActiveGame) => {
    const orig = g.topPrizesOriginal ?? 0;
    const rem  = g.topPrizesRemaining ?? 0;
    return orig > 0 ? rem / orig : 0;
  };

  const filtered = useMemo(() => {
    const s = filters.q.trim().toLowerCase();
    // Cutoff once per compute: 6 months ago from "now"
    const cutoff = new Date();
    cutoff.setMonth(cutoff.getMonth() - 6);
    return games.filter((g) => {
      if (g.price != null && (g.price < filters.priceMin || g.price > filters.priceMax)) return false;
      // Lifecycle filter now uses startDate recency, not g.lifecycle
      const isNewByDate = (() => {
        if (!g.startDate) return false;
        const d = new Date(g.startDate);
        return !Number.isNaN(d.getTime()) && d >= cutoff;
      })();
      if (filters.lifecycle === 'new' && !isNewByDate) return false;
      if (filters.lifecycle === 'continuing' && isNewByDate) return false;
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

      let result = 0;
      switch (key) {
        case 'best': {
          // Best = Printed odds (lower is better) → Top prizes left (more is better) → Price (lower is better)
          // 1) Printed odds (overallOdds): smaller ratio is better (e.g., 1 in 3 beats 1 in 4)
          if (odA !== odB) { result = odA - odB; break; }
          // 2) Top prizes remaining: more is better
          if (remA !== remB) { result = remB - remA; break; }
          // 3) Ticket price: lower is better; push missing to the end
          const priceA = Number.isFinite(a.price ?? NaN) ? (a.price as number) : Infinity;
          const priceB = Number.isFinite(b.price ?? NaN) ? (b.price as number) : Infinity;
          if (priceA !== priceB) { result = priceA - priceB; break; }
          result = a.gameNumber - b.gameNumber; break;
        }
        case 'adjusted':       result = adjA === adjB ? a.gameNumber - b.gameNumber : adjA - adjB; break;
        case 'odds':           result = odA === odB   ? a.gameNumber - b.gameNumber : odA - odB; break;
        case 'price':          result = pA === pB     ? a.gameNumber - b.gameNumber : pB - pA; break;
        case 'topPrizeValue':  result = tpvA === tpvB ? a.gameNumber - b.gameNumber : tpvB - tpvA; break;
        case 'topPrizesRemain':result = remA === remB ? a.gameNumber - b.gameNumber : remB - remA; break;
        case '%topAvail':      result = pctA === pctB ? a.gameNumber - b.gameNumber : pctB - pctA; break;
        case 'startDate': {
          const ts = (s?: string) => {
            const t = Date.parse(s ?? '');
            return Number.isFinite(t) ? t : -Infinity; // push missing/invalid to end
          };
          const A = ts(a.startDate);
          const B = ts(b.startDate);
          result = B === A ? a.gameNumber - b.gameNumber : B - A; break; // newest first
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
      {/* Left rail (desktop only; placeholder visible even if no fill) */}
      <aside className="rail rail--left" aria-label="Sponsored">
          <div className="rail__inner">
            <div className="ad-slot ad-slot--rail-300x600">
              <AdsLot />
            </div>
            <div className="ad-slot ad-slot--rail-300x250">
              <AdsLot />
            </div>
          </div>
        </aside>

      {/* Center content column */}
      <div className="rails-center">
        <div className="center-clamp">
          {/* Single vertical stack controls spacing for main content and mobile ad */}
          <div className="vstack vstack--4">
          <section className={`layout-grid sidebar-content ${filtersMode === 'drawer' ? 'use-drawer' : 'use-sidebar'}`}>
          {filtersMode === 'panel' && (
            <FiltersPanel
              {...filters}
              onChange={(patch) => setFilters(prev => ({ ...prev, ...patch }))}
              isSortReversed={isSortReversed}
              onToggleSortReverse={() => setIsSortReversed(v => !v)}
              onSetSortReversed={(v) => setIsSortReversed(!!v)}
              className="filters-panel"        // optional; safe to keep //
              drawerMode={false}               // ← explicit panel mode //
              open={false}                     // ← not a drawer, so closed //
              side="right"                     // optional; ignored on desktop //
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
              // If other listeners still depend on this event, keep dispatch:
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

      {/* Filters drawer (only when container says 'drawer') */}
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
        {/* In-flow ad (mobile/tablet). Desktop uses rails.
            Container stays for outline; spacing via vstack. */}
        <div className="ad-slot ad-slot--rect-280" aria-label="Advertisement">
          {!loading && sorted.length > 0 ? <AdsLot /> : null}
        </div>
      </div>
    </div>
  </div>

      {/* Right rail (desktop only; placeholder visible even if no fill) */}
      <aside className="rail rail--right" aria-label="Sponsored">
          <div className="rail__inner">
            <div className="ad-slot ad-slot--rail-300x600">
              <AdsLot />
            </div>
            <div className="ad-slot ad-slot--rail-300x250">
              <AdsLot />
            </div>
          </div>
        </aside>
    </main>
    </div>
  );
}
