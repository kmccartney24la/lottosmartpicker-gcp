// src/components/scratchers/FiltersPanel.tsx
'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './FiltersPanel.css';
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
  } = props;

  // Reset all filters to defaults (keeps updatedAt untouched)
  const resetAll = React.useCallback(() => {
    onChange({
      q: DEFAULTS.q,
      priceMin: DEFAULTS.priceMin,
      priceMax: DEFAULTS.priceMax,
      minTopAvail: DEFAULTS.minTopAvail,
      minTopRemain: DEFAULTS.minTopRemain,
      lifecycle: DEFAULTS.lifecycle,
      sortKey: DEFAULTS.sortKey,
    });
  }, [onChange]);

  // Clear a single chip/field (priceMin chip clears both min/max)
  const clearField = React.useCallback((key: keyof Filters) => {
    switch (key) {
      case 'q':
        onChange({ q: DEFAULTS.q });
        break;
      case 'priceMin':
      case 'priceMax':
        onChange({ priceMin: DEFAULTS.priceMin, priceMax: DEFAULTS.priceMax });
        break;
      case 'minTopAvail':
        onChange({ minTopAvail: DEFAULTS.minTopAvail });
        break;
      case 'minTopRemain':
        onChange({ minTopRemain: DEFAULTS.minTopRemain });
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
      if (params.has('pmin')) patch.priceMin = clampInt(params.get('pmin'), 1, 50, DEFAULTS.priceMin);
      if (params.has('pmax')) patch.priceMax = clampInt(params.get('pmax'), 1, 50, DEFAULTS.priceMax);
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

      if (Object.keys(patch).length) onChange(patch);
    }, 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!SYNC_QUERY || typeof window === 'undefined') return;

    const params = new URLSearchParams();
    if (q.trim()) params.set('q', q.trim());
    if (priceMin !== DEFAULTS.priceMin) params.set('pmin', String(priceMin));
    if (priceMax !== DEFAULTS.priceMax) params.set('pmax', String(priceMax));
    if (minTopAvail !== DEFAULTS.minTopAvail) params.set('toppct', String(Math.round(minTopAvail * 100)));
    if (minTopRemain !== DEFAULTS.minTopRemain) params.set('topremain', String(minTopRemain));
    if (lifecycle !== DEFAULTS.lifecycle) params.set('life', lifecycle);
    if (sortKey !== DEFAULTS.sortKey) params.set('sort', sortKey);

    const qstr = params.toString();
    const url = qstr ? `?${qstr}` : window.location.pathname;
    window.history.replaceState(null, '', url);
  }, [q, priceMin, priceMax, minTopAvail, minTopRemain, lifecycle, sortKey]);

  // ────────────────────────────────────────────────────────────────────────────
  // Drawer plumbing (SSR-safe)
  // ────────────────────────────────────────────────────────────────────────────
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);

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
      {/* Header */}
      <div className="filters-header">
        <div className="filters-title-section">
          <strong id={ids.title}>Filters &amp; Sort</strong>
          {updatedAt && (
            <div className="filters-updated" aria-live="polite">
              Updated {updatedAt}
            </div>
          )}
        </div>
        <div className="controls header-controls filters-actions">
          {drawerMode && onClose && (
            <button
              type="button"
              className="btn btn-ghost filters-close-btn"
              onClick={onClose}
              aria-label="Close filters"
              title="Close"
            >
              ×
            </button>
          )}
          <button
            type="button"
            className="btn btn-ghost filters-reset-btn"
            onClick={resetAll}
            aria-label="Reset all filters to defaults"
            title="Reset all"
          >
            <span className="filters-reset-text">Reset</span>
            <span className="filters-reset-icon" aria-hidden="true">↺</span>
          </button>
        </div>
      </div>

      {/* Chips */}
      {chips.length > 0 && (
        <div className="chips filters-chips" role="status" aria-live="polite">
          {chips.map(({ key, label }) => (
            <span className="chip" key={key}>
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

      {/* Sections */}
      <div className="filters-sections">
        {/* Sort */}
        <section aria-labelledby="sec-sort" className="filters-section">
          <h3 id="sec-sort" className="section-title">Sort by</h3>
          <label htmlFor={ids.sort}>
            <span className="visually-hidden">Sort key</span>
          </label>
          <select
            id={ids.sort}
            value={sortKey}
            onChange={(e) => onChange({ sortKey: e.currentTarget.value as SortKey })}
            aria-label="Sort results by"
            className="filters-select compact-control"
          >
            <option value="best">Best (price ↓ then adjusted ↑)</option>
            <option value="adjusted">Adjusted odds (lower = better)</option>
            <option value="odds">Printed odds (lower = better)</option>
            <option value="price">Ticket price</option>
            <option value="topPrizeValue">Top prize $</option>
            <option value="topPrizesRemain">Top prizes remaining</option>
            <option value="%topAvail">% top-prizes remaining</option>
            <option value="name">Name (A→Z)</option>
          </select>
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
              value={q}
              onChange={(e) => onChange({ q: e.target.value })}
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
              <span>Min price</span>
              <div className="input-wrap" data-has-suffix="true">
                <input
                  id={ids.pmin}
                  type="number"
                  min={1}
                  max={50}
                  step={1}
                  value={priceMin}
                  onChange={(e) =>
                    onChange({ priceMin: clampInt(e.currentTarget.value, 1, 50, 1) })
                  }
                  aria-label="Minimum ticket price"
                  aria-describedby="price-hint"
                  className="filters-input"
                />
                <span className="inside-suffix">$</span>
              </div>
            </label>

            <label htmlFor={ids.pmax} className="filters-price-label">
              <span>Max price</span>
              <div className="input-wrap" data-has-suffix="true">
                <input
                  id={ids.pmax}
                  type="number"
                  min={1}
                  max={50}
                  step={1}
                  value={priceMax}
                  onChange={(e) =>
                    onChange({ priceMax: clampInt(e.currentTarget.value, 1, 50, 50) })
                  }
                  aria-label="Maximum ticket price"
                  aria-describedby="price-hint"
                  className="filters-input"
                />
                <span className="inside-suffix">$</span>
              </div>
            </label>
          </div>
          <div className="filters-hint" aria-live="polite" id="price-hint">
            Range $1–$50
          </div>
        </section>

        {/* Top Prizes */}
        <section aria-labelledby="sec-top" className="filters-section">
          <h3 id="sec-top" className="section-title">Top Prizes</h3>
          <div className="filters-prizes-grid">
            <label htmlFor={ids.toppct} className="filters-prize-label">
              <span>Min top-prize %</span>
              <div className="input-wrap" data-has-suffix="true">
                <input
                  id={ids.toppct}
                  type="number"
                  min={0}
                  max={100}
                  step={5}
                  value={Math.round(minTopAvail * 100)}
                  onChange={(e) => {
                    const pct = clampInt(e.currentTarget.value, 0, 100, 0);
                    onChange({ minTopAvail: pct / 100 });
                  }}
                  aria-label="Minimum percent of top prizes remaining"
                  className="filters-input"
                />
                <span className="inside-suffix">%</span>
              </div>
            </label>

            <label htmlFor={ids.topremain} className="filters-prize-label">
              <span>Min top-prizes left</span>
              <div className="input-wrap" data-has-suffix="false">
                <input
                  id={ids.topremain}
                  type="number"
                  min={0}
                  step={1}
                  value={minTopRemain}
                  onChange={(e) =>
                    onChange({
                      minTopRemain: Math.max(0, parseInt(e.currentTarget.value || '0', 10) || 0),
                    })
                  }
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
            <option value="new">New only</option>
            <option value="continuing">Continuing only</option>
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
    case 'name': return 'Name (A→Z)';
    default: return String(k);
  }
}
