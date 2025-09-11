'use client';
import { useEffect, useMemo, useRef } from 'react';
import type { GameKey, LottoRow, getCurrentEraConfig } from '@lib/lotto';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from 'recharts';

export default function FrequencyPanel({
  id, open, onClose, rows, side='right', game
}: {
  id?: string;
  open: boolean;
  onClose: () => void;
  rows: LottoRow[];
  side?: 'right'|'bottom';
  game: GameKey;
}) {
  const closeRef = useRef<HTMLButtonElement|null>(null);
  useEffect(()=>{ if (open) closeRef.current?.focus(); }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    function trap(e: KeyboardEvent) {
      if (e.key !== 'Tab') return;
      const dlg = document.getElementById(id || 'frequency-panel');
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
  }, [open, id]);

  const data = useMemo(() => {
    if (!rows?.length) return [];
    // count mains only (special is separate in your analysis cards)
    const counts = new Map<number, number>();
    for (const r of rows) {
      [r.n1, r.n2, r.n3, r.n4, r.n5].forEach(n => counts.set(n, (counts.get(n)||0)+1));
    }
    const arr = Array.from(counts.entries()).map(([n,count])=>({ n, count }));
    arr.sort((a,b)=> a.n - b.n);
    return arr;
  }, [rows]);

  if (!open) return null;

  return (
    <>
      <div className="backdrop" onClick={onClose} aria-hidden="true" />
      <aside
        id={id || 'frequency-panel'}
        className={`sidebar ${side==='bottom' ? 'bottom' : ''} ${open ? 'open' : ''}`}
        role="dialog"
        aria-modal="true"
        aria-label="Frequency chart"
        aria-hidden={!open}
      >
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:16, borderBottom:'1px solid var(--card-bd)' }}>
          <div style={{ fontWeight:700 }}>Frequency (mains)</div>
          <button ref={closeRef} className="btn btn-ghost" onClick={onClose} aria-label="Close Frequency">Close</button>
        </div>
        <div style={{ height:'calc(100% - 64px)', padding:12 }}>
          {data.length === 0 ? (
            <div className="hint">No data available.</div>
          ) : (
            <div className="card" style={{ height: '100%', padding: 8 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data}>
                  <XAxis dataKey="n" />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
