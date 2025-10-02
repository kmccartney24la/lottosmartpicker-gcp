// src/components/SelectedLatest.tsx
'use client';
import { useEffect, useState } from 'react';
import { GameKey, LottoRow, fetchRowsWithCache, getCurrentEraConfig } from '@lib/lotto';

export default function SelectedLatest({ game }: { game: GameKey }) {
  const [row, setRow] = useState<LottoRow | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setBusy(true);
        const since = getCurrentEraConfig(game).start;
        const rows = await fetchRowsWithCache({ game, since, latestOnly: true });
        if (!alive) return;
        setRow(rows[0] ?? null);
      } finally {
        setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [game]);

  return (
    <div className="card selected-latest">
      <div className="selected-latest-title">Latest draw</div>
      {busy && <div className="selected-latest-loading">Loading…</div>}
      {!busy && row && (
        <div className="selected-latest-content">
          <div className="selected-latest-date">{row.date}</div>
          <div className="selected-latest-numbers">
            {[row.n1, row.n2, row.n3, row.n4, row.n5].map((n,i) => (
              <span key={`m-${i}`} aria-label={`Main ${i+1}`}>{n}</span>
            ))}
            {typeof row.special === 'number' && (
              <>
                <span className="evaluate-separator" aria-hidden="true">|</span>
                <span
                  aria-label="Special"
                  data-kind={
                    game === 'multi_powerball' ? 'pb'
                    : game === 'multi_megamillions' ? 'mb'
                    : game === 'multi_cash4life' ? 'cb'
                    : 'special'
                  }
                >
                  {row.special}
                </span>
              </>
            )}
          </div>
        </div>
      )}
      {!busy && !row && <div className="selected-latest-empty">—</div>}
    </div>
  );
}