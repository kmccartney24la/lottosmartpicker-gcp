// src/components/PastDrawsSidebar.tsx
'use client';
import './PastDrawsSidebar.css';
import { LottoRow, GameKey } from '@lib/lotto';
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export default function PastDrawsSidebar({
  open, onClose, compact, setCompact, pageRows, page, pageCount, setPage, total,
  side = 'right',
  sortDir,
  onToggleSort,
  game,
}: {
  open: boolean;
  onClose: () => void;
  compact: boolean;
  setCompact: (v:boolean)=>void;
  pageRows: LottoRow[];
  page: number;
  pageCount: number;
  setPage: (fn:(p:number)=>number)=>void;
  total: number;
  /** Optional: render as right drawer (default) */
  side?: 'left'|'right'|'bottom';
  /** Optional: if provided, shows a button to toggle sort direction */
  sortDir?: 'desc'|'asc';
  onToggleSort?: () => void;
  /** Current game key for special-ball theming */
  game: GameKey;
}) {

  // Some games (e.g., GA Fantasy 5) have no special ball
  const HAS_SPECIAL: Record<Exclude<GameKey,'ga_scratchers'>, boolean> = {
    ga_fantasy5: false,
    multi_powerball: true,
    multi_megamillions: true,
    multi_cash4life: true,
  };
  const hasSpecial = HAS_SPECIAL[game] ?? false;

  const closeRef = useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{ if (open) closeRef.current?.focus(); }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  // Mount the drawer/backdrop into <body> to avoid page stacking contexts
  const [portalEl, setPortalEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    const id = 'past-draws-portal';
    let el = typeof document !== 'undefined' ? document.getElementById(id) as HTMLElement | null : null;
    if (!el && typeof document !== 'undefined') {
      el = document.createElement('div');
      el.id = id;
      document.body.appendChild(el);
    }
    setPortalEl(el);
    return () => {
      // optional: leave the node in place for reuse; remove if you prefer cleanup
    };
  }, []);

  // Simple focus trap when open
  useEffect(() => {
    if (!open) return;
    function trap(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const dlg = document.getElementById('past-draws');
      if (!dlg) return;
      const els = dlg.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
      if (!els.length) return;
      const first = els[0], last = els[els.length-1];
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
    }
    document.addEventListener('keydown', trap);
    return () => document.removeEventListener('keydown', trap);
  }, [open]);

  if (!portalEl) return null;
  return createPortal(
    <>
      {open && <div className="backdrop" onClick={onClose} aria-hidden="true" />}
      <aside
        id="past-draws"
        className={`sidebar ${side==='left' ? 'left' : side==='right' ? 'right' : 'bottom'} ${open ? 'open' : ''}`}
        data-game={game}
        role="dialog"
        aria-modal="true"
        aria-labelledby="past-draws-title"
        aria-hidden={!open}
      >
        <div className="sidebar-header">
          {/* Title wraps as needed */}
          <div className="sidebar-title-wrap">
            <div id="past-draws-title" className="sidebar-title">Past Draws</div>
          </div>
          {/* Primary control (never wraps): Sort */}
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
          {/* Secondary row under Sort: Compact + Close (X) */}
          <div className="sidebar-secondary">
            <label className="sidebar-compact-label" title="Compact reduces padding and font size to show more rows per page.">
              <input type="checkbox" checked={compact} onChange={(e)=>setCompact(e.target.checked)} />
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
        {/* Middle row (scroller in non-compact; no-scroll in compact) */}
        <div
          className={`sidebar-content ${compact ? 'compact' : ''}`}
          style={
            compact
              ? ({
                  // ensure compact math knows how many rows we aim to show
                  ['--rows-per-page' as any]: 25,
                } as React.CSSProperties)
              : undefined
          }
        >
          <div id="results-panel" role="region" aria-label="Fetched draw results" className="sidebar-table-container">
            <table className="sidebar-table" key="tbl-no-special-col">
              <colgroup>
                <col className="col-date" />
                <col className="col-numbers" />
              </colgroup>
              <thead>
                <tr>
                  <th scope="col">Date</th>
                  <th scope="col">Numbers</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, idx) => (
                  <tr key={idx}>
                    <td className="mono date-cell">{r.date}</td>
                    <td className="numbers-cell" aria-label="Numbers">
                      <span className="num-bubble">{r.n1}</span>
                      <span className="num-bubble">{r.n2}</span>
                      <span className="num-bubble">{r.n3}</span>
                      <span className="num-bubble">{r.n4}</span>
                      <span className="num-bubble">{r.n5}</span>
                    {hasSpecial && (
                        <>
                          <span className="numbers-sep" aria-hidden="true">|</span>
                          <span
                            className="num-bubble num-bubble--special"
                            title={
                              game === 'multi_powerball'    ? 'Powerball' :
                              game === 'multi_megamillions' ? 'Mega Ball' :
                              game === 'multi_cash4life'    ? 'Cash Ball' : 'Special'
                            }
                          >
                            <span className="sr-only">
                              {game === 'multi_powerball'    ? 'Powerball ' :
                               game === 'multi_megamillions' ? 'Mega Ball ' :
                               game === 'multi_cash4life'    ? 'Cash Ball ' : 'Special '}
                            </span>
                            {typeof r.special === 'number' ? r.special : '—'}
                          </span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr><td colSpan={2} className="hint">No rows.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
        {/* Bottom row (always-visible footer) */}
        <div className="sidebar-pagination" role="contentinfo">
          <div className="sidebar-pagination-info">
            Showing {(page-1)*25 + 1}–{Math.min(page*25, total)} of {total}
          </div>
          <div className="sidebar-pagination-controls">
            <button className="btn btn-ghost" onClick={()=>setPage((p)=>Math.max(1, p-1))} disabled={page<=1}>
              <span className="sidebar-nav-text">Prev</span>
              <span className="sidebar-nav-icon" aria-hidden="true">‹</span>
            </button>
            <span className="sidebar-page-info">Page {page} / {pageCount}</span>
            <button className="btn btn-ghost" onClick={()=>setPage((p)=>Math.min(pageCount, p+1))} disabled={page>=pageCount}>
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
