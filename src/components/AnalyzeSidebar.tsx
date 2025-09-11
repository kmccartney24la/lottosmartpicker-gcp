'use client';
import { useState, useMemo } from 'react';

/**
 * Desktop: tooltip shows on hover/focus via CSS (.help[data-tip]…).
 * Mobile/tablet (coarse pointer): tap toggles (data-open="1") to pin the tooltip.
 */
export default function Info({ tip, label = 'Info' }: { tip: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const isTouch = useMemo(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(pointer: coarse)').matches;
  }, []);

  function onClick() {
    if (isTouch) setOpen(v => !v);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    // Keyboard users already see the tooltip on focus; only toggle on coarse pointers.
    if (!isTouch) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      setOpen(v => !v);
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  }

  return (
    <span
      className="help"
      data-tip={tip}
      data-open={open ? '1' : undefined}
      role="button"
      aria-label={label}
      aria-expanded={open}
      tabIndex={0}
      title={tip}
      onClick={onClick}
      onKeyDown={onKeyDown}
    >
      i
    </span>
  );
}