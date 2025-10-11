// src/components/Generator.tsx
'use client';
import './Generator.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import Info from 'src/components/Info';
import Pill from './Pill';
import { HINT_EXPLAIN, classifyHint, displayHint } from 'src/components/hints';
import EvaluateTicket from './EvaluateTicket';
import {
  GameKey,
  LottoRow,
  computeStats,
  generateTicket,
  ticketHints,
  getCurrentEraConfig,
  filterRowsForCurrentEra,
  // Digits (Pick 3 / Win 4)
  DigitRow, fetchDigitRowsFor, computeDigitStats, recommendDigitsFromStats, ticketHintsDigits,
  // Pick 10 (10-from-80)
  Pick10Row, fetchPick10RowsFor, computePick10Stats, generatePick10Ticket, recommendPick10FromStats, ticketHintsPick10,
  // Quick Draw (Keno-style; 20-from-80 history, user selects “spots”)
  fetchQuickDrawRowsFor, computeQuickDrawStats, recommendQuickDrawFromStats, generateQuickDrawTicket,
 } from '@lib/lotto';

export default function Generator({
  game,                 // keep: canonical rep for era/theming
  logical,              // NEW: logical game for shape detection
  rowsForGenerator,
  analysisForGame,
  anLoading,
  onEnsureRecommended,
  onActiveHints
}: {
  game: GameKey;        // canonical rep (e.g., multi_cash4life)
  logical?: LogicalGameKey; // NEW (optional) — if present, use for shape
  rowsForGenerator: LottoRow[];
  analysisForGame: { recMain:{mode:'hot'|'cold';alpha:number}; recSpec:{mode:'hot'|'cold';alpha:number} } | null;
  anLoading: boolean;
  onEnsureRecommended: () => Promise<{ recMain:{mode:'hot'|'cold';alpha:number}; recSpec:{mode:'hot'|'cold';alpha:number} } | null>;
  onActiveHints?: (labels: string[]) => void;
}) {
    // Use logical (if provided) to determine the game shape; fall back to canonical
  const shapeKey = logical ?? (game as unknown as LogicalGameKey);
  
    // --- shape guards -------------------------------------------------
    const isDigits =
    shapeKey === 'ny_numbers' || shapeKey === 'ny_numbers_midday' || shapeKey === 'ny_numbers_evening' ||
    shapeKey === 'ny_win4'    || shapeKey === 'ny_win4_midday'    || shapeKey === 'ny_win4_evening';

  const isPick10   = shapeKey === 'ny_pick10' || shapeKey === 'ny_pick10_rep';
  const isQuickDraw= shapeKey === 'ny_quick_draw' || shapeKey === 'ny_quick_draw_rep';

  const isFiveBall = !isDigits && !isPick10 && !isQuickDraw;

  // Modes are inferred from sliders: alpha >= 0.5 => 'hot', else 'cold'
  const [alphaMain, setAlphaMain] = useState(0.6);
  const [alphaSpecial, setAlphaSpecial] = useState(0.6);
  const modeMain: 'hot'|'cold' = alphaMain >= 0.5 ? 'hot' : 'cold';
  const modeSpecial: 'hot'|'cold' = alphaSpecial >= 0.5 ? 'hot' : 'cold';

  const [avoidCommon, setAvoidCommon] = useState(false);
  // String state so the box can be cleared while typing; default is "4"
  const [numInput, setNumInput] = useState('4');
  const [tickets, setTickets] = useState<{ mains: number[]; special?: number }[]>([]); // special optional for Fantasy 5
  // Non–5-ball tickets
  const [ticketsDigits, setTicketsDigits] = useState<{ digits: number[] }[]>([]);
  const [ticketsP10,    setTicketsP10]    = useState<{ values: number[] }[]>([]);
  const [ticketsQD,     setTicketsQD]     = useState<{ values: number[] }[]>([]);

  // Stats caches for non–5-ball
  const [digitStats, setDigitStats] = useState<ReturnType<typeof computeDigitStats> | null>(null);
  const [p10Stats,   setP10Stats]   = useState<ReturnType<typeof computePick10Stats> | null>(null);
  const [qdStats,    setQdStats]    = useState<ReturnType<typeof computeQuickDrawStats> | null>(null);

  // Quick Draw: user-selectable “spots” (how many numbers to pick)
  const [qdSpots, setQdSpots] = useState<1|2|3|4|5|6|7|8|9|10>(10);

  const liveRef = useRef<HTMLDivElement|null>(null);
  const [showEvaluate, setShowEvaluate] = useState(false);
  // Track last applied recommendation so we don't re-apply redundantly
  const lastAppliedRef = useRef<{ game: GameKey; aMain: number; aSpec: number } | null>(null);

  // ---- Era-aware data & stats (only for five-ball) ----
const eraCfg = useMemo(
  () => (isFiveBall ? getCurrentEraConfig(game) : null),
  [game, isFiveBall]
);

const rowsEra = useMemo(
  () => (isFiveBall && rowsForGenerator ? filterRowsForCurrentEra(rowsForGenerator, game) : []),
  [rowsForGenerator, game, isFiveBall]
);

const stats = useMemo(
  () => (isFiveBall && eraCfg ? computeStats(rowsEra as any, game, eraCfg) : null),
  [rowsEra, game, eraCfg, isFiveBall]
);

// Only five-ball games can have a special ball
const hasSpecial = !!(isFiveBall && eraCfg && eraCfg.specialMax > 0);


  function applyRecommendation(rec: { recMain:{mode:'hot'|'cold';alpha:number}; recSpec:{mode:'hot'|'cold';alpha:number} }) {
    setAlphaMain(parseFloat(rec.recMain.alpha.toFixed(2)));
    setAlphaSpecial(parseFloat(rec.recSpec.alpha.toFixed(2)));
  }

  async function applyRecommendedPreset() {
  if (isFiveBall) {
    if (analysisForGame) { applyRecommendation(analysisForGame); return; }
    const rec = await onEnsureRecommended();
    if (rec) applyRecommendation(rec);
    return;
  }
  if (isDigits && digitStats) {
    const r = recommendDigitsFromStats(digitStats);
    setAlphaMain(parseFloat(r.alpha.toFixed(2)));
    return;
  }
  if (isPick10 && p10Stats) {
    const r = recommendPick10FromStats(p10Stats);
    setAlphaMain(parseFloat(r.alpha.toFixed(2)));
    return;
  }
  if (isQuickDraw && qdStats) {
    const r = recommendQuickDrawFromStats(qdStats);
    setAlphaMain(parseFloat(r.alpha.toFixed(2)));
    return;
  }
}

  // Auto-apply for five-ball from analysis; for others, we compute local recs elsewhere
useEffect(() => {
  let alive = true;

  // Load per-shape stats (digits/pick10/quick draw)
  (async () => {
    try {
      if (isDigits) {
        const rows = await fetchDigitRowsFor(
          game === 'ny_win4' ? 'ny_win4' : 'ny_numbers',
          'both'
        );
        if (!alive) return;
        setDigitStats(computeDigitStats(rows, game === 'ny_win4' ? 4 : 3));
      } else setDigitStats(null);

      if (isPick10) {
        const rows = await fetchPick10RowsFor('ny_pick10');
        if (!alive) return;
        setP10Stats(computePick10Stats(rows));
      } else setP10Stats(null);

      if (isQuickDraw) {
        const rows = await fetchQuickDrawRowsFor('ny_quick_draw');
        if (!alive) return;
        setQdStats(computeQuickDrawStats(rows));
      } else setQdStats(null);
    } catch {}
  })();

  if (!isFiveBall) { return () => { alive = false; }; }

  // five-ball: wait for rows then apply analyzed recommendation
  if (!rowsEra || rowsEra.length === 0) return () => { alive = false; };
  (async () => {
    const rec = analysisForGame ?? (await onEnsureRecommended());
    if (!alive || !rec) return;
    const aMain = Number(rec.recMain.alpha.toFixed(2));
    const aSpec = Number(rec.recSpec.alpha.toFixed(2));
    const last = lastAppliedRef.current;
    if (!last || last.game !== game || last.aMain !== aMain || last.aSpec !== aSpec) {
      setAlphaMain(aMain);
      if (hasSpecial) setAlphaSpecial(aSpec);
      lastAppliedRef.current = { game, aMain, aSpec };
    }
  })();

  return () => { alive = false; };
}, [game, isFiveBall, isDigits, isPick10, isQuickDraw, rowsEra.length, analysisForGame, onEnsureRecommended, hasSpecial]);

  // Quick Draw pattern heuristics (variable k)
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
    // Threshold scales with k (looser for larger k, tighter for small k)
    const k = values.length;
    const limit = Math.ceil(domainMax / Math.max(8, k+2));
    return span <= limit;
  }

  function generate(rows = rowsEra as any[]) {
    // Clear all buckets first
    setTickets([]); setTicketsDigits([]); setTicketsP10([]); setTicketsQD([]);

    // DIGITS (Pick 3 / Win4)
    if (isDigits) {
      if (!digitStats) return;
      const parsed = parseInt(numInput, 10);
      const target = Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 4;
      const k = (game === 'ny_win4') ? 4 : 3;
      const rec = recommendDigitsFromStats(digitStats);          // decide default mode/alpha
      const mode = alphaMain >= 0.5 ? 'hot' : 'cold';            // allow user override via slider
      const alpha = alphaMain ?? rec.alpha;
      // Build digit weights 0..9 with smoothing (same spirit as buildWeights)
      const counts = new Map<number,number>();
      for (let d=0; d<10; d++) counts.set(d, digitStats.counts[d] || 0);
      const total = digitStats.counts.reduce((a,b)=>a+b,0);
      const avg = total/10;
      const eps = Math.min(0.5, Math.max(0.05, 0.05*avg));
      const arr = Array.from({length:10},(_,i)=>(counts.get(i)||0)+eps);
      const sum = arr.reduce((a,b)=>a+b,0);
      const freq = sum>0 ? arr.map(c=>c/sum) : Array(10).fill(1/10);
      const max = Math.max(...freq);
      const invRaw = freq.map(p=>(max-p)+1e-9);
      const invSum = invRaw.reduce((a,b)=>a+b,0);
      const chosen = (mode==='hot') ? freq : invRaw.map(x=>x/invSum);
      const base = Array(10).fill(1/10);
      const w = chosen.map((p,i)=>(1-alpha)*base[i] + alpha*p);
      const wSum = w.reduce((a,b)=>a+b,0);
      const weights = w.map(x=>x/wSum);
      const out: { digits:number[] }[] = [];
      const drawOne = () => {
        // sample k digits WITH replacement
        const pick = ():number => {
          let r = Math.random(); let acc=0;
          for (let i=0;i<10;i++){ acc += weights[i]; if (acc >= r) return i; }
          return 9;
        };
        const d: number[] = [];
        for (let i=0;i<k;i++) d.push(pick());
        return { digits: d };
      };
      const seen = new Set<string>();
      let guard = 0;
      while (out.length < target && guard < target * 60) {
        const t = drawOne();
        const key = t.digits.join('');
        if (!seen.has(key)) {
          // “Common” filters for digits
          if (!avoidCommon) {
            out.push(t);
          } else {
            const hints = ticketHintsDigits(t.digits, digitStats);
            const bad = hints.includes('Sequential digits')
                     || hints.includes('Palindrome')
                     || hints.includes('Sum outlier');
            if (!bad) out.push(t);
          }
          seen.add(key);
        }
        guard++;
      }
      setTicketsDigits(out);
      if (liveRef.current) liveRef.current.textContent = `Generated ${out.length} tickets.`;
      return;
    }

    // PICK 10 (10-from-80)
    if (isPick10) {
      if (!p10Stats) return;
      const parsed = parseInt(numInput, 10);
      const target = Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 4;
      // use slider alphaMain to override recommendation strength
      const rec = recommendPick10FromStats(p10Stats);
      const mode = alphaMain >= 0.5 ? 'hot' : 'cold';
      const alpha = alphaMain ?? rec.alpha;
      const out: { values:number[] }[] = [];
      const seen = new Set<string>();
      let guard = 0;
      while (out.length < target && guard < target * 60) {
        const values = generatePick10Ticket(p10Stats, { mode, alpha });
        const key = values.join('-');
        if (!seen.has(key)) {
          if (!avoidCommon) {
            out.push({ values });
          } else {
            const hints = ticketHintsPick10(values, p10Stats);
            const bad = hints.includes('3-in-a-row')
                     || hints.includes('Tight span')
                     || hints.includes('Birthday-heavy');
            if (!bad) out.push({ values });
          }
          seen.add(key);
        }
        guard++;
      }
      setTicketsP10(out);
      if (liveRef.current) liveRef.current.textContent = `Generated ${out.length} tickets.`;
      return;
    }

    // QUICK DRAW (Keno-style; player “spots” 1..10)
    if (isQuickDraw) {
      if (!qdStats) return;
      const parsed = parseInt(numInput, 10);
      const target = Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 4;
      const rec = recommendQuickDrawFromStats(qdStats);
      const mode = alphaMain >= 0.5 ? 'hot' : 'cold';
      const alpha = alphaMain ?? rec.alpha;
      const out: { values:number[] }[] = [];
      const seen = new Set<string>();
      let guard = 0;
      while (out.length < target && guard < target * 60) {
        const values = generateQuickDrawTicket(qdStats, qdSpots, { mode, alpha });
        const key = values.join('-');
        if (!seen.has(key)) {
          if (!avoidCommon) {
            out.push({ values });
          } else {
            // Light “common” filters for variable-k Keno
            const bad = qdHas3Run(values) || qdIsTight(values, 80);
            if (!bad) out.push({ values });
          }
          seen.add(key);
        }
        guard++;
      }
      setTicketsQD(out);
      if (liveRef.current) liveRef.current.textContent = `Generated ${out.length} tickets.`;
      return;
    }

    // FIVE-BALL (PB/MM/C4L/Fantasy5/Take5 ...) original path
    if (!rows || rows.length === 0) { setTickets([]); return; }
    const parsed = parseInt(numInput, 10);
    const target = Number.isFinite(parsed) ? Math.max(1, Math.min(100, parsed)) : 4; // clamp, fallback to 4
    const out: { mains: number[]; special?: number }[] = [];
    const seen = new Set<string>();
    let guard = 0;
    while (out.length < target && guard < target * 50) {
      const t = generateTicket(rows, game, { modeMain, modeSpecial, alphaMain, alphaSpecial, avoidCommon }, eraCfg) as { mains:number[]; special?:number };
      const key = `${t.mains.join('-')}:${t.special ?? ''}`;
      if (!seen.has(key)) { seen.add(key); out.push(t); }
      guard++;
    }
    setTickets(out);
    if (onActiveHints) {
      // compute union of hint labels across generated tickets
      const all = new Set<string>();
      for (const t of out) {
        const hs = ticketHints(game, t.mains, t.special ?? 0, stats);
        hs.forEach(h => all.add(h));
      }
      onActiveHints(Array.from(all));
    }
    if (liveRef.current) liveRef.current.textContent = `Generated ${out.length} tickets.`;
  }

  async function copyTicketsToClipboard() {
  let lines = '';
  if (isFiveBall) {
    lines = tickets.map(t => hasSpecial
      ? `${t.mains.join('-')} | ${t.special}`
      : `${t.mains.join('-')}`
    ).join('\n');
  } else if (isDigits) {
    lines = ticketsDigits.map(t => t.digits.join('')).join('\n'); // common format for digits
  } else if (isPick10) {
    lines = ticketsP10.map(t => t.values.join('-')).join('\n');
  } else if (isQuickDraw) {
    lines = ticketsQD.map(t => t.values.join('-')).join('\n');
  }
  try { await navigator.clipboard.writeText(lines); } catch {}
}

  return (
    <section className="card generator-card">
      {/* Header */}
      <div className="card-title">Generator</div>
      {/* Recommended */}
      <div className="controls">
        <button
          className="btn btn-primary"
          onClick={applyRecommendedPreset}
          aria-label="Apply Recommended preset from analysis (auto-analyze if needed)"
          disabled={anLoading}
          title={
            anLoading ? 'Analyzing…' : (
              analysisForGame
                ? `Recommended from analysis: mains ${analysisForGame.recMain.mode} (α=${analysisForGame.recMain.alpha.toFixed(2)}), special ${analysisForGame.recSpec.mode} (α=${analysisForGame.recSpec.alpha.toFixed(2)})`
                : 'Click to analyze and apply the recommended weights'
            )
          }
        >
          Recommended
        </button>
        <Info
          tip={
            'Recommended uses recent draw history to set weights automatically:\n' +
            '• Checks how uneven the numbers have been.\n' +
            '• Chooses “hot” (more frequent) or “cold” (less frequent) for mains and special.\n' +
            '• Sets α = how strongly to lean (0 = even, 1 = strong bias), with per-game limits.\n' +
            '• Adds light smoothing so small samples don’t overreact.\n' +
            'Note: This only biases random picks. It does not predict results.'
          }
        />
      </div>

      {/* Main numbers weighting */}
      <div className="generator-section">
        <div className="controls items-start">
          <div className="font-semibold">Main numbers weighting</div>
          <Info
            tip={
              'Main numbers weighting:\n' +
              '• hot = favor numbers that have hit more often\n' +
              '• cold = favor numbers that have hit less often\n' +
              '• α controls strength (0 = even, 1 = max bias)\n' +
              '• Light smoothing keeps small samples from being too spiky.'
            }
          />
        </div>
        <input
          aria-label="Main alpha"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={alphaMain}
          onChange={(e)=>setAlphaMain(parseFloat(e.target.value))}
          className="generator-range"
        />
        <div className="hint" aria-live="polite">alpha = {alphaMain.toFixed(2)} ({modeMain})</div>
      </div>

      {/* Special ball weighting (only for games that have a special) */}
      {hasSpecial && (
        <div className="generator-section generator-section--special">
          <div className="controls items-start">
            <div className="font-semibold">Special ball weighting</div>
            <Info
              tip={
                'Special ball weighting:\n' +
                '• hot = favor specials that have hit more often\n' +
                '• cold = favor specials that have hit less often\n' +
                '• α controls strength (0 = even, 1 = max bias)\n' +
                '• Very small ranges (e.g., 1–4) use conservative limits.'
              }
            />
          </div>
          <input
            aria-label="Special alpha"
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={alphaSpecial}
            onChange={(e)=>setAlphaSpecial(parseFloat(e.target.value))}
            className="generator-range"
          />
          <div className="hint" aria-live="polite">alpha = {alphaSpecial.toFixed(2)} ({modeSpecial})</div>
        </div>
      )}

      {/* Options */}
      <div className="generator-options">
        <div className="generator-checkbox-row">
          <label className="generator-checkbox-label" htmlFor="avoid-common">
            <input
              id="avoid-common"
              type="checkbox"
              checked={avoidCommon}
              onChange={(e)=>setAvoidCommon(e.target.checked)}
              className="generator-checkbox-input"
            />
            <span>Avoid common patterns</span>
          </label>
          {/* Keep the tooltip OUTSIDE the label to prevent toggling on tap/click */}
          <span
            className="generator-info-inline"
            onMouseDown={(e)=>e.preventDefault()}
            onClick={(e)=>e.stopPropagation()}
          >
          <Info
            tip={
              'Avoid common patterns:\n' +
              'Filters out tickets lots of people pick, like:\n' +
              '• 3+ consecutive numbers\n' +
              '• 4 or more numbers ≤ 31 (birthdays)\n' +
              '• Straight arithmetic sequences\n' +
              '• Very tight clusters\n' +
              'Goal: reduce shared picks—not to change odds.'
            }
          />
        </span>
      </div>
      </div>

      {/* Actions with Tickets input */}
      <div className="generator-actions">
        <div className="generator-tickets-control">
          <span>Tickets:</span>
          <input
            aria-label="Number of tickets"
            type="number"
            min={1}
            max={100}
            value={numInput}
            onChange={(e)=>setNumInput(e.target.value)}
            className="generator-number-input"
          />
        </div>
        {isQuickDraw && (
      <div className="generator-tickets-control">
        <span>Spots:</span>
        <select
          aria-label="Quick Draw spots"
          value={qdSpots}
          onChange={(e)=>setQdSpots(parseInt(e.target.value,10) as any)}
          className="generator-number-input"
        >
          {[1,2,3,4,5,6,7,8,9,10].map(s=>(
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>
    )}
        <button
          onClick={()=>generate()}
          className="btn btn-primary"
        >
          Generate
        </button>
        <button
          onClick={copyTicketsToClipboard}
          className="btn btn-ghost"
          disabled={tickets.length === 0}
          aria-label="Copy tickets to clipboard"
        >
          Copy tickets
        </button>
        <button
          className="btn btn-ghost"
          aria-pressed={showEvaluate}
          aria-controls="evaluate-panel"
          onClick={() => setShowEvaluate(v => !v)}
          title={showEvaluate ? 'Hide Evaluate My Numbers' : 'Show Evaluate My Numbers'}
        >
          Evaluate
        </button>
      </div>
      
{/* Evaluate My Numbers (togglable) */}
{showEvaluate && (
  <div id="evaluate-panel" className="generator-evaluate">
    <EvaluateTicket
      game={game}
      rowsForGenerator={rowsForGenerator}
      precomputedStats={stats}
    />
  </div>
)}

{/* Results */}
<div aria-live="polite" ref={liveRef} className="visually-hidden" />
<div className="generator-results">
        {/* FIVE-BALL */}
  {isFiveBall && tickets.map((t, i) => {
    const hints = ticketHints(game, t.mains, t.special ?? 0, stats);
    return (
      <div key={`fb-${i}`} className="card">
        <div className="mono num-bubbles" aria-label={`Ticket ${i+1}`}>
          {t.mains.map((n, idx) => (
            <span key={`m-${idx}`} className="num-bubble" aria-label={`Main ${idx+1}`}>{n}</span>
          ))}
          {hasSpecial && (
            <>
              <span className="evaluate-separator" aria-hidden="true">|</span>
              <span
                className={`num-bubble ${
                  game === 'multi_powerball' ? 'num-bubble--red'
                  : game === 'multi_megamillions' ? 'num-bubble--blue'
                  : game === 'multi_cash4life' ? 'num-bubble--green'
                  : 'num-bubble--amber'
                }`}
                aria-label="Special"
              >
                {t.special}
              </span>
            </>
          )}
        </div>
        <div className="chips">
          {hints.map(h => (
            <Pill key={h} tone={classifyHint(h)} title={HINT_EXPLAIN[h]}>
              {displayHint(h)}
            </Pill>
          ))}
        </div>
      </div>
    );
  })}

  {/* DIGITS */}
  {isDigits && ticketsDigits.map((t, i) => (
    <div key={`dg-${i}`} className="card">
      <div className="mono num-bubbles" aria-label={`Ticket ${i+1}`}>
        {t.digits.map((d, idx) => (
          <span key={`d-${idx}`} className="num-bubble">{d}</span>
        ))}
      </div>
    </div>
  ))}

  {/* PICK 10 */}
  {isPick10 && ticketsP10.map((t, i) => (
    <div key={`p10-${i}`} className="card">
      <div className="mono num-bubbles" aria-label={`Ticket ${i+1}`}>
        {t.values.map((n, idx) => (
          <span key={`p-${idx}`} className="num-bubble">{n}</span>
        ))}
      </div>
    </div>
  ))}

  {/* QUICK DRAW */}
  {isQuickDraw && ticketsQD.map((t, i) => (
    <div key={`qd-${i}`} className="card">
      <div className="mono num-bubbles" aria-label={`Ticket ${i+1}`}>
        {t.values.map((n, idx) => (
          <span key={`q-${idx}`} className="num-bubble">{n}</span>
        ))}
      </div>
    </div>
  ))}

  {/* Empty */}
  {isFiveBall && tickets.length===0 && <div className="hint">No tickets yet.</div>}
  {isDigits   && ticketsDigits.length===0 && <div className="hint">No tickets yet.</div>}
  {isPick10   && ticketsP10.length===0 && <div className="hint">No tickets yet.</div>}
  {isQuickDraw&& ticketsQD.length===0 && <div className="hint">No tickets yet.</div>}
      </div>
    </section>
  );
}
