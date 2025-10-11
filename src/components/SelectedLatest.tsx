// src/components/SelectedLatest.tsx
'use client';
import './SelectedLatest.css';
import { useEffect, useState } from 'react';
import {
  GameKey, LottoRow, fetchRowsWithCache, getCurrentEraConfig,
  computeStats, filterRowsForCurrentEra, ticketHints
} from '@lib/lotto';
import Pill from 'src/components/Pill';
import { HINT_EXPLAIN, classifyHint, displayHint } from 'src/components/hints';

// Canonical-only; never used for scratchers
type CanonicalDrawGame = Exclude<GameKey, 'ga_scratchers'>;

export default function SelectedLatest({
  game,
  onOpenPastDraws,
  showPast,
}: { game: CanonicalDrawGame; onOpenPastDraws?: () => void; showPast?: boolean }) {
  const [row, setRow] = useState<LottoRow | null>(null);
  const [latestTags, setLatestTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setBusy(true);
        const since = getCurrentEraConfig(game).start;
        // fetchRowsWithCache already returns current-era rows
        const rows = await fetchRowsWithCache({ game, since: getCurrentEraConfig(game).start });
        if (!alive) return;
        const latest = rows.length ? rows[rows.length - 1] : null;
        setRow(latest);
        if (latest) {
          const s = computeStats(rows, game, getCurrentEraConfig(game));
          const mains = [latest.n1, latest.n2, latest.n3, latest.n4, latest.n5];
          const spec = typeof latest.special === 'number' ? latest.special : 0;
          setLatestTags(ticketHints(game, mains, spec, s));
        } else {
          setLatestTags([]);
        }
      } finally {
        setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [game]);

  return (
    <div className="card selected-latest">
      {/* Past Draws action lives inside the card; pinned via CSS */}
      {onOpenPastDraws && (
        <div
          className="past-draws-anchor"
          style={{
            position: 'absolute',
            insetBlockStart: 'var(--space-4)',
            insetInlineEnd: 'var(--space-4)',
            left: 'auto',
            right: 'var(--space-4)',
            zIndex: 3,
          }}
        >
          <button
            type="button"
            className="btn btn-primary"
            onClick={onOpenPastDraws}
            aria-controls="past-draws"
            aria-expanded={!!showPast}
            title="Open past draws"
            data-role="past-draws"
          >
            Past Draws
          </button>
        </div>
      )}
      <div className="card-title selected-latest-title">Latest Draw</div>
      {busy && <div className="selected-latest-loading">Loading…</div>}
      {!busy && row && (
        <div className="selected-latest-content">
          <div className="selected-latest-meta">
            <small className="selected-latest-date">{row.date}</small>
          </div>
          {/* How this draw compares to game statistics (same tags as Hint Legend) */}
          {latestTags.length > 0 && (
            <div className="selected-latest-tags" aria-label="Latest draw tags">
              {latestTags.map((label) => {
                const tone = classifyHint(label) ?? 'neutral';
                const title = HINT_EXPLAIN?.[label];
                return (
                  <Pill key={label} tone={tone as any} title={title} wrap>
                    {displayHint(label)}
                  </Pill>
                );
              })}
            </div>
          )}
          {/* Ticket-like bubbles consistent with Generator */}
          <div className="mono num-bubbles" aria-label="Latest numbers">
            {[row.n1, row.n2, row.n3, row.n4, row.n5].map((n, i) => (
              <span
                key={`m-${i}`}
                className="num-bubble"
                aria-label={`Main ${i + 1}`}
              >
                {n}
              </span>
            ))}
            {typeof row.special === 'number' && (
              <>
                <span className="evaluate-separator" aria-hidden="true">|</span>
                <span
                  className={
                    `num-bubble ${
                      game === 'multi_powerball'    ? 'num-bubble--red'
                    : game === 'multi_megamillions' ? 'num-bubble--blue'
                    : game === 'multi_cash4life'    ? 'num-bubble--green'
                    : 'num-bubble--amber'
                    }`
                  }
                  aria-label="Special"
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