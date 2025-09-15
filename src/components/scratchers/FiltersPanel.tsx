'use client';
import { useEffect, useMemo, useRef } from 'react';
import type { SortKey } from './types';

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

type Props = Filters & { onChange: (patch: Partial<Filters>) => void };

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

// Optional URL sync (read once on mount; write on change). Set to false to disable.
const SYNC_QUERY = true as const;

export default function FiltersPanel(props: Props) {
  const {
    q, priceMin, priceMax, minTopAvail, minTopRemain, lifecycle, sortKey, updatedAt, onChange,
  } = props;

  // ── Build active-filter chips
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

  // ── URL querystring sync (read → parent; then write as filters change)
  const hasReadFromUrl = useRef(false);
  useEffect(() => {
    if (!SYNC_QUERY || hasReadFromUrl.current) return;
    hasReadFromUrl.current = true;

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!SYNC_QUERY) return;
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

  // ── Handlers
  const resetAll = () => {
    const { updatedAt: _skip, ...plain } = DEFAULTS;
    onChange(plain);
  };
  const clearField = (key: keyof Filters) => {
    if (key === 'priceMin' || key === 'priceMax') {
      onChange({ priceMin: DEFAULTS.priceMin, priceMax: DEFAULTS.priceMax });
      return;
    }
    onChange({ [key]: (DEFAULTS as any)[key] });
  };

  // ── Accessible IDs
  const ids = {
    search: 'flt-q',
    pmin: 'flt-pmin',
    pmax: 'flt-pmax',
    toppct: 'flt-pct',
    topremain: 'flt-rem',
    lifecycle: 'flt-life',
    sort: 'flt-sort',
  };

  return (
    <aside
      className="card"
      style={{ position: 'sticky', top: 16, alignSelf: 'start', maxWidth: 260 }}
      aria-label="Filters panel"
    >
      {/* Header */}
      <div className="section-title" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <div>
          <strong>Filters &amp; Sort</strong>
          {updatedAt && (
            <div
              className="hint mono"
              style={{ marginTop: 4, fontWeight: 400 }}
              aria-live="polite"
            >
              Updated {updatedAt}
            </div>
          )}
        </div>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={resetAll}
          aria-label="Reset all filters to defaults"
          title="Reset all"
        >
          Reset
        </button>
      </div>

      {/* Chips */}
      {chips.length > 0 && (
        <div className="chips" role="status" aria-live="polite" style={{ marginBottom: 8 }}>
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
      <div className="stack" style={{ display: 'grid', gap: 'var(--stack-gap)' }}>

        {/* Sort */}
        <section aria-labelledby="sec-sort">
          <h3 id="sec-sort" className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 6}}>
            Sort by
          </h3>
          <label htmlFor={ids.sort}>
            <span className="visually-hidden">Sort key</span>
          </label>
          <select
            id={ids.sort}
            value={sortKey}
            onChange={(e) => onChange({ sortKey: e.currentTarget.value as SortKey })}
            aria-label="Sort results by"
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
      </div>
    

        {/* Search */}
        <section aria-labelledby="sec-search">
          <h3 id="sec-search" className="section-title">Search</h3>
          <label htmlFor={ids.search}>
            <span className="visually-hidden">Search name or game number</span>
          </label>
          <div className="input-wrap" data-has-suffix="false">
            <input
              id={ids.search}
              type="search"               // consistent single-line control
              value={q}
              onChange={(e) => onChange({ q: e.target.value })}
              placeholder="Name or Game #"
              aria-label="Search name or game number"
            />
          </div>
        </section>

        {/* Price */}
        <section aria-labelledby="sec-price">
          <h3 id="sec-price" className="section-title">Price</h3>
          <div
            className="grid"
            style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}
          >
            <label htmlFor={ids.pmin} className="mt-0" style={{ minWidth: 0 }}>
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
                />
                <span className="inside-suffix">$</span>
              </div>
            </label>

            <label htmlFor={ids.pmax} style={{ minWidth: 0 }}>
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
                />
                <span className="inside-suffix">$</span>
              </div>
            </label>
          </div>
          <div
            className="hint mono"
            style={{ marginTop: 4, fontWeight: 400 }}
            aria-live="polite"
            id="price-hint"
          >
            Range $1–$50
          </div>
        </section>

        {/* Top Prizes */}
        <section aria-labelledby="sec-top">
          <h3 id="sec-top" className="section-title">Top Prizes</h3>
          <div
            className="grid"
            style={{ gridTemplateColumns: 'repeat(2, minmax(0,1fr))', gap: 8 }}
          >
            <label htmlFor={ids.toppct} style={{ minWidth: 0 }}>
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
                />
                <span className="inside-suffix">%</span>
              </div>
            </label>

            <label htmlFor={ids.topremain} style={{ minWidth: 0 }}>
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
                      minTopRemain: Math.max(
                        0,
                        parseInt(e.currentTarget.value || '0', 10) || 0
                      ),
                    })
                  }
                  aria-label="Minimum number of top prizes remaining"
                />
              </div>
            </label>
          </div>
        </section>

        {/* Status */}
        <section aria-labelledby="sec-status">
          <h3 id="sec-status" className="section-title">Status</h3>
          <label htmlFor={ids.lifecycle}>
            <span className="visually-hidden">Game lifecycle</span>
          </label>
          <select
            id={ids.lifecycle}
            value={lifecycle}
            onChange={(e) => onChange({ lifecycle: e.currentTarget.value as Filters['lifecycle'] })}
            aria-label="Game lifecycle"
          >
            <option value="all">All active</option>
            <option value="new">New only</option>
            <option value="continuing">Continuing only</option>
          </select>
        </section>
    </aside>
  );
}

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
