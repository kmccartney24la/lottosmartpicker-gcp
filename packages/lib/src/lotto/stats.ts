// packages/lib/src/lotto/stats.ts
import type { GameKey, LogicalGameKey, LottoRow } from './types.js';
import { getCurrentEraConfig, filterRowsForCurrentEra } from './era.js';

/* -------------------------------------------------------
   5-ball analytics core (no fetch, no DOM/IO, isomorphic)
   ------------------------------------------------------- */

export function computeStats(
  rows: LottoRow[],
  game: GameKey,
  overrideCfg?: { mainMax: number; specialMax: number; mainPick: number }
) {
  // ---- LRU memoization (keyed by game + era + lastRow + length) ----
  // Very small (12) — evict least-recently-used.
  type StatsKey = string;
  const _globalAny = globalThis as any;
  if (!_globalAny.__lsp_stats_lru__) {
    _globalAny.__lsp_stats_lru__ = {
      map: new Map<StatsKey, ReturnType<typeof computeStats>>(),
      touch(k: StatsKey, v: ReturnType<typeof computeStats>) {
        this.map.delete(k); this.map.set(k, v);
        if (this.map.size > 12) this.map.delete(this.map.keys().next().value);
      },
    };
  }
  const ST = _globalAny.__lsp_stats_lru__;
  const eraStart = (overrideCfg ? 'override' : getCurrentEraConfig(game).start);
  const last = rows.length ? rows[rows.length - 1]!.date : 'none';
  const key: StatsKey = `${game}|${eraStart}|${last}|${rows.length}`;
  const cached = ST.map.get(key);
  if (cached) { ST.touch(key, cached); return cached; }

  // Use override if provided (e.g., current era), else the current era.
  // This keeps Mega Millions (24) correct and future-proofs defaults.
  const cfg = overrideCfg ?? getCurrentEraConfig(game);

  const countsMain = new Map<number, number>();
  const countsSpecial = new Map<number, number>();
  const lastSeenMain = new Map<number, number>();
  const lastSeenSpecial = new Map<number, number>();
  for (let n=1;n<=cfg.mainMax;n++){countsMain.set(n,0); lastSeenMain.set(n,Infinity);}
  for (let n=1;n<=cfg.specialMax;n++){countsSpecial.set(n,0); lastSeenSpecial.set(n,Infinity);}
  const totalDraws = rows.length;

  // iterate newest→oldest (avoid copy+reverse)
  for (let i = rows.length - 1, idx = 0; i >= 0; i--, idx++) {
    const d = rows[i];
    if (!d) continue;

    // Build mains defensively, using the current era’s pick count.
    // Two Step draws 4 mains; some CSVs leave n5 undefined — never include it.
    const mains: number[] = [];
    // Push any present/finite mains from n1..n5 in order
    const raw = [d.n1, d.n2, d.n3, d.n4, d.n5];
    for (const m of raw) {
      if (Number.isFinite(m)) mains.push(m as number);
    }

    // Lotto-style 6-main games store the 6th main in `special` for CSV compatibility.
    // Treat that `special` as a MAIN for stats purposes (do NOT count it as a special).
    const isSixMainGame =
      (game === 'ny_lotto' ||
       game === 'fl_lotto' ||
       game === 'fl_jackpot_triple_play' ||
       game === 'tx_lotto_texas');

    const eraMainPick = (overrideCfg?.mainPick ?? getCurrentEraConfig(game).mainPick);
    if (eraMainPick > 5 && isSixMainGame && Number.isFinite(d.special)) {
      mains.push(d.special as number);
    }
    // Final safety: only analyze exactly the current era’s mainPick
    if (mains.length > eraMainPick) mains.length = eraMainPick;

    mains.forEach(m=>{
      countsMain.set(m,(countsMain.get(m)||0)+1);
      lastSeenMain.set(m, Math.min(lastSeenMain.get(m)||Infinity, idx));
    });

    // For 6-main games, do NOT count `special` in the special domain.
    if (cfg.specialMax > 0 && !isSixMainGame && typeof d.special === 'number' && Number.isFinite(d.special)) {
      const sp: number = d.special; // ✓ now narrowed to number
      countsSpecial.set(sp, (countsSpecial.get(sp) ?? 0) + 1);
      lastSeenSpecial.set(sp, Math.min(lastSeenSpecial.get(sp) ?? Infinity, idx));
    }
  }

  const expectedMain = (totalDraws*cfg.mainPick)/cfg.mainMax;
  const expectedSpecial = cfg.specialMax>0 ? totalDraws/cfg.specialMax : 0;

  const varMain = totalDraws*(cfg.mainPick/cfg.mainMax)*(1-cfg.mainPick/cfg.mainMax);
  const sdMain = Math.sqrt(Math.max(varMain,1e-9));

  const varSpecial = cfg.specialMax>0 ? totalDraws*(1/cfg.specialMax)*(1-1/cfg.specialMax) : 0;
  const sdSpecial = cfg.specialMax>0 ? Math.sqrt(Math.max(varSpecial,1e-9)) : 1; // avoid div/0

  const zMain = new Map<number,number>();
  const zSpecial = new Map<number,number>();
  for (let n=1;n<=cfg.mainMax;n++) zMain.set(n, ((countsMain.get(n)||0)-expectedMain)/sdMain);
  if (cfg.specialMax>0) for (let n=1;n<=cfg.specialMax;n++) zSpecial.set(n, ((countsSpecial.get(n)||0)-expectedSpecial)/sdSpecial);

  const result = { countsMain, countsSpecial, lastSeenMain, lastSeenSpecial, totalDraws, zMain, zSpecial, cfg };
  ST.touch(key, result);
  return result;
}

export function buildWeights(domainMax: number, counts: Map<number,number>, mode:'hot'|'cold', alpha:number): number[] {
  // Light smoothing prior to reduce early-era overfit.
  const arr = Array.from({length:domainMax},(_,i)=>counts.get(i+1)||0);
  const total = arr.reduce((a,b)=>a+b,0);
  const avg = domainMax > 0 ? (total / domainMax) : 0;
  const eps = Math.min(0.5, Math.max(0.05, 0.05 * avg)); // in [0.05, 0.5]
  const arrSmooth = arr.map(c => c + eps);
  const totalSmooth = arrSmooth.reduce((a,b)=>a+b,0);
  const freq = totalSmooth>0 ? arrSmooth.map(c=>c/totalSmooth) : Array(domainMax).fill(1/domainMax);
  const max = Math.max(...freq);
  const invRaw = freq.map(p=>(max-p)+1e-9);
  const invSum = invRaw.reduce((a,b)=>a+b,0);
  const inv = invRaw.map(x=>x/invSum);
  const base = Array(domainMax).fill(1/domainMax);
  const chosen = mode==='hot'?freq:inv;
  const blended = chosen.map((p,i)=>(1-alpha)*base[i] + alpha*p);
  const s = blended.reduce((a,b)=>a+b,0);
  return blended.map(x=>x/s);
}

export function weightedSampleDistinct(k:number, weights:number[]): number[] {
  const n = weights.length;
  const picks:number[] = [];
  const w = weights.map(v=>(Number.isFinite(v)&&v>0?v:0));
  const available = new Set<number>(Array.from({length:n},(_,i)=>i));
  const drawOne = ():number => {
    let sum = 0;
    for (const i of available) sum += w[i]!;
    if (sum <= 1e-12) {
      const arr = Array.from(available);
      const ri = Math.floor(Math.random()*arr.length);
      const val = arr[ri]!;
      return val;
    }
    let r = Math.random()*sum;
    let acc = 0;
    for (const i of available) { acc += w[i]!; if (acc >= r) return i; }
    return Array.from(available).pop() as number;
  };
  const limit = Math.min(k,n);
  for (let t=0;t<limit;t++){ const idx=drawOne(); picks.push(idx+1); available.delete(idx); }
  return picks.sort((a,b)=>a-b);
}

export function looksTooCommon(mains:number[], game:GameKey): boolean {
  const mainMax = getCurrentEraConfig(game).mainMax;
  const arr = [...mains].sort((a,b)=>a-b);
  // Any 3-in-a-row (triplet)
  const tripleRun = arr.some((_,i)=> i>=2 && arr[i-2]!+2===arr[i-1]!+1 && arr[i-1]!+1===arr[i]!);
  // Any 4-in-a-row
  const fourRun = arr.some((_,i)=> i>=3 && arr[i-3]!+3===arr[i-2]!+2 && arr[i-2]!+2===arr[i-1]!+1 && arr[i-1]!+1===arr[i]!);
  // “Date bias”: ≥4 numbers ≤31
  const lowBias = arr.filter(n=>n<=31).length >= 4;
  // Pure arithmetic progression
  const d1 = arr[1]! - arr[0]!;
  const arithmetic = arr.every((_,i)=>(i===0 ? true : arr[i]! - arr[i-1]! === d1));
  // Tight cluster: span narrower than ~1/7 of the domain
  const span = arr[arr.length-1]! - arr[0]!;
  const clustered = span <= Math.floor(mainMax/7);
  return fourRun || tripleRun || lowBias || arithmetic || clustered;
}

// --- granular detectors for hint labeling (5-ball sets; works for Take 5 too) ---
function hasConsecutiveRun(mains:number[], runLen:number): boolean {
  const a = [...mains].sort((x,y)=>x-y);
  for (let i=runLen-1;i<a.length;i++){
    let ok=true;
    for (let k=1;k<runLen;k++) if (a[i-k]!+k!==a[i]) { ok=false; break; }
    if (ok) return true;
  }
  return false;
}
function isArithmeticSequence(mains:number[]): boolean {
  const a = [...mains].sort((x, y) => x - y);
  if (a.length < 3) return false;
  const d = a[1]! - a[0]!;
  for (let i = 2; i < a.length; i++) {
    if ((a[i]! - a[i - 1]!) !== d) return false;
  }
  return true;
}
function isBirthdayHeavy(mains:number[]): boolean {
  return mains.filter(n=>n<=31).length >= 4;
}
function isTightlyClustered(mains:number[], domainMax:number): boolean {
  const a=[...mains].sort((x,y)=>x-y);
  const span=a[a.length-1]!-a[0]!;
  return span <= Math.floor(domainMax/7);
}

export function ticketHints(game:GameKey, mains:number[], special:number, stats: ReturnType<typeof computeStats>): string[] {
  const hints:string[] = [];
  // Granular pattern tags (derived from main numbers only)
  const domainMax = stats.cfg.mainMax;
  if (hasConsecutiveRun(mains, 4)) hints.push('4-in-a-row');
  else if (hasConsecutiveRun(mains, 3)) hints.push('3-in-a-row');
  if (isArithmeticSequence(mains)) hints.push('Arithmetic sequence');
  if (isBirthdayHeavy(mains)) hints.push('Birthday-heavy');
  if (isTightlyClustered(mains, domainMax)) hints.push('Tight span');
  // Back-compat umbrella if none of the above but still “too common”
  if (hints.length===0 && looksTooCommon(mains, game)) hints.push('Common pattern');

  const lowCount = mains.filter(n=>(stats.countsMain.get(n)||0) <= 1).length;
  if (lowCount >= 3) hints.push('Cold mains');
  const hotCount = mains.filter(n=> (stats.zMain.get(n)||0) > 1).length;
  if (hotCount >= 3) hints.push('Hot mains');
  if (stats.cfg.specialMax>0 && typeof special === 'number') {
    const specialZ = (stats.zSpecial.get(special)||0);
    if (specialZ > 1) hints.push('Hot special');
    if (specialZ < -1) hints.push('Cold special');
  }
  if (hints.length===0) hints.push('Balanced');
  return hints;
}

/** Small helper kept with hints to keep fetch.ts analytics-free. */
export function evaluateTicket(
  game: GameKey,
  mains: number[],
  special: number | 0,
  stats: ReturnType<typeof computeStats>
): string[] {
  return ticketHints(game, mains, special ?? 0, stats);
}

export function generateTicket(
  rows:LottoRow[],
  game:GameKey,
  opts:{modeMain:'hot'|'cold'; modeSpecial:'hot'|'cold'; alphaMain:number; alphaSpecial:number; avoidCommon:boolean},
  overrideCfg?: { mainMax: number; specialMax: number; mainPick: number }
) {
  const s = computeStats(rows, game, overrideCfg);
  const wMain = buildWeights(s.cfg.mainMax, s.countsMain, opts.modeMain, opts.alphaMain);
  const wSpecial = s.cfg.specialMax>0 ? buildWeights(s.cfg.specialMax, s.countsSpecial, opts.modeSpecial, opts.alphaSpecial) : [];
  let mains:number[]=[]; let special:number|undefined=undefined; let tries=0;
  do {
    mains = weightedSampleDistinct(s.cfg.mainPick, wMain);
    if (s.cfg.specialMax>0) special = weightedSampleDistinct(1, wSpecial)[0];
    tries++; if (tries>50) break;
  } while (opts.avoidCommon && looksTooCommon(mains, game));
  return s.cfg.specialMax>0 ? { mains, special: special! } : { mains };
}

export function analyzeGame(rows:LottoRow[], game:GameKey) {
  // Small memo (reuse the same LRU structure; distinct namespace)
  type Key = string;
  const _globalAny = globalThis as any;
  if (!_globalAny.__lsp_analyze_lru__) {
    _globalAny.__lsp_analyze_lru__ = {
      map: new Map<Key, any>(),
      touch(k: Key, v: any){ this.map.delete(k); this.map.set(k,v); if (this.map.size>12) this.map.delete(this.map.keys().next().value); }
    };
  }
  // Always analyze the CURRENT era only
  const era = getCurrentEraConfig(game);
  const filtered = filterRowsForCurrentEra(rows, game);
  const last = filtered.length ? filtered[filtered.length-1]!.date : 'none';
  const key: Key = `${game}|${era.start}|${last}|${filtered.length}`;
  const cached = _globalAny.__lsp_analyze_lru__.map.get(key);
  if (cached) { _globalAny.__lsp_analyze_lru__.touch(key, cached); return cached; }

  const s = computeStats(filtered, game, era);

  const mainCounts = Array.from({length:s.cfg.mainMax},(_,i)=> s.countsMain.get(i+1) || 0);
  const specialCounts = s.cfg.specialMax>0 ? Array.from({length:s.cfg.specialMax},(_,i)=> s.countsSpecial.get(i+1) || 0) : [];
  const cvMain = coefVar(mainCounts);
  const cvSpec = s.cfg.specialMax>0 ? coefVar(specialCounts) : 0;
  const recencyHotFracMain = (()=>{ const threshold=10; let hot=0; for (let i=1;i<=s.cfg.mainMax;i++) if ((s.lastSeenMain.get(i)||Infinity)<=threshold) hot++; return hot/s.cfg.mainMax; })();
  const recencyHotFracSpec = s.cfg.specialMax>0 ? (()=>{ const threshold=10; let hot=0; for (let i=1;i<=s.cfg.specialMax;i++) if ((s.lastSeenSpecial.get(i)||Infinity)<=threshold) hot++; return hot/s.cfg.specialMax; })() : 0;
  const recMain0 = recommendFromDispersion(cvMain, 'main');
  const recSpec0 = s.cfg.specialMax>0 ? recommendFromDispersion(cvSpec,'special') : { mode:'hot' as const, alpha:0.60 };
  const recMain = { ...recMain0, alpha: clampAlphaFor(game, 'main', recMain0.alpha, s.totalDraws) };
  const recSpec = s.cfg.specialMax>0 ? { ...recSpec0, alpha: clampAlphaFor(game, 'special', recSpec0.alpha, s.totalDraws) } : recSpec0;

  const result = {
    game,
    draws: s.totalDraws,
    cvMain, cvSpec,
    recencyHotFracMain, recencyHotFracSpec,
    recMain, recSpec,
    eraStart: era.start,
    eraCfg: { mainMax: era.mainMax, specialMax: era.specialMax, mainPick: era.mainPick, label: era.label, description: era.description }
  };
  _globalAny.__lsp_analyze_lru__.touch(key, result);
  return result;
}

// ---- Jackpot odds (exact, era-aware) ---------------------------------------
export function nCk(n:number,k:number): number {
  if (k<0 || k>n) return 0;
  k = Math.min(k, n-k);
  let num=1, den=1;
  for (let i=1;i<=k;i++){ num *= (n - (k - i)); den *= i; }
  return Math.round(num/den);
}

export function jackpotOdds(game:GameKey): number {
  const _globalAny = globalThis as any;
  if (!_globalAny.__lsp_jackpot_cache__) _globalAny.__lsp_jackpot_cache__ = new Map<GameKey, number>();
  const hit = _globalAny.__lsp_jackpot_cache__.get(game);
  if (hit) return hit;
  const era = getCurrentEraConfig(game);
  const mains = nCk(era.mainMax, era.mainPick);
  const specials = Math.max(era.specialMax, 1);
  const val = mains * specials; // “1 in <return value>”
  _globalAny.__lsp_jackpot_cache__.set(game, val);
  return val;
}

// ---- Odds for logical games that aren’t 5+special ----
export function jackpotOddsForLogical(logical: LogicalGameKey): number | null {
  switch (logical) {
    case 'ny_take5':   return jackpotOdds('ny_take5');
    case 'ny_numbers': return Math.pow(10, 3);
    case 'ny_win4':    return Math.pow(10, 4);
    case 'ca_daily3':  return Math.pow(10, 3); // straight, exact order
    case 'ca_daily4':  return Math.pow(10, 4); // straight, exact order
    case 'tx_pick3':   return Math.pow(10, 3); // straight, exact order
    case 'tx_daily4':  return Math.pow(10, 4); // straight, exact order
    case 'ny_pick10':  return Math.round(nCk(80,10) / nCk(20,10));
    case 'ny_lotto':   return jackpotOdds('ny_lotto');
    case 'ny_quick_draw': return null;
    case 'tx_all_or_nothing':
      // Top prize if you match ALL 12 or NONE of 12 (two winning subsets).
      // Total 12-number combinations from 24 is C(24,12); two winning outcomes → C(24,12)/2 odds denominator.
      return Math.round(nCk(24,12) / 2);
    // Florida digits (straight, exact order)
    case 'fl_pick2':   return Math.pow(10, 2);
    case 'fl_pick3':   return Math.pow(10, 3);
    case 'fl_pick4':   return Math.pow(10, 4);
    case 'fl_pick5':   return Math.pow(10, 5);
    default:           return null;
  }
}

export function weightedSampleDistinctFromWeights(k:number, weights:number[]): number[] {
  const n = weights.length;
  const picks:number[] = [];
  const available = new Set<number>(Array.from({length:n},(_,i)=>i));
  const w = weights.slice();
  while (picks.length < Math.min(k, n)) {
    let sum = 0; for (const i of available) sum += w[i]!;
    let r = Math.random()*sum, acc=0, chosen=-1;
    for (const i of available) { acc+=w[i]!; if (acc>=r){chosen=i;break;} }
    if (chosen<0) break;
    picks.push(chosen+1);
    available.delete(chosen);
  }
  return picks.sort((a,b)=>a-b);
}

export function coefVar(values:number[]): number {
  const n = values.length; if (n===0) return 0;
  const mean = values.reduce((a,b)=>a+b,0)/n;
  const varr = values.reduce((a,b)=>a+(b-mean)*(b-mean),0)/n;
  return mean===0?0:Math.sqrt(varr)/mean;
}

export function recommendFromDispersion(cv:number, domain:'main'|'special'):{mode:'hot'|'cold';alpha:number} {
  if (domain==='special') {
    if (cv>=0.30) return { mode:'hot', alpha:0.70 };
    if (cv<=0.18) return { mode:'cold', alpha:0.55 };
    return { mode:'hot', alpha:0.60 };
  } else {
    if (cv>=0.25) return { mode:'hot', alpha:0.65 };
    if (cv<=0.15) return { mode:'cold', alpha:0.55 };
    return { mode:'hot', alpha:0.60 };
  }
}

/** Clamp alpha for non-era domains where we don't have (mainMax,specialMax) */
export function clampAlphaGeneric(
  alpha:number,
  draws:number,
  domainSize:number,
  lo:number,
  hi:number
): number {
  let hi2 = hi;
  if (draws < domainSize) hi2 = Math.max(lo, hi - 0.10);
  return Math.min(hi2, Math.max(lo, alpha));
}

export function clampAlphaFor(game:GameKey, domain:'main'|'special', alpha:number, draws:number): number {
  const era = getCurrentEraConfig(game);
  let lo = 0.5, hi = 0.75;
  if (domain==='main') {
    if (era.mainMax <= 45) { lo = 0.40; hi = 0.70; }  // Fantasy 5
    else { lo = 0.50; hi = 0.75; }                    // PB/MM/C4L
  } else {
    if (era.specialMax <= 5) { lo = 0.35; hi = 0.65; } // C4L: tiny domain, keep conservative
    else { lo = 0.45; hi = 0.75; }                     // PB/MM
  }
  // Early-era guard: before ~one full domain of draws, avoid very spiky alphas
  if (draws < era.mainMax) { hi = Math.max(lo, hi - 0.10); }
  return Math.min(hi, Math.max(lo, alpha));
}
