// src/components/AnalyzeSidebar.tsx
'use client';
import './AnalyzeSidebar.css';
import { useEffect, useRef, useState } from 'react';
import PatternInsightsModal from 'apps/web/src/components/PatternInsightsModal';
import { ErrorBoundary } from 'apps/web/src/components/ErrorBoundary';
import {
   fetchRowsWithCache, fetchLogicalRows,
   defaultSinceFor,
   jackpotOdds, jackpotOddsQuickDraw, jackpotOddsForLogical,
   // Digits
   fetchDigitRowsFor, computeDigitStatsAsync, recommendDigitsFromStats,
   // Pick 10
   fetchPick10RowsFor, computePick10StatsAsync, recommendPick10FromStats,
   inferKAndNFromKOfNRows,
   // Quick Draw (Keno-style)
   fetchQuickDrawRowsFor, computeQuickDrawStatsAsync, recommendQuickDrawFromStats,
   // Cash Pop
   fetchCashPopRows,
   // All or Nothing (TX)
   // lives in lotto/fetch.ts, analytics live in lotto/pick10.ts as a variant
   fetchAllOrNothingRows,
   computeAllOrNothingStatsAsync,
   // (no explicit recommend fn exported; we’ll surface the hot/cold alpha-like results)
   // Worker-offloaded analysis
   analyzeGameAsync, LOGICAL_TO_UNDERLYING,
   resolveEraGame,
   getCurrentEraConfig,
 } from '@lsp/lib';
import type { StateKey, GameKey, LogicalGameKey,} from '@lsp/lib';
import { DEFAULT_STATE } from '@lsp/lib';
import {
  resolveGameMeta,
  isDigitShape,
  effectivePeriod,
  coerceAnyPeriod,
  digitLogicalFor,
  repForLogical,
  displayNameFor,
  digitsKFor,
  sidebarModeFor,
} from '@lsp/lib';

// Canonical/era-backed draw games come from lib types
type CanonicalDrawGame = GameKey;
// Canonical keys to consider (labels will come from registry.displayNameFor)
const ORDER: GameKey[] = [
  'multi_powerball',
  'multi_megamillions',
  'multi_cash4life',
  'ga_fantasy5',
  // California classics
  'ca_superlotto_plus',
  'ca_fantasy5',
  // Florida classics
  'fl_fantasy5',
  'fl_lotto',
  'fl_jackpot_triple_play',
  // New York classics
  'ny_take5',
  'ny_lotto',
  // Texas era-backed canonicals
  'tx_lotto_texas',
  'tx_cash5',
  'tx_texas_two_step',
];

// Which logical games are allowed per state page
const MULTISTATE: LogicalGameKey[] = [
  'multi_powerball','multi_megamillions','multi_cash4life',
];

function logicalAllowedByState(st: StateKey): LogicalGameKey[] {
  const prefix = `${st}_`; // 'ga_','ca_','ny_','fl_','tx_'
  const all = Object.keys(LOGICAL_TO_UNDERLYING) as LogicalGameKey[];
  const local = all.filter(k => k.startsWith(prefix));
  return [...new Set([...MULTISTATE, ...local])];
}

// Which canonical games are allowed per state page
const CANON_BY_STATE: Record<StateKey, GameKey[]> = {
  ga: ['ga_fantasy5','multi_powerball','multi_megamillions','multi_cash4life'],
  ca: ['ca_superlotto_plus','ca_fantasy5','multi_powerball','multi_megamillions'],
  ny: ['ny_take5','ny_lotto','multi_powerball','multi_megamillions','multi_cash4life'],
  fl: ['fl_fantasy5','fl_lotto','fl_jackpot_triple_play','multi_powerball','multi_megamillions','multi_cash4life'],
  tx: ['tx_lotto_texas','tx_cash5','tx_texas_two_step','multi_powerball','multi_megamillions'],
};

type A = ReturnType<typeof import('@lsp/lib').analyzeGame>;
// Use typeof import to avoid pulling sync fns as runtime values
type DS  = ReturnType<typeof import('@lsp/lib').computeDigitStats>;
type P10 = ReturnType<typeof import('@lsp/lib').computePick10Stats>;
type QD  = ReturnType<typeof import('@lsp/lib').computeQuickDrawStats>;
type AON = ReturnType<typeof import('@lsp/lib').computeAllOrNothingStats>;
type CP  = { totalDraws: number };

type Props = {
  /** Canonical games to analyze on this page (defaults to ORDER’s keys). */
  canonical?: CanonicalDrawGame[];
  /** Logical (NY) games to analyze on this page (defaults to none). */
  logical?: LogicalGameKey[];
  /** Optional card title override. */
  title?: string;
  /** Period to analyze for logical games that have midday/evening variants. Defaults to 'both'. */
  period?: 'midday'|'evening'|'both';
  /** State context for filtering which games appear/analyze. */
  state?: StateKey;
};

function AnalyzeSidebarInner({ canonical, logical, title, period = 'both', state }: Props) {
  const st = state ?? DEFAULT_STATE;

  const CANON_BASE: GameKey[] =
    canonical && canonical.length > 0 ? canonical : ORDER;

  const CANON_LIST = CANON_BASE
    .filter((k) => CANON_BY_STATE[st].includes(k))
    .map((key) => ({ key, label: displayNameFor(key) }));
  // Logical games:
  // If the caller didn't pass any, fall back to "all logicals allowed for this state"
  const allowedLogical = logicalAllowedByState(st);
  const baseLogical =
    logical && logical.length > 0
      ? logical
      : allowedLogical;
  const LOGICAL_LIST = baseLogical.filter(lg => allowedLogical.includes(lg)).slice();
  // Store by string id so canonical and logical can coexist without collisions
  const [data5, setData5] = useState<Record<string, A | null>>({});
  const [dataDigits, setDataDigits] = useState<Record<string, DS | null>>({});
  const [dataP10, setDataP10] = useState<Record<string, P10 | null>>({});
  const [dataQD,  setDataQD]  = useState<Record<string, QD  | null>>({});
  const [dataCP,  setDataCP]  = useState<Record<string, CP  | null>>({});
  const [dataAON, setDataAON] = useState<Record<string, AON | null>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string|null>(null);
  const [okCount, setOkCount] = useState(0);
  const [qdSpots, setQdSpots] = useState<1|2|3|4|5|6|7|8|9|10>(10);
  const [sortMode, setSortMode] = useState<'alpha' | 'odds'>('alpha');
  const [selectedGameId, setSelectedGameId] = useState<string | null>(null);
  const [insightsOpen, setInsightsOpen] = useState(false);

  // Track a single in-flight analyze chain to abort on prop changes
  const inflightRef = useRef<{ ac: AbortController | null; timer: any } | null>(null);

  // Alphabetical views (case-insensitive)
  const CANON_VIEW = [...CANON_LIST].sort((a, b) =>
    String(a.label).localeCompare(String(b.label), 'en', { sensitivity: 'base' })
  );
  const LOGICAL_VIEW = [...LOGICAL_LIST].sort((a, b) =>
    String(displayNameFor(a)).localeCompare(String(displayNameFor(b)), 'en', { sensitivity: 'base' })
  );

  // Build a single list containing *all* games with a best-effort odds number
  const ALL_GAMES_SORTABLE = [
    ...CANON_LIST.map(g => {
      const raw = jackpotOdds(g.key);
      const odds = Number.isFinite(raw) ? raw : Number.POSITIVE_INFINITY;
      return {
        id: g.key,
        kind: 'canonical' as const,
        label: displayNameFor(g.key),
        odds,
      };
    }),
    ...LOGICAL_LIST.map(lg => {
      const meta = resolveGameMeta(undefined, lg);
      const rep = repForLogical(lg, meta);
      let odds = Number.POSITIVE_INFINITY;
      if (isDigitShape(meta.shape)) {
        const o = jackpotOddsForLogical(lg);
        odds = o ? o : Number.POSITIVE_INFINITY;
      } else if (meta.shape === 'pick10') {
        const o = jackpotOddsForLogical('ny_pick10');
        odds = o ? o : Number.POSITIVE_INFINITY;
      } else if (meta.shape === 'quickdraw') {
        // depends on current spots, but that's ok — we just need *a* number
        const o = jackpotOddsQuickDraw(qdSpots);
        odds = o ? o : Number.POSITIVE_INFINITY;
      } else if (meta.shape === 'five' || meta.shape === 'six') {
        const o = jackpotOdds(rep);
        odds = o ? o : Number.POSITIVE_INFINITY;
      }
      return {
        id: lg,
        kind: 'logical' as const,
        label: displayNameFor(lg),
        odds,
      };
    }),
  ];

  const SORTED_BY_ODDS = [...ALL_GAMES_SORTABLE].sort((a, b) => {
    if (a.odds === b.odds) {
      return a.label.localeCompare(b.label, 'en', { sensitivity: 'base' });
    }
    return a.odds - b.odds;
  });

  // Load per-game analysis (current era only) with debounce + abort
  useEffect(() => {
    // Abort any previous run + clear pending debounce
    if (inflightRef.current?.ac) inflightRef.current.ac.abort();
    if (inflightRef.current?.timer) clearTimeout(inflightRef.current.timer);

    const ac = new AbortController();
    const signal = ac.signal;
    const cancelled = () => signal.aborted;

    const timer = setTimeout(async () => {
      try {
        if (cancelled()) return;
        setBusy(true);
        setErr(null);
        type TaskResult =
          | readonly [key: string, kind: 'five',     value: A]
          | readonly [key: string, kind: 'digits',   value: DS]
          | readonly [key: string, kind: 'pick10',   value: P10]
          | readonly [key: string, kind: 'quickdraw',value: QD]
          | readonly [key: string, kind: 'allornothing', value: AON]
          | readonly [key: string, kind: 'cashpop',  value: CP];
        const tasks: Promise<TaskResult>[] = [];
        // Canonical games
        for (const g of CANON_LIST) {
          tasks.push((async () => {
            // g.key is already an EraKey
            const rows = await fetchRowsWithCache({ game: g.key });
            const v = await analyzeGameAsync(rows, g.key, signal);
            return [g.key, 'five', v] as const;
          })());
        }
        // Logical loader (branch by game type)
        for (const lg of LOGICAL_LIST) {
          const meta = resolveGameMeta(undefined, lg);
          // Coerce app-level Period → AnyPeriod understood by registry
          const eff = effectivePeriod(meta, coerceAnyPeriod(period)); // respects preferEveningWhenBoth

          if (isDigitShape(meta.shape)) {
            // Use shared helper to derive the exact union accepted by fetchDigitRowsFor
            const lgDigit = digitLogicalFor(undefined, lg);
            if (!lgDigit) throw new Error('Unexpected non-digit logical: ' + lg);
            tasks.push((async (): Promise<TaskResult> => {
              const rows = await fetchDigitRowsFor(lgDigit, eff);
              // Library now supports k ∈ {2,3,4,5} directly — no proxying.
              const k = meta.kDigits!;
              const v = await computeDigitStatsAsync(rows, k as 2|3|4|5, signal);
              return [lg, 'digits', v] as const;
            })());
            continue;
          }

          switch (meta.shape) {
            case 'pick10':
              tasks.push((async (): Promise<TaskResult> => {
                // use the actual underlying (still falls back to NY)
                const underlyingList = LOGICAL_TO_UNDERLYING[lg]?.all ?? [];
                const underlying = (underlyingList[0] ?? 'ny_pick10') as 'ny_pick10';
                const rows = await fetchPick10RowsFor(underlying);

                // some feeds deliver 20-of-80 (keno-style); detect it like the modal does
                const inferred = inferKAndNFromKOfNRows(rows as any);

                if (inferred?.k === 10 && inferred?.N === 80) {
                  // true pick-10
                  const v = await computePick10StatsAsync(rows, signal);
                  return [lg, 'pick10', v] as const;
                }

                if (inferred?.k === 20 && inferred?.N === 80) {
                  // this is really a quickdraw/keno feed – analyze as quickdraw
                  const v = await computeQuickDrawStatsAsync(rows as any, signal);
                  return [lg, 'quickdraw', v] as const;
                }

                // fallback: try pick-10 anyway so we don't silently drop it
                const v = await computePick10StatsAsync(rows, signal);
                return [lg, 'pick10', v] as const;
              })());
              break;

            case 'quickdraw':
              tasks.push((async (): Promise<TaskResult> => {
                const rows = await fetchQuickDrawRowsFor('ny_quick_draw');
                const v = await computeQuickDrawStatsAsync(rows, signal);
                return [lg, 'quickdraw', v] as const;
              })());
              break;

            case 'cashpop':
              tasks.push((async (): Promise<TaskResult> => {
                const rows = await fetchCashPopRows('all'); // all periods for better sample
                const v: CP = { totalDraws: rows.length };
                return [lg, 'cashpop', v] as const;
              })());
              break;

              // Texas All or Nothing (12 of 24) — registry shape: 'allornothing'
            case 'allornothing':
              tasks.push((async (): Promise<TaskResult> => {
                // We fetch ALL periods to get the full sample (morning/day/evening/night)
                const rows = await fetchAllOrNothingRows('all');
                const v = await computeAllOrNothingStatsAsync(rows, signal);
                // We’ll tag this as a separate kind so the render can show the 12/24 domain.
                return [lg, 'allornothing', v] as any;
              })());
              break;

            // five/six (standard 5-ball style analysis path, including NY Lotto)
            case 'five':
            case 'six':
            default:
              tasks.push((async () => {
                // Prefer logical-windowing based on its canonical representative
                const rep = repForLogical(lg, meta);
                const rows = await fetchLogicalRows({ logical: lg, period: eff});
                const v = await analyzeGameAsync(rows, rep, signal);
                return [lg, 'five', v] as const;
              })());
              break;
          }
        }

        if (tasks.length === 0) {
          if (cancelled()) return;
          setOkCount(0);
          setBusy(false);
          setErr(null);
          return;
        }

        const settled = await Promise.allSettled(tasks);
        if (cancelled()) return;
        const next5: Record<string, A>  = {};
        const nextD: Record<string, DS> = {};
        const nextP: Record<string, P10> = {};
        const nextQ: Record<string, QD>  = {};
        const nextAON: Record<string, AON> = {};
        const nextC: Record<string, CP>  = {};
        let ok = 0;
        settled.forEach(r => {
          if (r.status === 'fulfilled') {
            const [k, kind, v] = r.value;
            if (kind === 'five')      { next5[k] = v as A;   ok++; }
            if (kind === 'digits')    { nextD[k] = v as DS;  ok++; }
            if (kind === 'pick10')    { nextP[k] = v as P10; ok++; }
            if (kind === 'quickdraw') { nextQ[k] = v as QD;  ok++; }
            if (kind === 'allornothing') { nextAON[k] = v as AON; ok++; }
            if (kind === 'cashpop')   { nextC[k] = v as CP;  ok++; }
          }
        });
        setOkCount(ok);
        setData5(prev => ({ ...prev, ...next5 }));
        setDataDigits(prev => ({ ...prev, ...nextD }));
        setDataP10(prev => ({ ...prev, ...nextP }));
        setDataQD(prev => ({ ...prev, ...nextQ }));
        setDataAON(prev => ({ ...prev, ...nextAON }));
        setDataCP(prev => ({ ...prev, ...nextC }));
        if (ok === 0) setErr('No analysis available (data fetch failed).');
      } catch (e:any) {
        if (!cancelled()) setErr(e?.message || String(e));
      } finally {
        if (!cancelled()) setBusy(false);
      }
    }, 200);

    inflightRef.current = { ac, timer };
    return () => {
      ac.abort();
      clearTimeout(timer);
    };
    // Depend on stable identifiers only; JSON.stringify keeps shallow lists stable
  }, [JSON.stringify(CANON_LIST.map(x => x.key)), JSON.stringify(LOGICAL_LIST), period, st]);

  return (
    <>
    <section className="card analyze-sidebar ticket-grid" role="note" aria-label="Analysis">
      <div className="card-title analyze-title-row">
        <span>{title ?? 'Analysis'}</span>
        <button
          type="button"
          className="btn btn-ghost analyze-sort-btn"
          onClick={() => setSortMode(mode => mode === 'alpha' ? 'odds' : 'alpha')}
        >
          {sortMode === 'alpha' ? 'Sort: Best odds' : 'Sort: A–Z'}
        </button>
      </div>
      {busy && (Object.keys(data5).length + Object.keys(dataDigits).length
                + Object.keys(dataP10).length + Object.keys(dataQD).length
                + Object.keys(dataCP).length > 0) && (
        <div className="analyze-refreshing" aria-live="polite">Refreshing…</div>
      )}
      {err && <div className="analyze-error">{err}</div>}
      {busy && <div className="analyze-loading">Refreshing analysis…</div>}
      {!busy && !err && (
        <div className="analyze-status" aria-live="polite">
          Loaded {okCount}/{CANON_LIST.length + LOGICAL_LIST.length} games.
        </div>
      )}
      <div className="analyze-games">
        {!busy && (
          <>
            {sortMode === 'alpha' && CANON_VIEW.map(g => {
              const a = data5[g.key];
              return (
                <div key={g.key} className="analyze-game">
                  <div className="analyze-game-title">
                    <span>{displayNameFor(g.key)}</span>
                    <button
                      type="button"
                      className="btn btn-ghost analyze-insights-btn"
                      onClick={() => {
                        setSelectedGameId(g.key);
                        setInsightsOpen(true);
                      }}
                    >
                      Pattern insights
                    </button>
                  </div>
                  {a ? (
                    <div className="analyze-game-details card-content-text">
                      <div className="analyze-detail">
                        <span className="analyze-label">Total draws analyzed:</span>
                        <span className="analyze-value mono">{a.draws.toLocaleString()}</span>
                      </div>
                      <div className="analyze-detail">
                        <span className="analyze-label">Jackpot odds:</span>
                        <span className="analyze-value mono">1 in {jackpotOdds(g.key).toLocaleString()}</span>
                      </div>
                      <div className="analyze-detail analyze-recommendation">
                        <span className="analyze-label">Recommended:</span>
                        <span className="analyze-value mono">
                          mains <em>{a.recMain.mode}</em> (α={a.recMain.alpha.toFixed(2)})
                          {a.eraCfg.specialMax > 0 && (
                            <>, special <em>{a.recSpec.mode}</em> (α={a.recSpec.alpha.toFixed(2)})</>
                          )}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="analyze-unavailable">Unavailable.</div>
                  )}
                </div>
              );
            })}
            {sortMode === 'alpha' && LOGICAL_VIEW.map(lg => {
              const a5  = data5[lg];
              const ad  = dataDigits[lg];
              const ap10= dataP10[lg];
              const acp = dataCP[lg];
              const aon = dataAON[lg];
              const meta = resolveGameMeta(undefined, lg);
              const rep  = repForLogical(lg, meta);
              const kDisplay = isDigitShape(meta.shape) ? digitsKFor(meta) : undefined;
              return (
                <div key={lg} className="analyze-game">
                  <div className="analyze-game-title">
                    <span>{displayNameFor(lg)}</span>
                    <button
                      type="button"
                      className="btn btn-ghost analyze-insights-btn"
                      onClick={() => {
                        setSelectedGameId(lg);
                        setInsightsOpen(true);
                      }}
                    >
                      Pattern insights
                    </button>
                  </div>
                  {a5 ? (
                    <div className="analyze-game-details card-content-text">
                      <div className="analyze-detail">
                        <span className="analyze-label">Total draws analyzed:</span>
                        <span className="analyze-value mono">{a5.draws.toLocaleString()}</span>
                      </div>
                      <div className="analyze-detail">
                        <span className="analyze-label">Jackpot odds:</span>
                        <span className="analyze-value mono">1 in {jackpotOdds(rep).toLocaleString()}</span>
                      </div>
                      <div className="analyze-detail analyze-recommendation">
                        <span className="analyze-label">Recommended:</span>
                        <span className="analyze-value mono">
                          mains <em>{a5.recMain.mode}</em> (α={a5.recMain.alpha.toFixed(2)})
                          {a5.eraCfg.specialMax > 0 && (
                            <>, special <em>{a5.recSpec.mode}</em> (α={a5.recSpec.alpha.toFixed(2)})</>
                          )}
                        </span>
                      </div>
                    </div>
                  ) : ad ? (
                    <div className="analyze-game-details card-content-text">
                      <div className="analyze-detail">
                        <span className="analyze-label">Total draws analyzed:</span>
                        <span className="analyze-value mono">{ad.totalDraws.toLocaleString()}</span>
                      </div>
                      <div className="analyze-detail">
                        <span className="analyze-label">Digit domain:</span>
                        <span className="analyze-value mono">
                          0–9 × {kDisplay ?? ad.k}
                          {kDisplay && kDisplay !== ad.k && (
                            <> (analyzed via {ad.k}-digit proxy)</>
                          )}
                        </span>
                      </div>
                      <div className="analyze-detail">
                        <span className="analyze-label">Jackpot odds:</span>
                        <span className="analyze-value mono">
                          {(() => {
                            const o = jackpotOddsForLogical(lg);
                            return o ? `1 in ${o.toLocaleString()}` : 'n/a';
                          })()}
                        </span>
                       </div>
                       <div className="analyze-detail analyze-recommendation">
                        <span className="analyze-label">Recommended:</span>
                        <span className="analyze-value mono">
                          {(() => {
                            const rec = recommendDigitsFromStats(ad);
                            return <>digits <em>{rec.mode}</em> (α={rec.alpha.toFixed(2)})</>;
                          })()}
                        </span>
                      </div>
                    </div>
                  ) : ap10 ? (
                    <div className="analyze-game-details card-content-text">
                      <div className="analyze-detail">
                        <span className="analyze-label">Total draws analyzed:</span>
                        <span className="analyze-value mono">{ap10.totalDraws.toLocaleString()}</span>
                      </div>
                      <div className="analyze-detail">
                        <span className="analyze-label">Number domain:</span>
                        <span className="analyze-value mono">1–80 · pick 10</span>
                      </div>
                      <div className="analyze-detail">
                        <span className="analyze-label">Jackpot odds:</span>
                        <span className="analyze-value mono">
                          {(() => {
                            const o = jackpotOddsForLogical(lg);
                            return o ? `1 in ${o.toLocaleString()}` : 'n/a';
                          })()}
                        </span>
                       </div>
                       <div className="analyze-detail analyze-recommendation">
                        <span className="analyze-label">Recommended:</span>
                        <span className="analyze-value mono">
                          {(() => {
                            const rec = recommendPick10FromStats(ap10);
                            return <>mains <em>{rec.mode}</em> (α={rec.alpha.toFixed(2)})</>;
                          })()}
                        </span>
                      </div>
                      {/* No “hot/cold lists” here — ticket-level tags only */}
                    </div>
                  ) : dataQD[lg] ? (
                    (() => {
                      const aqd = dataQD[lg];
                      if (!aqd) return <div className="analyze-unavailable">Unavailable.</div>;
                      const mode = sidebarModeFor(meta);
                      const isPick10Like = mode === 'pick10';
                      const rec = recommendQuickDrawFromStats(aqd);
                      return (
                        <div className="analyze-game-details card-content-text">
                          <div className="analyze-detail">
                            <span className="analyze-label">Total draws analyzed:</span>
                            <span className="analyze-value mono">{aqd.totalDraws.toLocaleString()}</span>
                          </div>
                          <div className="analyze-detail">
                            <span className="analyze-label">Number domain:</span>
                            <span className="analyze-value mono">1–80 · hits per draw: 20</span>
                          </div>
                          {/* NY Pick 10: do NOT show the spots picker */}
                          {!isPick10Like && (
                            <div className="analyze-detail">
                              <span className="analyze-label">Spots:</span>
                              <span className="analyze-value">
                                <select
                                  aria-label="Quick Draw Spots"
                                  value={qdSpots}
                                  onChange={e => setQdSpots(Number(e.target.value) as any)}
                                >
                                  {[1,2,3,4,5,6,7,8,9,10].map(s => (
                                    <option key={s} value={s}>{s} spot{s>1?'s':''}</option>
                                  ))}
                                </select>
                              </span>
                            </div>
                          )}
                          <div className="analyze-detail">
                            <span className="analyze-label">Jackpot odds:</span>
                            <span className="analyze-value mono">
                              {isPick10Like
                                ? (() => {
                                    const o = jackpotOddsForLogical(lg);
                                    return o ? `1 in ${o.toLocaleString()}` : 'n/a';
                                  })()
                                : `1 in ${jackpotOddsQuickDraw(qdSpots).toLocaleString()}`
                              }
                            </span>
                          </div>
                          <div className="analyze-detail analyze-recommendation">
                            <span className="analyze-label">Recommended:</span>
                            <span className="analyze-value mono">
                              mains <em>{rec.mode}</em> (α={rec.alpha.toFixed(2)})
                            </span>
                          </div>
                        </div>
                      );
                    })()
                    ) : lg === 'fl_cashpop' ? (
                    acp ? (
                      <div className="analyze-game-details card-content-text">
                        <div className="analyze-detail">
                          <span className="analyze-label">Total draws analyzed:</span>
                          <span className="analyze-value mono">{acp.totalDraws.toLocaleString()}</span>
                        </div>
                        <div className="analyze-detail">
                          <span className="analyze-label">Number domain:</span>
                          <span className="analyze-value mono">1–15 · pick 1</span>
                        </div>
                        <div className="analyze-detail">
                          <span className="analyze-label">Jackpot odds:</span>
                          <span className="analyze-value mono">n/a</span>
                        </div>
                        <div className="analyze-detail analyze-recommendation">
                          <span className="analyze-label">Recommended:</span>
                          <span className="analyze-value mono">—</span>
                        </div>
                      </div>
                    ) : (
                      <div className="analyze-unavailable">Unavailable.</div>
                    )
                    ) : meta.shape === 'allornothing' ? (
                    aon ? (
                      <div className="analyze-game-details card-content-text">
                        <div className="analyze-detail">
                          <span className="analyze-label">Total draws analyzed:</span>
                          <span className="analyze-value mono">
                            {aon.totalDraws.toLocaleString()}
                          </span>
                        </div>
                        <div className="analyze-detail">
                          <span className="analyze-label">Number domain:</span>
                          <span className="analyze-value mono">1–24 · pick 12</span>
                        </div>
                        <div className="analyze-detail">
                          <span className="analyze-label">Heaviest hits:</span>
                          <span className="analyze-value mono">
                            {(() => {
                              // counts is Map<number,number>; derive top 5 by freq
                              const top = Array
                                .from(aon.counts.entries())
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 5)
                                .map(([num]) => num);
                              return top.length ? top.join(', ') : 'n/a';
                            })()}
                          </span>
                        </div>
                        <div className="analyze-detail analyze-recommendation">
                          <span className="analyze-label">Recommended:</span>
                          <span className="analyze-value mono">
                            Favor highest-frequency numbers.
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="analyze-unavailable">Unavailable.</div>
                    )
                  ) : (
                    <div className="analyze-unavailable">Unavailable.</div>
                  )}
                </div>
              );
            })}
            {sortMode === 'odds' && SORTED_BY_ODDS.map(item => {
              if (item.kind === 'canonical') {
                const a = data5[item.id];
                return (
                  <div key={item.id} className="analyze-game">
                    <div className="analyze-game-title">
                      <span>{item.label}</span>
                      <button
                        type="button"
                        className="btn btn-ghost analyze-insights-btn"
                        onClick={() => {
                          setSelectedGameId(item.id);
                          setInsightsOpen(true);
                        }}
                      >
                        Pattern insights
                      </button>
                    </div>
                    {a ? (
                      <div className="analyze-game-details card-content-text">
                        <div className="analyze-detail">
                          <span className="analyze-label">Total draws analyzed:</span>
                          <span className="analyze-value mono">{a.draws.toLocaleString()}</span>
                        </div>
                        <div className="analyze-detail">
                          <span className="analyze-label">Jackpot odds:</span>
                          <span className="analyze-value mono">
                            1 in {jackpotOdds(item.id).toLocaleString()}
                          </span>
                        </div>
                        <div className="analyze-detail analyze-recommendation">
                          <span className="analyze-label">Recommended:</span>
                          <span className="analyze-value mono">
                            mains <em>{a.recMain.mode}</em> (α={a.recMain.alpha.toFixed(2)})
                            {a.eraCfg.specialMax > 0 && (
                              <>, special <em>{a.recSpec.mode}</em> (α={a.recSpec.alpha.toFixed(2)})</>
                            )}
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="analyze-unavailable">Unavailable.</div>
                    )}
                  </div>
                );
              }

              // logical branch: reuse the existing logical rendering logic
              const lg = item.id;
              const a5  = data5[lg];
              const ad  = dataDigits[lg];
              const ap10= dataP10[lg];
              const acp = dataCP[lg];
              const aon = dataAON[lg];
              const meta = resolveGameMeta(undefined, lg);
              const rep  = repForLogical(lg, meta);
              const kDisplay = isDigitShape(meta.shape) ? digitsKFor(meta) : undefined;
              return (
                <div key={lg} className="analyze-game">
                  <div className="analyze-game-title">
                    <span>{displayNameFor(lg)}</span>
                    <button
                      type="button"
                      className="btn btn-ghost analyze-insights-btn"
                      onClick={() => {
                        setSelectedGameId(lg);
                        setInsightsOpen(true);
                      }}
                    >
                      Pattern insights
                    </button>
                  </div>
                  {/* --- existing logical render branches unchanged --- */}
                  {a5 ? (
                    <div className="analyze-game-details card-content-text">
                      <div className="analyze-detail">
                        <span className="analyze-label">Total draws analyzed:</span>
                        <span className="analyze-value mono">{a5.draws.toLocaleString()}</span>
                      </div>
                      <div className="analyze-detail">
                        <span className="analyze-label">Jackpot odds:</span>
                        <span className="analyze-value mono">1 in {jackpotOdds(rep).toLocaleString()}</span>
                      </div>
                      <div className="analyze-detail analyze-recommendation">
                        <span className="analyze-label">Recommended:</span>
                        <span className="analyze-value mono">
                          mains <em>{a5.recMain.mode}</em> (α={a5.recMain.alpha.toFixed(2)})
                          {a5.eraCfg.specialMax > 0 && (
                            <>, special <em>{a5.recSpec.mode}</em> (α={a5.recSpec.alpha.toFixed(2)})</>
                          )}
                        </span>
                      </div>
                    </div>
                  ) : ad ? (
                    <div className="analyze-game-details card-content-text">
                      <div className="analyze-detail">
                        <span className="analyze-label">Total draws analyzed:</span>
                        <span className="analyze-value mono">{ad.totalDraws.toLocaleString()}</span>
                      </div>
                      <div className="analyze-detail">
                        <span className="analyze-label">Digit domain:</span>
                        <span className="analyze-value mono">
                          0–9 × {kDisplay ?? ad.k}
                          {kDisplay && kDisplay !== ad.k && (
                            <> (analyzed via {ad.k}-digit proxy)</>
                          )}
                        </span>
                      </div>
                      <div className="analyze-detail">
                        <span className="analyze-label">Jackpot odds:</span>
                        <span className="analyze-value mono">
                          {(() => {
                            const o = jackpotOddsForLogical(lg);
                            return o ? `1 in ${o.toLocaleString()}` : 'n/a';
                          })()}
                        </span>
                      </div>
                      <div className="analyze-detail analyze-recommendation">
                        <span className="analyze-label">Recommended:</span>
                        <span className="analyze-value mono">
                          {(() => {
                            const rec = recommendDigitsFromStats(ad);
                            return <>digits <em>{rec.mode}</em> (α={rec.alpha.toFixed(2)})</>;
                          })()}
                        </span>
                      </div>
                    </div>
                  ) : ap10 ? (
                    <div className="analyze-game-details card-content-text">
                      <div className="analyze-detail">
                        <span className="analyze-label">Total draws analyzed:</span>
                        <span className="analyze-value mono">{ap10.totalDraws.toLocaleString()}</span>
                      </div>
                      <div className="analyze-detail">
                        <span className="analyze-label">Number domain:</span>
                        <span className="analyze-value mono">1–80 · pick 10</span>
                      </div>
                      <div className="analyze-detail">
                        <span className="analyze-label">Jackpot odds:</span>
                        <span className="analyze-value mono">
                          {(() => {
                            const o = jackpotOddsForLogical('ny_pick10');
                            return o ? `1 in ${o.toLocaleString()}` : 'n/a';
                          })()}
                        </span>
                      </div>
                      <div className="analyze-detail analyze-recommendation">
                        <span className="analyze-label">Recommended:</span>
                        <span className="analyze-value mono">
                          {(() => {
                            const rec = recommendPick10FromStats(ap10);
                            return <>mains <em>{rec.mode}</em> (α={rec.alpha.toFixed(2)})</>;
                          })()}
                        </span>
                      </div>
                    </div>
                  ) : dataQD[lg] ? (
                    (() => {
                      const aqd = dataQD[lg];
                      if (!aqd) return <div className="analyze-unavailable">Unavailable.</div>;
                      const mode = sidebarModeFor(meta);
                      const isPick10Like = mode === 'pick10';
                      const rec = recommendQuickDrawFromStats(aqd);
                      return (
                        <div className="analyze-game-details card-content-text">
                          <div className="analyze-detail">
                            <span className="analyze-label">Total draws analyzed:</span>
                            <span className="analyze-value mono">{aqd.totalDraws.toLocaleString()}</span>
                          </div>
                          <div className="analyze-detail">
                            <span className="analyze-label">Number domain:</span>
                            <span className="analyze-value mono">1–80 · hits per draw: 20</span>
                          </div>
                          {/* NY Pick 10: do NOT show the spots picker */}
                          {!isPick10Like && (
                            <div className="analyze-detail">
                              <span className="analyze-label">Spots:</span>
                              <span className="analyze-value">
                                <select
                                  aria-label="Quick Draw Spots"
                                  value={qdSpots}
                                  onChange={e => setQdSpots(Number(e.target.value) as any)}
                                >
                                  {[1,2,3,4,5,6,7,8,9,10].map(s => (
                                    <option key={s} value={s}>{s} spot{s>1?'s':''}</option>
                                  ))}
                                </select>
                              </span>
                            </div>
                          )}
                          <div className="analyze-detail">
                            <span className="analyze-label">Jackpot odds:</span>
                            <span className="analyze-value mono">
                              {isPick10Like
                                ? (() => {
                                    const o = jackpotOddsForLogical(lg);
                                    return o ? `1 in ${o.toLocaleString()}` : 'n/a';
                                  })()
                                : `1 in ${jackpotOddsQuickDraw(qdSpots).toLocaleString()}`
                              }
                            </span>
                          </div>
                          <div className="analyze-detail analyze-recommendation">
                            <span className="analyze-label">Recommended:</span>
                            <span className="analyze-value mono">
                              mains <em>{rec.mode}</em> (α={rec.alpha.toFixed(2)})
                            </span>
                          </div>
                        </div>
                      );
                    })()
                  ) : lg === 'fl_cashpop' ? (
                    acp ? (
                      <div className="analyze-game-details card-content-text">
                        <div className="analyze-detail">
                          <span className="analyze-label">Total draws analyzed:</span>
                          <span className="analyze-value mono">{acp.totalDraws.toLocaleString()}</span>
                        </div>
                        <div className="analyze-detail">
                          <span className="analyze-label">Number domain:</span>
                          <span className="analyze-value mono">1–15 · pick 1</span>
                        </div>
                        <div className="analyze-detail">
                          <span className="analyze-label">Jackpot odds:</span>
                          <span className="analyze-value mono">n/a</span>
                        </div>
                        <div className="analyze-detail analyze-recommendation">
                          <span className="analyze-label">Recommended:</span>
                          <span className="analyze-value mono">—</span>
                        </div>
                      </div>
                    ) : (
                      <div className="analyze-unavailable">Unavailable.</div>
                    )
                  ) : meta.shape === 'allornothing' ? (
                    aon ? (
                      <div className="analyze-game-details card-content-text">
                        <div className="analyze-detail">
                          <span className="analyze-label">Total draws analyzed:</span>
                          <span className="analyze-value mono">
                            {aon.totalDraws.toLocaleString()}
                          </span>
                        </div>
                        <div className="analyze-detail">
                          <span className="analyze-label">Number domain:</span>
                          <span className="analyze-value mono">1–24 · pick 12</span>
                        </div>
                        <div className="analyze-detail">
                          <span className="analyze-label">Heaviest hits:</span>
                          <span className="analyze-value mono">
                            {(() => {
                              const top = Array
                                .from(aon.counts.entries())
                                .sort((a, b) => b[1] - a[1])
                                .slice(0, 5)
                                .map(([num]) => num);
                              return top.length ? top.join(', ') : 'n/a';
                            })()}
                          </span>
                        </div>
                        <div className="analyze-detail analyze-recommendation">
                          <span className="analyze-label">Recommended:</span>
                          <span className="analyze-value mono">
                            Favor highest-frequency numbers.
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="analyze-unavailable">Unavailable.</div>
                    )
                  ) : (
                    <div className="analyze-unavailable">Unavailable.</div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </section>

    {/* Pattern insights modal, shared for whichever game was clicked */}
    {selectedGameId && (
      <PatternInsightsModal
        open={insightsOpen}
        gameKey={selectedGameId as any}
        onClose={() => {
          setInsightsOpen(false);
          // keep the last selected id so reopen is instant if user clicks again
        }}
        period={period}
      />
    )}
    </>
  );
}

// --- Component-level Error Boundary wrapper ---
export default function AnalyzeSidebar(props: Props) {
  // Reset boundary when the big inputs change to avoid being “stuck” after a render error.
  const resetKey =
    JSON.stringify({
      state: props.state ?? DEFAULT_STATE,
      period: props.period ?? 'both',
      canonical: (props.canonical ?? ORDER).sort(),   // stable-ish keying
      logical: (props.logical ?? []).slice().sort(),
    });

  const Fallback = (
    <div className="rounded-lg border p-4 text-sm">
      <div className="font-medium mb-2">Analysis panel hit an error.</div>
      <p className="mb-2">You can retry just this sidebar without affecting the rest of the page.</p>
      <button
        className="mt-1 rounded bg-black text-white px-3 py-1"
        onClick={() => { /* handled by ErrorBoundary’s Retry */ }}
      >
        Retry
      </button>
    </div>
  );

  return (
    <ErrorBoundary key={resetKey} fallback={Fallback}>
      <AnalyzeSidebarInner {...props} />
    </ErrorBoundary>
  );
}

