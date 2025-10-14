// src/components/AnalyzeSidebar.tsx
'use client';
import './AnalyzeSidebar.css';
import { useEffect, useState } from 'react';
import {
   GameKey, LogicalGameKey,
   analyzeGame, fetchRowsWithCache, fetchLogicalRows,
   jackpotOdds, jackpotOddsQuickDraw, jackpotOddsForLogical,
   // Digits
   fetchDigitRowsFor, computeDigitStats, recommendDigitsFromStats,
   // Pick 10
   fetchPick10RowsFor, computePick10Stats, recommendPick10FromStats,
   // Quick Draw (Keno-style)
   fetchQuickDrawRowsFor, computeQuickDrawStats, recommendQuickDrawFromStats,
 } from '@lib/lotto';

// Canonical draw games only (no scratchers here)
type CanonicalDrawGame = Exclude<GameKey, 'ga_scratchers'>;

const ORDER: { key: CanonicalDrawGame; label: string }[] = [
  { key: 'multi_powerball',    label: 'Powerball' },
  { key: 'multi_megamillions', label: 'Mega Millions' },
  { key: 'multi_cash4life', label: 'Cash4Life' },
  { key: 'ga_fantasy5',  label: 'Fantasy 5' },
];

// Labels for NY logical games
const NY_LABEL: Record<LogicalGameKey, string> = {
  ny_take5: 'Take 5',
  ny_numbers: 'Numbers (Pick 3)',
  ny_win4: 'Win 4',
  ny_lotto: 'NY Lotto',
  ny_pick10: 'Pick 10',
  ny_quick_draw: 'Quick Draw',
  multi_powerball: 'Powerball',
  multi_megamillions: 'Mega Millions',
  multi_cash4life: 'Cash4Life',
};

// Representative canonical keys for era/odds when analyzing logical games
const REP_FOR_LOGICAL: Record<LogicalGameKey, CanonicalDrawGame> = {
  ny_take5: 'ny_take5' as CanonicalDrawGame,
  ny_numbers: 'multi_cash4life',
  ny_win4: 'multi_cash4life',
  ny_lotto: 'ny_lotto',              // ← use NY Lotto’s own era (6/59 + Bonus)
  ny_pick10: 'multi_cash4life',
  ny_quick_draw: 'multi_cash4life',
  multi_powerball: 'multi_powerball',
  multi_megamillions: 'multi_megamillions',
  multi_cash4life: 'multi_cash4life',
};

type A = ReturnType<typeof analyzeGame>;
type DS = ReturnType<typeof computeDigitStats>;
type P10 = ReturnType<typeof computePick10Stats>;
type QD  = ReturnType<typeof computeQuickDrawStats>;

type Props = {
  /** Canonical games to analyze on this page (defaults to ORDER’s keys). */
  canonical?: CanonicalDrawGame[];
  /** Logical (NY) games to analyze on this page (defaults to none). */
  logical?: LogicalGameKey[];
  /** Optional card title override. */
  title?: string;
  /** Period to analyze for logical games that have midday/evening variants. Defaults to 'both'. */
  period?: 'midday'|'evening'|'both';
};

export default function AnalyzeSidebar({ canonical, logical, title, period = 'both' }: Props) {
  const CANON_LIST = (canonical && canonical.length > 0)
    ? canonical.map(k => ({ key: k, label: ORDER.find(o => o.key === k)?.label ?? k }))
    : ORDER;
  const LOGICAL_LIST = (logical ?? []).slice(); // array of LogicalGameKey
  // Store by string id so canonical and logical can coexist without collisions
  const [data5, setData5] = useState<Record<string, A | null>>({});
  const [dataDigits, setDataDigits] = useState<Record<string, DS | null>>({});
  const [dataP10, setDataP10] = useState<Record<string, P10 | null>>({});
  const [dataQD,  setDataQD]  = useState<Record<string, QD  | null>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string|null>(null);
  const [okCount, setOkCount] = useState(0);
  const [qdSpots, setQdSpots] = useState<1|2|3|4|5|6|7|8|9|10>(10);

  // Alphabetical views (case-insensitive)
  const CANON_VIEW = [...CANON_LIST].sort((a, b) =>
    String(a.label).localeCompare(String(b.label), 'en', { sensitivity: 'base' })
  );
  const LOGICAL_VIEW = [...LOGICAL_LIST].sort((a, b) =>
    String(NY_LABEL[a] ?? a).localeCompare(String(NY_LABEL[b] ?? b), 'en', { sensitivity: 'base' })
  );

  // Load per-game analysis (current era only)
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        setBusy(true); setErr(null);
        type TaskResult =
          | readonly [key: string, kind: 'five',     value: A]
          | readonly [key: string, kind: 'digits',   value: DS]
          | readonly [key: string, kind: 'pick10',   value: P10]
          | readonly [key: string, kind: 'quickdraw',value: QD];
        const tasks: Promise<TaskResult>[] = [];
        // Canonical games
        for (const g of CANON_LIST) {
          tasks.push((async () => {
            const rows = await fetchRowsWithCache({ game: g.key });
            return [g.key, 'five', analyzeGame(rows, g.key)] as const;
          })());
        }
        // Logical loader (branch by game type)
        for (const lg of LOGICAL_LIST) {
          if (lg === 'ny_numbers' || lg === 'ny_win4') {
            tasks.push((async (): Promise<TaskResult> => {
              const period = 'both' as const;
              const rows = await fetchDigitRowsFor(lg, period);
              const v = computeDigitStats(rows, lg === 'ny_win4' ? 4 : 3);
              return [lg, 'digits', v] as const;
            })())
          } else if (lg === 'ny_pick10') {
            tasks.push((async (): Promise<TaskResult> => {
              const rows = await fetchPick10RowsFor('ny_pick10');
              const v = computePick10Stats(rows);
              return [lg, 'pick10', v] as const;
            })());
          } else if (lg === 'ny_quick_draw') {
            tasks.push((async (): Promise<TaskResult> => {
              const rows = await fetchQuickDrawRowsFor('ny_quick_draw');
              const v = computeQuickDrawStats(rows);
              return [lg, 'quickdraw', v] as const;
            })());
          } else {
            // ny_take5 is 5-ball (no special): use existing analyzeGame path
            tasks.push((async () => {
              const rows = await fetchLogicalRows({ logical: lg, period });
              const rep = REP_FOR_LOGICAL[lg];
              return [lg, 'five', analyzeGame(rows, rep)] as const;
            })());
          }
        }
        const settled = await Promise.allSettled(tasks);
        if (!alive) return;
        const next5: Record<string, A>  = {};
        const nextD: Record<string, DS> = {};
        const nextP: Record<string, P10> = {};
        const nextQ: Record<string, QD>  = {};
        let ok = 0;
        settled.forEach(r => {
          if (r.status === 'fulfilled') {
            const [k, kind, v] = r.value;
            if (kind === 'five')      { next5[k] = v as A;   ok++; }
            if (kind === 'digits')    { nextD[k] = v as DS;  ok++; }
            if (kind === 'pick10')    { nextP[k] = v as P10; ok++; }
            if (kind === 'quickdraw') { nextQ[k] = v as QD;  ok++; }
          }
        });
        setOkCount(ok);
        setData5(prev => ({ ...prev, ...next5 }));
        setDataDigits(prev => ({ ...prev, ...nextD }));
        setDataP10(prev => ({ ...prev, ...nextP }));
        setDataQD(prev => ({ ...prev, ...nextQ }));
        if (ok === 0) setErr('No analysis available (data fetch failed).');
      } catch (e:any) {
        if (alive) setErr(e?.message || String(e));
      } finally {
        if (alive) setBusy(false);
      }
    })();
    return () => { alive = false; };
  }, [JSON.stringify(CANON_LIST.map(x=>x.key)), JSON.stringify(LOGICAL_LIST), period]);

  return (
    <section className="card analyze-sidebar ticket-grid" role="note" aria-label="Analysis">
      <div className="card-title">
        {title ?? 'Analysis'}
      </div>
      {err && <div className="analyze-error">{err}</div>}
      {busy && <div className="analyze-loading">Analyzing current eras…</div>}
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
                  <div className="analyze-game-title">{g.label}</div>
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
              const rep = REP_FOR_LOGICAL[lg];
              return (
                <div key={lg} className="analyze-game">
                  <div className="analyze-game-title">{NY_LABEL[lg] ?? lg}</div>
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
                        <span className="analyze-value mono">0–9 × {ad.k}</span>
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

