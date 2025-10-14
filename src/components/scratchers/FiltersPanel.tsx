// src/components/scratchers/FiltersPanel.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './FiltersPanel.css';
import Info from 'src/components/Info';
import type { SortKey } from './types';

/** Existing filter model (unchanged) */
export type Filters = {
  q: string;
  priceMin: number;
  priceMax: number;
  minTopAvail: number;   // 0..1
  minTopRemain: number;  // int
  lifecycle: 'all' | 'new' | 'continuing';
  sortKey: SortKey;
  updatedAt?: string;
};

/** Explicit, SSR-safe control surface for desktop vs drawer */
export type FiltersPanelProps = Filters & {
  onChange: (patch: Partial<Filters>) => void;
  className?: string;
  /** Which edge the panel should slide from on small screens (when using .mobile-drawer). */
  side?: 'left' | 'right';
  /** If true, renders as a drawer (and portals to <body>); otherwise renders inline sticky card. */
  drawerMode: boolean;
  /** Drawer open/closed state (used only when drawerMode=true). */
  open: boolean;
  /** Backdrop/Escape handler (used only when drawerMode=true). */
  onClose?: () => void;
  /** Optional: reflect and control reversed sort (does not change Filters model) */
  isSortReversed?: boolean;
  onToggleSortReverse?: () => void;
  onSetSortReversed?: (v: boolean) => void;
};

// Reasonable, non-invasive assumptions for defaults (only used by Reset/chips)
const DEFAULTS: Readonly<Filters> = {
  q: '',
  priceMin: 1,
  priceMax: 50,
  minTopAvail: 0,
  minTopRemain: 0,
  lifecycle: 'all',
  sortKey: 'best' as SortKey,
  updatedAt: undefined,
};

// Optional URL sync (read once on mount; write on change)
const SYNC_QUERY = true as const;

export default function FiltersPanel(props: FiltersPanelProps) {
  const {
    q, priceMin, priceMax, minTopAvail, minTopRemain, lifecycle, sortKey, updatedAt,
    onChange,
    className = '',
    side = 'right',
    drawerMode,
    open,
    onClose,
    // optional sort reverse props
    isSortReversed,
    onToggleSortReverse,
  } = props;

  // Capture the initial observed maximum ticket price once (used as dynamic ceiling).
  const initialMaxRef = useRef<number>(priceMax);
  // If parent ever provides a higher max later (e.g., dataset changed), adopt it once.
  if (priceMax > initialMaxRef.current) initialMaxRef.current = priceMax;
  const PRICE_CEIL = initialMaxRef.current; // replaces hardcoded 50

  // ────────────────────────────────────────────────────────────────────────────
  // Local *string* state for free-typing (commit on blur/Enter)
  // ────────────────────────────────────────────────────────────────────────────
  const [qStr, setQStr] = useState<string>(q ?? '');
  const [pminStr, setPminStr] = useState<string>(String(priceMin));
  const [pmaxStr, setPmaxStr] = useState<string>(String(priceMax));
  const [toppctStr, setToppctStr] = useState<string>(String(Math.round(minTopAvail * 100)));
  const [topremainStr, setTopremainStr] = useState<string>(String(minTopRemain));
  const [announce, setAnnounce] = useState<string>('');
  const announceRef = useRef<number | null>(null);

  // Sync local strings whenever committed props change (e.g., reset/chips/url)
  useEffect(() => setQStr(q ?? ''), [q]);
  useEffect(() => setPminStr(String(priceMin)), [priceMin]);
  useEffect(() => setPmaxStr(String(priceMax)), [priceMax]);
  useEffect(() => setToppctStr(String(Math.round(minTopAvail * 100))), [minTopAvail]);
  useEffect(() => setTopremainStr(String(minTopRemain)), [minTopRemain]);

  // Debounce search → parent (200ms); do not debounce numeric commits
  useEffect(() => {
    const id = window.setTimeout(() => {
      if (qStr !== q) onChange({ q: qStr });
    }, 200);
    return () => window.clearTimeout(id);
  }, [qStr]); // eslint-disable-line react-hooks/exhaustive-deps

  // Helpers
  const digitsOnly = (s: string) => s.replace(/[^\d]/g, '');
  const parseIntLoose = (s: string): number | null => {
    const d = digitsOnly(s);
    if (d === '') return null;
    const n = parseInt(d, 10);
    return Number.isFinite(n) ? n : null;
  };
  const withAnnouncement = (msg: string | null) => {
    if (!msg) return;
    setAnnounce(msg);
    if (announceRef.current) window.clearTimeout(announceRef.current);
    announceRef.current = window.setTimeout(() => setAnnounce(''), 2500);
  };
  const preventWheelWhileFocused: React.WheelEventHandler<HTMLInputElement> = (e) => {
    // Prevent accidental value changes on trackpads while focused
    e.preventDefault();
  };
  const handleKeyCommit = (e: React.KeyboardEvent<HTMLInputElement>, onCommit: () => void, onRevert: () => void) => {
    if (e.key === 'Enter') onCommit();
    else if (e.key === 'Escape') onRevert();
  };

  // Committers (apply bounds + minimal cross-field correction)
  const commitPriceMin = () => {
    const maybe = parseIntLoose(pminStr);
    if (maybe == null) { setPminStr(String(priceMin)); return; }
    let newMin = clampInt(maybe, 1, PRICE_CEIL, priceMin);
    let newMax = priceMax;
    let note: string | null = null;
    if (newMin > newMax) { newMax = newMin; note = `Adjusted to $${newMin}–$${newMax}`; }
    onChange({ priceMin: newMin, priceMax: newMax });
    setPminStr(String(newMin));
    setPmaxStr(String(newMax));
    withAnnouncement(note);
  };
  const commitPriceMax = () => {
    const maybe = parseIntLoose(pmaxStr);
    if (maybe == null) { setPmaxStr(String(priceMax)); return; }
    let newMax = clampInt(maybe, 1, PRICE_CEIL, priceMax);
    let newMin = priceMin;
    let note: string | null = null;
    if (newMin > newMax) { newMin = newMax; note = `Adjusted to $${newMin}–$${newMax}`; }
    onChange({ priceMin: newMin, priceMax: newMax });
    setPminStr(String(newMin));
    setPmaxStr(String(newMax));
    withAnnouncement(note);
  };
  const commitTopPct = () => {
    const maybe = parseIntLoose(toppctStr);
    if (maybe == null) { setToppctStr(String(Math.round(minTopAvail * 100))); return; }
    const pct = clampInt(maybe, 0, 100, Math.round(minTopAvail * 100));
    onChange({ minTopAvail: pct / 100 });
    setToppctStr(String(pct));
  };
  const commitTopRemain = () => {
    const maybe = parseIntLoose(topremainStr);
    if (maybe == null) { setTopremainStr(String(minTopRemain)); return; }
    const rem = Math.max(0, maybe);
    onChange({ minTopRemain: rem });
    setTopremainStr(String(rem));
  };

  // Reset all filters to defaults (keeps updatedAt untouched)
  const resetAll = React.useCallback(() => {
    onChange({
      q: DEFAULTS.q,
      // Keep ceiling dynamic: min back to default, max to current ceiling.
      priceMin: DEFAULTS.priceMin,
      priceMax: PRICE_CEIL,
      minTopAvail: DEFAULTS.minTopAvail,
      minTopRemain: DEFAULTS.minTopRemain,
      lifecycle: DEFAULTS.lifecycle,
      sortKey: DEFAULTS.sortKey,
    });
    // local mirrors
    setQStr(DEFAULTS.q);
    setPminStr(String(DEFAULTS.priceMin));
    setPmaxStr(String(PRICE_CEIL));
    setToppctStr(String(Math.round(DEFAULTS.minTopAvail * 100)));
    setTopremainStr(String(DEFAULTS.minTopRemain));
  }, [onChange]);

  // Clear a single chip/field (priceMin chip clears both min/max)
  const clearField = React.useCallback((key: keyof Filters) => {
    switch (key) {
      case 'q':
        onChange({ q: DEFAULTS.q });
        setQStr(DEFAULTS.q);
        break;
      case 'priceMin':
      case 'priceMax':
        // Clear price → default min, dynamic ceiling for max
        onChange({ priceMin: DEFAULTS.priceMin, priceMax: PRICE_CEIL });
        setPminStr(String(DEFAULTS.priceMin));
        setPmaxStr(String(PRICE_CEIL));
        break;
      case 'minTopAvail':
        onChange({ minTopAvail: DEFAULTS.minTopAvail });
        setToppctStr(String(Math.round(DEFAULTS.minTopAvail * 100)));
        break;
      case 'minTopRemain':
        onChange({ minTopRemain: DEFAULTS.minTopRemain });
        setTopremainStr(String(DEFAULTS.minTopRemain));
        break;
      case 'lifecycle':
        onChange({ lifecycle: DEFAULTS.lifecycle });
        break;
      case 'sortKey':
        onChange({ sortKey: DEFAULTS.sortKey });
        break;
      default:
        // no-op for fields we don't chip
        break;
    }
  }, [onChange]);

  // ────────────────────────────────────────────────────────────────────────────
  // Build active-filter chips
  // ────────────────────────────────────────────────────────────────────────────
  const chips = useMemo(() => {
    const items: { key: keyof Filters; label: string }[] = [];

    if (q.trim() !== DEFAULTS.q) items.push({ key: 'q', label: `Search “${q.trim()}”` });

    if (priceMin !== DEFAULTS.priceMin || priceMax !== DEFAULTS.priceMax) {
      items.push({ key: 'priceMin', label: `Price $${priceMin}–$${priceMax}` });
    }
    if (minTopAvail !== DEFAULTS.minTopAvail) {
      items.push({ key: 'minTopAvail', label: `≥ ${Math.round(minTopAvail * 100)}% top prizes` });
    }
    if (minTopRemain !== DEFAULTS.minTopRemain) {
      items.push({ key: 'minTopRemain', label: `≥ ${minTopRemain} top prizes left` });
    }
    if (lifecycle !== DEFAULTS.lifecycle) {
      const name = lifecycle === 'new' ? 'New' : lifecycle === 'continuing' ? 'Continuing' : 'All';
      items.push({ key: 'lifecycle', label: name });
    }
    if (sortKey !== DEFAULTS.sortKey) {
      items.push({ key: 'sortKey', label: `Sort: ${readableSort(sortKey)}` });
    }
    return items;
  }, [q, priceMin, priceMax, minTopAvail, minTopRemain, lifecycle, sortKey]);

  // ────────────────────────────────────────────────────────────────────────────
  // URL querystring sync (read → parent; then write as filters change)
  // ────────────────────────────────────────────────────────────────────────────
  const hasReadFromUrl = useRef(false);
  useEffect(() => {
    if (!SYNC_QUERY || hasReadFromUrl.current || typeof window === 'undefined') return;
    hasReadFromUrl.current = true;

    // Use setTimeout to ensure this runs after hydration
    setTimeout(() => {
      const params = new URLSearchParams(window.location.search);
      if ([...params.keys()].length === 0) return;

      const patch: Partial<Filters> = {};
      if (params.has('q')) patch.q = params.get('q') || '';
      if (params.has('pmin')) patch.priceMin = clampInt(params.get('pmin'), 1, PRICE_CEIL, DEFAULTS.priceMin);
      if (params.has('pmax')) patch.priceMax = clampInt(params.get('pmax'), 1, PRICE_CEIL, PRICE_CEIL);
      if (params.has('toppct')) {
        const pct = clampInt(params.get('toppct'), 0, 100, Math.round(DEFAULTS.minTopAvail * 100));
        patch.minTopAvail = pct / 100;
      }
      if (params.has('topremain')) patch.minTopRemain = Math.max(0, parseInt(params.get('topremain') || '0', 10) || 0);
      if (params.has('life')) {
        const v = params.get('life');
        if (v === 'all' || v === 'new' || v === 'continuing') patch.lifecycle = v;
      }
      if (params.has('sort')) patch.sortKey = (params.get('sort') as SortKey) || DEFAULTS.sortKey;

      // Optional: read "rev" (reverse sort) if parent wants it
      if (props.onSetSortReversed && params.has('rev')) {
        const v = String(params.get('rev')).toLowerCase();
        const incoming = (v === '1' || v === 'true' || v === 'yes');
        const incomingSort = (params.get('sort') as SortKey) || DEFAULTS.sortKey;
        // For Launch date we want newest first by default → not reversed.
        if (incomingSort === 'startDate') {
          props.onSetSortReversed(false);
        } else {
          props.onSetSortReversed(incoming);
        }
      }

      if (Object.keys(patch).length) onChange(patch);
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!SYNC_QUERY || typeof window === 'undefined') return;

    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (priceMin !== DEFAULTS.priceMin) params.set('pmin', String(priceMin));
    // Compare against dynamic ceiling rather than static default
    if (priceMax !== PRICE_CEIL) params.set('pmax', String(priceMax));
    if (minTopAvail !== DEFAULTS.minTopAvail) params.set('toppct', String(Math.round(minTopAvail * 100)));
    if (minTopRemain !== DEFAULTS.minTopRemain) params.set('topremain', String(minTopRemain));
    if (lifecycle !== DEFAULTS.lifecycle) params.set('life', lifecycle);
    if (sortKey !== DEFAULTS.sortKey) params.set('sort', sortKey);
    // Preserve reverse toggle in URL if provided
    if (typeof isSortReversed === 'boolean' && isSortReversed) params.set('rev', '1');

    const qstr = params.toString();
    const url = qstr ? `?${qstr}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [q, priceMin, priceMax, minTopAvail, minTopRemain, lifecycle, sortKey, isSortReversed]);

  // ────────────────────────────────────────────────────────────────────────────
  // Drawer plumbing (SSR-safe)
  // ────────────────────────────────────────────────────────────────────────────
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  const drawerId = 'filters-drawer'; // unique aside id for aria-controls targeting

  // Create or reuse a stable portal node in <body>
  useEffect(() => {
    if (!drawerMode) return; // not needed for inline/desktop
    if (typeof document === 'undefined') return;

    const id = 'filters-drawer-portal';
    let el = document.getElementById(id) as HTMLElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    }
    setPortalEl(el);
  }, [drawerMode]);

  // ESC to close (only when drawer + open)
  useEffect(() => {
    if (!drawerMode || !open) return;
    if (typeof document === 'undefined') return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerMode, open, onClose]);

  // Simple focus trap while the drawer is open (match PastDrawsSidebar)
  useEffect(() => {
    if (!drawerMode || !open) return;
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const dlg = document.getElementById(drawerId);
      if (!dlg) return;
      const els = dlg.querySelectorAll<HTMLElement>(
        'button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'
      );
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [drawerMode, open]);

  // Background scroll lock (html)
  useEffect(() => {
    if (!drawerMode) return;
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    const prev = root.style.overflow;
    if (open) root.style.overflow = 'hidden';
    return () => {
      root.style.overflow = prev;
    };
  }, [drawerMode, open]);

  // a11y ids
  const ids = {
    title: 'filters-title',
    search: 'flt-q',
    pmin: 'flt-pmin',
    pmax: 'flt-pmax',
    toppct: 'flt-pct',
    topremain: 'flt-rem',
    lifecycle: 'flt-life',
    sort: 'flt-sort',
  };

  // Shared inner markup
  const inner = (
    <>
      {/* Header — mirror inline layout, plus X close on the right */}
      <div className="filters-header">
        <div className="filters-title-wrap">
          <div id={ids.title} className="filters-title">Filters &amp; Sort</div>
          {updatedAt && (
            <div className="filters-updated" aria-live="polite">
              Updated {new Date(updatedAt).toLocaleDateString()}
            </div>
          )}
          {/* polite area for commit adjustments */}
          <div className="hint-inline" aria-live="polite">{announce}</div>
        </div>
        {/* Inline-like controls: Reset (text) and Close (X) */}
        <div className="controls filters-controls">
          <button
            type="button"
            className="btn btn-primary filters-reset-btn"
            onClick={resetAll}
            aria-label="Reset all filters to defaults"
            title="Reset all"
          >
            <span className="filters-reset-text">Reset</span>
            <span className="filters-reset-icon" aria-hidden="true">↺</span>
          </button>
          {drawerMode && onClose && (
            <button
              type="button"
              className="filters-close-btn"
              onClick={onClose}
              aria-label="Close Filters"
              title="Close"
            >
              <span aria-hidden>✕</span>
            </button>
          )}
        </div>
      </div>

      {/* Chips */}
      {chips.length > 0 && (
        <div className="filters-chips" role="status" aria-live="polite">
          {chips.map(({ key, label }) => (
            <span className="filters-chip" key={key}>
              {label}
              <button
                type="button"
                className="chip-x"
                aria-label={`Clear ${label}`}
                onClick={() => clearField(key)}
                title="Clear"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      {/* Sections (shared markup for inline & drawer) */}
      <div className="filters-sections">
        {/* Sort */}
        <section aria-labelledby="sec-sort" className="filters-section">
          <h3 id="sec-sort" className="section-title">
            Sort by
          </h3>
          <div className="sort-row">
            <label htmlFor={ids.sort}>
              <span className="visually-hidden">Sort key</span>
            </label>
            <select
              id={ids.sort}
              value={sortKey}
              onChange={(e) => {
                const v = e.currentTarget.value as SortKey;
                onChange({ sortKey: v });
                // Ensure the default visual order for Launch date is "newest first"
                // (i.e., not reversed). This prevents sticky reverse from a prior key.
                if (props.onSetSortReversed) {
                  if (v === 'startDate') {
                    props.onSetSortReversed(false);
                  }
                }
                // Hint the table to show the matching left-bar view on mobile/compact
                if (v === 'topPrizesRemain' || v === '%topAvail') {
                  window.dispatchEvent(new CustomEvent<'top' | 'total'>('scratchers:leftMode', { detail: 'top' }));
                } else if (v === 'totalPrizesRemain' || v === '%totalAvail') {
                  window.dispatchEvent(new CustomEvent<'top' | 'total'>('scratchers:leftMode', { detail: 'total' }));
                }
              }}
              aria-label="Sort results by"
              className="filters-select compact-control"
            >
              <option value="best">Best</option>
              <option value="name">Name (A→Z)</option>
              <option value="startDate">Launch date</option>
              <option value="price">Ticket price</option>
              <option value="odds">Printed odds (lower = better)</option>
              <option value="adjusted">Adjusted odds (lower = better)</option>
              <option value="topPrizeValue">Top prize $</option>
              <option value="topPrizesRemain">Top prizes remaining</option>
              <option value="%topAvail">% top-prizes remaining</option>
              <option value="totalPrizesRemain">Total prizes remaining</option>
              <option value="%totalAvail">% total-prizes remaining</option>
            </select>
            <button
              type="button"
              className={`btn icon-only sort-reverse-btn ${isSortReversed ? 'is-pressed' : ''}`}
              aria-pressed={!!isSortReversed}
              aria-label={isSortReversed ? 'Reverse sort: on (descending relative to current key)' : 'Reverse sort: off (ascending/standard for key)'}
              title="Reverse sort"
              onClick={onToggleSortReverse}
            >↕</button>
          </div>
        </section>

        {/* Search */}
        <section aria-labelledby="sec-search" className="filters-section">
          <h3 id="sec-search" className="section-title">Search</h3>
          <label htmlFor={ids.search}>
            <span className="visually-hidden">Search name or game number</span>
          </label>
          <div className="input-wrap" data-has-suffix="false">
            <input
              id={ids.search}
              type="search"
              value={qStr}
              onChange={(e) => setQStr(e.currentTarget.value)}
              placeholder="Name or Game #"
              aria-label="Search name or game number"
              className="filters-input"
            />
          </div>
        </section>

        {/* Price */}
        <section aria-labelledby="sec-price" className="filters-section">
          <h3 id="sec-price" className="section-title">Price</h3>
          <div className="filters-price-grid">
            <label htmlFor={ids.pmin} className="filters-price-label">
              <span>Min price $</span>
              <div className="input-wrap" data-has-suffix="false">
                <input
                  id={ids.pmin}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pminStr}
                  onChange={(e) => setPminStr(e.currentTarget.value)}
                  onBlur={commitPriceMin}
                  onKeyDown={(e) => handleKeyCommit(e, commitPriceMin, () => setPminStr(String(priceMin)))}
                  onWheel={preventWheelWhileFocused}
                  aria-label="Minimum ticket price"
                  aria-describedby="price-hint"
                  className="filters-input"
                />
              </div>
            </label>

            <label htmlFor={ids.pmax} className="filters-price-label">
              <span>Max price $</span>
              <div className="input-wrap" data-has-suffix="false">
                <input
                  id={ids.pmax}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={pmaxStr}
                  onChange={(e) => setPmaxStr(e.currentTarget.value)}
                  onBlur={commitPriceMax}
                  onKeyDown={(e) => handleKeyCommit(e, commitPriceMax, () => setPmaxStr(String(priceMax)))}
                  onWheel={preventWheelWhileFocused}
                  aria-label="Maximum ticket price"
                  aria-describedby="price-hint"
                  className="filters-input"
                />
              </div>
            </label>
          </div>
          <div className="filters-hint" aria-live="polite" id="price-hint">
            Range $1–${PRICE_CEIL}
          </div>
        </section>

        {/* Top Prizes */}
        <section aria-labelledby="sec-top" className="filters-section">
          <h3 id="sec-top" className="section-title">Top Prizes</h3>
          <div className="filters-prizes-grid">
            <label htmlFor={ids.toppct} className="filters-prize-label">
              <span>Min top-prize %</span>
              <div className="input-wrap" data-has-suffix="false">
                <input
                  id={ids.toppct}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={toppctStr}
                  onChange={(e) => setToppctStr(e.currentTarget.value)}
                  onBlur={commitTopPct}
                  onKeyDown={(e) => handleKeyCommit(e, commitTopPct, () => setToppctStr(String(Math.round(minTopAvail * 100))))}
                  onWheel={preventWheelWhileFocused}
                  aria-label="Minimum percent of top prizes remaining"
                  className="filters-input"
                />
              </div>
            </label>

            <label htmlFor={ids.topremain} className="filters-prize-label">
              <span>Min top-prizes left</span>
              <div className="input-wrap" data-has-suffix="false">
                <input
                  id={ids.topremain}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  value={topremainStr}
                  onChange={(e) => setTopremainStr(e.currentTarget.value)}
                  onBlur={commitTopRemain}
                  onKeyDown={(e) => handleKeyCommit(e, commitTopRemain, () => setTopremainStr(String(minTopRemain)))}
                  onWheel={preventWheelWhileFocused}
                  aria-label="Minimum number of top prizes remaining"
                  className="filters-input"
                />
              </div>
            </label>
          </div>
        </section>

        {/* Status */}
        <section aria-labelledby="sec-status" className="filters-section">
          <h3 id="sec-status" className="section-title">Status</h3>
          <label htmlFor={ids.lifecycle}>
            <span className="visually-hidden">Game lifecycle</span>
          </label>
          <select
            id={ids.lifecycle}
            value={lifecycle}
            onChange={(e) => onChange({ lifecycle: e.currentTarget.value as Filters['lifecycle'] })}
            aria-label="Game lifecycle"
            className="filters-select compact-control"
          >
            <option value="all">All active</option>
            <option value="new">New</option>
          </select>
        </section>
      </div>
    </>
  );

  // ────────────────────────────────────────────────────────────────────────────
  // Render: inline sticky (desktop) vs. portal drawer (mobile/tablet)
  // ────────────────────────────────────────────────────────────────────────────
  if (!drawerMode) {
    // Desktop inline sticky card
    return (
      <aside
        className={`filters-panel ${className}`}
        aria-label="Filters panel"
      >
        {inner}
      </aside>
    );
  }

  // Drawer mode (portal to <body>)
  if (!portalEl) return null;

  const drawerClasses = [
    'filters-panel',
    'mobile-drawer',
    side === 'left' ? 'left' : 'right',
    open ? 'open' : '',
    className,
  ].filter(Boolean).join(' ');

  return createPortal(
    <>
      {open && (
        <div
          className="filters-backdrop"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={drawerClasses}
        id={drawerId}
        role="dialog"
        aria-modal="true"
        aria-labelledby={ids.title}
        aria-hidden={!open}
      >
        {inner}
      </aside>
    </>,
    portalEl
  );
}

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
function clampInt(v: string | number | null, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : parseInt(String(v || ''), 10);
  if (Number.isFinite(n)) return Math.max(min, Math.min(max, n));
  return fallback;
}

function readableSort(k: SortKey): string {
  switch (k) {
    case 'best': return 'Best';
    case 'adjusted': return 'Adjusted odds';
    case 'odds': return 'Printed odds';
    case 'price': return 'Ticket price';
    case 'topPrizeValue': return 'Top prize $';
    case 'topPrizesRemain': return 'Top prizes remaining';
    case '%topAvail': return '% top-prizes remaining';
    case 'totalPrizesRemain': return 'Total prizes remaining';
    case '%totalAvail': return '% total-prizes remaining';
    case 'name': return 'Name (A→Z)';
    // Forward-compat with parent if it supports this key
    case 'startDate': return 'Launch date';
    default: return String(k);
  }
}
