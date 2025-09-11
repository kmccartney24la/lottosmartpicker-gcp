'use client';
import { useEffect, useId, useRef, useState } from 'react';

export default function Info({ tip }: { tip: string }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement|null>(null);
  const dlgRef = useRef<HTMLDivElement|null>(null);
  const titleId = useId();

  useEffect(() => {
   if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); btnRef.current?.focus(); }
      if (e.key === 'Tab' && dlgRef.current) {
        // simple trap: keep focus within dialog
        const focusables = dlgRef.current.querySelectorAll<HTMLElement>('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])');
        if (focusables.length === 0) return;
        const first = focusables[0], last = focusables[focusables.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (e.shiftKey && active === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="help"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${titleId}-dialog` : undefined}
        onClick={() => setOpen(true)}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(true); } }}
        title={tip}
      >
        i
      </button>
      {open && (
        <>
          <div className="backdrop" onClick={() => { setOpen(false); btnRef.current?.focus(); }} aria-hidden="true" />
          <div
            ref={dlgRef}
            id={`${titleId}-dialog`}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="card"
            style={{ position:'fixed', zIndex:110, inset:'auto 12px 12px auto', maxWidth:320 }}
          >
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
              <div id={titleId} style={{ fontWeight:700 }}>Info</div>
              <button className="btn btn-ghost" onClick={() => { setOpen(false); btnRef.current?.focus(); }} aria-label="Close">Close</button>
            </div>
            <div style={{ marginTop:8, whiteSpace:'pre-wrap' }}>{tip}</div>
          </div>
        </>
      )}
    </>
  );
}