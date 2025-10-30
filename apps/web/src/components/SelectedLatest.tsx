// src/components/SelectedLatest.tsx
'use client';
import './SelectedLatest.css';
import { ErrorBoundary } from 'apps/web/src/components/ErrorBoundary';
import { useEffect, useRef, useState } from 'react';
import {
  fetchRowsWithCache, getCurrentEraConfig,
  computeStatsAsync, ticketHints,
  // shape-aware helpers
  fetchLogicalRows,
  fetchDigitRowsFor, 
  fetchPick10RowsFor, computePick10StatsAsync, ticketHintsPick10,
  fetchQuickDrawRowsFor,
  // TX All or Nothing (12-from-24)
  fetchAllOrNothingRowsFor, computeAllOrNothingStatsAsync,
  fetchCashPopRows,
  fetchNyLottoExtendedRows,
  defaultSinceFor,
} from '@lsp/lib';
import type {
  GameKey, LottoRow, LogicalGameKey,
  DigitRowEx, Period, CashPopPeriod
} from '@lsp/lib'
import {
  resolveGameMeta,
  effectivePeriod as registryEffectivePeriod,
  coerceAnyPeriod,
  filterHintsForGame as registryFilterHintsForGame,
  // use registry for digits tags + Fireball/Bonus/special rendering
  playTypeLabelsForDigits,
  digitLogicalFor,
  sidebarSpecialForRow,
  rowToFiveView,
  qdHas3Run,
  qdIsTight,
} from '@lsp/lib';
import Pill from 'apps/web/src/components/Pill';
import { HINT_EXPLAIN, classifyHint, displayHint } from 'apps/web/src/components/hints';

type CanonicalDrawGame = GameKey;

function SelectedLatestInner({
  game,
  logical,
  period,
  onOpenPastDraws,
  showPast,
}: {
  game: CanonicalDrawGame;
  logical?: LogicalGameKey;          // NEW: drives shape for NY games
  period?: Period;                   // generalized (midday/evening/both/all + cashpop periods)
  onOpenPastDraws?: () => void;
  showPast?: boolean;
}) {

  // Registry-driven meta (tone, six-mains, etc.)
  const meta = resolveGameMeta(game, logical);

  // 5-ball canonical/latest row (PB/MM/C4L/Fantasy 5/Take 5 rep)
  const [row, setRow] = useState<LottoRow | null>(null);
  // NY Lottos / digits / pick10 / quick draw latest payloads
  const [digits, setDigits] = useState<number[] | null>(null);         // Numbers/Win4 + FL Picks
  const [fb, setFb] = useState<number | undefined>(undefined);         // Florida Fireball (optional)
  const [p10, setP10] = useState<number[] | null>(null);               // Pick 10
  const [qd, setQD] = useState<number[] | null>(null);                 // Quick Draw (20) 
  const [aon, setAon] = useState<{ date:string; values:number[] } | null>(null);   // Texas All or Nothing (12 numbers, 1..24)
  const [nyLotto, setNyLotto] = useState<{ date:string; mains:number[]; bonus:number } | null>(null); // 6 + Bonus
  const [cashPop, setCashPop] = useState<{ date:string; value:number } | null>(null); // Cash Pop (1 value)
  const [latestTags, setLatestTags] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const isNyNumbers = logical === 'ny_numbers';
  const isNyWin4   = logical === 'ny_win4';
  const isNyPick10 = logical === 'ny_pick10';
  const isNyQD     = logical === 'ny_quick_draw';
  const isNyTake5  = logical === 'ny_take5';
  const isNyLotto  = logical === 'ny_lotto';
  const isTxAon    = logical === 'tx_all_or_nothing' || meta.shape === 'allornothing';
  const isFlFantasy5 = logical === 'fl_fantasy5' || game === 'fl_fantasy5';
  const isFlCashPop  = logical === 'fl_cashpop';
  const isFlDigitLogical =
    logical === 'fl_pick2' || logical === 'fl_pick3' || logical === 'fl_pick4' || logical === 'fl_pick5';

  // Period selection:
  // - Cash Pop: honor user's selection; default to 'all'
  // - Others: use registry rule (prefer evening when both/all)
  const effectivePeriod: Period = isFlCashPop
    ? ((period ?? 'all') as Period)
    : (registryEffectivePeriod(meta, coerceAnyPeriod(period) ?? 'evening') as Period);
  // Florida 6-main games (6th main currently lives in `row.special`)
  const isFlLotto  = game === 'fl_lotto';
  const isFlJTP    = game === 'fl_jackpot_triple_play';

  // Helper: filter to only labels we explain in HINT_EXPLAIN
  const keepKnownHints = (labels: string[]) => labels.filter(l => !!HINT_EXPLAIN[l]);

  // No more *_midday/*_evening GameKeys for FL digits; we always come through logicals.
  const flPickLogicalAndPeriod = null as null;

  // One abortable, debounced chain at a time
  const inflightRef = useRef<{ ac: AbortController | null; timer: any } | null>(null);

  useEffect(() => {
    // cancel previous run (if any)
    if (inflightRef.current?.ac) inflightRef.current.ac.abort();
    if (inflightRef.current?.timer) clearTimeout(inflightRef.current.timer);

    const ac = new AbortController();
    const signal = ac.signal;
    const cancelled = () => signal.aborted;

    // debounce to kill flappy switches
    const timer = setTimeout(async () => {
      try {
        if (cancelled()) return;
        const hadData = !!(row || digits || p10 || qd || nyLotto || cashPop);
        setBusy(true);
        setRefreshing(hadData);
        // First load: clear. Refresh: keep showing old data.
        if (!hadData) {
          setRow(null);
          setDigits(null); setFb(undefined);
          setP10(null); setQD(null);
          setAon(null);
          setNyLotto(null); setCashPop(null);
          setLatestTags([]);
        }

        // ----- DIGITS via registry (NY Numbers/Win4, CA Daily3/4, FL/TX logical pick*, etc.) -----
        const lgDigitGeneric = logical ? digitLogicalFor(undefined, logical) : null;
        if (lgDigitGeneric) {
          const metaLg = resolveGameMeta(undefined, lgDigitGeneric);
          // Normalize to the concrete input that fetcher accepts
          const eff = registryEffectivePeriod(metaLg, coerceAnyPeriod(effectivePeriod) ?? 'evening');
          const per: 'midday'|'evening' = (eff === 'midday' ? 'midday' : 'evening');
          const rows = await fetchDigitRowsFor(lgDigitGeneric as any, per);
          if (cancelled()) return;
          const latest = rows.at(-1) as DigitRowEx | undefined;
          if (!latest) return;
          setDigits(latest.digits);
          // Show Fireball only when registry says this logical uses it
          setFb(metaLg.usesFireball && typeof (latest as any).fb === 'number' ? (latest as any).fb : undefined);
          setLatestTags(keepKnownHints(playTypeLabelsForDigits(latest.digits, metaLg)));
          // Set a minimal row so header can show the date
          setRow({ game, date: latest.date, n1:0,n2:0,n3:0,n4:0,n5:0 } as unknown as LottoRow);
          return;
        }

        // ----- FL Fantasy 5 (midday/evening; when both/all → evening) -----
        if (isFlFantasy5) {
          // window by rep key to avoid full history
          const repKey: GameKey = 'fl_fantasy5';
          const since = defaultSinceFor(repKey) ?? getCurrentEraConfig(repKey).start;
          const rows = await fetchLogicalRows({ logical: 'fl_fantasy5', period: effectivePeriod, since });
          if (cancelled()) return;
          const latest = rows.at(-1) ?? null;
          if (!latest) return;
          setRow(latest); // no special
          // Use any canonical Fantasy5 GameKey (midday/evening) for era typing
          const era = getCurrentEraConfig('fl_fantasy5');
          const stats = await computeStatsAsync(rows as any, latest.game as GameKey, {
            mainMax: era.mainMax, specialMax: era.specialMax, mainPick: era.mainPick
          }, signal);
          setLatestTags(
            registryFilterHintsForGame(meta, ticketHints(latest.game as GameKey, [latest.n1,latest.n2,latest.n3,latest.n4,latest.n5], 0, stats))
          );
          return;
        }

        // ----- FL Cash Pop (selected period; 'all' = latest among five) -----
        if (isFlCashPop) {
          // fetchCashPopRows only accepts CashPopPeriod | 'all'
          const cpPeriod: CashPopPeriod | 'all' =
            (effectivePeriod === 'both' || effectivePeriod === 'midday' || effectivePeriod === 'evening')
              ? 'all'
              : (effectivePeriod as CashPopPeriod | 'all');
          const rows = await fetchCashPopRows(cpPeriod);
          if (cancelled()) return;
          const latest = rows.at(-1) ?? null;
          if (!latest) return;
          setCashPop({ date: latest.date, value: latest.value });
          // No special tags for single-number; keep it simple
          return;
        }

        // ----- NY Pick 10 -----
        if (isNyPick10) {
          const rows = await fetchPick10RowsFor('ny_pick10');
          if (cancelled()) return;
          const latest = rows.at(-1) ?? null;
          if (!latest) return;
          setP10(latest.values);
          const stats = await computePick10StatsAsync(rows, signal);
          setLatestTags(ticketHintsPick10(latest.values, stats));
          return;
        }

        // (FL/TX digits are handled by the generic DIGITS branch above)

        // ----- NY Quick Draw (20 numbers) -----
        if (isNyQD) {
          const rows = await fetchQuickDrawRowsFor('ny_quick_draw');
          if (cancelled()) return;
          const latest = rows.at(-1) ?? null;
          if (!latest) return;
          setQD(latest.values);
          // Light flags via registry helpers
          const flags: string[] = [];
          if (qdHas3Run(latest.values)) flags.push('3-in-a-row');
          if (qdIsTight(latest.values)) flags.push('Tight span');
          if (flags.length === 0) flags.push('Balanced');
          setLatestTags(flags);
          return;
        }

        // ----- TX All or Nothing (12-from-24, 4x daily) -----
        if (isTxAon) {
          // same period coercion as other multi-daily TX games
          const eff = registryEffectivePeriod(meta, coerceAnyPeriod(effectivePeriod) ?? 'evening');
          const per: 'morning' | 'day' | 'evening' | 'night' | 'all' =
            eff === 'all'
              ? 'all'
              : eff === 'midday'
                ? 'day'
                : eff === 'evening'
                  ? 'evening'
                  : eff === 'both'
                    ? 'evening'
                    : (eff as any);
          const rows = await fetchAllOrNothingRowsFor('tx_all_or_nothing', per);
          if (cancelled()) return;
          const latest = rows.at(-1) ?? null;
          if (!latest) return;
          setAon({ date: latest.date, values: latest.values });
          // compute AoN stats to get z-scores → then filter via registry list
          const stats = await computeAllOrNothingStatsAsync(rows, signal);
          // Build lightweight flags: hot/cold style isn’t surfaced here; we stick to registry names
          // Registry patterns for 'allornothing' were set to ['3-in-a-row','Tight span','Balanced']
          const flags: string[] = [];
          const sorted = [...latest.values].sort((a,b)=>a-b);
          const hasRun3 = sorted.some((v,i,arr)=> i>=2 && arr[i-2]!+2===arr[i-1]!+1 && arr[i-1]!+1===v);
          const span = sorted[sorted.length-1]! - sorted[0]!;
          if (hasRun3) flags.push('3-in-a-row');
          if (span <= 6) flags.push('Tight span'); // 24/4 = 6 → same spirit as quickdraw
          if (flags.length === 0) flags.push('Balanced');
          setLatestTags(flags.filter(l => !!HINT_EXPLAIN[l]));
          return;
        }

        // ----- NY Take 5 (5 mains, no special) -----
        if (isNyTake5) {
          const repKey: GameKey = 'ny_take5'; // representative for windowing
          const since = defaultSinceFor(repKey) ?? getCurrentEraConfig(repKey).start;
          const rows = await fetchLogicalRows({ logical: 'ny_take5', period: effectivePeriod, since });
          if (cancelled()) return;
          const latest = rows.at(-1) ?? null;
          if (!latest) return;
          setRow(latest); // row.special undefined for T5
          const era = getCurrentEraConfig('ny_take5');
          const stats = await computeStatsAsync(rows as any, 'ny_take5', {
            mainMax: era.mainMax, specialMax: era.specialMax, mainPick: era.mainPick
          }, signal);
          setLatestTags(ticketHints('ny_take5', [latest.n1,latest.n2,latest.n3,latest.n4,latest.n5], 0, stats));
          return;
        }

        // ----- NY Lotto (6 mains + Bonus) -----
        if (isNyLotto) {
          // 1) Display via centralized extended fetcher (6 mains + Bonus)
          const ext = await fetchNyLottoExtendedRows();
          if (cancelled()) return;
          const last = ext.at(-1) ?? null;
          if (!last) return;
          setNyLotto({ date: last.date, mains: last.mains, bonus: last.bonus });
          // 2) For tags, use era-aware stats (mains only)
          const era = getCurrentEraConfig('ny_lotto');
          const since = defaultSinceFor('ny_lotto') ?? era.start;
          const statsRows = await fetchRowsWithCache({ game: 'ny_lotto', since });
          if (cancelled()) return;
          const stats = await computeStatsAsync(statsRows as any, 'ny_lotto', {
            mainMax: era.mainMax, specialMax: era.specialMax, mainPick: era.mainPick
          }, signal);
          setLatestTags(ticketHints('ny_lotto', last.mains, 0, stats));
          return;
        }

        // ----- Default canonical 5-ball path (Powerball/Mega/C4L/GA/FL Fantasy 5 rep) -----
        const era = getCurrentEraConfig(game);
        const since = defaultSinceFor(game) ?? era.start;
        const rows = await fetchRowsWithCache({ game, since });
        if (cancelled()) return;
        const latest = rows.at(-1) ?? null;
        setRow(latest);
        if (latest) {
          const s = await computeStatsAsync(rows as any, game, {
            mainMax: era.mainMax, specialMax: era.specialMax, mainPick: era.mainPick
          }, signal);
          const mains = [latest.n1, latest.n2, latest.n3, latest.n4, latest.n5];
          const spec = typeof latest.special === 'number' ? latest.special : 0;
          setLatestTags(
            registryFilterHintsForGame(meta, ticketHints(game, mains, spec, s))
          );
        }
      } finally {
        if (!cancelled()) { setBusy(false); setRefreshing(false); }
      }
    }, 200);

    inflightRef.current = { ac, timer };
    return () => {
      ac.abort();
      clearTimeout(timer);
    };
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
      {busy && !refreshing && <div className="selected-latest-loading">Loading…</div>}
      {refreshing && <div className="selected-latest-refresh">Refreshing…</div>}
      {/* Canonical 5-ball, NY Take 5, FL Fantasy 5 (render via rowToFiveView for consistency, incl. FL LOTTO/JTP) */}
      {!busy && !digits && !p10 && !qd && !nyLotto && !cashPop && row && (
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
            {(() => {
              const era = getCurrentEraConfig(game);
              const v = rowToFiveView(
                { n1: row.n1, n2: row.n2, n3: row.n3, n4: row.n4, n5: row.n5, special: row.special },
                meta,
                { gameStr: row.game as string, eraCfg: era }
              );
              return (
                <>
                  {v.mains.map((n, i) => (
                    <span key={`m-${i}`} className="num-bubble" aria-label={`Main ${i + 1}`}>{n}</span>
                  ))}
                  {v.sep && (
                    <>
                      <span className="evaluate-separator" aria-hidden="true">|</span>
                      <span className={`num-bubble ${v.className ?? ''}`} aria-label={v.label || 'Special'}>
                        {typeof v.special === 'number' ? v.special : '—'}
                      </span>
                    </>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      )}
      {/* NY Numbers / Win 4 (digits) */}
      {!busy && digits && (
        <div className="selected-latest-content">
          <div className="selected-latest-meta">
            <small className="selected-latest-date">
              Latest {effectivePeriod === 'midday' ? 'Midday' : 'Evening'}
              {row?.date ? ` · ${row.date}` : ''}
            </small>
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
            {typeof fb === 'number' && (
              <>
                <span className="evaluate-separator" aria-hidden="true">|</span>
                <span className="num-bubble num-bubble--fireball" aria-label="Fireball">{fb}</span>
              </>
            )}
          </div>
        </div>
      )}
      {/* NY Pick 10 (10 numbers) */}
      {!busy && p10 && (
        <div className="selected-latest-content">
          <div className="selected-latest-meta">
            <small className="selected-latest-date">Latest{row?.date ? ` · ${row.date}` : ''}</small>
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
            <small className="selected-latest-date">Latest{row?.date ? ` · ${row.date}` : ''}</small>
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
      {/* TX All or Nothing (12 numbers, 1..24) */}
      {!busy && aon && (
        <div className="selected-latest-content">
          <div className="selected-latest-meta">
            <small className="selected-latest-date">
              {aon.date}
            </small>
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
            {aon.values.map((n,i)=>(
              <span key={`aon-${i}`} className="num-bubble">{n}</span>
            ))}
          </div>
        </div>
      )}
      {/* FL Cash Pop (single value) */}
      {!busy && cashPop && (
        <div className="selected-latest-content">
          <div className="selected-latest-meta">
            <small className="selected-latest-date">{cashPop.date}</small>
          </div>
          <div className="mono num-bubbles" aria-label="Latest Cash Pop number">
            <span className="num-bubble">{cashPop.value}</span>
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
            <span className="num-bubble num-bubble--nylotto-bonus" aria-label="Bonus">{nyLotto.bonus}</span>
          </div>
        </div>
      )}
      {!busy && !row && !digits && !p10 && !qd && !nyLotto && !cashPop && (
        <div className="selected-latest-empty">—</div>
      )}
    </div>
  );
}

// --- Component-level Error Boundary wrapper ---
export default function SelectedLatest(props: {
  game: CanonicalDrawGame;
  logical?: LogicalGameKey;
  period?: Period;
  onOpenPastDraws?: () => void;
  showPast?: boolean;
}) {
  // Remount the boundary when identity-defining props change
  const resetKey = JSON.stringify({
    game: props.game,
    logical: props.logical ?? null,
    period: props.period ?? null,
  });
  return (
    <ErrorBoundary key={resetKey}>
      <SelectedLatestInner {...props} />
    </ErrorBoundary>
  );
}