'use client';
import { useMemo, useRef, useState } from 'react';
import Info from 'src/components/Info';
import Pill from './Pill';
import { HINT_EXPLAIN, classifyHint } from './hints';
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
    <div className="card" style={{ maxWidth: 720 }}>
      {/* Header */}
      <div style={{ fontWeight: 700, marginBottom: 8 }}>Generator</div>
      
      {/* Recommended */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
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
          style={{ marginLeft: 4 }}
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
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
        <div style={{ fontWeight: 600 }}>Main numbers weighting</div>
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
      {/* (removed old hot/cold toggle buttons) */}
      <input
        aria-label="Main alpha"
        type="range"
        min={0}
        max={1}
        step={0.05}
        value={alphaMain}
        onChange={(e)=>setAlphaMain(parseFloat(e.target.value))}
        style={{ width: '95%' }} 
      />
      <div className="hint" aria-live="polite">alpha = {alphaMain.toFixed(2)} ({modeMain})</div>

      {/* Special ball weighting (only for games that have a special) */}
      {hasSpecial && (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 12 }}>
            <div style={{ fontWeight: 600 }}>Special ball weighting</div>
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
            style={{ width: '95%' }} 
          />
          <div className="hint" aria-live="polite">alpha = {alphaSpecial.toFixed(2)} ({modeSpecial})</div>
        </>
      )}

      {/* Options */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
        <label style={{ fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          <input type="checkbox" checked={avoidCommon} onChange={(e)=>setAvoidCommon(e.target.checked)} />
          <span>Avoid common patterns</span>
          <Info
            tip={
              'Heuristic filter:\n' +
              '• Consecutive triplets\n' +
              '• 4+ numbers ≤ 31 (date bias)\n' +
              '• Arithmetic sequences\n' +
              '• Tight clusters (small spread)\n' +
              'This reduces “too common” combos players tend to pick.'
            }
          />
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 14 }}>Tickets:</span>
          <input aria-label="Number of tickets" type="number" min={1} max={100} value={num} onChange={(e)=>setNum(parseInt(e.target.value||'1'))} style={{ width: 84 }} />
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', alignItems:'center', gap: 8 }}>
        <button onClick={()=>generate()} className="btn btn-primary" style={{ marginTop: 10 }}>
          Generate
        </button>
        <button
          onClick={copyTicketsToClipboard}
          className="btn btn-ghost"
          style={{ marginTop: 10 }}
          disabled={tickets.length === 0}
          aria-label="Copy tickets to clipboard"
        >
          Copy tickets
        </button>
      </div>

      {/* Results */}
      <div aria-live="polite" ref={liveRef} style={{ position:'absolute', width:1, height:1, clip:'rect(0 0 0 0)', overflow:'hidden' }} />
      <div style={{ marginTop: 12, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
        {tickets.map((t, i) => {
          const hints = ticketHints(game, t.mains, t.special ?? 0, stats);
          return (
            <div key={i} className="card" style={{ padding: 8 }}>
              <div className="mono" aria-label={`Ticket ${i+1}`}>
                {hasSpecial ? `${t.mains.join('-')} | ${t.special}` : t.mains.join('-')}
              </div>
              <div style={{ marginTop: 6 }}>
                <div style={{ display:'flex', flexWrap:'wrap', gap: 6 }}>
                  {hints.map(h => (
                    <Pill key={h} tone={classifyHint(h)} title={HINT_EXPLAIN[h]}>
                      {h}
                    </Pill>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
        {tickets.length === 0 && <div className="hint">No tickets yet.</div>}
      </div>
    </div>
  );
}
