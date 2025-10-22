// lib/state.ts
export type StateKey = 'ga' | 'ca' | 'fl' | 'ny';
export const DEFAULT_STATE: StateKey = 'ga';
export const LS_STATE = 'lsp.state';

export function stateFromPath(pathname: string): StateKey {
  if (!pathname) return DEFAULT_STATE;
  if (pathname.startsWith('/ny')) return 'ny';
  if (pathname.startsWith('/ga')) return 'ga';
  if (pathname.startsWith('/fl')) return 'fl';
  if (pathname.startsWith('/ca')) return 'ca';
  return DEFAULT_STATE;
}

export function sectionFromPath(pathname: string): 'draws' | 'scratchers' {
  if (!pathname) return 'draws';
  // treat both prefixed and unprefixed scratchers as "scratchers"
  if (pathname === '/scratchers' || pathname.endsWith('/scratchers')) return 'scratchers';
  return 'draws';
}

export function routeFor(state: StateKey, section: 'draws'|'scratchers'): string {
  const base =
    state === 'ny' ? '/ny' :
    state === 'ga' ? '/ga' :
    state === 'ca' ? '/ca' :
    '/fl';
  return section === 'scratchers' ? `${base}/scratchers` : base;
}

export function getStoredState(fb: StateKey = DEFAULT_STATE): StateKey {
  try {
    const raw = typeof window !== 'undefined' ? window.localStorage.getItem(LS_STATE) : null;
    return (raw === 'ny' || raw === 'ga' || raw === 'fl' || raw === 'ca') ? (raw as StateKey) : fb;
  } catch {
    return fb;
  }
}

export function storeState(s: StateKey): void {
  try {
    if (typeof window !== 'undefined') window.localStorage.setItem(LS_STATE, s);
  } catch { /* noop */ }
}
