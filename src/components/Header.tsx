// src/components/Header.tsx
'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import ThemeSwitcher from './ThemeSwitcher';
import * as React from 'react';
import './Header.css';
import {
  type StateKey,
  stateFromPath,
  sectionFromPath,
  routeFor,
  getStoredState,
  storeState,
} from 'lib/state';

export default function Header() {
  const headerRef = React.useRef<HTMLElement>(null);
  const titleWrapRef = React.useRef<HTMLSpanElement>(null); // points to .brand__subtitle
  const titleBoxRef = React.useRef<HTMLSpanElement>(null);  // points to .brand__title-box
  const pathname = usePathname();
  const router = useRouter();
  const section = sectionFromPath(pathname || '/');
  const [activeState, setActiveState] = React.useState<StateKey>(stateFromPath(pathname || '/'));
  const detailsRef = React.useRef<HTMLDetailsElement>(null);
  const tabDrawRef = React.useRef<HTMLAnchorElement>(null);
  const tabScratchRef = React.useRef<HTMLAnchorElement>(null);
  const themeWrapRef = React.useRef<HTMLDivElement>(null);
  const [navItemW, setNavItemW] = React.useState<number | null>(null);

  // Flag mask support early on the client (no layout change; only a visibility toggle)
  React.useEffect(() => {
    try {
      const ok =
        CSS && (CSS.supports('mask-image: url("")') || CSS.supports('-webkit-mask-image: url("")'));
      if (ok) document.documentElement.setAttribute('data-mask-ok', '1');
    } catch {}
  }, []);

  // On mount, prefer stored state ONLY for where tabs/links point to (URL still wins for content)
  React.useEffect(() => {
    const stored = getStoredState(activeState);
    if (stored !== activeState) setActiveState(stored);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Derived hrefs for tabs / menu (based on the switcher-selected state)
  const hrefDraws = routeFor(activeState, 'draws');
  const hrefScratchers = routeFor(activeState, 'scratchers');
  const isDraw = (pathname || '/') === hrefDraws;
  const isScratchers = (pathname || '/') === hrefScratchers;

  // Measure total header height → expose as --header-total-h (px)
  React.useLayoutEffect(() => {
    const el = headerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const h = Math.round(el.offsetHeight || 0);
      el.style.setProperty('--header-total-h', `${h}px`);
    });
    ro.observe(el);
    // initial set
    const h = Math.round(el.offsetHeight || 0);
    el.style.setProperty('--header-total-h', `${h}px`);
    return () => ro.disconnect();
  }, []);

  // Measure title box and badge to compute a fixed max width for the subtitle
  React.useLayoutEffect(() => {
    const box = titleBoxRef.current;
    const wrap = titleWrapRef.current;
    if (!box || !wrap) return;

    const compute = () => {
      const badge = box.querySelector('.title-badge') as HTMLElement | null;
      const boxW = Math.ceil(box.offsetWidth || 0);
      const badgeW = Math.ceil(badge?.offsetWidth || 0);
      // Read CSS token for desired fixed gap (falls back to 12px if missing)
      const cs = getComputedStyle(wrap);
      const gapToken = cs.getPropertyValue('--subtitle-gap').trim();
      const gap =
        gapToken.endsWith('px')
          ? parseFloat(gapToken)
          : (Number.parseFloat(gapToken) || 12);
      // Available area is title width minus badge width (container ends at badge).
      // The *visual* gap is added via padding-inline-end in CSS using --subtitle-gap.
      const area = Math.max(0, boxW - badgeW);
      wrap.style.setProperty('--subtitle-area-w', `${area}px`);
    };

    // Initial compute + observers for dynamic changes (font load, resize, state switch)
    compute();
    const ro = new ResizeObserver(compute);
    ro.observe(box);
    // Also recompute on window resize
    window.addEventListener('resize', compute);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', compute);
    };
  }, [activeState]);


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
    <header ref={headerRef} className="site-header site-header--static" role="banner">
      {/* Title row — large & centered */}
      <div className="site-header__inner header-row header-row--title">
        <Link href="/" aria-label="LottoSmartPicker home" className="brand__link">
          {/* Colored logo (decorative) */}
          <img
            className="brand__logo--img"
            src="/brand/logo-full.svg"
            alt=""
            aria-hidden="true"
            decoding="async"
            loading="eager"
          />
          <span className="brand__title-wrap">
            {/* A box that is sized ONLY by the title; badge anchors to its right edge */}
            <span className="brand__title-box" ref={titleBoxRef}>
              <h1 className="brand__title brand__title--xl">LottoSmartPicker 9000</h1>
              {/* playslip-style twin badge, right-aligned to title */}
              <span className="title-badge" aria-hidden />
            </span>
            {/* Subtitle appears to the left of (i.e., before) where the badge drops under */}
            <span className="brand__subtitle" aria-live="polite" ref={titleWrapRef}>
              {activeState === 'ny' ? 'New York' : 'Georgia'}
            </span>
          </span>
        </Link>
      </div>

      {/* “Playslip strip” under title — tabs right, theme furthest right */}
      <div
        className="site-header__inner header-row header-row--strip"
        aria-label="Primary & theme"
        style={navItemW ? ({ ['--navItemW' as any]: `${navItemW}px` }) : undefined}
      >
        {/* State switcher — left-aligned with page content, square like the hamburger */}
        <div className="state-wrap">
          <label className="visually-hidden" htmlFor="state-select">State</label>
          <select
            id="state-select"
            className="state-select"
            aria-label="State"
            value={activeState}
            onChange={(e) => {
              const next = (e.target.value as StateKey) || 'ga';
              storeState(next);
              setActiveState(next);
              const target = routeFor(next, section);
              router.push(target);
            }}
          >
            <option value="ga">GA</option>
            <option value="ny">NY</option>
          </select>
        </div>
        {/* Inline pills (wrap; aligned to the right side) */}
        <nav className="nav-inline" aria-label="Primary">
          <HeaderTab href={hrefDraws} active={isDraw} refEl={tabDrawRef}>Draw Games</HeaderTab>
          <HeaderTab href={hrefScratchers} active={isScratchers} refEl={tabScratchRef}>Scratchers</HeaderTab>
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
            <Link href={hrefDraws} role="menuitem" aria-current={isDraw ? 'page' : undefined} className="sheet-link">
              Draw Games
            </Link>
            <Link href={hrefScratchers} role="menuitem" aria-current={isScratchers ? 'page' : undefined} className="sheet-link">
              Scratchers
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
