export declare const MOBILE_BREAKPOINT = "767.98px";
export declare const TABLET_BREAKPOINT = "768px";
export declare const DESKTOP_BREAKPOINT = "1024px";
/**
 * Custom hook to detect if the current viewport is mobile.
 * Uses a media query to check against the MOBILE_BREAKPOINT.
 * It is SSR-safe, returning false on the server and updating on the client.
 */
export declare function useIsMobile(): boolean;
/**
 * Custom hook to detect if the current viewport should use drawer mode for filters.
 * This includes:
 * - Mobile portrait (≤767.98px width)
 * - Mobile landscape (≤768px height, indicating landscape orientation)
 * - Tablet portrait (768px-1023px width)
 * Desktop (≥1024px) uses fixed sidebar.
 */
export declare function useDrawerMode(): boolean;
