'use client';
import { useEffect, useState } from 'react';

export type DisplayMode = 'compact' | 'detailed' | 'expanded';
const LS_KEY = 'lsp.displayMode';

export default function DisplayModeSwitcher({
  value,
  onChange,
  id = 'display-mode',
  'aria-label': ariaLabel = 'Display density',
}: {
  value?: DisplayMode;
  onChange?: (v: DisplayMode) => void;
  id?: string;
  'aria-label'?: string;
}) {
  const [internal, setInternal] = useState<DisplayMode>('detailed');
  const isControlled = value !== undefined;
  const mode = isControlled ? (value as DisplayMode) : internal;

  useEffect(() => {
    const saved = (typeof window !== 'undefined' && localStorage.getItem(LS_KEY)) as DisplayMode | null;
    if (!isControlled && (saved === 'compact' || saved === 'detailed')) {
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
    <label>
      <span>Mode</span><br />
      <select
        id={id}
        className="compact-control"
        value={mode}
        onChange={(e) => setMode(e.target.value as DisplayMode)}
        aria-label={ariaLabel}
        style={{ minHeight: 'var(--control-h)' }}
        >
        <option value="compact">Compact</option>
        <option value="detailed">Detailed</option>
        <option value="expanded">Expanded</option>
        </select>
    </label>
  );
}
