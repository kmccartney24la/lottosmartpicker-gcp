// src/components/EvaluateTicket.tsx
'use client';
import './EvaluateTicket.css';
import { useMemo, useState, useEffect, useRef } from 'react';
import Pill from 'src/components/Pill';
import Info from 'src/components/Info';
import { HINT_EXPLAIN, classifyHint, displayHint } from 'src/components/hints';
import {
  GameKey,
  type LogicalGameKey,
  getCurrentEraConfig,
  ticketHints,
  ticketHintsPick10,
  LottoRow,
  // worker-offloaded fallback when precomputedStats is absent
  computeStatsAsync,
} from 'packages/lib/lotto';
// type-only imports to keep bundle clean but fix TS types
import type {
  computeStats,
  computeDigitStats,
  computePick10Stats,
  computeQuickDrawStats,
} from 'packages/lib/lotto';
import {
  resolveGameMeta,
  isDigitShape,
  specialToneClass,
  filterHintsForGame,
  bonusMustDifferFromMains,
  eraConfigFor,
  playTypeLabelsForDigits,
  qdHas3Run,
  qdIsTight,
  hasColoredSpecial,
} from 'packages/lib/gameRegistry';

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

  // ---- Registry-driven shape detection ----
  const meta = useMemo(() => resolveGameMeta(game, logical), [game, logical]);
  const isDigits   = isDigitShape(meta.shape);
  const isPick10   = meta.shape === 'pick10';
  const isQuickDraw= meta.shape === 'quickdraw';
  const isFiveBall = meta.shape === 'five' || meta.shape === 'six';
  const isNyLotto  = !!meta.isNyLotto;

  // Apply registry tweaks (e.g., FL LOTTO/JTP -> specialMax: 0) once here.
  const eraCfg = useMemo(() => {
    const base = getCurrentEraConfig(game);
    return eraConfigFor(meta, base);
  }, [game, meta]);
  // Respect registry flags exactly like the Generator (PB/MM/C4L : special; FL LOTTO/JTP : no special)
  const hasSpecial = hasColoredSpecial(meta);

 // --------------------- FIVE-BALL INPUTS ------------------------------
  // Build controlled inputs sized to the game’s domain (lazy init)
  const [mains, setMains] = useState<string[]>(
   () => Array.from({ length: eraCfg.mainPick }, () => '')
 );
  const [special, setSpecial] = useState<string>('');

  // --------------------- DIGITS INPUTS ---------------------------------
  const kDigits = (meta.kDigits ?? 3) as 2|3|4|5;
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
  // allow canceling a pending worker compute if user re-clicks or shape changes
  const evalInflightRef = useRef<AbortController | null>(null);

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
  // Color class for the special input (matches ticket bubble colors).
  // Provide an explicit NY Lotto bonus style to mirror chips/bubbles elsewhere.
  const specialInputClass =
    isNyLotto ? 'special--nylotto-bonus' :
    (meta.specialTone === 'red'   ? 'special--red'
    : meta.specialTone === 'blue'  ? 'special--blue'
    : meta.specialTone === 'green' ? 'special--green'
    : 'special--amber');

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
      // Registry-driven rule: some games require bonus ≠ mains (NY Lotto)
      if (bonusMustDifferFromMains(meta) && Number.isFinite(v)) {
        const mainNums2 = mains.map(s => parseInt(s, 10)).filter(n => Number.isFinite(n));
        if (mainNums2.includes(v)) errs.push('Bonus must be different from all main numbers.');
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

  // ---------------- Main evaluate() switch -----------------------------
  async function evaluate() {
    setResultHints(null);
    // cancel any previous evaluation
    if (evalInflightRef.current) { try { evalInflightRef.current.abort(); } catch {} }
    const ac = new AbortController();
    evalInflightRef.current = ac;

    // DIGITS
    if (!isFiveBall && isDigits) {
      const ok = validateDigits();
      if (!ok) return;
      // Play-type labels from the registry (Straight/Box/variants as applicable)
      const labels = playTypeLabelsForDigits(ok.digits, meta)
        .filter(l => !!HINT_EXPLAIN[l]); // only keep labels we explain
      setResultHints(labels);
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
      if (qdIsTight(ok.values, 80))  flags.push('Tight span');
      // Keep a generic "Balanced" tag if neither flag tripped
      if (flags.length === 0) flags.push('Balanced');
      setResultHints(flags);
      return;
    }

    // FIVE-BALL
    const ok = validateFive();
    if (!ok) { setResultHints(null); return; }
    // Prefer precomputed from Generator; otherwise compute via worker (era-aware override).
    const stats =
      precomputedStats ??
      (await computeStatsAsync(rowsForGenerator, game, {
        mainMax: eraCfg.mainMax,
        specialMax: eraCfg.specialMax,
        mainPick: eraCfg.mainPick,
      }, ac.signal).catch((e: any) => {
        setErrors([e?.message || 'Failed to compute stats.']); return null;
      }));
    if (!stats) return;
    const hintsRaw = ticketHints(game, ok.mains, ok.special ?? 0, stats);
    const hints = filterHintsForGame(meta, hintsRaw);
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
                  className={`evaluate-special-input ${specialInputClass} ${
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
          <div className="evaluate-hint">Digits can repeat. We’ll tag the applicable play type(s) for your digits.</div>
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
                      className={`num-bubble ${specialToneClass(meta)}`}
                      aria-label={isNyLotto ? 'Bonus' : 'Special'}>
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
                {displayHint(h)}
              </Pill>
            ))}
          </div>
        </div>
      )}
      </div>{/* /ticket sheet */}
    </div>
  );
}
