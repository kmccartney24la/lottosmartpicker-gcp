// src/components/PastDrawsSidebar.tsx
'use client';
import './PastDrawsSidebar.css';
import { ErrorBoundary } from 'apps/web/src/components/ErrorBoundary';
import { useDrawerSwipe } from 'apps/web/src/hooks/useDrawerSwipe';
import type {
  LottoRow,
  GameKey,
  LogicalGameKey,
  Period,
  QuickDrawRow,
  Pick10Row,
  DigitRow,
} from '@lsp/lib';
import { toPastDrawsDigitsView, getCurrentEraConfig, } from '@lsp/lib';
import { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  resolveGameMeta,
  sidebarModeFor,
  sidebarHeaderLabel,
  sidebarDateKey,
  rowToFiveView,
  type FiveLikeRow,
  type SidebarMode,
  // use the registry's meta-driven helper (shape-aware)
  digitsKFor,
} from '@lsp/lib';



/*
 * New: shape-aware payload (backward compatible).
 */
export type PastDrawsPayload =
  | { kind: 'five'; rows: LottoRow[]; game?: GameKey }
  // Allow FL digits too: k may be 2 | 3 | 4 | 5
  | { kind: 'digits'; rows: DigitRow[]; k: 2 | 3 | 4 | 5 }
  // Florida digits with Fireball (optional) — rows shaped locally
  | { kind: 'digits_fb'; rows: { date: string; digits: number[]; fb?: number }[]; k: 2 | 3 | 4 | 5 }
  | { kind: 'pick10'; rows: Pick10Row[] }
  | { kind: 'quickdraw'; rows: QuickDrawRow[] }
  // Optional explicit NY Lotto extended shape if parent provides it
  | { kind: 'ny_lotto'; rows: { date: string; mains: number[]; bonus: number }[] }
  // NEW: Texas All or Nothing (12 from 24)
  | { kind: 'all_or_nothing'; rows: { date: string; values: number[] }[] }
  // NEW: Cash Pop (1 number per draw)
  | { kind: 'cashpop'; rows: { date: string; value: number }[] };

function PastDrawsSidebarInner({
  open, onClose, compact, setCompact, pageRows, page, pageCount, setPage, total,
  side = 'right',
  sortDir,
  onToggleSort,
  game,
  logical,
  period,
  payload,
}: {
  open: boolean;
  onClose: () => void;
  compact: boolean;
  setCompact: (v: boolean) => void;
  pageRows: LottoRow[]; // legacy
  page: number;
  pageCount: number;
  setPage: (fn: (p: number) => number) => void;
  total: number;
  /** Optional: render as right drawer (default) */
  side?: 'left' | 'right' | 'bottom';
  /** Optional: if provided, shows a button to toggle sort direction */
  sortDir?: 'desc' | 'asc';
  onToggleSort?: () => void;
  /** Canonical game key for theming (PB/MM/C4L/Fantasy5). Omit for NY logical games. */
  game?: GameKey;
  /** NY logical key + period when not canonical (for data attrs / a11y only). */
  logical?: LogicalGameKey;
  period?: Period;
  /** New: shape-aware payload. When present, legacy pageRows are ignored. */
  payload?: PastDrawsPayload;
}) {
  // Mount target for the drawer/backdrop
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const id = 'past-draws-portal';
    let el = typeof document !== 'undefined' ? (document.getElementById(id) as HTMLElement | null) : null;
    if (!el && typeof document !== 'undefined') {
      el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    }
    setPortalEl(el);
  }, []);

  // Prevent body scroll when drawer is open
  useEffect(() => {
    if (!open) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [open]);

  // Focus handling
  const closeRef = useRef<HTMLButtonElement | null>(null);
  useEffect(() => { if (open) closeRef.current?.focus(); }, [open]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => {
    if (!open) return;
    function trap(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const dlg = document.getElementById('past-draws');
      if (!dlg) return;
      const els = dlg.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
      if (!els.length) return;
      const first = els[0], last = els[els.length - 1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [open]);

  // ---------- Shape detection ----------
  // Resolve game metadata ONCE and before any usage
  const meta = useMemo(() => resolveGameMeta(game, logical), [game, logical]);
  // Map meta (+ optional payload kind) to a concrete sidebar mode
  const inferredMode: SidebarMode = useMemo(
    () => sidebarModeFor(meta, payload?.kind),
    [meta, payload?.kind]
  );

  // ---------- Normalization to a common row view ----------
  type ViewRow = {
    date: string;
    values: number[];
    special?: number;
    label: 'Numbers' | 'Digits';
    sep?: boolean;
    specialLabel?: string;   // e.g., 'Bonus' | 'Special' | 'Fireball'
    specialClass?: string;   // fully resolved CSS class for the special bubble
  };

  const viewRows: ViewRow[] = useMemo(() => {
    const rows: ViewRow[] = [];

    const asFive = (rowsIn: LottoRow[], fiveGame?: GameKey) => {
      const g = (fiveGame || game || rowsIn[0]?.game) as GameKey | undefined;
      const m = resolveGameMeta(g, logical);
      const eraCfg = g ? getCurrentEraConfig(g) : ({ mainPick: 5 } as any);
      for (const r of rowsIn) {
        const v = rowToFiveView(r as unknown as FiveLikeRow, m, { gameStr: g, eraCfg });
        rows.push({
          date: r.date,
          values: v.mains,
          special: v.special,
          label: 'Numbers',
          sep: v.sep,
          specialLabel: v.label,
          specialClass: v.className,
        });
      }
    };


    if (payload) {
      switch (payload.kind) {
        case 'five':
          asFive(payload.rows, payload.game);
          break;
          case 'all_or_nothing': {
          for (const r of payload.rows) {
            const vals = (r.values || []).filter(n => Number.isFinite(n) && n >= 1 && n <= 24).slice(0, 12);
            rows.push({
              date: r.date,
              values: vals,
              label: 'Numbers',
            });
          }
          break;
        }
          case 'cashpop': {
          for (const r of payload.rows) {
            rows.push({
              date: r.date,
              values: [r.value],
              label: 'Digits',
            });
          }
          break;
        }
          case 'digits_fb': {
          const k = payload.k;
          for (const r of payload.rows) {
            const view = toPastDrawsDigitsView(r, k);
            rows.push({
              date: view.date,
              values: view.values,
              special: view.special,
              label: 'Digits',
              sep: view.sep,
              specialLabel: view.specialLabel,
              specialClass: view.special ? 'num-bubble--fireball' : undefined,
            });
          }
          break;
        }
        case 'ny_lotto': {
          for (const r of payload.rows) {
            rows.push({
              date: r.date,
              values: (r.mains || []).slice(0, 6),
              special: r.bonus,
              label: 'Numbers',
              sep: true,
              specialLabel: 'Bonus',
              // Keep NY Lotto bonus styling consistent with SelectedLatest
              specialClass: 'num-bubble--nylotto-bonus',
            });
          }
          break;
        }
        case 'digits': {
          const k = payload.k;
          for (const r of payload.rows) {
            rows.push({ date: r.date, values: (r.digits || []).slice(0, k), label: 'Digits' });
          }
          break;
        }
        case 'pick10': {
          for (const r of payload.rows) {
            rows.push({ date: r.date, values: (r.values || []).slice(0, 10), label: 'Numbers' });
          }
          break;
        }
        case 'quickdraw': {
          for (const r of payload.rows) {
            rows.push({ date: r.date, values: (r.values || []).slice(0, 20), label: 'Numbers' });
          }
          break;
        }
      }
      return rows;
    }

    if (inferredMode === 'cashpop') {
      // No payload? We can't infer Cash Pop from five-ball pageRows — show hint.
      // (Parent should pass a payload; keep graceful fallback.)
      return rows;
    }

    // Legacy path (no payload): infer from logical and pageRows
    if (inferredMode === 'digits') {
      // Determine digit length straight from registry meta.
      const k = (digitsKFor(meta) ?? 3) as 2 | 3 | 4 | 5;
      const showFireball = !!meta.usesFireball;
      for (const r of pageRows) {
        const d = [r.n1, r.n2, r.n3, r.n4, r.n5]
          .filter(n => Number.isFinite(n) && n >= 0 && n <= 9)
          .slice(0, k);
        if (!d.length) continue;
        rows.push({
          date: r.date,
          values: d,
          special: showFireball && typeof r.special === 'number' ? r.special : undefined,
          label: 'Digits',
          sep: showFireball && typeof r.special === 'number',
          specialLabel: showFireball ? 'Fireball' : undefined,
          specialClass: showFireball && typeof r.special === 'number' ? 'num-bubble--fireball' : undefined,
        });
      }
      return rows;
    }

    if (inferredMode === 'pick10') {
      for (const r of pageRows) {
        const v = [r.n1, r.n2, r.n3, r.n4, r.n5]
          .filter(n => Number.isFinite(n) && n >= 1 && n <= 80);
        // Legacy shim only carries first 5 — still render what we have; parents can upgrade via payload
        rows.push({ date: r.date, values: v, label: 'Numbers' });
      }
      return rows;
    }

    if (inferredMode === 'quickdraw') {
      for (const r of pageRows) {
        const v = [r.n1, r.n2, r.n3, r.n4, r.n5]
          .filter(n => Number.isFinite(n) && n >= 1 && n <= 80);
        rows.push({ date: r.date, values: v, label: 'Numbers' });
      }
      return rows;
    }

    if (inferredMode === 'ny_lotto') {
      // Treat as five-ish but with 6 mains + Bonus when available
      asFive(pageRows, 'ny_lotto');
      return rows;
    }

    // Default: classic five-ball (PB/MM/C4L/Fantasy5/Take 5)
    asFive(pageRows, game);
    return rows;
  }, [payload, pageRows, game, logical, inferredMode, meta]);

  // ---------- Sorting (Newest → Oldest by default) ----------
  const effectiveSortDir: 'desc' | 'asc' = sortDir ?? 'desc';
  const sortedViewRows = useMemo(() => {
    return [...viewRows].sort((a, b) =>
      effectiveSortDir === 'desc'
        ? sidebarDateKey(b.date) - sidebarDateKey(a.date)
        : sidebarDateKey(a.date) - sidebarDateKey(b.date)
    );
  }, [viewRows, effectiveSortDir]);

  // Soft render guard: never render more than N rows to avoid jank/crashes.
 // Keep this generous; parent should still paginate/cap at fetch time.
 const MAX_RENDER_ROWS = 2000; // tune to taste
 const rowsToRender = (() => {
    if (sortedViewRows.length <= MAX_RENDER_ROWS) {
      return sortedViewRows;
    }
    // If we're showing newest → oldest, we want the *first* N (they're the newest).
    // If we're showing oldest → newest, we want the *last* N (they're the newest).
    if (effectiveSortDir === 'desc') {
      return sortedViewRows.slice(0, MAX_RENDER_ROWS);
    }
    // asc: oldest → newest
    return sortedViewRows.slice(-MAX_RENDER_ROWS);
  })();

  const headerLabel =
    viewRows[0]?.label || sidebarHeaderLabel(meta, inferredMode);

  // Unified swipe-to-close
  const { ref: asideRef, touchHandlers } = useDrawerSwipe({
    open,
    side,
    onClose,
    thresholdRatio: 0.33, // match FiltersPanel behavior
  });

  if (!portalEl) return null;
  return createPortal(
    <>
      {open && <div className="backdrop" onClick={onClose} aria-hidden="true" />}
      <aside
        id="past-draws"
        className={`sidebar ${side === 'left' ? 'left' : side === 'right' ? 'right' : 'bottom'} ${open ? 'open' : ''}`}
        data-game={game ?? logical ?? 'logical'}
        role="dialog"
        aria-modal="true"
        aria-labelledby="past-draws-title"
        aria-hidden={!open}
        ref={asideRef}
        {...touchHandlers}
      >
        <div className="sidebar-header">
          <div className="sidebar-title-wrap">
            <div id="past-draws-title" className="sidebar-title">Past Draws</div>
          </div>
          <div className="sidebar-primary">
            {typeof sortDir !== 'undefined' && onToggleSort && (
              <button
                className="sidebar-sort-btn"
                title="Toggle sort order by date"
                onClick={onToggleSort}
                aria-label="Toggle sort order by date"
              >
                <span className="sidebar-sort-text">Sort: {sortDir === 'desc' ? 'Newest → Oldest' : 'Oldest → Newest'}</span>
                <span className="sidebar-sort-short" aria-hidden="true">{sortDir === 'desc' ? '↓' : '↑'}</span>
              </button>
            )}
          </div>
          <div className="sidebar-secondary">
            <label className="sidebar-compact-label" title="Compact reduces padding and font size to show more rows per page.">
              <input type="checkbox" checked={compact} onChange={(e) => setCompact(e.target.checked)} />
              <span>Compact</span>
            </label>
            <button
              ref={closeRef}
              className="sidebar-close-btn"
              onClick={onClose}
              aria-label="Close Past Draws"
              title="Close"
            >
              <span aria-hidden="true">✕</span>
            </button>
          </div>
        </div>

        <div
          className={`sidebar-content ${compact ? 'compact' : ''}`}
          style={compact ? ({ ['--rows-per-page' as any]: 25 } as React.CSSProperties) : undefined}
        >
          <div id="results-panel" role="region" aria-label="Fetched draw results" className="sidebar-table-container">
            <table className="sidebar-table" key={inferredMode}>
              <colgroup>
                <col className="col-date" />
                <col className="col-numbers" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">{headerLabel}</th>
                </tr>
              </thead>
              <tbody>
                {viewRows.length === 0 && (
                  <tr><td colSpan={2} className="hint">No rows.</td></tr>
                )}
                {sortedViewRows.length > rowsToRender.length && (
                 <tr>
                   <td colSpan={2} className="hint">
                     Showing the most recent {rowsToRender.length.toLocaleString()} rows for performance.
                   </td>
                 </tr>
               )}
                {rowsToRender.map((r, idx) => {
                  const showSep = r.sep && typeof r.special !== 'undefined';
                  const specialTitle = r.specialLabel || 'Special';
                  const specialClass = r.specialClass || 'num-bubble--amber';
                  return (
                    <tr key={`${r.date}-${idx}`}>
                      <td className="mono date-cell">{r.date}</td>
                      <td className="numbers-cell" aria-label={r.label}>
                        {r.values.map((n, i) => (
                          <span className="num-bubble" key={i}>{n}</span>
                        ))}
                        {showSep && (
                          <>
                            <span className="numbers-sep" aria-hidden="true">|</span>
                            <span
                              className={`num-bubble ${specialClass}`}
                              title={specialTitle}
                            >
                              <span className="sr-only">{specialTitle} </span>
                              {typeof r.special === 'number' ? r.special : '—'}
                            </span>
                          </>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <div className="sidebar-pagination" role="contentinfo">
          <div className="sidebar-pagination-info">
            Showing {(page - 1) * 25 + 1}–{Math.min(page * 25, total)} of {total}
          </div>
          <div className="sidebar-pagination-controls">
            <button className="btn btn-ghost" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}>
              <span className="sidebar-nav-text">Prev</span>
              <span className="sidebar-nav-icon" aria-hidden="true">‹</span>
            </button>
            <span className="sidebar-page-info">Page {page} / {pageCount}</span>
            <button className="btn btn-ghost" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={page >= pageCount}>
              <span className="sidebar-nav-text">Next</span>
              <span className="sidebar-nav-icon" aria-hidden="true">›</span>
            </button>
          </div>
        </div>
      </aside>
    </>,
    portalEl
  );
}

// --- Component-level Error Boundary wrapper ---
export default function PastDrawsSidebar(props: {
  open: boolean;
  onClose: () => void;
  compact: boolean;
  setCompact: (v: boolean) => void;
  pageRows: LottoRow[];
  page: number;
  pageCount: number;
  setPage: (fn: (p: number) => number) => void;
  total: number;
  side?: 'left' | 'right' | 'bottom';
  sortDir?: 'desc' | 'asc';
  onToggleSort?: () => void;
  game?: GameKey;
  logical?: LogicalGameKey;
  period?: Period;
  payload?: PastDrawsPayload;
}) {
  // Remount (reset) the boundary when key inputs change.
  const resetKey = JSON.stringify({
    game: props.game ?? null,
    logical: props.logical ?? null,
    period: props.period ?? null,
    payloadKind: props.payload?.kind ?? null,
    side: props.side ?? 'right',
  });
  return (
    <ErrorBoundary key={resetKey}>
      <PastDrawsSidebarInner {...props} />
    </ErrorBoundary>
  );
}
