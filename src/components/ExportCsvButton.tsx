'use client';
import { useEffect, useRef, useState } from 'react';
import { GameKey, getCurrentEraConfig, fetchRowsWithCache } from '@lib/lotto';
import { rowsToCSV } from '@lib/csv';

export default function ExportCsvButton({
  game,
  className,
}: {
  game: GameKey;
  className?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [addBOM, setAddBOM] = useState(false);
  const menuRef = useRef<HTMLDivElement|null>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) { if (open && menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false); }
    document.addEventListener('mousedown', onDoc); return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  async function doExport({ all=false }: { all?: boolean } = {}) {
    if (busy) return;
    setBusy(true);
    const since = getCurrentEraConfig(game).start; // default: current era only
    const latestOnly = false;

    try {
      // Choose dataset: current view (could be latestOnly in page) vs full era
      const rows = await fetchRowsWithCache({ game, since, latestOnly: !all ? undefined : false });
      if (!rows || rows.length === 0) throw new Error('No rows cached');
      let csv = rowsToCSV(rows);
      const prefix = addBOM ? '\uFEFF' : '';
      const blob = new Blob([prefix + csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const ts = new Date().toISOString().slice(0,10);
      a.href = url;
      const scope = all ? 'era' : 'view';
      a.download = `${game}_${scope}_${ts}${addBOM ? '_utf8bom' : ''}.csv`;
      document.body.appendChild(a);
      a.click();
      URL.revokeObjectURL(url);
      a.remove();
    } catch {
      // Fallback to server — keeps working if cache/fetch fails or you move secrets server-side
      const params = new URLSearchParams({ game, since, bom: addBOM ? '1' : '0', all: '1' });
      window.location.href = `/api/export?${params.toString()}`;
    } finally {
      setBusy(false);
    }
  }

  return (
     <div style={{ position:'relative', display:'inline-flex' }}>
      <button
        type="button"
        className={className ?? 'btn btn-secondary'}
        onClick={() => doExport({ all:false })}
        aria-label="Export CSV of current view"
        aria-busy={busy}
        disabled={busy}
        title="Export the currently viewed rows to CSV"
      >
        {busy ? 'Exporting…' : 'Export CSV'}
      </button>
      <button className="btn btn-ghost" aria-label="More export options" onClick={()=>setOpen(v=>!v)} style={{ marginLeft: 6 }}>▾</button>
      {open && (
        <div ref={menuRef} className="card" role="menu" style={{ position:'absolute', right:0, top:'100%', marginTop:6, minWidth:220 }}>
          <button role="menuitem" className="btn btn-ghost" onClick={()=>{ setOpen(false); void doExport({ all:true }); }}>Export entire era</button>
          <label role="menuitem" className="btn btn-ghost" style={{ display:'flex', alignItems:'center', gap:8 }}>
            <input type="checkbox" checked={addBOM} onChange={(e)=>setAddBOM(e.target.checked)} />
            Add UTF-8 BOM (Excel)
          </label>
        </div>
      )}
    </div>
  );
}
