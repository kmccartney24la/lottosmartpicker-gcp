// src/components/SelectedLatest.tsx
'use client';
import './SelectedLatest.css';
import { ErrorBoundary } from 'apps/web/src/components/ErrorBoundary';
import { useEffect, useRef, useState } from 'react';
import {
  GameKey, LottoRow, fetchRowsWithCache, getCurrentEraConfig,
  computeStatsAsync, ticketHints,
  // shape-aware helpers
  type LogicalGameKey, fetchLogicalRows,
  fetchDigitRowsFor, type DigitRowEx,
  fetchPick10RowsFor, computePick10StatsAsync, ticketHintsPick10,
  fetchQuickDrawRowsFor,
  type Period, type CashPopPeriod, fetchCashPopRows,
  fetchNyLottoExtendedRows,
  defaultSinceFor,
} from '@lsp/lib';
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
  digitsKFor,
  qdHas3Run,
  qdIsTight,
} from '@lsp/lib';
import Pill from 'apps/web/src/components/Pill';
import { HINT_EXPLAIN, classifyHint, displayHint } from 'apps/web/src/components/hints';

// Canonical-only; never used for scratchers
type CanonicalDrawGame = Exclude<GameKey, 'ga_scratchers'>;

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
  const isFlFantasy5 = logical === 'fl_fantasy5';
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
  // Florida digit games (canonical keys carry period already)
  const isFlPick5  = game === 'fl_pick5_midday' || game === 'fl_pick5_evening';
  const isFlPick4  = game === 'fl_pick4_midday' || game === 'fl_pick4_evening';
  const isFlPick3  = game === 'fl_pick3_midday' || game === 'fl_pick3_evening';
  const isFlPick2  = game === 'fl_pick2_midday' || game === 'fl_pick2_evening';
  const isAnyFlPick = isFlPick5 || isFlPick4 || isFlPick3 || isFlPick2;

  // Helper: filter to only labels we explain in HINT_EXPLAIN
  const keepKnownHints = (labels: string[]) => labels.filter(l => !!HINT_EXPLAIN[l]);

  // Map canonical FL Pick GameKey → { logical, fixedPeriod }
  // Narrow `lg` to the exact union fetchDigitRowsFor expects
  const flPickLogicalAndPeriod = (() => {
    type FLPickLogical = 'fl_pick5' | 'fl_pick4' | 'fl_pick3' | 'fl_pick2';
    if (!isAnyFlPick) return null as null | { lg: FLPickLogical; p: 'midday'|'evening' };
    const p: 'midday'|'evening' = game.endsWith('_midday') ? 'midday' : 'evening';
    if (isFlPick5) return { lg: 'fl_pick5' as FLPickLogical, p };
    if (isFlPick4) return { lg: 'fl_pick4' as FLPickLogical, p };
    if (isFlPick3) return { lg: 'fl_pick3' as FLPickLogical, p };
    return { lg: 'fl_pick2' as FLPickLogical, p };
  })();

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
          setNyLotto(null); setCashPop(null);
          setLatestTags([]);
        }

        // ----- DIGITS via registry (NY Numbers/Win4, CA Daily3/4, FL logical pick2/3/4/5) -----
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

        // ----- FL Pick 5/4/3/2 via LOGICAL (digits + Fireball) -----
        // (Kept for callers that pass FL logicals without `logical` prop; generic branch above handles logicals.)
        if (isFlDigitLogical) {
          const lg = digitLogicalFor(undefined, logical) as 'fl_pick2'|'fl_pick3'|'fl_pick4'|'fl_pick5';
          const metaLg = resolveGameMeta(undefined, lg);
          const eff = registryEffectivePeriod(metaLg, coerceAnyPeriod(effectivePeriod) ?? 'evening');
          const per: 'midday'|'evening' = (eff === 'midday' ? 'midday' : 'evening');
          const rows = await fetchDigitRowsFor(lg, per);
          if (cancelled()) return;
          const latest = rows.at(-1) as DigitRowEx | undefined;
          if (!latest) return;

          setDigits(latest.digits);
          setFb(typeof latest.fb === 'number' ? latest.fb : undefined);
          setLatestTags(keepKnownHints(playTypeLabelsForDigits(latest.digits, resolveGameMeta(undefined, lg))));
          setRow({ game, date: latest.date, n1:0,n2:0,n3:0,n4:0,n5:0 } as unknown as LottoRow);
          return;
        }

        // ----- FL Fantasy 5 (midday/evening; when both/all → evening) -----
        if (isFlFantasy5) {
          // window by rep key to avoid full history
          const repKey: GameKey = 'fl_fantasy5_midday';
          const since = defaultSinceFor(repKey) ?? getCurrentEraConfig(repKey).start;
          const rows = await fetchLogicalRows({ logical: 'fl_fantasy5', period: effectivePeriod, since });
          if (cancelled()) return;
          const latest = rows.at(-1) ?? null;
          if (!latest) return;
          setRow(latest); // no special
          // Use any canonical Fantasy5 GameKey (midday/evening) for era typing
          const era = getCurrentEraConfig('fl_fantasy5_midday');
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

        // ----- FL Pick 5/4/3/2 via LOGICAL (digits + Fireball) -----
        if (isFlDigitLogical) {
          const lg = digitLogicalFor(undefined, logical) as 'fl_pick2'|'fl_pick3'|'fl_pick4'|'fl_pick5';
          const per: 'midday'|'evening' = effectivePeriod === 'midday' ? 'midday' : 'evening';
          const rows = await fetchDigitRowsFor(lg, per);
          if (cancelled()) return;
          const latest = rows.at(-1) as DigitRowEx | undefined;
          if (!latest) return;
          setDigits(latest.digits);
          setFb(typeof latest.fb === 'number' ? latest.fb : undefined);
          // PLAY-TYPE ONLY tags from registry (k from meta)
          const kMeta = digitsKFor(resolveGameMeta(undefined, lg)) ?? 3;
          setLatestTags(keepKnownHints(playTypeLabelsForDigits(latest.digits, resolveGameMeta(undefined, lg))));
          // Set date for header
          setRow({ game, date: latest.date, n1:0,n2:0,n3:0,n4:0,n5:0 } as unknown as LottoRow);
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

        // ----- FL Pick 5/4/3/2 (digits + Fireball via unified fetcher) -----
        if (isAnyFlPick && flPickLogicalAndPeriod) {
          const rows = await fetchDigitRowsFor(flPickLogicalAndPeriod.lg, flPickLogicalAndPeriod.p);
          if (cancelled()) return;
          const latest = rows.at(-1) as DigitRowEx | undefined;
          if (!latest) return;
          setDigits(latest.digits);
          setFb(typeof latest.fb === 'number' ? latest.fb : undefined);
          // PLAY-TYPE ONLY tags via registry
          setLatestTags(keepKnownHints(playTypeLabelsForDigits(
            latest.digits,
            resolveGameMeta(undefined, flPickLogicalAndPeriod.lg)
          )));
          // meta date
          setRow({ game, date: latest.date, n1:0,n2:0,n3:0,n4:0,n5:0 } as unknown as LottoRow);
          return;
        }

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
  }, [game, logical, effectivePeriod, period, flPickLogicalAndPeriod?.lg, flPickLogicalAndPeriod?.p]);

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