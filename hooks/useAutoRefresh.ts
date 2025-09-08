
'use client';
import { useEffect } from 'react';
import { isInDrawWindowNYFor } from '@lib/lotto';
export function useAutoRefresh(enabled: boolean, game: 'powerball'|'megamillions', load: () => Promise<void>) {
  useEffect(() => {
    if (!enabled) return;
    let timer: number | undefined;
    const loop = async () => {
      if (document.visibilityState === 'hidden') {
        timer = window.setTimeout(loop, 60_000);
        return;
      }
      if (isInDrawWindowNYFor(game)) {
        await load();
        timer = window.setTimeout(loop, 120_000);
      } else {
        timer = window.setTimeout(loop, 900_000);
      }
    };
    const handleVis = () => { if (document.visibilityState === 'visible') void load(); };
    document.addEventListener('visibilitychange', handleVis);
    loop();
    return () => { if (timer) window.clearTimeout(timer); document.removeEventListener('visibilitychange', handleVis); };
  }, [enabled, game, load]);
}
