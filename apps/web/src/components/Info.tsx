// src/components/Info.tsx
'use client';
import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import './Info.css';

type Props = {
  /** Tooltip text (plain text; newlines allowed) */
  tip: string;
  /** Accessible label for the trigger (visually we render a small “i” chip) */
  label?: string;
  /** Optional className for the trigger */
  className?: string;
};

function useIsomorphicLayoutEffect(fn: React.EffectCallback, deps: React.DependencyList) {
  // Avoid SSR warnings; match useLayoutEffect on client
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return typeof window !== 'undefined' ? useLayoutEffect(fn, deps) : useEffect(fn, deps as any);
}

export default function Info({ tip, label = 'Info', className }: Props) {
  const triggerRef = useRef<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [placement, setPlacement] = useState<'top' | 'bottom'>('top');
  const [coords, setCoords] = useState<{ left: number; top: number }>({ left: 0, top: 0 });
  const [mounted, setMounted] = useState(false);

  useEffect(() => { setMounted(true); }, []);

  const updatePosition = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const viewportH = window.innerHeight || document.documentElement.clientHeight;
    // Prefer top; if not enough space (≤ 80px), flip to bottom
    const preferTop = r.top > 80;
    const nextPlacement: 'top' | 'bottom' = preferTop ? 'top' : 'bottom';
    setPlacement(nextPlacement);
    const gap = 8;
    if (nextPlacement === 'top') {
      setCoords({ left: r.left + r.width / 2, top: r.top - gap });
    } else {
      setCoords({ left: r.left + r.width / 2, top: r.bottom + gap });
    }
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, updatePosition]);

  useEffect(() => {
    if (!open) return;
    const onScroll = () => updatePosition();
    const onResize = () => updatePosition();
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('resize', onResize);
    };
  }, [open, updatePosition]);

  const show = () => setOpen(true);
  const hide = () => setOpen(false);
  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') hide();
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(v => !v); }
  };

  // Render a tiny “i” chip that users can hover or focus.
  return (
    <>
      <span
        ref={triggerRef}
        className={`help${className ? ` ${className}` : ''}`}
        role="button"
        tabIndex={0}
        aria-label={label}
        aria-expanded={open}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onKeyDown={onKey}
      >
        i
      </span>
      {mounted && open && typeof document !== 'undefined'
        ? createPortal(
            <div
              className="tooltip-pop"
              role="tooltip"
              data-placement={placement}
              style={{
                position: 'fixed',
                left: coords.left,
                top: coords.top,
                transform:
                  placement === 'top'
                    ? 'translate(-50%, calc(-100% - 0px))'
                    : 'translate(-50%, 0)',
              }}
            >
              <div className="tooltip-pop__inner">
                {tip.split('\n').map((line, i) => (
                  <p key={i} className="tooltip-pop__line">{line}</p>
                ))}
              </div>
              <span className="tooltip-pop__arrow" aria-hidden="true" />
            </div>,
            document.body
          )
        : null}
    </>
  );
}