// src/components/scratchers/DisplayModeSwitcher.tsx
'use client';
import { useEffect, useState } from 'react';

export type DisplayMode = 'compact' | 'detailed' | 'expanded';
const LS_KEY = 'lsp.displayMode';

export default function DisplayModeSwitcher({
  value,
  onChange,
  id = 'display-mode',
  'aria-label': ariaLabel,
  className = '',
}: {
  value?: DisplayMode;
  onChange?: (v: DisplayMode) => void;
  id?: string;
  'aria-label'?: string;
  className?: string;
}) {
  const [internal, setInternal] = useState<DisplayMode>('detailed');
  const isControlled = value !== undefined;
  const mode = isControlled ? (value as DisplayMode) : internal;

  useEffect(() => {
    const saved = (typeof window !== 'undefined' && localStorage.getItem(LS_KEY)) as DisplayMode | null;
    if (!isControlled && (saved === 'compact' || saved === 'detailed' || saved === 'expanded')) {
      setInternal(saved);
    }
  }, [isControlled]);


  function setMode(next: DisplayMode) {
    if (!isControlled) {
      setInternal(next);
      if (typeof window !== 'undefined') localStorage.setItem(LS_KEY, next);
    }
    onChange?.(next);
  }

  return (
    <label className={className}>
      <select
        id={id}
        className="compact-control"
        value={mode}
        onChange={(e) => setMode(e.target.value as DisplayMode)}
        /* Visible label provided; only set aria-label if caller overrides */
        aria-label={ariaLabel || undefined}
        >
        <option value="compact">Compact</option>
        <option value="detailed">Detailed</option>
        <option value="expanded">Expanded</option>
        </select>
    </label>
  );
}
