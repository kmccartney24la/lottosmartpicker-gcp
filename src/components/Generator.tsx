// src/components/Generator.tsx
'use client';
import { useMemo, useRef, useState } from 'react';
import Info from 'src/components/Info';
import Pill from './Pill';
import { HINT_EXPLAIN, classifyHint } from './hints';
import EvaluateTicket from './EvaluateTicket';
import {
  GameKey,
  LottoRow,
  computeStats,
  generateTicket,
  ticketHints,
  getCurrentEraConfig,
  filterRowsForCurrentEra,
} from '@lib/lotto';

export default function Generator({
  game, rowsForGenerator, analysisForGame, anLoading, onEnsureRecommended
}: {
  game: GameKey;
  rowsForGenerator: LottoRow[];
  analysisForGame: { recMain:{mode:'hot'|'cold';alpha:number}; recSpec:{mode:'hot'|'cold';alpha:number} } | null;
  anLoading: boolean;
  onEnsureRecommended: () => Promise<{ recMain:{mode:'hot'|'cold';alpha:number}; recSpec:{mode:'hot'|'cold';alpha:number} } | null>;
}) {
  // Modes are inferred from sliders: alpha >= 0.5 => 'hot', else 'cold'
  const [alphaMain, setAlphaMain] = useState(0.6);
  const [alphaSpecial, setAlphaSpecial] = useState(0.6);
  const modeMain: 'hot'|'cold' = alphaMain >= 0.5 ? 'hot' : 'cold';
  const modeSpecial: 'hot'|'cold' = alphaSpecial >= 0.5 ? 'hot' : 'cold';

  const [avoidCommon, setAvoidCommon] = useState(true);
  const [num, setNum] = useState(10);
  const [tickets, setTickets] = useState<{ mains: number[]; special?: number }[]>([]); // special optional for Fantasy 5
  const liveRef = useRef<HTMLDivElement|null>(null);
  const [showEvaluate, setShowEvaluate] = useState(false);

  // ---- Era-aware data & stats (always current era) ----
  const eraCfg = useMemo(() => getCurrentEraConfig(game), [game]);
  const rowsEra = useMemo(() => filterRowsForCurrentEra(rowsForGenerator, game), [rowsForGenerator, game]);
  const stats = useMemo(
    () => computeStats(rowsEra as any, game, eraCfg),
    [rowsEra, game, eraCfg]
  );

  function applyRecommendation(rec: { recMain:{mode:'hot'|'cold';alpha:number}; recSpec:{mode:'hot'|'cold';alpha:number} }) {
    setAlphaMain(parseFloat(rec.recMain.alpha.toFixed(2)));
    setAlphaSpecial(parseFloat(rec.recSpec.alpha.toFixed(2)));
  }

  async function applyRecommendedPreset() {
    if (analysisForGame) { applyRecommendation(analysisForGame); return; }
    const rec = await onEnsureRecommended();
    if (rec) applyRecommendation(rec);
  }

  function generate(rows = rowsEra as any[]) {
    if (!rows || rows.length === 0) { setTickets([]); return; }
    const out: { mains: number[]; special?: number }[] = [];
    const seen = new Set<string>();
    let guard = 0;
    while (out.length < num && guard < num * 50) {
      const t = generateTicket(rows, game, { modeMain, modeSpecial, alphaMain, alphaSpecial, avoidCommon }, eraCfg) as { mains:number[]; special?:number };
      const key = `${t.mains.join('-')}:${t.special ?? ''}`;
      if (!seen.has(key)) { seen.add(key); out.push(t); }
      guard++;
    }
    setTickets(out);
    if (liveRef.current) liveRef.current.textContent = `Generated ${out.length} tickets.`;
  }

  async function copyTicketsToClipboard() {
    const lines = tickets.map(t => eraCfg.specialMax > 0
      ? `${t.mains.join('-')} | ${t.special}`
      : `${t.mains.join('-')}`
    ).join('\n');
    try { await navigator.clipboard.writeText(lines); } catch {}
  }

  const hasSpecial = eraCfg.specialMax > 0;

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
            'Recommended uses past drawing stats with gentle safeguards:\n' +
            '• Measures dispersion (CV) of hit counts for mains & special.\n' +
            '• Converts CV → hot/cold + α, then applies small per-game α clamps.\n' +
            '• Adds light smoothing to avoid overfitting when samples are small.\n' +
            '• “Hot” leans toward frequent hitters; “Cold” toward underrepresented.\n' +
            'This biases random sampling; it does not predict outcomes.'
          }
        />
      </div>

      {/* Main numbers weighting */}
      <div className="generator-section">
        <div className="controls items-start">
          <div className="font-semibold">Main numbers weighting</div>
          <Info
            tip={
              'Main weighting:\n' +
              '• hot: probability ∝ historical frequency\n' +
              '• cold: probability ∝ inverse frequency (rarer → higher weight)\n' +
              '• α blends uniform with history (0=uniform, 1=hot/cold)\n' +
              '• A tiny smoothing prior reduces spiky behavior on low samples.'
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
        <div className="generator-section">
          <div className="controls items-start">
            <div className="font-semibold">Special ball weighting</div>
            <Info
              tip={
                'Special ball weighting mirrors mains:\n' +
                '• hot: weight by frequency; cold: weight by inverse frequency.\n' +
                '• α blends uniform with history (0 = uniform, 1 = pure hot/cold).\n' +
                '• Very small domains (like 1–4) use conservative α clamps.'
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
        <label className="generator-checkbox-label">
          <input
            type="checkbox"
            checked={avoidCommon}
            onChange={(e)=>setAvoidCommon(e.target.checked)}
            className="generator-checkbox-input"
          />
          <span>Avoid common patterns</span>
          <Info
            tip={
              'Heuristic filter:\n' +
              '• Consecutive triplets\n' +
              '• 4+ numbers ≤ 31 (date bias)\n' +
              '• Arithmetic sequences\n' +
              '• Tight clusters (small spread)\n' +
              'This reduces "too common" combos players tend to pick.'
            }
          />
        </label>
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
            value={num}
            onChange={(e)=>setNum(parseInt(e.target.value||'1'))}
            className="generator-number-input"
          />
        </div>
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
        {tickets.map((t, i) => {
          const hints = ticketHints(game, t.mains, t.special ?? 0, stats);
          return (
            <div key={i} className="card">
              {/* Bubble-rendered ticket numbers */}
              <div className="mono num-bubbles" aria-label={`Ticket ${i+1}`}>
                {t.mains.map((n, idx) => (
                  <span key={`m-${idx}`} className="num-bubble" aria-label={`Main ${idx+1}`}>{n}</span>
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
                      aria-label="Special"
                    >
                      {t.special}
                    </span>
                  </>
                )}
              </div>
              {/* Hint pills */}
              <div className="chips">
                {hints.map(h => (
                  <Pill key={h} tone={classifyHint(h)} title={HINT_EXPLAIN[h]}>
                    {h}
                  </Pill>
                ))}
              </div>
            </div>
          );
        })}
        {tickets.length === 0 && <div className="hint">No tickets yet.</div>}
      </div>
    </section>
  );
}
