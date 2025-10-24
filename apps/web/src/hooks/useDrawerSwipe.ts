import * as React from 'react';

type Side = 'left' | 'right' | 'bottom';

type Options = {
  /** Is the drawer currently open? */
  open: boolean;
  /** Which edge the drawer slides from. */
  side: Side;
  /** Called when a successful close swipe happens. */
  onClose: () => void;
  /** Optional: only enable on coarse pointers (touch). Default true. */
  coarseOnly?: boolean;
  /** Optional: fraction of the drawer size to trigger close (0..1). Default 0.33 */
  thresholdRatio?: number;
  /** Optional: for bottom drawers we translate on Y; otherwise X. */
  axis?: 'x' | 'y';
};

export function useDrawerSwipe(opts: Options) {
  const {
    open,
    side,
    onClose,
    coarseOnly = true,
    thresholdRatio = 0.33,
    axis = side === 'bottom' ? 'y' : 'x',
  } = opts;

  const hostRef = React.useRef<HTMLElement | null>(null);
  const draggingRef = React.useRef(false);
  const [dragging, setDragging] = React.useState(false);
  const startRef = React.useRef({ x: 0, y: 0 });
  const lastRef = React.useRef({ x: 0, y: 0 });
  const axisLockRef = React.useRef<'x' | 'y' | null>(null);

  const setTransform = (tx: number, ty = 0) => {
    const el = hostRef.current;
    if (!el) return;
    el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
  };
  const clearTransform = () => {
    const el = hostRef.current;
    if (!el) return;
    el.style.transition = 'transform 160ms ease-out';
    el.style.transform = '';
    const done = () => {
      el.style.transition = '';
      el.removeEventListener('transitionend', done);
    };
    el.addEventListener('transitionend', done);
  };

  const signForClose = side === 'right' || side === 'bottom' ? +1 : -1;

  const onTouchStart: React.TouchEventHandler<HTMLElement> = (e) => {
    if (!open) return;
    if (coarseOnly) {
      const isCoarse = window.matchMedia?.('(pointer: coarse)').matches ?? true;
      if (!isCoarse) return;
    }
    const t = e.touches[0];
    startRef.current = { x: t.clientX, y: t.clientY };
    lastRef.current = { x: t.clientX, y: t.clientY };
    axisLockRef.current = null;
    draggingRef.current = true;
    setDragging(true);

    const el = hostRef.current;
    if (el) el.style.transition = 'none';
  };

  const onTouchMove: React.TouchEventHandler<HTMLElement> = (e) => {
    if (!open || !draggingRef.current) return;
    const t = e.touches[0];
    lastRef.current = { x: t.clientX, y: t.clientY };

    const dx = t.clientX - startRef.current.x;
    const dy = t.clientY - startRef.current.y;

    // Axis lock after a small lead
    if (!axisLockRef.current) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        axisLockRef.current = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y';
      } else {
        return;
      }
    }
    // If locked to vertical, let native scroll happen
    if (axisLockRef.current === 'y' && axis === 'x') return;
    if (axisLockRef.current === 'x' && axis === 'y') return;

    // Only move in closing direction
    let projected = axis === 'x' ? dx : dy;
    projected *= signForClose; // >0 means toward close
    if (projected <= 0) {
      setTransform(0, 0);
      return;
    }

    // Limit by host size
    const el = hostRef.current;
    const size = el
      ? axis === 'x' ? el.clientWidth : el.clientHeight
      : 320;
    const limited = Math.max(0, Math.min(projected, size));

    // Apply transform (respect side/axis)
    e.preventDefault();
    if (axis === 'x') {
      const tx = limited * signForClose;
      setTransform(tx, 0);
    } else {
      const ty = limited * signForClose;
      setTransform(0, ty);
    }
  };

  const onTouchEnd: React.TouchEventHandler<HTMLElement> = () => {
    if (!open || !draggingRef.current) return;
    draggingRef.current = false;
    setDragging(false);

    const el = hostRef.current;
    const size = el
      ? axis === 'x' ? el.clientWidth : el.clientHeight
      : 320;

    const dx = lastRef.current.x - startRef.current.x;
    const dy = lastRef.current.y - startRef.current.y;
    let traveled = axis === 'x' ? dx : dy;
    traveled *= signForClose; // positive if toward close

    const shouldClose = traveled > size * thresholdRatio;

    if (shouldClose) {
      // Nudge then close
      if (axis === 'x') setTransform((Math.max(traveled, size * thresholdRatio) + 40) * signForClose, 0);
      else setTransform(0, (Math.max(traveled, size * thresholdRatio) + 40) * signForClose);
      requestAnimationFrame(onClose);
    } else {
      clearTransform();
    }
  };

  const attachRef = (el: HTMLElement | null) => {
    hostRef.current = el;
  };

  return {
    ref: attachRef,
    dragging,
    touchHandlers: { onTouchStart, onTouchMove, onTouchEnd },
  };
}
