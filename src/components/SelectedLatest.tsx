// src/components/SelectedLatest.tsx
'use client';
import './SelectedLatest.css';
import { useEffect, useState } from 'react';
import {
  GameKey, LottoRow, fetchRowsWithCache, getCurrentEraConfig,
  computeStats, ticketHints,
  // shape-aware helpers
  type LogicalGameKey, fetchLogicalRows,
  fetchDigitRowsFor, computeDigitStats, ticketHintsDigits,
  fetchPick10RowsFor, computePick10Stats, ticketHintsPick10,
  fetchQuickDrawRowsFor, computeQuickDrawStats,
  apiPathForGame, parseFlexibleCsv,
} from '@lib/lotto';
import Pill from 'src/components/Pill';
import { HINT_EXPLAIN, classifyHint, displayHint } from 'src/components/hints';

// Canonical-only; never used for scratchers
type CanonicalDrawGame = Exclude<GameKey, 'ga_scratchers'>;

export default function SelectedLatest({
  game,
  logical,
  period,
  onOpenPastDraws,
  showPast,
}: {
  game: CanonicalDrawGame;
  logical?: LogicalGameKey;          // NEW: drives shape for NY games
  period?: 'midday'|'evening'|'both';// NEW: for NY games with draw times
  onOpenPastDraws?: () => void;
  showPast?: boolean;
}) {
  // 5-ball canonical/latest row (PB/MM/C4L/Fantasy 5/Take 5 rep)
  const [row, setRow] = useState<LottoRow | null>(null);
  // NY Lottos / digits / pick10 / quick draw latest payloads
  const [digits, setDigits] = useState<number[] | null>(null);         // Numbers/Win4
  const [p10, setP10] = useState<number[] | null>(null);               // Pick 10
  const [qd, setQD] = useState<number[] | null>(null);                 // Quick Draw (20)
  const [nyLotto, setNyLotto] = useState<{ date:string; mains:number[]; bonus:number } | null>(null); // 6 + Bonus
  const [latestTags, setLatestTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const isNyNumbers = logical === 'ny_numbers';
  const isNyWin4   = logical === 'ny_win4';
  const isNyPick10 = logical === 'ny_pick10';
  const isNyQD     = logical === 'ny_quick_draw';
  const isNyTake5  = logical === 'ny_take5';
  const isNyLotto  = logical === 'ny_lotto';
  // When "both" is selected, latest should be EVENING
  const effectivePeriod = (period === 'midday') ? 'midday' : 'evening';
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setBusy(true);
        // Reset all shapes
        setRow(null); setDigits(null); setP10(null); setQD(null); setNyLotto(null);
        setLatestTags([]);

        // ----- NY Numbers / Win 4 (digits) -----
        if (isNyNumbers || isNyWin4) {
          const rows = await fetchDigitRowsFor(isNyWin4 ? 'ny_win4' : 'ny_numbers', effectivePeriod);
          if (!alive) return;
          const latest = rows.at(-1) ?? null;
          if (!latest) return;
          setDigits(latest.digits);
          const stats = computeDigitStats(rows, isNyWin4 ? 4 : 3);
          setLatestTags(ticketHintsDigits(latest.digits, stats));
          return;
        }

        // ----- NY Pick 10 -----
        if (isNyPick10) {
          const rows = await fetchPick10RowsFor('ny_pick10');
          if (!alive) return;
          const latest = rows.at(-1) ?? null;
          if (!latest) return;
          setP10(latest.values);
          const stats = computePick10Stats(rows);
          setLatestTags(ticketHintsPick10(latest.values, stats));
          return;
        }

        // ----- NY Quick Draw (20 numbers) -----
        if (isNyQD) {
          const rows = await fetchQuickDrawRowsFor('ny_quick_draw');
          if (!alive) return;
          const latest = rows.at(-1) ?? null;
          if (!latest) return;
          setQD(latest.values);
          // Light flags (same as EvaluateTicket)
          const flags: string[] = [];
          const a = [...latest.values].sort((x,y)=>x-y);
          const has3Run = a.some((_,i)=> i>=2 && a[i-2]+2===a[i-1]+1 && a[i-1]+1===a[i]);
          const span = a[a.length-1]-a[0]; const limit = Math.ceil(80 / Math.max(8, a.length+2));
          if (has3Run) flags.push('3-in-a-row');
          if (span <= limit) flags.push('Tight span');
          if (flags.length === 0) flags.push('Balanced');
          setLatestTags(flags);
          return;
        }

        // ----- NY Take 5 (5 mains, no special) -----
        if (isNyTake5) {
          const rows = await fetchLogicalRows({ logical: 'ny_take5', period: effectivePeriod });
          if (!alive) return;
          const latest = rows.at(-1) ?? null;
          if (!latest) return;
          setRow(latest); // row.special undefined for T5
          const era = getCurrentEraConfig('ny_take5');
          const stats = computeStats(rows, 'ny_take5', era);
          setLatestTags(ticketHints('ny_take5', [latest.n1,latest.n2,latest.n3,latest.n4,latest.n5], 0, stats));
          return;
        }

        // ----- NY Lotto (6 mains + Bonus) -----
        if (isNyLotto) {
          // 1) For display, read the canonical NY Lotto CSV to get 6 + Bonus.
          const url = apiPathForGame('ny_lotto');
          const res = await fetch(url, { cache: 'no-store' });
          if (!res.ok) return;
          const csv = await res.text();
          const flex = parseFlexibleCsv(csv);
          if (!alive) return;
          const last = flex.at(-1) ?? null;
          if (!last) return;
          // Map 6 mains + bonus (Bonus may be in .special or values[6])
          const mains = (last.values ?? []).filter(Number.isFinite).slice(0, 6);
          const bonus = Number.isFinite(last.special as any)
            ? (last.special as number)
            : ((last.values ?? [])[6] ?? 0);
          if (mains.length !== 6 || !Number.isFinite(bonus)) return;
          setNyLotto({ date: last.date, mains, bonus });
          // 2) For tags, use era-aware stats (mains only)
          const era = getCurrentEraConfig('ny_lotto');
          const statsRows = await fetchRowsWithCache({ game: 'ny_lotto', since: era.start });
          const stats = computeStats(statsRows, 'ny_lotto', era);
          setLatestTags(ticketHints('ny_lotto', mains, 0, stats));
          return;
        }

        // ----- Default canonical 5-ball path (Powerball/Mega/C4L/GA Fantasy 5) -----
        const era = getCurrentEraConfig(game);
        const rows = await fetchRowsWithCache({ game, since: era.start });
        if (!alive) return;
        const latest = rows.at(-1) ?? null;
        setRow(latest);
        if (latest) {
          const s = computeStats(rows, game, era);
          const mains = [latest.n1, latest.n2, latest.n3, latest.n4, latest.n5];
          const spec = typeof latest.special === 'number' ? latest.special : 0;
          setLatestTags(ticketHints(game, mains, spec, s));
        }
      } finally {
        setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [game, logical, effectivePeriod, period]);

  return (
    <div className="card card--reserve-topright selected-latest">
      {/* Past Draws action lives inside the card; pinned via CSS */}
      {onOpenPastDraws && (
        <div className="past-draws-anchor card-topright-anchor">
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
      {/* Canonical 5-ball (PB/MM/C4L) and NY Take 5 reuse `row` */}
      {!busy && !digits && !p10 && !qd && !nyLotto && row && (
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
      {/* NY Numbers / Win 4 (digits) */}
      {!busy && digits && (
        <div className="selected-latest-content">
          <div className="selected-latest-meta">
            <small className="selected-latest-date">Latest {effectivePeriod === 'midday' ? 'Midday' : 'Evening'}</small>
          </div>
          {latestTags.length > 0 && (
            <div className="selected-latest-tags" aria-label="Latest draw tags">
              {latestTags.map(label => (
                <Pill key={label} tone={classifyHint(label)} title={HINT_EXPLAIN[label]} wrap>
                  {displayHint(label)}
                </Pill>
              ))}
            </div>
          )}
          <div className="mono num-bubbles" aria-label="Latest digits">
            {digits.map((d,i)=>(
              <span key={`dg-${i}`} className="num-bubble">{d}</span>
            ))}
          </div>
        </div>
      )}
      {/* NY Pick 10 (10 numbers) */}
      {!busy && p10 && (
        <div className="selected-latest-content">
          <div className="selected-latest-meta">
            <small className="selected-latest-date">Latest</small>
          </div>
          {latestTags.length > 0 && (
            <div className="selected-latest-tags" aria-label="Latest draw tags">
              {latestTags.map(label => (
                <Pill key={label} tone={classifyHint(label)} title={HINT_EXPLAIN[label]} wrap>
                  {displayHint(label)}
                </Pill>
              ))}
            </div>
          )}
          <div className="mono num-bubbles" aria-label="Latest numbers">
            {p10.map((n,i)=>(
              <span key={`p10-${i}`} className="num-bubble">{n}</span>
            ))}
          </div>
        </div>
      )}
      {/* NY Quick Draw (20 numbers) */}
      {!busy && qd && (
        <div className="selected-latest-content">
          <div className="selected-latest-meta">
            <small className="selected-latest-date">Latest</small>
          </div>
          {latestTags.length > 0 && (
            <div className="selected-latest-tags" aria-label="Latest draw tags">
              {latestTags.map(label => (
                <Pill key={label} tone={classifyHint(label)} title={HINT_EXPLAIN[label]} wrap>
                  {displayHint(label)}
                </Pill>
              ))}
            </div>
          )}
          <div className="mono num-bubbles" aria-label="Latest numbers">
            {qd.map((n,i)=>(
              <span key={`qd-${i}`} className="num-bubble">{n}</span>
            ))}
          </div>
        </div>
      )}
      {/* NY Lotto (6 mains + Bonus) */}
      {!busy && nyLotto && (
        <div className="selected-latest-content">
          <div className="selected-latest-meta">
            <small className="selected-latest-date">{nyLotto.date}</small>
          </div>
          {latestTags.length > 0 && (
            <div className="selected-latest-tags" aria-label="Latest draw tags">
              {latestTags.map(label => (
                <Pill key={label} tone={classifyHint(label)} title={HINT_EXPLAIN[label]} wrap>
                  {displayHint(label)}
                </Pill>
              ))}
            </div>
          )}
          <div className="mono num-bubbles" aria-label="Latest numbers">
            {nyLotto.mains.map((n,i)=>(
              <span key={`ny6-${i}`} className="num-bubble">{n}</span>
            ))}
            <span className="evaluate-separator" aria-hidden="true">|</span>
            <span className="num-bubble num-bubble--amber" aria-label="Bonus">{nyLotto.bonus}</span>
          </div>
        </div>
      )}
      {!busy && !row && !digits && !p10 && !qd && !nyLotto && (
        <div className="selected-latest-empty">—</div>
      )}
    </div>
  );
}