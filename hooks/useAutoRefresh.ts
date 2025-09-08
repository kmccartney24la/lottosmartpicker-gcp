'use client';
import { useEffect, useRef } from 'react';
import { GameKey, isInDrawWindowNYFor } from '@lib/lotto';

/**
 * Auto-refresh strategy:
 * - Only active when `enabled` is true.
 * - During the selected game's draw window: refresh ~every 45s.
 * - Outside the window: very light check (every 10 min) to see if we've entered the window.
 *   (Keeps “no continuous polling” spirit; we only refresh aggressively inside the window.)
 */
export function useAutoRefresh(enabled: boolean, game: GameKey, reload: () => void) {
  const intervalRef = useRef<number | null>(null);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    const clearAll = () => {
      if (intervalRef.current != null) { clearInterval(intervalRef.current); intervalRef.current = null; }
      if (timeoutRef.current != null) { clearTimeout(timeoutRef.current); timeoutRef.current = null; }
    };

    if (!enabled) { clearAll(); return; }

    const schedule = () => {
      clearAll();

      // Inside draw window: refresh repeatedly & fast
      if (isInDrawWindowNYFor(game)) {
        // immediate refresh on enter
        reload();
        intervalRef.current = window.setInterval(() => {
          // If we leave the window, reschedule the light checker
          if (!isInDrawWindowNYFor(game)) {
            schedule();
            return;
          }
          reload();
        }, 45_000);
        return;
      }

      // Outside window: light checker to avoid constant polling
      timeoutRef.current = window.setTimeout(schedule, 10 * 60 * 1000); // 10 min
    };

    schedule();
    return () => clearAll();
  }, [enabled, game, reload]);
}

