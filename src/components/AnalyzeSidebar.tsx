// src/components/AnalyzeSidebar.tsx
'use client';
import './AnalyzeSidebar.css';
import { useEffect, useRef, useState } from 'react';
import { ErrorBoundary } from 'src/components/ErrorBoundary';
import {
   GameKey, LogicalGameKey,
   fetchRowsWithCache, fetchLogicalRows,
   defaultSinceFor,
   jackpotOdds, jackpotOddsQuickDraw, jackpotOddsForLogical,
   // Digits
   fetchDigitRowsFor, computeDigitStatsAsync, recommendDigitsFromStats,
   // Pick 10
   fetchPick10RowsFor, computePick10StatsAsync, recommendPick10FromStats,
   // Quick Draw (Keno-style)
   fetchQuickDrawRowsFor, computeQuickDrawStatsAsync, recommendQuickDrawFromStats,
   // Cash Pop
   fetchCashPopRows,
   // Worker-offloaded analysis
   analyzeGameAsync,
 } from 'packages/lib/lotto';
import type { StateKey } from 'packages/lib/state';
import { DEFAULT_STATE } from 'packages/lib/state';
import {
  resolveGameMeta,
  isDigitShape,
  effectivePeriod,
  coerceAnyPeriod,
  digitLogicalFor,
  repForLogical,
  displayNameFor,
  digitsKFor,
} from 'packages/lib/gameRegistry';


// Canonical draw games only (no scratchers here)
type CanonicalDrawGame = Exclude<GameKey, 'ga_scratchers'>;

// Canonical keys to consider (labels will come from registry.displayNameFor)
const ORDER: CanonicalDrawGame[] = [
  'multi_powerball',
  'multi_megamillions',
  'multi_cash4life',
  'ga_fantasy5',
  // California classics
  'ca_superlotto_plus',
  'ca_fantasy5',
  'fl_lotto',
  'fl_jackpot_triple_play',
];

// Which logical games are allowed per state page
const LOGICAL_ALLOWED: Record<StateKey, LogicalGameKey[]> = {
  ga: [
    // GA page currently only shows multi-state logicals (add GA-specific later if needed)
    'multi_powerball',
    'multi_megamillions',
    'multi_cash4life',
  ],
  ca: [
    // California logicals: Daily 3/4 (digits) + multi-state
    'ca_daily3',
    'ca_daily4',
    'multi_powerball',
    'multi_megamillions',
  ],
  ny: [
    'ny_take5',
    'ny_numbers',
    'ny_win4',
    'ny_lotto',
    'ny_pick10',
    'ny_quick_draw',
    'multi_powerball',
    'multi_megamillions',
    'multi_cash4life',
  ],
  fl: [
    'fl_fantasy5',
    'fl_pick5',
    'fl_pick4',
    'fl_pick3',
    'fl_pick2',
    'fl_cashpop',
    'multi_powerball',
    'multi_megamillions',
    'multi_cash4life', 
  ],
};

// Which canonical games are allowed per state page
const CANON_ALLOWED: Record<StateKey, CanonicalDrawGame[]> = {
  ga: ['ga_fantasy5', 'multi_powerball', 'multi_megamillions', 'multi_cash4life'],
  ca: [
    'ca_superlotto_plus',
    'ca_fantasy5',
    'multi_powerball',
    'multi_megamillions',
  ],
  ny: ['multi_powerball', 'multi_megamillions', 'multi_cash4life'], // no GA Fantasy 5 on NY
  fl: [
    'fl_lotto',
    'fl_jackpot_triple_play',
    'multi_powerball',
    'multi_megamillions',
    'multi_cash4life',
  ],
};

type A = ReturnType<typeof import('packages/lib/lotto').analyzeGame>;
// Use typeof import to avoid pulling sync fns as runtime values
type DS  = ReturnType<typeof import('packages/lib/lotto').computeDigitStats>;
type P10 = ReturnType<typeof import('packages/lib/lotto').computePick10Stats>;
type QD  = ReturnType<typeof import('packages/lib/lotto').computeQuickDrawStats>;
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

  const CANON_BASE: CanonicalDrawGame[] =
    (canonical && canonical.length > 0) ? canonical : ORDER;

  const CANON_LIST = CANON_BASE
    .filter(k => CANON_ALLOWED[st].includes(k))
    .map(key => ({ key, label: displayNameFor(key) }));
  // Filter logical by state
  const LOGICAL_LIST = (logical ?? []).filter(lg => LOGICAL_ALLOWED[st].includes(lg)).slice();
  // Store by string id so canonical and logical can coexist without collisions
  const [data5, setData5] = useState<Record<string, A | null>>({});
  const [dataDigits, setDataDigits] = useState<Record<string, DS | null>>({});
  const [dataP10, setDataP10] = useState<Record<string, P10 | null>>({});
  const [dataQD,  setDataQD]  = useState<Record<string, QD  | null>>({});
  const [dataCP,  setDataCP]  = useState<Record<string, CP  | null>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string|null>(null);
  const [okCount, setOkCount] = useState(0);
  const [qdSpots, setQdSpots] = useState<1|2|3|4|5|6|7|8|9|10>(10);
  // Track a single in-flight analyze chain to abort on prop changes
  const inflightRef = useRef<{ ac: AbortController | null; timer: any } | null>(null);

  // Alphabetical views (case-insensitive)
  const CANON_VIEW = [...CANON_LIST].sort((a, b) =>
    String(a.label).localeCompare(String(b.label), 'en', { sensitivity: 'base' })
  );
  const LOGICAL_VIEW = [...LOGICAL_LIST].sort((a, b) =>
    String(displayNameFor(a)).localeCompare(String(displayNameFor(b)), 'en', { sensitivity: 'base' })
  );

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
          | readonly [key: string, kind: 'cashpop',  value: CP];
        const tasks: Promise<TaskResult>[] = [];
        // Canonical games
        for (const g of CANON_LIST) {
          tasks.push((async () => {
            // Window canonical data using library helper
            const since = defaultSinceFor(g.key) ?? undefined;
            const rows = await fetchRowsWithCache({ game: g.key, since })
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
              const k = meta.kDigits!; // guaranteed by registry for digit shapes
              if (k === 3 || k === 4) {
                const v = await computeDigitStatsAsync(rows, k, signal);
                return [lg, 'digits', v] as const;
              }
              // proxy path for k=2|5
              const proxyK: 3|4 = (k === 2 ? 3 : 4);
              const proxyRows = rows.map(r => ({
                date: r.date,
                digits: (k === 2)
                  ? [r.digits[0] ?? 0, r.digits[1] ?? 0, r.digits[1] ?? 0]
                  : r.digits.slice(0, 4),
              }));
              const v = await computeDigitStatsAsync(proxyRows as any, proxyK, signal);
              return [lg, 'digits', v] as const;
            })());
            continue;
          }

          switch (meta.shape) {
            case 'pick10':
              tasks.push((async (): Promise<TaskResult> => {
                const rows = await fetchPick10RowsFor('ny_pick10');
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

            // five/six (standard 5-ball style analysis path, including NY Lotto)
            case 'five':
            case 'six':
            default:
              tasks.push((async () => {
                // Prefer logical-windowing based on its canonical representative
                const rep = repForLogical(lg, meta);
                const since = defaultSinceFor(rep) ?? undefined;
                const rows = await fetchLogicalRows({ logical: lg, period: eff, since });
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
        const nextC: Record<string, CP>  = {};
        let ok = 0;
        settled.forEach(r => {
          if (r.status === 'fulfilled') {
            const [k, kind, v] = r.value;
            if (kind === 'five')      { next5[k] = v as A;   ok++; }
            if (kind === 'digits')    { nextD[k] = v as DS;  ok++; }
            if (kind === 'pick10')    { nextP[k] = v as P10; ok++; }
            if (kind === 'quickdraw') { nextQ[k] = v as QD;  ok++; }
            if (kind === 'cashpop')   { nextC[k] = v as CP;  ok++; }
          }
        });
        setOkCount(ok);
        setData5(prev => ({ ...prev, ...next5 }));
        setDataDigits(prev => ({ ...prev, ...nextD }));
        setDataP10(prev => ({ ...prev, ...nextP }));
        setDataQD(prev => ({ ...prev, ...nextQ }));
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
    <section className="card analyze-sidebar ticket-grid" role="note" aria-label="Analysis">
      <div className="card-title">
        {title ?? 'Analysis'}
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
            {CANON_VIEW.map(g => {
              const a = data5[g.key];
              return (
                <div key={g.key} className="analyze-game">
                  <div className="analyze-game-title">{displayNameFor(g.key)}</div>
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
            {LOGICAL_VIEW.map(lg => {
              const a5  = data5[lg];
              const ad  = dataDigits[lg];
              const ap10= dataP10[lg];
              const acp = dataCP[lg];
              const meta = resolveGameMeta(undefined, lg);
              const rep  = repForLogical(lg, meta);
              const kDisplay = isDigitShape(meta.shape) ? digitsKFor(meta) : undefined;
              return (
                <div key={lg} className="analyze-game">
                  <div className="analyze-game-title">{displayNameFor(lg)}</div>
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
                      {/* No “hot/cold lists” here — ticket-level tags only */}
                    </div>
                  ) : lg === 'ny_quick_draw' ? (
                    (() => {
                      const aqd = dataQD[lg];
                      if (!aqd) return <div className="analyze-unavailable">Unavailable.</div>;
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
                          <div className="analyze-detail">
                            <span className="analyze-label">Jackpot odds:</span>
                            <span className="analyze-value mono">
                              1 in {jackpotOddsQuickDraw(qdSpots).toLocaleString()}
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

