export const DEFAULT_STATE = 'ga';
export const LS_STATE = 'lsp.state';
export function stateFromPath(pathname) {
    if (!pathname)
        return DEFAULT_STATE;
    if (pathname.startsWith('/ny'))
        return 'ny';
    if (pathname.startsWith('/ga'))
        return 'ga';
    if (pathname.startsWith('/fl'))
        return 'fl';
    if (pathname.startsWith('/ca'))
        return 'ca';
    if (pathname.startsWith('/tx'))
        return 'tx';
    return DEFAULT_STATE;
}
export function sectionFromPath(pathname) {
    if (!pathname)
        return 'draws';
    // treat both prefixed and unprefixed scratchers as "scratchers"
    if (pathname === '/scratchers' || pathname.endsWith('/scratchers'))
        return 'scratchers';
    return 'draws';
}
export function routeFor(state, section) {
    const base = state === 'ny' ? '/ny' :
        state === 'ga' ? '/ga' :
            state === 'ca' ? '/ca' :
                state === 'tx' ? '/tx' :
                    '/fl';
    return section === 'scratchers' ? `${base}/scratchers` : base;
}
export function getStoredState(fb = DEFAULT_STATE) {
    try {
        const raw = typeof window !== 'undefined' ? window.localStorage.getItem(LS_STATE) : null;
        return (raw === 'ny' || raw === 'ga' || raw === 'fl' || raw === 'ca' || raw === 'tx') ? raw : fb;
    }
    catch {
        return fb;
    }
}
export function storeState(s) {
    try {
        if (typeof window !== 'undefined')
            window.localStorage.setItem(LS_STATE, s);
    }
    catch { /* noop */ }
}
