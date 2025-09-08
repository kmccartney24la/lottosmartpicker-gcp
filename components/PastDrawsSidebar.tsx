
'use client';
import { LottoRow } from '@lib/lotto';
import { useEffect, useRef } from 'react';

export default function PastDrawsSidebar({
  open, onClose, compact, setCompact, pageRows, page, pageCount, setPage, total
}: {
  open: boolean; onClose: () => void; compact: boolean; setCompact: (v:boolean)=>void;
  pageRows: LottoRow[]; page: number; pageCount: number; setPage: (fn:(p:number)=>number)=>void; total: number;
}) {
  const closeRef = useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{ if (open) closeRef.current?.focus(); }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <>
      {open && <div className="backdrop" onClick={onClose} aria-hidden="true" />}
      <aside id="past-draws" className={`sidebar ${open ? 'open' : ''}`} role="complementary" aria-label="Past Draws" aria-hidden={!open}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:16, borderBottom:'1px solid var(--card-bd)' }}>
          <div style={{ fontWeight:700 }}>Past Draws</div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <label className="hint" style={{ display:'flex', alignItems:'center', gap:6 }} title="Compact reduces padding and font size to show more rows per page.">
              <input type="checkbox" checked={compact} onChange={(e)=>setCompact(e.target.checked)} /> Compact
            </label>
            <button ref={closeRef} className="btn btn-ghost" onClick={onClose} aria-label="Close Past Draws">Close</button>
          </div>
        </div>
        <div className={compact ? 'compact' : ''} style={{ height:'calc(100% - 64px)', display:'flex', flexDirection:'column' }}>
          <div id="results-panel" role="region" aria-label="Fetched draw results" style={{ flex:'1 1 auto', overflow:'auto', padding:'12px' }}>
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left' }}>Date</th>
                  <th style={{ textAlign: 'left' }}>Numbers</th>
                  <th style={{ textAlign: 'left' }}>Special</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((r, idx) => (
                  <tr key={idx}>
                    <td>{r.date}</td>
                    <td className="mono">{[r.n1,r.n2,r.n3,r.n4,r.n5].join('-')}</td>
                    <td>{r.special}</td>
                  </tr>
                ))}
                {pageRows.length === 0 && (
                  <tr><td colSpan={3} className="hint">No rows.</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', borderTop:'1px solid var(--card-bd)' }}>
            <div className="hint">Showing {(page-1)*25 + 1}–{Math.min(page*25, total)} of {total}</div>
            <div>
              <button className="btn btn-ghost" onClick={()=>setPage((p)=>Math.max(1, p-1))} disabled={page<=1}>Prev</button>
              <span className="hint" style={{ margin: '0 8px' }}>Page {page} / {pageCount}</span>
              <button className="btn btn-ghost" onClick={()=>setPage((p)=>Math.min(pageCount, p+1))} disabled={page>=pageCount}>Next</button>
            </div>
          </div>
        </div>
      </aside>
    </>
  );
}
