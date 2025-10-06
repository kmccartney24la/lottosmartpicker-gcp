// src/components/Header.tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import ThemeSwitcher from './ThemeSwitcher';
import * as React from 'react';
import './Header.css';

export default function Header() {
  const pathname = usePathname();
  const isDraw = pathname === '/' || pathname.startsWith('/draws');
  const isScratchers = pathname.startsWith('/scratchers');
  const detailsRef = React.useRef<HTMLDetailsElement>(null);
  const tabDrawRef = React.useRef<HTMLAnchorElement>(null);
  const tabScratchRef = React.useRef<HTMLAnchorElement>(null);
  const themeWrapRef = React.useRef<HTMLDivElement>(null);
  const [navItemW, setNavItemW] = React.useState<number | null>(null);

  // Close the hamburger when clicking anywhere outside it
  React.useEffect(() => {
    function onDocPointerDown(e: PointerEvent) {
      const d = detailsRef.current;
      if (!d || !d.open) return;
      if (e.target instanceof Node && d.contains(e.target)) return;
      d.open = false;
    }
    document.addEventListener('pointerdown', onDocPointerDown);
    return () => document.removeEventListener('pointerdown', onDocPointerDown);
  }, []);

  // Equalize widths across the two tabs and the Theme select
  React.useLayoutEffect(() => {
    const calc = () => {
      const w1 = tabDrawRef.current ? Math.ceil(tabDrawRef.current.offsetWidth) : 0;
      const w2 = tabScratchRef.current ? Math.ceil(tabScratchRef.current.offsetWidth) : 0;
      let w3 = 0;
      const sel = themeWrapRef.current?.querySelector('select') as HTMLSelectElement | null;
      if (sel) {
        const prevW = sel.style.width;
        sel.style.width = 'auto';                 // measure natural width
        w3 = Math.ceil(sel.scrollWidth + 2);      // a hair for caret buffer
        sel.style.width = prevW;
      }
      const max = Math.max(w1, w2, w3);
      setNavItemW(max || null);
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, []);

  return (
    <header className="site-header site-header--static" role="banner">
      {/* Title row — large & centered */}
      <div className="site-header__inner header-row header-row--title">
        <Link href="/" aria-label="LottoSmartPicker home" className="brand__link">
          <span className="brand__logo" aria-hidden="true" />
          <span className="brand__title-wrap">
            <h1 className="brand__title brand__title--xl">LottoSmartPicker 9000</h1>
            {/* playslip-style twin badge, right-aligned to title */}
            <span className="title-badge" aria-hidden />
          </span>
        </Link>
      </div>

      {/* “Playslip strip” under title — tabs right, theme furthest right */}
      <div
        className="site-header__inner header-row header-row--strip"
        aria-label="Primary & theme"
        style={navItemW ? ({ ['--navItemW' as any]: `${navItemW}px` }) : undefined}
      >
        {/* Inline pills (wrap; aligned to the right side) */}
        <nav className="nav-inline" aria-label="Primary">
          <HeaderTab href="/" active={isDraw} refEl={tabDrawRef}>Draw Games</HeaderTab>
          <HeaderTab href="/scratchers" active={isScratchers} refEl={tabScratchRef}>GA Scratchers</HeaderTab>
        </nav>
        {/* Right controls: Theme + Hamburger (stacked on mobile, aligned right) */}
        <div className="right-ctrls">
          {/* Theme control: desktop shows select; mobile shows "Theme" + square icon
              with the native select over the square to open the dropdown. */}
          <div className="theme-wrap" ref={themeWrapRef}>
            <span className="visually-hidden">Theme</span>
            <span className="theme-word" aria-hidden>Theme</span>
            <span className="theme-swatch" aria-hidden />
            <ThemeSwitcher className="theme-native" variant="bare" />
          </div>
          {/* Mobile hamburger */}
          <details className="nav-menu" role="navigation" ref={detailsRef}>
          <summary
            className="nav-trigger"
            aria-label="Open menu"
            aria-haspopup="menu"
            aria-controls="primary-menu"
          >
            <span className="nav-trigger__icon" aria-hidden>☰</span>
            <span className="visually-hidden">Menu</span>
          </summary>
          <div className="nav-sheet" id="primary-menu" role="menu">
            <Link href="/" role="menuitem" aria-current={isDraw ? 'page' : undefined} className="sheet-link">
              Draw Games
            </Link>
            <Link href="/scratchers" role="menuitem" aria-current={isScratchers ? 'page' : undefined} className="sheet-link">
              GA Scratchers
            </Link>
            {/* Theme remains visible in-row on mobile; keep this hidden */}
            <div className="sheet-theme theme-in-sheet" role="menuitem" />
          </div>
        </details>
        </div>
      </div>
    </header>
  );
}

function HeaderTab({
  href, active, children, refEl
}: {
  href: string; active: boolean; children: React.ReactNode; refEl?: React.Ref<HTMLAnchorElement>;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className="tab chip chip--nav chip--thin"
      ref={refEl as any}
    >
      <span className="tab__label">{children}</span>
    </Link>
  );
}
