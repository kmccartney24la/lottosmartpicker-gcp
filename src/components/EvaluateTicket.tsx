// src/components/EvaluateTicket.tsx
'use client';
import './EvaluateTicket.css';
import { useMemo, useState, useEffect } from 'react';
import Pill from 'src/components/Pill';
import Info from 'src/components/Info';
import { HINT_EXPLAIN, classifyHint } from 'src/components/hints';
import {
  GameKey,
  type LogicalGameKey,
  getCurrentEraConfig,
  ticketHints,
  computeStats,
  filterRowsForCurrentEra,
  // digits
  computeDigitStats, ticketHintsDigits,
  // pick 10
  computePick10Stats, ticketHintsPick10,
  // quick draw
  computeQuickDrawStats,
  LottoRow,
} from '@lib/lotto';

type StatsT = ReturnType<typeof computeStats>;

export default function EvaluateTicket({
  game,
  rowsForGenerator,           // pass the same rows the Generator uses
  precomputedStats,           // 5-ball stats (from Generator)
  // NEW (optional shape-aware inputs)
  logical,
  precomputedDigitStats,
  precomputedPick10Stats,
  precomputedQuickDrawStats,
  quickDrawSpots,
}: {
  game: GameKey;
  rowsForGenerator: LottoRow[];
  precomputedStats: StatsT | null;
  logical?: LogicalGameKey;
  precomputedDigitStats?: ReturnType<typeof computeDigitStats> | null;
  precomputedPick10Stats?: ReturnType<typeof computePick10Stats> | null;
  precomputedQuickDrawStats?: ReturnType<typeof computeQuickDrawStats> | null;
  quickDrawSpots?: 1|2|3|4|5|6|7|8|9|10;
}) {

  // ---- Game shape detection (LogicalGameKey only; no *_rep, no *_midday/evening) ----
  const lg = logical; // undefined means we're on a canonical 5-ball page
  const isDigits = lg === 'ny_numbers' || lg === 'ny_win4';
  const isPick10 = lg === 'ny_pick10';
  const isQuickDraw = lg === 'ny_quick_draw';
  const isFiveBall = !lg || (!isDigits && !isPick10 && !isQuickDraw);
  const isNyLotto = lg === 'ny_lotto' || game === 'ny_lotto';

  const eraCfg = useMemo(() => getCurrentEraConfig(game), [game]);
  const hasSpecial = eraCfg.specialMax > 0;

 // --------------------- FIVE-BALL INPUTS ------------------------------
  // Build controlled inputs sized to the game’s domain (lazy init)
  const [mains, setMains] = useState<string[]>(
   () => Array.from({ length: eraCfg.mainPick }, () => '')
 );
  const [special, setSpecial] = useState<string>('');

  // --------------------- DIGITS INPUTS ---------------------------------
  const kDigits = lg === 'ny_win4' ? 4 : 3;
  const [digits, setDigits] = useState<string[]>(
    () => Array.from({ length: kDigits }, () => '')
  );

  // --------------------- PICK 10 INPUTS --------------------------------
  const [p10Vals, setP10Vals] = useState<string[]>(
    () => Array.from({ length: 10 }, () => '')
  );

  // --------------------- QUICK DRAW INPUTS -----------------------------
  const qdSpotsLocal = quickDrawSpots ?? 10;
  const [qdVals, setQdVals] = useState<string[]>(
    () => Array.from({ length: qdSpotsLocal }, () => '')
  );

  const [errors, setErrors] = useState<string[]>([]);
  const [resultHints, setResultHints] = useState<string[] | null>(null);

  // (Safety) Reset inputs/results whenever the domain changes
  useEffect(() => {
   setMains(Array.from({ length: eraCfg.mainPick }, () => ''));
    setSpecial('');
    setDigits(Array.from({ length: kDigits }, () => ''));
    setP10Vals(Array.from({ length: 10 }, () => ''));
    setQdVals(Array.from({ length: qdSpotsLocal }, () => ''));
    setResultHints(null);
    setErrors([]);
  }, [game, eraCfg.mainPick, eraCfg.specialMax, kDigits, qdSpotsLocal]);
  // Color class for the special input (matches ticket bubble colors)
  const specialColorClass =
    game === 'multi_powerball'    ? 'special--red'
  : game === 'multi_megamillions' ? 'special--blue'
  : game === 'multi_cash4life'    ? 'special--green'
  :                                  'special--amber';

  function updateMainAt(i: number, val: string) {
    setMains(prev => prev.map((v, idx) => (idx === i ? val : v)));
  }

  // ---------------- FIVE-BALL VALIDATION -------------------------------
  function validateFive(): { mains: number[]; special?: number } | null {
    const errs: string[] = [];

    // Coerce & validate mains
    const mainNums = mains.map(s => parseInt(s, 10)).filter(n => Number.isFinite(n));
    if (mainNums.length !== eraCfg.mainPick) {
   errs.push(`Enter exactly ${eraCfg.mainPick} main numbers.`);
    }
    // Range + uniqueness
    const inRange = mainNums.every(n => n >= 1 && n <= eraCfg.mainMax);
    if (!inRange) errs.push(`Main numbers must be between 1 and ${eraCfg.mainMax}.`);
    const uniq = new Set(mainNums);
    if (uniq.size !== mainNums.length) errs.push('Main numbers must be unique.');

    // Special (if present)
    let specialNum: number | undefined = undefined;
    if (hasSpecial) {
      const v = parseInt(special, 10);
      if (!Number.isFinite(v)) errs.push(isNyLotto ? 'Enter a Bonus number.' : 'Enter a special ball number.');
      else if (v < 1 || v > eraCfg.specialMax) errs.push(`${isNyLotto ? 'Bonus' : 'Special'} must be between 1 and ${eraCfg.specialMax}.`);
      else specialNum = v;
      // NY Lotto: Bonus must be different from all mains
      if (isNyLotto && Number.isFinite(v)) {
        const mainNums = mains.map(s => parseInt(s, 10)).filter(n => Number.isFinite(n));
        if (mainNums.includes(v)) errs.push('Bonus must be different from all main numbers.');
      }
    }

    setErrors(errs);
    if (errs.length) return null;
    return { mains: mainNums, special: specialNum };
  }

  // ---------------- DIGITS VALIDATION ----------------------------------
  function validateDigits(): { digits: number[] } | null {
    const errs: string[] = [];
    const vals = digits.map(s => s.trim()).filter(s => s !== '');
    if (vals.length !== kDigits) errs.push(`Enter exactly ${kDigits} digits.`);
    const nums = digits.map(s => Number(s)).filter(n => Number.isInteger(n) && n >= 0 && n <= 9);
    if (nums.length !== kDigits) errs.push('Digits must be 0–9.');
    setErrors(errs);
    if (errs.length) return null;
    return { digits: digits.map(d => Math.max(0, Math.min(9, Number(d)))) };
  }

  // ---------------- PICK 10 VALIDATION ---------------------------------
  function validatePick10(): { values: number[] } | null {
    const errs: string[] = [];
    const nums = p10Vals.map(s => parseInt(s, 10)).filter(n => Number.isFinite(n));
    if (nums.length !== 10) errs.push('Enter exactly 10 numbers.');
    const inRange = nums.every(n => n >= 1 && n <= 80);
    if (!inRange) errs.push('Numbers must be between 1 and 80.');
    const uniq = new Set(nums);
    if (uniq.size !== nums.length) errs.push('Numbers must be unique.');
    setErrors(errs);
    if (errs.length) return null;
    return { values: nums };
  }

  // ---------------- QUICK DRAW VALIDATION ------------------------------
  function validateQuickDraw(): { values: number[] } | null {
    const errs: string[] = [];
    const nums = qdVals.map(s => parseInt(s, 10)).filter(n => Number.isFinite(n));
    if (nums.length !== qdSpotsLocal) errs.push(`Enter exactly ${qdSpotsLocal} numbers.`);
    const inRange = nums.every(n => n >= 1 && n <= 80);
    if (!inRange) errs.push('Numbers must be between 1 and 80.');
    const uniq = new Set(nums);
    if (uniq.size !== nums.length) errs.push('Numbers must be unique.');
    setErrors(errs);
    if (errs.length) return null;
    return { values: nums };
  }

  // ---------------- QUICK DRAW simple pattern flags --------------------
  function qdHas3Run(values: number[]): boolean {
    if (values.length < 3) return false;
    const a = [...values].sort((x,y)=>x-y);
    for (let i=2;i<a.length;i++){
      if (a[i-2]+2===a[i-1]+1 && a[i-1]+1===a[i]) return true;
    }
    return false;
  }
  function qdIsTight(values: number[], domainMax=80): boolean {
    if (!values.length) return false;
    const a = [...values].sort((x,y)=>x-y);
    const span = a[a.length-1] - a[0];
    const k = values.length;
    const limit = Math.ceil(domainMax / Math.max(8, k+2));
    return span <= limit;
  }

  // ---------------- Main evaluate() switch -----------------------------
  function evaluate() {
    setResultHints(null);

    // DIGITS
    if (!isFiveBall && isDigits) {
      const ok = validateDigits();
      if (!ok) return;
      const stats = precomputedDigitStats ?? null;
      if (!stats) { setErrors(['Stats unavailable for Digits.']); return; }
      const hints = ticketHintsDigits(ok.digits, stats);
      setResultHints(hints);
      return;
    }

    // PICK 10
    if (!isFiveBall && isPick10) {
      const ok = validatePick10();
      if (!ok) return;
      const stats = precomputedPick10Stats ?? null;
      if (!stats) { setErrors(['Stats unavailable for Pick 10.']); return; }
      const hints = ticketHintsPick10(ok.values, stats);
      setResultHints(hints);
      return;
    }

    // QUICK DRAW
    if (!isFiveBall && isQuickDraw) {
      const ok = validateQuickDraw();
      if (!ok) return;
      const stats = precomputedQuickDrawStats ?? null;
      if (!stats) { setErrors(['Stats unavailable for Quick Draw.']); return; }
      // Library doesn’t expose ticketHintsQuickDraw; supply light, consistent flags
      const flags: string[] = [];
      if (qdHas3Run(ok.values)) flags.push('3-in-a-row');
      if (qdIsTight(ok.values, 80)) flags.push('Tight span');
      // Keep a generic "Balanced" tag if neither flag tripped
      if (flags.length === 0) flags.push('Balanced');
      setResultHints(flags);
      return;
    }

    // FIVE-BALL
    const ok = validateFive();
    if (!ok) { setResultHints(null); return; }
    // Reuse existing stats from parent (fast). If you prefer to recompute for safety:
    // const rowsEra = filterRowsForCurrentEra(rowsForGenerator, game);
    // const stats = computeStats(rowsEra as any, game, eraCfg);
    const hints = ticketHints(game, ok.mains, ok.special ?? 0, precomputedStats!);
    setResultHints(hints);
  }

  return (
    <div className="card evaluate-ticket">
      {/* playslip sheet */}
      <div className="evaluate-ticket-sheet ticket ticket-grid">
      <div className="evaluate-header">
        <div className="section-title">Evaluate My Numbers</div>
        <Info tip={
`Check your own pick using the same analysis used for generated tickets.
• Validates against the game's domain & uniqueness.
• Tags mirror the generator's ticketHints.
• No prediction claims—just descriptive heuristics.`} />
      </div>

      {/* ------------------------ INPUTS ------------------------ */}
      <div className="evaluate-inputs">
{/* FIVE-BALL: Single row: mains + | + special */}
      {isFiveBall && (
        <label className="evaluate-inline-label">
          <span>
            Your numbers ({eraCfg.mainPick} of 1–{eraCfg.mainMax}
            {hasSpecial ? ` + ${isNyLotto ? 'Bonus' : 'Special'} 1–${eraCfg.specialMax}` : ''})
          </span>
          <div className="evaluate-inline-inputs">
            {Array.from({ length: eraCfg.mainPick }).map((_, i) => {
              const v = mains[i] ?? '';
              const parsed = Number.parseInt(v, 10);
              const okNum = Number.isFinite(parsed) && parsed >= 1 && parsed <= eraCfg.mainMax;
              const dup = v !== '' && mains.filter(x => x === v).length > 1;
              const invalid = !okNum || dup;
              return (
                <input
                  key={i}
                  aria-label={`Main #${i + 1}`}
                  inputMode="numeric"
                  type="number"
                  min={1}
                  max={eraCfg.mainMax}
                  placeholder={`${i + 1}`}
                  value={v}
                  onChange={e => updateMainAt(i, e.target.value)}
                  onWheel={e => (e.currentTarget as HTMLInputElement).blur()}
                  className={`evaluate-main-input ${invalid ? 'evaluate-input-invalid' : ''}`}
                />
              );
            })}
            {hasSpecial && (
              <>
                <span aria-hidden="true" className="mono evaluate-separator">|</span>
                <input
                  aria-label={isNyLotto ? 'Bonus' : 'Special ball'}
                  inputMode="numeric"
                  type="number"
                  min={1}
                  max={eraCfg.specialMax}
                  placeholder={isNyLotto ? 'B' : 'S'}
                  value={special}
                  onChange={e => setSpecial(e.target.value)}
                  onWheel={e => (e.currentTarget as HTMLInputElement).blur()}
                  className={`evaluate-special-input ${specialColorClass} ${
                    (() => {
                      const v = Number.parseInt(special, 10);
                      const bad = !(Number.isFinite(v) && v >= 1 && v <= eraCfg.specialMax);
                      return bad ? 'evaluate-input-invalid' : '';
                    })()
                  }`}
                />
              </>
            )}
          </div>
          <div className="evaluate-hint">
            Tips: each box takes <em>one</em> number; no repeats; mains 1–{eraCfg.mainMax}
            {hasSpecial ? `; ${isNyLotto ? 'bonus' : 'special'} 1–${eraCfg.specialMax}` : ''}.
          </div>
        </label>
        )}

{/* DIGITS: k boxes (0–9, with replacement) */}
      {!isFiveBall && isDigits && (
        <label className="evaluate-inline-label">
          <span>Your digits (0–9 × {kDigits})</span>
          <div className="evaluate-inline-inputs">
            {Array.from({ length: kDigits }).map((_, i) => {
              const v = digits[i] ?? '';
              const ok = v === '' ? true : (/^\d$/.test(v));
              return (
                <input
                  key={`dg-${i}`}
                  aria-label={`Digit #${i+1}`}
                  inputMode="numeric"
                  type="number"
                  min={0}
                  max={9}
                  placeholder="0–9"
                  value={v}
                  onChange={e => setDigits(prev => prev.map((x,idx)=>idx===i? e.target.value : x))}
                  onWheel={e => (e.currentTarget as HTMLInputElement).blur()}
                  className={`evaluate-main-input ${ok ? '' : 'evaluate-input-invalid'}`}
                />
              );
            })}
          </div>
          <div className="evaluate-hint">Digits can repeat; palindromes/sequences are flagged.</div>
        </label>
      )}

{/* PICK 10: 10 unique numbers 1..80 */}
      {!isFiveBall && isPick10 && (
        <label className="evaluate-inline-label">
          <span>Your numbers (10 unique, 1–80)</span>
          <div className="evaluate-inline-inputs">
            {Array.from({ length: 10 }).map((_, i) => {
              const v = p10Vals[i] ?? '';
              const parsed = Number.parseInt(v, 10);
              const okNum = Number.isFinite(parsed) && parsed >= 1 && parsed <= 80;
              const dup = v !== '' && p10Vals.filter(x => x === v).length > 1;
              const invalid = !okNum || dup;
              return (
                <input
                  key={`p10-${i}`}
                  aria-label={`Pick10 #${i+1}`}
                  inputMode="numeric"
                  type="number"
                  min={1}
                  max={80}
                  placeholder={`${i+1}`}
                  value={v}
                  onChange={e => setP10Vals(prev => prev.map((x,idx)=>idx===i? e.target.value : x))}
                  onWheel={e => (e.currentTarget as HTMLInputElement).blur()}
                  className={`evaluate-main-input ${invalid ? 'evaluate-input-invalid' : ''}`}
                />
              );
            })}
          </div>
          <div className="evaluate-hint">No repeats; common patterns like tight spans/3-runs are flagged.</div>
        </label>
      )}

{/* QUICK DRAW: spots unique numbers 1..80 */}
      {!isFiveBall && isQuickDraw && (
        <label className="evaluate-inline-label">
          <span>Your numbers ({qdSpotsLocal} unique, 1–80)</span>
          <div className="evaluate-inline-inputs">
            {Array.from({ length: qdSpotsLocal }).map((_, i) => {
              const v = qdVals[i] ?? '';
              const parsed = Number.parseInt(v, 10);
              const okNum = Number.isFinite(parsed) && parsed >= 1 && parsed <= 80;
              const dup = v !== '' && qdVals.filter(x => x === v).length > 1;
              const invalid = !okNum || dup;
              return (
                <input
                  key={`qd-${i}`}
                  aria-label={`QuickDraw #${i+1}`}
                  inputMode="numeric"
                  type="number"
                  min={1}
                  max={80}
                  placeholder={`${i+1}`}
                  value={v}
                  onChange={e => setQdVals(prev => prev.map((x,idx)=>idx===i? e.target.value : x))}
                  onWheel={e => (e.currentTarget as HTMLInputElement).blur()}
                  className={`evaluate-main-input ${invalid ? 'evaluate-input-invalid' : ''}`}
                />
              );
            })}
          </div>
          <div className="evaluate-hint">No repeats; flags tight spans and 3-in-a-row sequences.</div>
        </label>
      )}

        <button className="btn btn-primary evaluate-button" onClick={evaluate}>
          Evaluate
        </button>
      </div>

      {/* Validation errors */}
      {errors.length > 0 && (
        <ul className="evaluate-errors">
          {errors.map((e,i) => <li key={i}>{e}</li>)}
        </ul>
      )}

      {/* ------------------------ OUTPUT ------------------------ */}
      {resultHints && (
        <div className="evaluate-results">
          {/* Render ticket bubbles according to shape */}
          <div className="mono evaluate-ticket-display" aria-label="Your evaluated ticket">
            {isFiveBall && (
              <>
                {mains.map((m, i) => (
                  <span key={`m-${i}`} className="num-bubble" aria-label={`Main ${i + 1}`}>{m || '–'}</span>
                ))}
                {hasSpecial && (
                  <>
                    <span className="evaluate-separator" aria-hidden="true">|</span>
                    <span
                      className={
                        `num-bubble ${
                          game === 'multi_powerball' ? 'num-bubble--red'
                          : game === 'multi_megamillions' ? 'num-bubble--blue'
                          : game === 'multi_cash4life' ? 'num-bubble--green'
                          : 'num-bubble--amber'
                        }`
                      }
                      aria-label={isNyLotto ? 'Bonus' : 'Special'}
                    >
                      {special || '–'}
                    </span>
                  </>
                )}
              </>
            )}
            {!isFiveBall && isDigits && (
              <>
                {digits.map((d, i) => (
                  <span key={`dgx-${i}`} className="num-bubble">{d || '–'}</span>
                ))}
              </>
            )}
            {!isFiveBall && isPick10 && (
              <>
                {p10Vals.map((v, i) => (
                  <span key={`p10x-${i}`} className="num-bubble">{v || '–'}</span>
                ))}
              </>
            )}
            {!isFiveBall && isQuickDraw && (
              <>
                {qdVals.map((v, i) => (
                  <span key={`qdx-${i}`} className="num-bubble">{v || '–'}</span>
                ))}
              </>
            )}
          </div>
          <div className="evaluate-hints">
            {resultHints.map(h => (
              <Pill key={h} tone={classifyHint(h)} title={HINT_EXPLAIN[h]}>
                {h}
              </Pill>
            ))}
          </div>
        </div>
      )}
      </div>{/* /ticket sheet */}
    </div>
  );
}
