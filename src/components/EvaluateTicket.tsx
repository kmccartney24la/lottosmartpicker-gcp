// src/components/EvaluateTicket.tsx
'use client';
import './EvaluateTicket.css';
import { useMemo, useState, useEffect } from 'react';
import Pill from 'src/components/Pill';
import Info from 'src/components/Info';
import { HINT_EXPLAIN, classifyHint } from 'src/components/hints';
import {
  GameKey,
  getCurrentEraConfig,
  ticketHints,
  computeStats,
  filterRowsForCurrentEra,
  LottoRow,
} from '@lib/lotto';

type StatsT = ReturnType<typeof computeStats>;

export default function EvaluateTicket({
  game,
  rowsForGenerator,           // pass the same rows the Generator uses
  precomputedStats,           // pass Generator's stats to avoid recompute
}: {
  game: GameKey;
  rowsForGenerator: LottoRow[];
  precomputedStats: StatsT;
}) {
  const eraCfg = useMemo(() => getCurrentEraConfig(game), [game]);
  const hasSpecial = eraCfg.specialMax > 0;

 // Build controlled inputs sized to the game’s domain (lazy init)
  const [mains, setMains] = useState<string[]>(
   () => Array.from({ length: eraCfg.mainPick }, () => '')
 );
  const [special, setSpecial] = useState<string>('');

  const [errors, setErrors] = useState<string[]>([]);
  const [resultHints, setResultHints] = useState<string[] | null>(null);

  // (Safety) Reset inputs/results whenever the domain changes
  useEffect(() => {
   setMains(Array.from({ length: eraCfg.mainPick }, () => ''));
    setSpecial('');
    setResultHints(null);
    setErrors([]);
  }, [game, eraCfg.mainPick, eraCfg.specialMax]);

  // Color class for the special input (matches ticket bubble colors)
  const specialColorClass =
    game === 'multi_powerball'    ? 'special--red'
  : game === 'multi_megamillions' ? 'special--blue'
  : game === 'multi_cash4life'    ? 'special--green'
  :                                  'special--amber';

  function updateMainAt(i: number, val: string) {
    setMains(prev => prev.map((v, idx) => (idx === i ? val : v)));
  }

  function validate(): { mains: number[]; special?: number } | null {
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
      if (!Number.isFinite(v)) errs.push('Enter a special ball number.');
      else if (v < 1 || v > eraCfg.specialMax) errs.push(`Special must be between 1 and ${eraCfg.specialMax}.`);
      else specialNum = v;
    }

    setErrors(errs);
    if (errs.length) return null;
    return { mains: mainNums, special: specialNum };
  }

  function evaluate() {
    const ok = validate();
    if (!ok) { setResultHints(null); return; }
    // Reuse existing stats from parent (fast). If you prefer to recompute for safety:
    // const rowsEra = filterRowsForCurrentEra(rowsForGenerator, game);
    // const stats = computeStats(rowsEra as any, game, eraCfg);
    const hints = ticketHints(game, ok.mains, ok.special ?? 0, precomputedStats);
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

      {/* Inputs */}
      <div className="evaluate-inputs">
{/* Single horizontal row: all mains + | + special */}
        <label className="evaluate-inline-label">
          <span>
            Your numbers ({eraCfg.mainPick} of 1–{eraCfg.mainMax}
            {hasSpecial ? ` + Special 1–${eraCfg.specialMax}` : ''})
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
                  aria-label="Special ball"
                  inputMode="numeric"
                  type="number"
                  min={1}
                  max={eraCfg.specialMax}
                  placeholder="S"
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
            {hasSpecial ? `; special 1–${eraCfg.specialMax}` : ''}.
          </div>
        </label>
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

      {/* Output */}
      {resultHints && (
        <div className="evaluate-results">
          {/* Render each number in its own inline element so bubble styles apply */}
          <div className="mono evaluate-ticket-display" aria-label="Your evaluated ticket">
            {/* mains */}
            {mains.map((m, i) => (
              <span key={`m-${i}`} className="num-bubble" aria-label={`Main ${i + 1}`}>{m || '–'}</span>
            ))}
            {/* separator + special (if present) */}
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
                  aria-label="Special"
                  data-kind={
                    game === 'multi_powerball' ? 'pb'
                    : game === 'multi_megamillions' ? 'mb'
                    : game === 'multi_cash4life' ? 'cb'
                    : 'special'
                  }
                >
                  {special || '–'}
                </span>
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
