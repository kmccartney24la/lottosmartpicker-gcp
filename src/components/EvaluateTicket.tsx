// src/components/EvaluateTicket.tsx
'use client';
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
    <div className="card" style={{ marginTop: 12 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ fontWeight: 700 }}>Evaluate My Numbers</div>
        <Info tip={
`Check your own pick using the same analysis used for generated tickets.
• Validates against the game’s domain & uniqueness.
• Tags (pills) mirror the generator’s ticketHints.
• No prediction claims—just descriptive heuristics.`} />
      </div>

            {/* Inputs */}
      <div className="controls" style={{ marginTop: 8, gap: 10 }}>
        <label>
          <span>Main numbers ({eraCfg.mainPick} of 1–{eraCfg.mainMax})</span>

          {/* Grid of one input per required main number */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${eraCfg.mainPick}, minmax(58px, 1fr))`,
              gap: 25,
              alignItems: 'center',
            }}
          >
            {Array.from({ length: eraCfg.mainPick }).map((_, i) => {
              const v = mains[i] ?? '';
              // inline validity to tint border if needed
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
                  onWheel={e => (e.currentTarget as HTMLInputElement).blur()} // prevent accidental wheel changes
                  style={{
                    width: '100%',
                    textAlign: 'center',
                    ...(invalid ? { borderColor: 'var(--danger)' } : null),
                  }}
                />
              );
            })}
          </div>

          <div className="hint" style={{ marginTop: 6 }}>
            Tips: each box takes <em>one</em> number, no repeats, all between 1 and {eraCfg.mainMax}.
          </div>
        </label>

        {hasSpecial && (
          <label>
            <span>Special (1–{eraCfg.specialMax})</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span aria-hidden="true" className="mono" style={{ opacity: 0.65 }}>
                |
              </span>
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
                style={{ width: 84, textAlign: 'center' }}
              />
            </div>
            <div className="hint" style={{ marginTop: 6 }}>
              Enter exactly one special-ball number.
            </div>
          </label>
        )}

        <button className="btn btn-primary" onClick={evaluate} style={{ alignSelf: 'end' }}>
          Evaluate
        </button>
      </div>

      {/* Validation errors */}
      {errors.length > 0 && (
        <ul className="hint" style={{ color:'var(--danger)', marginTop: 8 }}>
          {errors.map((e,i) => <li key={i}>{e}</li>)}
        </ul>
      )}

      {/* Output */}
      {resultHints && (
        <div style={{ marginTop: 10 }}>
          <div className="mono">
            {hasSpecial
              ? `${mains.join('-')} | ${special}`
              : mains.join('-')}
          </div>
          <div style={{ marginTop: 6, display:'flex', flexWrap:'wrap', gap: 6 }}>
            {resultHints.map(h => (
              <Pill key={h} tone={classifyHint(h)} title={HINT_EXPLAIN[h]}>
                {h}
              </Pill>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
