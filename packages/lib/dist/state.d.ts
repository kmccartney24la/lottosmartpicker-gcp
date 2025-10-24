export type StateKey = 'ga' | 'ca' | 'fl' | 'ny';
export declare const DEFAULT_STATE: StateKey;
export declare const LS_STATE = "lsp.state";
export declare function stateFromPath(pathname: string): StateKey;
export declare function sectionFromPath(pathname: string): 'draws' | 'scratchers';
export declare function routeFor(state: StateKey, section: 'draws' | 'scratchers'): string;
export declare function getStoredState(fb?: StateKey): StateKey;
export declare function storeState(s: StateKey): void;
