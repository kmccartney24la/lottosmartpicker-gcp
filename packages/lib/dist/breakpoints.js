import { useState, useEffect } from 'react';
// Standardized Breakpoint Constants
export const MOBILE_BREAKPOINT = '767.98px';
export const TABLET_BREAKPOINT = '768px';
export const DESKTOP_BREAKPOINT = '1024px';
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
            const updateIsMobile = () => setIsMobile(mq.matches);
            // Set initial value
            updateIsMobile();
            // Listen for changes
            mq.addEventListener('change', updateIsMobile);
            // Cleanup
            return () => mq.removeEventListener('change', updateIsMobile);
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
            const checkDrawerMode = () => {
                const width = window.innerWidth;
                const height = window.innerHeight;
                // Mobile portrait: width ≤ 767.98px
                const isMobilePortrait = width <= 767.98;
                // Mobile landscape: height ≤ 568px (common landscape height threshold)
                const isMobileLandscape = height <= 568 && width > height;
                // Tablet portrait: width between 768px and 1023px
                const isTabletPortrait = width >= 768 && width <= 1023;
                // Desktop: width ≥ 1024px should use fixed sidebar
                const isDesktop = width >= 1024;
                // Use drawer for everything except desktop
                const shouldUseDrawer = !isDesktop;
                setUseDrawer(shouldUseDrawer);
            };
            // Set initial value
            checkDrawerMode();
            // Listen for resize changes
            window.addEventListener('resize', checkDrawerMode);
            // Also listen for orientation changes on mobile
            window.addEventListener('orientationchange', () => {
                // Small delay to ensure dimensions are updated after orientation change
                setTimeout(checkDrawerMode, 100);
            });
            // Cleanup
            return () => {
                window.removeEventListener('resize', checkDrawerMode);
                window.removeEventListener('orientationchange', checkDrawerMode);
            };
        }
    }, []); // Empty dependency array ensures this runs once on mount
    return useDrawer;
}
