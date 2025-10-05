// src/components/ThemeSwitcher.tsx
'use client';
import { useEffect, useId, useState } from 'react';

type ThemeKey = 'system' | 'light' | 'dark' | 'contrast';
const THEME_KEY = 'lotto-theme';
const THEMES = new Set<ThemeKey>(['system', 'light', 'dark', 'contrast']);

function applyTheme(theme: ThemeKey) {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
    localStorage.removeItem(THEME_KEY);
  } else {
    root.setAttribute('data-theme', theme);
    localStorage.setItem(THEME_KEY, theme);
  }
}

function initTheme(): ThemeKey {
  if (typeof window === 'undefined') return 'system';
  const saved = localStorage.getItem(THEME_KEY) as ThemeKey | null;
  return saved && THEMES.has(saved) ? saved : 'system';
}

export default function ThemeSwitcher({
  className = '',
  variant = 'full',
}: {
  className?: string;
  /** 'full' renders label+select; 'bare' renders just the select (for custom wrappers) */
  variant?: 'full' | 'bare';
}) {
  const [theme, setTheme] = useState<ThemeKey>(() => initTheme());
  const [announce, setAnnounce] = useState('');
  const [tId, setTId] = useState<number | null>(null); // debounce id for live region
  const selId = useId();

  // Apply theme + polite live announcement (debounced)
  useEffect(() => {
    applyTheme(theme);
    if (tId) window.clearTimeout(tId);
    const id = window.setTimeout(() => {
      setAnnounce(
        theme === 'system'
          ? `System theme: ${window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'}`
          : `Theme set to ${theme}`
      );
    }, 200);
    setTId(id);
    return () => window.clearTimeout(id);
  }, [theme]);

  // Sync across tabs/windows
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === THEME_KEY && e.newValue && THEMES.has(e.newValue as ThemeKey)) {
        setTheme(e.newValue as ThemeKey);
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // React to system scheme changes when in 'system'
  useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => {
      applyTheme('system'); // ensure data-theme is removed
      setAnnounce(`System theme: ${mq.matches ? 'dark' : 'light'}`);
    };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [theme]);

 if (variant === 'bare') {
    return (
      <>
        <select
          id={selId}
          aria-label="Theme"
          value={theme}
          onChange={(e) => setTheme(e.target.value as ThemeKey)}
          className={`compact-control ${className}`.trim()}
        >
          <option value="system">System</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
          <option value="contrast">Contrast</option>
        </select>
        <span aria-live="polite" className="visually-hidden">{announce}</span>
      </>
    );
  }

  return (
    <label className={className} htmlFor={selId}>
      <span>Theme</span>
      <select
        id={selId}
        value={theme}
        onChange={(e) => setTheme(e.target.value as ThemeKey)}
        className="compact-control"
      >
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="contrast">Contrast</option>
      </select>
      <span aria-live="polite" className="visually-hidden">{announce}</span>
    </label>
  );
}
