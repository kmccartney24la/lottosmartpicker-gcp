// src/components/Pill.tsx
'use client';
import { ReactNode } from 'react';

export type PillTone = 'hot' | 'cold' | 'neutral' | 'warn';

export default function Pill({
  tone = 'neutral',
  title,
  children,
  style,
  wrap = false,            // ✅ make sure we destructure this
}: {
  tone?: PillTone;
  title?: string;
  children: ReactNode;
  style?: React.CSSProperties;
  wrap?: boolean;
}) {
  return (
    <span
      title={title}
      className={`chip chip--${tone}${wrap ? ' chip--wrap' : ''}`}
      style={style}
    >
      {children}
    </span>
  );
}
