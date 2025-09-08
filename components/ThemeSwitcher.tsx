
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
  useEffect(()=>{ applyTheme(theme); }, [theme]);
  return (
    <label>
      <span>Theme</span><br/>
      <select aria-label="Theme" value={theme} onChange={(e)=>setTheme(e.target.value as ThemeKey)}>
        <option value="system">System</option>
        <option value="light">Light</option>
        <option value="dark">Dark</option>
        <option value="contrast">High contrast</option>
      </select>
    </label>
  );
}
