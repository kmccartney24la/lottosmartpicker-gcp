'use client';
import { useEffect, useState } from 'react';
import {
  GameKey, LottoRow, fetchRowsWithCache, getCurrentEraConfig,
} from '@lib/lotto';

const GAMES: { key: GameKey; label: string }[] = [
  { key: 'powerball',    label: 'Powerball' },
  { key: 'megamillions', label: 'Mega Millions' },
  { key: 'ga_cash4life', label: 'Cash4Life' },
  { key: 'ga_fantasy5',  label: 'Fantasy 5' },
];

export default function LatestStrip() {
  const [latest, setLatest] = useState<Record<GameKey, LottoRow | null>>({
    powerball: null, megamillions: null, ga_cash4life: null, ga_fantasy5: null,
  });

  useEffect(() => {
    let alive = true;
    (async () => {
      const entries = await Promise.all(GAMES.map(async g => {
        const since = getCurrentEraConfig(g.key).start;
        const rows = await fetchRowsWithCache({ game: g.key, since, latestOnly: true });
        return [g.key, rows[rows.length - 1] ?? null] as const;
      }));
      if (alive) {
        const next: any = {}; entries.forEach(([k, v]) => next[k] = v);
        setLatest(next);
      }
    })();
    return () => { alive = false; };
  }, []);
  return (
    <section className="grid" style={{ gridTemplateColumns: 'repeat(4,minmax(0,1fr))', gap: 8, margin: '8px 0' }}>
      {GAMES.map(g => {
        const r = latest[g.key];
        return (
          <div key={g.key} className="card" aria-live="polite">
            <div style={{ fontWeight: 700, marginBottom: 4 }}>{g.label}</div>
            {r ? (
              <div className="mono" style={{ fontSize: 13 }}>
                <div className="hint" style={{ marginBottom: 2 }}>{r.date}</div>
                <div>{[r.n1,r.n2,r.n3,r.n4,r.n5].join('-')}{typeof r.special==='number' ? ` | ${r.special}` : ''}</div>
              </div>
            ) : (
              <div className="hint">—</div>
            )}
          </div>
        );
      })}
    </section>
  );
}