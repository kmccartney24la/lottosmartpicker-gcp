// src/components/PastDrawsSidebar.tsx
'use client';
import './PastDrawsSidebar.css';
import {
  LottoRow,
  GameKey,
  LogicalGameKey,
  Period,
  getCurrentEraConfig,
  type DigitRow,
  type Pick10Row,
  type QuickDrawRow,
} from '@lib/lotto';
import { useEffect, useRef, useState, useMemo } from 'react';
import { createPortal } from 'react-dom';

/*
 * New: shape-aware payload (backward compatible).
 */
export type PastDrawsPayload =
  | { kind: 'five'; rows: LottoRow[]; game?: GameKey }
  | { kind: 'digits'; rows: DigitRow[]; k: 3 | 4 }
  | { kind: 'pick10'; rows: Pick10Row[] }
  | { kind: 'quickdraw'; rows: QuickDrawRow[] }
  // Optional explicit NY Lotto extended shape if parent provides it
  | { kind: 'ny_lotto'; rows: { date: string; mains: number[]; bonus: number }[] };

export default function PastDrawsSidebar({
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
  type Mode = 'five' | 'digits' | 'pick10' | 'quickdraw' | 'ny_lotto';

  const inferredMode: Mode = useMemo(() => {
    if (payload) return payload.kind as Mode;
    switch (logical) {
      case 'ny_numbers': return 'digits';
      case 'ny_win4': return 'digits';
      case 'ny_pick10': return 'pick10';
      case 'ny_quick_draw': return 'quickdraw';
      case 'ny_lotto': return 'ny_lotto';
      default: return 'five';
    }
  }, [payload, logical]);

  // ---------- Normalization to a common row view ----------
  type ViewRow = { date: string; values: number[]; special?: number; label: 'Numbers' | 'Digits'; sep?: boolean; specialLabel?: string };

  const viewRows: ViewRow[] = useMemo(() => {
    const rows: ViewRow[] = [];

    const asFive = (rowsIn: LottoRow[], fiveGame?: GameKey) => {
      const g = fiveGame || game || rowsIn[0]?.game;
      const cfg = g ? getCurrentEraConfig(g) : { mainPick: 5, specialMax: 0 } as any;
      const mainPick = cfg.mainPick || 5;
      const hasSpecial = (cfg.specialMax ?? 0) > 0;
      const isNyLotto = (g === 'ny_lotto' || g === 'ny_nylotto') || inferredMode === 'ny_lotto';

      for (const r of rowsIn) {
        const mains: number[] = [];
        // Pull up to 5 from n1..n5
        const base = [r.n1, r.n2, r.n3, r.n4, r.n5].filter(n => Number.isFinite(n));
        mains.push(...base);
        // NY Lotto needs 6 mains; if we only have 5, try to append special as 6th main (shim case)
        if (isNyLotto && mains.length === 5 && typeof r.special === 'number') {
          mains.push(r.special);
        }
        // Trim/Pad to mainPick (never pad with invalids; just trim)
        const show = mains.slice(0, mainPick);
        const spec = isNyLotto
          ? // For NY Lotto, the rendered "special" is the Bonus (if present we prefer r.special as Bonus; if used as 6th main already, we omit Bonus)
            (mains.length >= 6 && typeof r.special === 'number' && !show.includes(r.special) ? r.special : undefined)
          : (hasSpecial ? r.special : undefined);

        rows.push({
          date: r.date,
          values: show,
          special: spec,
          label: 'Numbers',
          sep: isNyLotto ? true : hasSpecial,
          specialLabel: isNyLotto
            ? 'Bonus'
            : g === 'multi_powerball' ? 'Powerball'
            : g === 'multi_megamillions' ? 'Mega Ball'
            : g === 'multi_cash4life' ? 'Cash Ball'
            : 'Special',
        });
      }
    };

    if (payload) {
      switch (payload.kind) {
        case 'five':
          asFive(payload.rows, payload.game);
          break;
        case 'ny_lotto': {
          for (const r of payload.rows) {
            rows.push({
              date: r.date,
              values: (r.mains || []).slice(0, 6),
              special: r.bonus,
              label: 'Numbers',
              sep: true,
              specialLabel: 'Bonus',
            });
          }
          break;
        }
        case 'digits': {
          for (const r of payload.rows) {
            rows.push({ date: r.date, values: (r.digits || []).slice(0, payload.k), label: 'Digits' });
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

    // Legacy path (no payload): infer from logical and pageRows
    if (inferredMode === 'digits') {
      const k: 3 | 4 = logical === 'ny_win4' ? 4 : 3;
      for (const r of pageRows) {
        const d = [r.n1, r.n2, r.n3, r.n4, r.n5]
          .filter(n => Number.isFinite(n) && n >= 0 && n <= 9)
          .slice(0, k);
        if (d.length) rows.push({ date: r.date, values: d, label: 'Digits' });
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
  }, [payload, pageRows, game, logical, inferredMode]);

  const headerLabel = viewRows[0]?.label || (inferredMode === 'digits' ? 'Digits' : 'Numbers');

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
      >
        <div className="sidebar-header">
          <div className="sidebar-title-wrap">
            <div id="past-draws-title" className="sidebar-title">Past Draws</div>
          </div>
          <div className="sidebar-primary">
            {typeof sortDir !== 'undefined' && onToggleSort && (
              <button
                className="btn btn-ghost sidebar-sort-btn"
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
                {viewRows.map((r, idx) => {
                  const showSep = r.sep && typeof r.special !== 'undefined';
                  const isNyLotto = (logical === 'ny_lotto') || inferredMode === 'ny_lotto';
                  const specialTitle = r.specialLabel || (isNyLotto ? 'Bonus' : 'Special');
                  return (
                    <tr key={`${r.date}-${idx}`}>
                      <td className="mono date-cell">{r.date}</td>
                      <td className="numbers-cell" aria-label={r.label}>
                        {r.values.map((n, i) => (
                          <span className="num-bubble" key={i}>{n}</span>
                        ))}
                        {r.sep && (
                          <>
                            <span className="numbers-sep" aria-hidden="true">|</span>
                            <span
                              className={`num-bubble num-bubble--special`}
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
