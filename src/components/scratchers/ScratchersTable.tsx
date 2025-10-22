// src/components/scratchers/ScratchersTable.tsx
'use client';

import './ScratchersTable.css';
import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  forwardRef,
  type ForwardedRef,
  type MutableRefObject,
} from 'react';
import { ErrorBoundary } from 'src/components/ErrorBoundary';
import { createPortal } from 'react-dom';
import { comparators } from './sort';
import type { SortKey, ActiveGame } from './types';
import type { DisplayMode } from './DisplayModeSwitcher';
import DisplayModeSwitcher from './DisplayModeSwitcher'; // use dropdown-only

type ThumbKind = 'ticket' | 'odds';
type LeftMode = 'top' | 'total';

function pctTopPrizesRemain(g: ActiveGame) {
  const orig = g.topPrizesOriginal ?? 0;
  const rem = g.topPrizesRemaining ?? 0;
  return orig > 0 ? rem / orig : 0;
}

// --- NY tiers: total prizes left helpers -----------------------------------
function totalsFromTiers(g: ActiveGame) {
  const tiers = Array.isArray((g as any).tiers) ? (g as any).tiers as Array<{
    prizesRemaining?: number | null;
    prizesPaidOut?: number | null;
    totalPrizes?: number | null;
  }> : [];
  let remaining = 0;
  let original = 0;
  for (const t of tiers) {
    const rem = t.prizesRemaining ?? 0;
    const tot = (t.totalPrizes != null ? t.totalPrizes : (t.prizesRemaining ?? 0) + (t.prizesPaidOut ?? 0)) ?? 0;
    remaining += rem;
    original  += tot;
  }
  return { remaining, original };
}

function pctTotalPrizesRemain(g: ActiveGame) {
  const { remaining, original } = totalsFromTiers(g);
  return original > 0 ? remaining / original : NaN;
}

function hasTierToggleAvailable(games: ActiveGame[]) {
  // Only show the toggle if ANY game has tier rows with enough info to compute totals.
  return games.some(g => {
    const tiers = Array.isArray((g as any).tiers) ? (g as any).tiers : [];
    return tiers.length > 0 && tiers.some((t: any) =>
      t && (t.prizesRemaining != null) && (t.totalPrizes != null || t.prizesPaidOut != null)
    );
  });
}

const OddsCell = ({ g }: { g: ActiveGame }) => (
  <div className="leading-tight" aria-label="Odds adjusted and printed">
    <div className="mono">
      {g.adjustedOdds != null ? `1 in ${Number(g.adjustedOdds).toFixed(2)}` : '—'}
    </div>
    <div className="mono hint">{g.overallOdds != null ? `1 in ${g.overallOdds}` : '—'}</div>
  </div>
);

const TopLeftCell = ({ g, mode }: { g: ActiveGame; mode: LeftMode }) => {
  const isTotal = mode === 'total';
  const pctRaw = isTotal ? pctTotalPrizesRemain(g) : pctTopPrizesRemain(g);
  const pct = Math.round((isFinite(pctRaw) ? pctRaw : 0) * 100);
  const display = (() => {
    if (isTotal) {
      const { remaining, original } = totalsFromTiers(g);
      return { rem: remaining, orig: original };
    }
    return { rem: g.topPrizesRemaining ?? 0, orig: g.topPrizesOriginal ?? 0 };
  })();
  return (
    <div className="leading-tight">
      <div className="mono">
        {display.rem.toLocaleString()} / {display.orig.toLocaleString()}
      </div>
      <div className="mono hint">{isFinite(pct) ? `${pct}% left` : '—'}</div>
      <div className="meter" aria-hidden="true">
        <span style={{ width: `${isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0}%` }} />
      </div>
    </div>
  );
};

function lifecycleLabelFromStartDate(startDate?: string): string | null {
  if (!startDate) return null;
  const d = new Date(startDate);
  if (Number.isNaN(d.getTime())) return null;
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - 6);
  return d >= cutoff ? 'New' : null;
}

function Price({ value }: { value: number | undefined }) {
  if (value == null || Number.isNaN(value)) return <>—</>;
  return <>${value}</>;
}

function Money({ value }: { value: number | undefined }) {
  if (value == null || Number.isNaN(value)) return <>—</>;
  return <>${value.toLocaleString()}</>;
}

function DesktopSkeleton() {
  return (
    <div role="status" aria-live="polite" className="scratchers-skel desktop-only w-full">
      <table className="compact w-full" aria-hidden="true">
        <thead>
          <tr>
            <th className="w-[38%] text-left">Name</th>
            <th className="mono w-[10%] text-right">Game #</th>
            <th className="mono w-[10%] text-right">Price</th>
            <th className="mono w-[18%] text-right">Odds (adj / print)</th>
            <th className="mono w-[12%] text-right">Top prize</th>
            <th className="mono w-[12%] text-right">Top-prizes left</th>
          </tr>
        </thead>
        <tbody>
          {Array.from({ length: 6 }).map((_, i) => (
            <tr key={i} className="row skeleton">
              <td>
                <div className="skeleton-line w-70" />
                <div className="skeleton-line w-40" />
              </td>
              <td className="mono text-right">
                <div className="skeleton-line w-40" />
              </td>
              <td className="mono text-right">
                <div className="skeleton-line w-30" />
              </td>
              <td className="text-right">
                <div className="skeleton-line w-60" />
                <div className="skeleton-line w-40" />
              </td>
              <td className="mono text-right">
                <div className="skeleton-line w-50" />
              </td>
              <td className="text-right">
                <div className="skeleton-line w-60" />
                <div className="meter">
                  <span className="skeleton-fill" style={{ width: '50%' }} />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <span className="visually-hidden">Loading scratchers…</span>
    </div>
  );
}

function MobileSkeleton() {
  return (
    <div role="status" aria-live="polite" className="scratchers-skel mobile-only">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="mobile-card skeleton">
          <div className="line1">
            <div className="skeleton-line w-60" />
            <span className="chip skeleton-pill" />
          </div>
          <div className="line2 mono">
            <div className="skeleton-line w-80" />
          </div>
          <div className="line3 mono">
            <div className="skeleton-line w-70" />
          </div>
          <div className="line4 mono">
            <div className="skeleton-line w-40" />
            <div className="meter">
              <span className="skeleton-fill" style={{ width: '50%' }} />
            </div>
          </div>
        </div>
      ))}
      <span className="visually-hidden">Loading scratchers…</span>
    </div>
  );
}

type ScratchersTableProps = {
  games: ActiveGame[];
  loading: boolean;
  displayMode?: DisplayMode; // 'compact' | 'detailed' | 'expanded'
  /** Global image selection that also resets per-row overrides on change */
  globalImageKind?: ThumbKind; // 'ticket' | 'odds'
  /** @deprecated Visibility is container-driven via [data-filters="drawer"]. Button is always rendered; CSS decides visibility. */
  showFiltersButton?: boolean;
  /** Open filters drawer/panel */
  onOpenFilters?: () => void;
  /** Change view mode */
  onChangeDisplayMode?: (mode: DisplayMode) => void;
  /** Toggle Ticket/Odds globally (used in Expanded) */
  onToggleGlobalImageKind?: () => void;
  /** Container-driven override for cards/table */
  forcedView?: 'table' | 'cards';
  /** Optional: the active sort key (if parent wants table to sort) */
  sortKey?: SortKey;
  /** Optional: reverse flag (descending) */
  isSortReversed?: boolean;
};

// Inner implementation (unchanged logic); kept separate so we can wrap with ErrorBoundary
const ScratchersTableInner = forwardRef<HTMLDivElement, ScratchersTableProps>(function ScratchersTable(
  {
    games,
    loading,
    displayMode = 'detailed',
    globalImageKind = 'ticket',
    onOpenFilters,
    onChangeDisplayMode,
    onToggleGlobalImageKind,
    forcedView,
    sortKey,
    isSortReversed = false,
  }: ScratchersTableProps,
  scrollRootRef: ForwardedRef<HTMLDivElement>
) {
  const isDetailed = displayMode === ('detailed' as DisplayMode);
  const isExpanded = displayMode === ('expanded' as DisplayMode);
  const showThumbs = isDetailed || isExpanded;
  // NY: there are no odds images. Decide UI affordances from the data:
  const hasAnyOdds = useMemo(() => games.some(g => !!g.oddsImageUrl), [games]);
  // NY-only: expose header toggle when any game has tiers with counts
  const canToggleLeft = useMemo(() => hasTierToggleAvailable(games), [games]);
  const [leftMode, setLeftMode] = useState<LeftMode>('top');
  /** Tracks if the user explicitly clicked the header toggle in this session. */
  const userOverrodeLeftMode = useRef<boolean>(false);

  // Default to 'total' when NY totals are available (first load / dataset change)
  useEffect(() => {
    if (canToggleLeft && !userOverrodeLeftMode.current) {
      setLeftMode('total');
    }
  }, [canToggleLeft]);

  // Listen for Filters → Table hint events to sync the left bar view.
  useEffect(() => {
    const onLeftMode = (e: Event) => {
      const ce = e as CustomEvent<LeftMode | undefined>;
      const detail = ce?.detail;
      if (detail === 'top' || detail === 'total') {
        setLeftMode(detail);
        // This is an app-driven hint (e.g., user changed sort),
        // so clear any prior "override" so the next header click wins again.
        userOverrodeLeftMode.current = false;
      }
    };
    // TypeScript may not know this custom event; cast name as string.
    window.addEventListener('scratchers:leftMode' as any, onLeftMode as EventListener);
    return () => window.removeEventListener('scratchers:leftMode' as any, onLeftMode as EventListener);
  }, []);

  const toggleLeftMode = useCallback(() => {
    if (!canToggleLeft) return;
    userOverrodeLeftMode.current = true;
    setLeftMode(m => (m === 'top' ? 'total' : 'top'));
  }, [canToggleLeft]);

  // Per-row overrides
  const [rowThumb, setRowThumb] = useState<Record<number, ThumbKind>>({});
  useEffect(() => {
    setRowThumb({});
  }, [globalImageKind]);
  const currentKindFor = (id: number): ThumbKind => rowThumb[id] ?? globalImageKind;
  const toggleRow = (id: number) =>
    setRowThumb(prev => ({ ...prev, [id]: currentKindFor(id) === 'odds' ? 'ticket' : 'odds' }));

  // ────────────────────────────────────────────────────────────────────────
  // Sorting (optional): use sort.ts comparators when the parent provides a key
  // ────────────────────────────────────────────────────────────────────────
  const cmpMap: Partial<Record<SortKey, (a: ActiveGame, b: ActiveGame) => number>> = useMemo(() => ({
    // We only intercept the keys we added/changed. Others remain as-is (parent may sort upstream).
    best: comparators.best,
    startDate: comparators.startDate,
    totalPrizesRemain: comparators.totalPrizesRemain,
    '%totalAvail': comparators.pctTotalAvail,
  }), []);

  const sortedGames = useMemo(() => {
    const cmp = sortKey ? cmpMap[sortKey] : undefined;
    if (!cmp) return games;

    // inside sortedGames useMemo()
    const baseDir = 1; // <-- keep it 1 (no special-case for startDate)
    const dir = isSortReversed ? -baseDir : baseDir;

    const copy = [...games];
    copy.sort((a, b) => {
      const core = cmp(a, b);
      if (core !== 0) return dir * core;
      // Final stability: name ASC for any remaining tie
      return String(a.name).localeCompare(String(b.name));
    });
    return copy;
  }, [games, sortKey, isSortReversed, cmpMap]);


  /** Lightbox (Detailed mode only) */
  type LightboxState = { id: number; kind: ThumbKind } | null;
  const [lightbox, setLightbox] = useState<LightboxState>(null);
  const gameMap = useMemo(() => new Map(sortedGames.map(g => [g.gameNumber, g])), [sortedGames]);

  const openLightbox = (id: number) => {
    if (!isDetailed) return;
    setLightbox({ id, kind: currentKindFor(id) });
  };
  const closeLightbox = () => setLightbox(null);
  const setLightboxKind = (id: number, kind: ThumbKind) => {
    setLightbox(s => (s && s.id === id ? { ...s, kind } : s));
    setRowThumb(prev => ({ ...prev, [id]: kind }));
  };

  useEffect(() => {
    if (!lightbox) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') return closeLightbox();
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        const g = gameMap.get(lightbox.id);
        if (!g) return;
        const hasT = !!g.ticketImageUrl;
        const hasO = !!g.oddsImageUrl;
        const next: ThumbKind =
          lightbox.kind === 'ticket' ? (hasO ? 'odds' : 'ticket') : (hasT ? 'ticket' : 'odds');
        setLightboxKind(lightbox.id, next);
      }
    };
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [lightbox, gameMap]);

  const [hasMounted, setHasMounted] = useState(false);
  useEffect(() => {
    setHasMounted(true);
  }, []);

  // --- bottom shadow controller -------------------------------------------
  const localRef = useRef<HTMLDivElement | null>(null);
  const tbodyRef = useRef<HTMLTableSectionElement | null>(null);
  const setRefs = useCallback((node: HTMLDivElement | null) => {
    localRef.current = node;
    if (typeof scrollRootRef === 'function') scrollRootRef(node);
    else if (scrollRootRef && 'current' in (scrollRootRef as MutableRefObject<HTMLDivElement | null>)) {
      (scrollRootRef as MutableRefObject<HTMLDivElement | null>).current = node;
    }
  }, [scrollRootRef]);

  const updateBottomShadow = useCallback(() => {
    const scrollEl = tbodyRef.current ?? localRef.current;
    const hostEl   = localRef.current;
    if (!scrollEl || !hostEl) return;
    const hasMore = Math.ceil(scrollEl.scrollTop + scrollEl.clientHeight) < scrollEl.scrollHeight;
    hostEl.setAttribute('data-shadow-bottom', hasMore ? 'true' : 'false');
  }, []);

  useEffect(() => {
    const scrollEl = tbodyRef.current ?? localRef.current;
    if (!scrollEl) return;
    updateBottomShadow();
    const onScroll = () => updateBottomShadow();
    const onResize = () => updateBottomShadow();
    scrollEl.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onResize);
    // also update when data changes
    const id = window.setTimeout(updateBottomShadow, 0);
    return () => {
      window.clearTimeout(id);
      scrollEl.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onResize);
    };
  }, [sortedGames, updateBottomShadow]);

  if (loading || !hasMounted) {
    return (
      <div
        className={`scratchers-table has-stbar ${displayMode === 'expanded' ? 'mode-expanded' : displayMode === 'detailed' ? 'mode-detailed' : 'mode-compact'}`}
        aria-busy="true"
        ref={setRefs}
        /* Hint for CSS when parent forces card/table via shell attribute */
         data-view={forcedView}
      >
        {/* Permanent thin header */}
        <div className="stbar" role="toolbar" aria-label="Scratchers controls">
          {/* Render once; CSS container queries decide visibility */}
        <button
          type="button"
          className="btn btn-primary filters-btn"
          onClick={onOpenFilters}
          aria-label="Open filters"
        >
          Filters
        </button>
          <div className="spacer" />
          {/* Dropdown-only (keeps bar thin and inline at all widths) */}
          <DisplayModeSwitcher
            value={displayMode}
            onChange={onChangeDisplayMode}
            aria-label="View mode"
            className="mode-switcher"  /* optional hook for styling */
          />
          {/* Only show toggle if there exists at least one odds image */}
          {displayMode === 'expanded' && hasAnyOdds && (
            <button
              type="button"
              className="btn btn-primary odds-toggle"
              onClick={onToggleGlobalImageKind}
              aria-label={globalImageKind === 'odds' ? 'Show ticket images' : 'Show odds images'}
            >
              {globalImageKind === 'odds' ? 'Show Tickets' : 'Show Odds'}
            </button>
          )}
        </div>
        <DesktopSkeleton />
        <MobileSkeleton />
      </div>
    );
  }
  // Keep the header even when there are no rows
  const hasRows = sortedGames.length > 0;

  return (
    <div
      ref={setRefs}
      className={`scratchers-table has-stbar ${isExpanded ? 'mode-expanded' : isDetailed ? 'mode-detailed' : 'mode-compact'}`}
      role="region"
      aria-label="Scratchers table"
      data-view={forcedView}
    >
      {/* Permanent thin header (replaces any old expanded header) */}
      <div className="stbar" role="toolbar" aria-label="Scratchers controls">
        <button
          type="button"
          className="btn btn-primary filters-btn"
          onClick={onOpenFilters}
          aria-label="Open filters"
        >
          Filters
        </button>
        <div className="spacer" />
        {/* Dropdown-only mode switcher */}
        <DisplayModeSwitcher
            value={displayMode}
            onChange={onChangeDisplayMode}
            aria-label="View mode"
            className="mode-switcher"  /* optional hook for styling */
          />
       {/* Only show toggle if there exists at least one odds image */}
       {isExpanded && hasAnyOdds && (
          <button
            type="button"
            className="btn btn-primary odds-toggle"
            onClick={onToggleGlobalImageKind}
            aria-label={globalImageKind === 'odds' ? 'Show ticket images' : 'Show odds images'}
          >
            {globalImageKind === 'odds' ? 'Show Tickets' : 'Show Odds'}
          </button>
        )}
      </div>
      {/* Desktop / tablet table */}
      {!hasRows ? null : (
      <table className="compact desktop-only w-full" role="table" aria-label="GA Scratchers comparison">
        <thead>
          <tr>
            {showThumbs && (
              <th className={`col-image mono ${isExpanded ? 'w-[12%]' : 'w-[10%]'} text-left`}>Image</th>
            )}
            {/* When thumbnails are present: Expanded => Name 28%; Detailed => Name 30% */}
            <th
              className={`col-name text-left ${
                showThumbs ? (isExpanded ? 'w-[28%]' : 'w-[30%]') : 'w-[38%]'
              }`}
            >
              Name
            </th>
            {/* Tighter numeric cols when thumbnails are present */}
            <th className={`col-game  mono text-right ${showThumbs ? 'w-[8%]'  : 'w-[10%]'}`}>Game #</th>
            <th className={`col-price mono text-right ${showThumbs ? 'w-[8%]'  : 'w-[10%]'}`}>Price</th>
            <th className={`col-odds  mono text-right ${showThumbs ? 'w-[16%]' : 'w-[18%]'}`}>Odds (adj / print)</th>
            <th className={`col-top   mono text-right ${showThumbs ? 'w-[14%]' : 'w-[12%]'}`}>Top prize</th>
            <th
              className={`col-left  mono text-right ${showThumbs ? 'w-[14%]' : 'w-[12%]'}`}
              aria-sort="none"
            >
              {canToggleLeft ? (
                <button
                  type="button"
                  className="btn btn-primary odds-toggle th-toggle"
                  onClick={toggleLeftMode}
                  aria-pressed={leftMode === 'total'}
                  aria-label={
                    leftMode === 'total'
                      ? 'Showing total prizes left. Click to show top-prizes left.'
                      : 'Showing top-prizes left. Click to show total prizes left.'
                  }
                  title={
                    leftMode === 'total'
                      ? 'Total prizes left (click to switch to Top-prizes left)'
                      : 'Top-prizes left (click to switch to Total prizes left)'
                  }
                >
                  {leftMode === 'total' ? 'Total prizes left' : 'Top-prizes left'}
                </button>
              ) : (
                'Top-prizes left'
              )}
            </th>
          </tr>
        </thead>
        <tbody ref={tbodyRef}>
          {sortedGames.map(g => {
            const kind = currentKindFor(g.gameNumber);
            const src =
              (kind === 'odds' ? g.oddsImageUrl : g.ticketImageUrl) || g.ticketImageUrl || g.oddsImageUrl;
            const hasTicket = !!g.ticketImageUrl;
            const hasOdds = !!g.oddsImageUrl;
            return (
              <tr key={g.gameNumber} className="row">
                {showThumbs && (
                  <td className="col-image whitespace-nowrap">
                    {isExpanded ? (
                      <div className="thumb-wrap">
                        {src ? (
                          <img
                            className="thumb-full"
                            src={src}
                            alt=""
                            loading="lazy"
                            decoding="async"
                            aria-hidden="true"
                          />
                        ) : (
                          <div className="thumb placeholder" aria-hidden="true" />
                        )}
                        {/* Only show badge + arrows when BOTH images exist */}
                        {hasTicket && hasOdds && (
                          <>
                            <div className="thumb-badge mono">
                              {currentKindFor(g.gameNumber) === 'odds' ? 'Odds' : 'Ticket'}
                            </div>
                            <div className="thumb-controls" role="group" aria-label="Swap image">
                              <button
                                type="button"
                                className="thumb-arrow"
                                onClick={() => toggleRow(g.gameNumber)}
                              >
                                ‹ ›
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="thumb-open"
                        onClick={() => openLightbox(g.gameNumber)}
                        aria-label={`Open ${currentKindFor(g.gameNumber)} image for ${g.name}`}
                      >
                        {src ? (
                          <img className="thumb" src={src} alt="" loading="lazy" decoding="async" />
                        ) : (
                          <div className="thumb placeholder" aria-hidden="true" />
                        )}
                      </button>
                    )}
                  </td>
                )}
                <td className="col-name whitespace-normal overflow-visible text-clip">
                  <div className="title font-bold leading-tight">
                    {g.name}{' '}
                    {(() => {
                      const label = lifecycleLabelFromStartDate(g.startDate);
                      return label ? (
                        <span className="chip lifecycle new" title={label}>
                          {label}
                        </span>
                      ) : null;
                    })()}
                  </div>
                  {/* Compact meta line appears on mid widths when some columns are hidden */}
                  <div className="row-meta mono">
                    #{g.gameNumber} • <Price value={g.price} /> • Top: <Money value={g.topPrizeValue} />
                  </div>
                  {g.startDate && <div className="hint mt-0.5">{`Launch: ${g.startDate}`}</div>}
                </td>
                <td className="col-game mono text-right whitespace-nowrap">{g.gameNumber}</td>
                <td className="col-price mono text-right whitespace-nowrap">
                  <Price value={g.price} />
                </td>
                <td className="col-odds text-right">
                  <OddsCell g={g} />
                </td>
                <td className="col-top mono text-right">
                  <Money value={g.topPrizeValue} />
                </td>
                <td className="col-left text-right">
                  <TopLeftCell g={g} mode={canToggleLeft ? leftMode : 'top'} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      )}

      {/* Mobile cards (with true 2-column layout for detailed/expanded) */}
      {!hasRows ? (
        <div className="empty-state" role="status" aria-live="polite">
          <p>No games match your filters.</p>
        </div>
      ) : (
      <div className="mobile-only" role="list" aria-label="GA Scratchers comparison, mobile cards">
        {sortedGames.map(g => {
          const useMode: LeftMode = canToggleLeft ? leftMode : 'top';
          const pctRaw = useMode === 'total' ? pctTotalPrizesRemain(g) : pctTopPrizesRemain(g);
          const pct  = Math.round((isFinite(pctRaw) ? pctRaw : 0) * 100);
          const counts = (() => {
            if (useMode === 'total') {
              const { remaining, original } = totalsFromTiers(g);
              return { rem: remaining, orig: original };
            }
            return { rem: g.topPrizesRemaining ?? 0, orig: g.topPrizesOriginal ?? 0 };
          })();
          const kind = currentKindFor(g.gameNumber);
          const src  = (kind === 'odds' ? g.oddsImageUrl : g.ticketImageUrl) || g.ticketImageUrl || g.oddsImageUrl;
          const hasTicket = !!g.ticketImageUrl;
          const hasOdds = !!g.oddsImageUrl;
          const lifecycle = lifecycleLabelFromStartDate(g.startDate);
          return (
            <div key={g.gameNumber} role="listitem" className={`mobile-card ${showThumbs ? 'twocol' : ''}`}>
              {/* LEFT column (media) – only for detailed/expanded */}
              {showThumbs && (
                <div className="media">
                  {isExpanded ? (
                    <div className="thumb-wrap">
                      {src ? (
                        <img className="thumb-full" src={src} alt="" loading="lazy" decoding="async" aria-hidden="true" />
                      ) : (
                        <div className="thumb placeholder" aria-hidden="true" />
                      )}
                      {/* Only show badge + arrows when BOTH images exist */}
                      {hasTicket && hasOdds && (
                        <>
                          <div className="thumb-badge mono">{kind === 'odds' ? 'Odds' : 'Ticket'}</div>
                          <div className="thumb-controls" role="group" aria-label="Swap image">
                            <button
                              type="button"
                              className="thumb-arrow"
                              onClick={() => toggleRow(g.gameNumber)}
                            >
                              ‹ ›
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="thumb-open"
                      onClick={() => openLightbox(g.gameNumber)}
                      aria-label={`Open ${kind} image for ${g.name}`}
                    >
                      {src ? <img className="thumb" src={src} alt="" loading="lazy" decoding="async" /> : <div className="thumb placeholder" aria-hidden="true" />}
                    </button>
                  )}
                </div>
              )}

              {/* RIGHT column (info) */}
              <div className="info">
                <div className="line1">
                  <div className="title-wrap inline-flex items-center gap-2">
                    <div className="name">{g.name}</div>
                  </div>
                  {lifecycle && <span className="chip lifecycle new">{lifecycle}</span>}
                </div>
                <div className="line2 mono">
                  <span aria-label="Game number">#{g.gameNumber}</span>
                  <span aria-hidden="true"> • </span>
                  <span aria-label="Price"><Price value={g.price} /></span>
                  <span aria-hidden="true"> • </span>
                  <span aria-label="Top prize">Top: <Money value={g.topPrizeValue} /></span>
                </div>
                <div className="line3 mono">
                  <span aria-label="Adjusted odds">{g.adjustedOdds != null ? `Adj 1 in ${Number(g.adjustedOdds).toFixed(2)}` : 'Adj —'}</span>
                  <span aria-hidden="true"> / </span>
                  <span className="hint" aria-label="Printed odds">{g.overallOdds != null ? `Print 1 in ${g.overallOdds}` : 'Print —'}</span>
                </div>
                <div className="line4 mono">
                  <span className="counts">
                    {canToggleLeft ? (leftMode === 'total' ? 'Total: ' : 'Top: ') : ''}
                    {counts.rem.toLocaleString()} / {counts.orig.toLocaleString()} · {isFinite(pct) ? `${pct}% left` : '—'}
                  </span>
                  <div className="meter" aria-hidden="true"><span style={{ width: `${isFinite(pct) ? Math.max(0, Math.min(100, pct)) : 0}%` }} /></div>
                </div>
                {g.startDate && <div className="line5 hint">Launch: {g.startDate}</div>}
              </div>
            </div>
          );
        })}
      </div>
      )}

      {/* Lightbox (Detailed mode only) */}
      {isDetailed && lightbox && hasMounted && createPortal((() => {
          const g = gameMap.get(lightbox.id);
          if (!g) return null;
          const hasTicket = !!g.ticketImageUrl;
          const hasOdds = !!g.oddsImageUrl;
          const effectiveKind: ThumbKind =
            lightbox.kind === 'odds' && hasOdds
              ? 'odds'
              : lightbox.kind === 'ticket' && hasTicket
              ? 'ticket'
              : hasTicket
              ? 'ticket'
              : 'odds';
          const src =
            effectiveKind === 'odds' ? g.oddsImageUrl : (g.ticketImageUrl ?? g.oddsImageUrl);
          return (
            <div className="lightbox-overlay" onClick={closeLightbox}>
              <div
                className="lightbox"
                role="dialog"
                aria-modal="true"
                aria-labelledby={`lb-title-${g.gameNumber}`}
                onClick={e => e.stopPropagation()}
              >
                <header className="lightbox-header">
                  <h2 id={`lb-title-${g.gameNumber}`}>{g.name}</h2>
                  <button type="button" className="btn" aria-label="Close image" onClick={closeLightbox}>
                    ✕
                  </button>
                </header>
                <div className="lightbox-body">
                  {src ? (
                    <img
                      className="lightbox-img"
                      src={src}
                      alt={`${g.name} ${effectiveKind === 'odds' ? 'odds' : 'ticket'} image`}
                      decoding="async"
                    />
                  ) : (
                    <div className="thumb placeholder" aria-hidden="true" />
                  )}
                </div>
                {/* Only show swap controls when BOTH images exist.
                   This hides the buttons for states without odds images. */}
                {hasTicket && hasOdds && (
                  <div className="lightbox-controls">
                    <button
                      type="button"
                      className={`btn ${effectiveKind === 'ticket' ? 'btn-primary' : ''}`}
                      onClick={() => setLightboxKind(g.gameNumber, 'ticket')}
                      aria-pressed={effectiveKind === 'ticket'}
                    >
                      Ticket
                    </button>
                    <button
                      type="button"
                      className={`btn ${effectiveKind === 'odds' ? 'btn-primary' : ''}`}
                      onClick={() => setLightboxKind(g.gameNumber, 'odds')}
                      aria-pressed={effectiveKind === 'odds'}
                    >
                      Odds
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })(), document.body)}
    </div>
  );
});

// Error boundary wrapper that preserves the ref API
export default React.forwardRef<HTMLDivElement, ScratchersTableProps>(function ScratchersTable(
  props,
  ref
) {
  // Remount the subtree if major identity-defining inputs change.
  // (Avoid stringifying full game objects; size is a good proxy here.)
  const resetKey = [
    props.displayMode ?? 'detailed',
    props.sortKey ?? 'none',
    props.isSortReversed ? 'rev' : 'fwd',
    props.games?.length ?? 0,
  ].join('|');
  return (
    <ErrorBoundary key={resetKey}>
      <ScratchersTableInner {...props} ref={ref} />
    </ErrorBoundary>
  );
});


