'use client';
import { useState, useEffect } from 'react';
// Standardized Breakpoint Constants
export const MOBILE_BREAKPOINT = '767.98px';
export const TABLET_BREAKPOINT = '768px';
export const DESKTOP_BREAKPOINT = '1024px';
// Numeric helpers (avoid parsing repeatedly & keep comparisons precise)
const MOBILE_BP_PX = 767.98;
const TABLET_MIN_PX = 768;
const DESKTOP_MIN_PX = 1024;
// Small utility: add/remove media listener with Safari fallback
const addMqlListener = (mql, fn) => mql.addEventListener ? mql.addEventListener('change', fn) : mql.addListener(fn);
const removeMqlListener = (mql, fn) => mql.removeEventListener ? mql.removeEventListener('change', fn) : mql.removeListener(fn);
/**
 * Custom hook to detect if the current viewport is mobile.
 * Uses a media query to check against the MOBILE_BREAKPOINT.
 * It is SSR-safe, returning false on the server and updating on the client.
 */
export function useIsMobile() {
    const [isMobile, setIsMobile] = useState(false);
    useEffect(() => {
        // Ensure window is defined (client-side)
        if (typeof window !== 'undefined') {
            const mq = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT})`);
            const onChange = () => setIsMobile(mq.matches);
            // Set initial value
            onChange();
            // Listen for changes
            addMqlListener(mq, onChange);
            // Cleanup
            return () => removeMqlListener(mq, onChange);
        }
    }, []); // Empty dependency array ensures this runs once on mount
    return isMobile;
}
/**
 * Custom hook to detect if the current viewport should use drawer mode for filters.
 * This includes:
 * - Mobile portrait (≤767.98px width)
 * - Mobile landscape (≤768px height, indicating landscape orientation)
 * - Tablet portrait (768px-1023px width)
 * Desktop (≥1024px) uses fixed sidebar.
 */
export function useDrawerMode() {
    const [useDrawer, setUseDrawer] = useState(true); // Default to true for SSR safety
    useEffect(() => {
        // Ensure window is defined (client-side)
        if (typeof window !== 'undefined') {
            // Keep a stable handler reference for add/remove
            const checkDrawerMode = () => {
                const width = window.innerWidth;
                const height = window.innerHeight;
                // Mobile portrait: width ≤ 767.98px
                const isMobilePortrait = width <= MOBILE_BP_PX;
                // Mobile landscape: height ≤ 568px and landscape
                const isMobileLandscape = height <= 568 && width > height;
                // Tablet portrait: width between 768px and 1023px inclusive
                const isTabletPortrait = width >= TABLET_MIN_PX && width < DESKTOP_MIN_PX;
                // Desktop: width ≥ 1024px should use fixed sidebar
                const isDesktop = width >= DESKTOP_MIN_PX;
                // Use drawer for everything except desktop
                const shouldUseDrawer = !isDesktop || isMobilePortrait || isMobileLandscape || isTabletPortrait;
                setUseDrawer(shouldUseDrawer);
            };
            // Set initial value
            checkDrawerMode();
            window.addEventListener('resize', checkDrawerMode, { passive: true });
            // Also listen for orientation changes on mobile (use a named handler so we can remove it)
            const onOrientation = () => {
                // Small delay to ensure dimensions are updated after orientation change
                setTimeout(checkDrawerMode, 100);
            };
            window.addEventListener('orientationchange', onOrientation, { passive: true });
            // Cleanup
            return () => {
                window.removeEventListener('resize', checkDrawerMode);
                window.removeEventListener('orientationchange', onOrientation);
            };
        }
    }, []); // Empty dependency array ensures this runs once on mount
    return useDrawer;
}
