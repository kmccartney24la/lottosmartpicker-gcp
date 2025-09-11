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
        setRow(rows[rows.length - 1] ?? null);
      } finally {
        setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [game]);

  return (
    <div className="card" style={{ padding: 12, minWidth: 260, minHeight: 92 }}>
      <div style={{ fontWeight: 700, marginBottom: 4 }}>Latest draw</div>
      {busy && <div className="hint">Loading…</div>}
      {!busy && row && (
        <div className="mono" style={{ fontSize: 13 }}>
          <div className="hint" style={{ marginBottom: 2 }}>{row.date}</div>
          <div>{[row.n1,row.n2,row.n3,row.n4,row.n5].join('-')}{typeof row.special==='number' ? ` | ${row.special}` : ''}</div>
        </div>
      )}
      {!busy && !row && <div className="hint">—</div>}
    </div>
  );
}