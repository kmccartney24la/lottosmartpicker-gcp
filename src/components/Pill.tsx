'use client';
import { ReactNode } from 'react';

export type PillTone = 'hot' | 'cold' | 'neutral' | 'warn';

export default function Pill({
  tone = 'neutral',
  title,
  children,
  style,
  wrap = false,          // ✅ destructure wrap
}: {
  tone?: PillTone;
  title?: string;
  children: ReactNode;
  style?: React.CSSProperties;
  wrap?: boolean;
}) {
  const base: React.CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: wrap ? 'center' : undefined, // ✅ center when fixed width
    gap: 6,
    borderRadius: 9999,
    padding: '2px 8px',
    fontSize: 12,
    lineHeight: 1.4,
    borderWidth: 1,
    borderStyle: 'solid',
    whiteSpace: wrap ? 'normal' : 'nowrap',      // ✅ allow wrapping in legend
    textAlign: wrap ? 'center' : undefined,
    overflowWrap: wrap ? 'anywhere' : undefined, // ✅ wrap long labels
    wordBreak: wrap ? 'break-word' : undefined,
    cursor: 'default',
  };

  const tones: Record<PillTone, React.CSSProperties> = {
    hot:     { borderColor: 'var(--danger, #d33)', background: 'rgba(221,51,51,.08)', color: 'var(--danger, #b11)' },
    cold:    { borderColor: 'var(--accent, #276ef1)', background: 'rgba(39,110,241,.08)', color: 'var(--accent, #1d52b5)' },
    neutral: { borderColor: 'var(--card-bd, #cad0d7)', background: 'var(--card-bg, #f7f8fa)', color: 'var(--text, #2b2f33)' },
    warn:    { borderColor: 'var(--warn, #b8860b)', background: 'rgba(184,134,11,.09)', color: 'var(--warn, #8b6508)' },
  };

  return (
    <span title={title} style={{ ...base, ...tones[tone], ...style }}>
      {children}
    </span>
  );
}
