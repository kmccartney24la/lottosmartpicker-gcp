
'use client';
import { useEffect, useState } from 'react';
type ThemeKey = 'system' | 'light' | 'dark' | 'contrast';
function applyTheme(theme: ThemeKey) {
  const root = document.documentElement;
  if (theme === 'system') {
    root.removeAttribute('data-theme');
    localStorage.removeItem('lotto-theme');
  } else {
    root.setAttribute('data-theme', theme);
    localStorage.setItem('lotto-theme', theme);
  }
}
function initTheme(): ThemeKey {
  if (typeof window === 'undefined') return 'system';
  const saved = localStorage.getItem('lotto-theme') as ThemeKey | null;
  return saved || 'system';
}
export default function ThemeSwitcher() {
  const [theme, setTheme] = useState<ThemeKey>(initTheme());
  const [announce, setAnnounce] = useState('');
  useEffect(()=>{ applyTheme(theme); setAnnounce(`Theme set to ${theme}`); }, [theme]);

  // Optional: react when user changes system theme while in 'system'
  useEffect(() => {
    if (theme !== 'system' || typeof window === 'undefined') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => { applyTheme('system'); setAnnounce('Theme set to system'); };
    mq.addEventListener?.('change', onChange);
    return () => mq.removeEventListener?.('change', onChange);
  }, [theme]);

  return (
    <label>
      <span>Theme</span><br/>
      <select aria-label="Theme" value={theme} onChange={(e)=>setTheme(e.target.value as ThemeKey)}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="contrast">High contrast</option>
      </select>
      <span aria-live="polite" style={{ position:'absolute', width:1, height:1, overflow:'hidden', clip:'rect(0 0 0 0)' }}>
        {announce}
      </span>
    </label>
  );
}
