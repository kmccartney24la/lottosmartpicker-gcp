'use client';
import { useEffect, useRef } from 'react';

export default function Sheet({
  open, onClose, children, side='bottom', labelledBy,
}: {
  open: boolean; onClose: () => void; children: React.ReactNode; side?: 'bottom' | 'right'; labelledBy?: string;
}) {
  const ref = useRef<HTMLDivElement|null>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  useEffect(() => {
    if (!open || !ref.current) return;
    const el = ref.current;
    const f = el.querySelector<HTMLElement>('button,[href],input,select,textarea,[tabindex]');
    f?.focus();
  }, [open]);

  if (!open) return null;
  return (
    <>
      <div className="backdrop" onClick={onClose} aria-hidden="true" />
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy}
        className="card"
        style={{
          position:'fixed', zIndex:110,
          inset: side==='bottom' ? 'auto 0 0 0' : '0 0 0 auto',
          width: side==='right' ? 'min(420px, 90vw)' : '100%',
          maxHeight: side==='bottom' ? '70vh' : '100vh',
          borderRadius: side==='bottom' ? '14px 14px 0 0' : '0',
        }}
      >
        {children}
      </div>
    </>
  );
}
