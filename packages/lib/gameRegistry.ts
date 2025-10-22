// src/lib/gameRegistry.ts
import type {
  GameKey,
  LogicalGameKey,
} from 'packages/lib/lotto';

// Canonical-only (exclude scratchers in consuming files)
type CanonicalDrawGame = Exclude<GameKey, 'ga_scratchers'>;

/* ===========================
   Public types
   =========================== */
export type Shape =
  | 'five' | 'six'
  | 'digit2' | 'digit3' | 'digit4' | 'digit5'
  | 'pick10' | 'quickdraw' | 'cashpop';

export type SpecialTone = 'red'|'blue'|'green'|'amber'|null;

export type TagMode = 'patterns-only'|'playtypes-only'|'light-patterns';

export interface GameMeta {
  shape: Shape;
  kDigits?: 2|3|4|5;
  hasSpecial: boolean;
  specialTone: SpecialTone;
  usesFireball?: boolean;
  tagMode: TagMode;
  preferEveningWhenBoth?: boolean;
  sixMainsNoSpecial?: boolean; // FL LOTTO/JTP: render 6 mains, no colored special
  isNyLotto?: boolean;
}

/** Legend config consumed by HintLegend (UI-agnostic) */
export type LegendItem = {
  label: string;
  children?: string[];
};

export type LegendGroup =
  | { kind: 'playtypes';  title: 'Play Types';      items: LegendItem[] }
  | { kind: 'patterns';   title: 'Common Patterns'; items: LegendItem[] };

/* ===========================
   Internal helpers
   =========================== */

   /** Normalize keys and cheap jurisdiction flags */
function normKey(k?: string) { return String(k ?? '').toLowerCase(); }
function flagsFor(key?: string) {
  const k = normKey(key);
  return {
    isFL: k.startsWith('fl_') || k.includes('florida'),
    isNY: k.startsWith('ny_') || k.includes('new_york'),
    isCA: k.startsWith('ca_') || k.includes('california'),
  };
}

/** Narrow helper: is a digit shape? */
export function isDigitShape(shape: Shape): shape is 'digit2'|'digit3'|'digit4'|'digit5' {
  return shape.startsWith('digit') as boolean;
}

/** Tag policy convenience */
export function usesPlayTypeTags(meta: GameMeta): boolean {
  return meta.tagMode === 'playtypes-only';
}

/** factorial small k (<=5) */
function fact(n: number): number {
  return n<=1 ? 1 : n*fact(n-1);
}

function multiplicities(d: number[]): number[] {
  const m = new Map<number, number>();
  d.forEach(x => m.set(x, (m.get(x)||0) + 1));
  return Array.from(m.values()).sort((a,b)=>b-a);
}

/** permutations for multiset of k digits */
function multisetPermutationsCount(d: number[]): number {
  const k = d.length;
  const mults = multiplicities(d);
  return fact(k) / mults.reduce((acc, c) => acc*fact(c), 1);
}

function kToShape(k: 2|3|4|5): Shape {
  return (('digit'+k) as Shape);
}

/** Build a "<N>-Way Box" string */
function wayLabel(n: number, base: 'Box' = 'Box'): string {
  return `${n}-Way ${base}`;
}
// 1) Colored special presence + class
export function hasColoredSpecial(meta: GameMeta): boolean {
  return !!(meta.hasSpecial && !meta.sixMainsNoSpecial && !meta.isNyLotto);
}
const TONE_CLASS: Record<NonNullable<SpecialTone>, string> = {
  red: 'num-bubble--red',
  blue: 'num-bubble--blue',
  green: 'num-bubble--green',
  amber: 'num-bubble--amber',
};
export function specialToneClass(meta: GameMeta): string {
  return meta.specialTone ? TONE_CLASS[meta.specialTone] : 'num-bubble--amber';
}

// 2) Special bubble label
export function specialLabel(meta: GameMeta, game?: string): string {
  if (meta.isNyLotto) return 'Bonus';
  const g = normKey(game);
  const SPECIAL_LABEL_BY_SUBSTR: [string, string][] = [
    ['powerball', 'Powerball'],
    ['megamillions', 'Mega Ball'],
    ['cash4life', 'Cash Ball'],
    // California SuperLotto Plus uses a "Mega" number (not Mega Millions)
    ['superlotto', 'Mega'],
  ];
  for (const [needle, label] of SPECIAL_LABEL_BY_SUBSTR) {
    if (g.includes(needle)) return label;
  }
  return 'Special';
}

// 3) Effective period (evening wins when both/all & meta says so)
export type AnyPeriod = 'midday'|'evening'|'both'|'all';
export function effectivePeriod(meta: GameMeta, requested?: AnyPeriod): AnyPeriod {
  if (!requested) return meta.preferEveningWhenBoth ? 'evening' : 'evening';
  if ((requested === 'both' || requested === 'all') && meta.preferEveningWhenBoth) return 'evening';
  return requested;
}

/**
 * Coerce an unknown period (e.g., app-level Period) into AnyPeriod understood by the registry.
 * Returns undefined when not coercible, allowing effectivePeriod to apply defaults.
 */
export function coerceAnyPeriod(p?: unknown): AnyPeriod | undefined {
  return (p === 'midday' || p === 'evening' || p === 'both' || p === 'all')
    ? p
    : undefined;
}

// 4) Filter hints if no colored special
export function filterHintsForGame(meta: GameMeta, labels: string[]): string[] {
  if (hasColoredSpecial(meta)) return labels;
  return labels.filter(h => h !== 'Hot special' && h !== 'Cold special');
}

// 5) NY Lotto rule: bonus ≠ mains
export function bonusMustDifferFromMains(meta: GameMeta): boolean {
  return !!meta.isNyLotto;
}

/* ===========================
   Sidebar helpers (mode, labels, special-bubble, date sort)
   =========================== */

/** UI modes the sidebar knows how to render */
export type SidebarMode =
  | 'five'
  | 'digits'
  | 'pick10'
  | 'quickdraw'
  | 'ny_lotto'
  | 'cashpop';

/** Map meta + optional payload kind → a concrete rendering mode */
export function sidebarModeFor(meta: GameMeta, payloadKind?: string): SidebarMode {
  if (payloadKind) return (payloadKind as SidebarMode);
  if (meta.isNyLotto) return 'ny_lotto';
  const byShape: Partial<Record<Shape, SidebarMode>> = {
    cashpop: 'cashpop',
    pick10: 'pick10',
    quickdraw: 'quickdraw',
    digit2: 'digits',
    digit3: 'digits',
    digit4: 'digits',
    digit5: 'digits',
    five: 'five',
    six: 'five',
  };
  return byShape[meta.shape] ?? 'five';
}

/** Header label for the numbers column */
export function sidebarHeaderLabel(meta: GameMeta, mode: SidebarMode): 'Numbers' | 'Digits' {
  if (mode === 'digits' || mode === 'cashpop') return 'Digits';
  return 'Numbers';
}

/**
 * Decide how (and whether) to show a "special" bubble for a row.
 * - NY Lotto: show Bonus only if it's not one of the mains.
 * - Colored special games: show colored special when present.
 * - Fireball: caller passes specialLabelOverride='Fireball' to force Fireball styling.
 */
export function sidebarSpecialForRow(args: {
  meta: GameMeta;
  mains: number[];                   // already sliced to correct count
  special?: number;                  // incoming special value (if any)
  gameStr?: string;                  // for special label inference
  specialLabelOverride?: string;     // e.g., 'Fireball'
}): { special?: number; sep: boolean; label?: string; className?: string } {
  const { meta, mains, special, gameStr, specialLabelOverride } = args;

  // Fireball (explicit override by caller)
  if (specialLabelOverride) {
    return typeof special === 'number'
      ? { special, sep: true, label: specialLabelOverride, className: 'num-bubble--fireball' }
      : { sep: false };
  }

  // NY Lotto: bonus must differ from mains
  if (meta.isNyLotto) {
    if (typeof special === 'number' && !mains.includes(special)) {
      return { special, sep: true, label: 'Bonus', className: 'num-bubble--nylotto-bonus' };
    }
    return { sep: false };
  }

  // Colored special games (e.g., PB/MM/C4L)
  if (hasColoredSpecial(meta) && typeof special === 'number') {
    return {
      special,
      sep: true,
      label: sidebarSpecialLabel(meta, gameStr),
      className: specialToneClass(meta),
    };
  }

  // No special bubble
  return { sep: false };
}

/** Special label — wrapper to keep naming consistent from one import */
export function sidebarSpecialLabel(meta: GameMeta, gameStr?: string): string {
  return specialLabel(meta, gameStr);
}

/** Robust date key for sorting (ms since epoch). Accepts ISO and US formats. */
export function sidebarDateKey(s: string): number {
  if (!s) return 0;
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
    const n = Date.parse(t);
    return Number.isFinite(n) ? n : 0;
  }
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(t)) {
    const [m, d, y] = t.split('/').map(Number);
    const yy = y < 100 ? 2000 + y : y;
    const n = new Date(yy, (m || 1) - 1, d || 1).getTime();
    return Number.isFinite(n) ? n : 0;
  }
  const n = Date.parse(t);
  return Number.isFinite(n) ? n : 0;
}

/* ===========================
   Five/six extraction helpers for sidebars & lists
   =========================== */

/** Minimal structural row for classic 5/6 games (keeps registry decoupled from LottoRow). */
export type FiveLikeRow = { n1?: number; n2?: number; n3?: number; n4?: number; n5?: number; special?: number };

/** Choose how many mains to show for a five/six style game (era-aware, NY/FL six-mains aware). */
export function mainPickFor(meta: GameMeta, eraCfg?: { mainPick?: number }): number {
  if (meta.sixMainsNoSpecial || meta.isNyLotto) return 6;
  const fallback = typeof eraCfg?.mainPick === 'number' ? eraCfg.mainPick : 5;
  return Math.max(1, Math.min(6, fallback || 5));
}

/**
 * Build a normalized "five-like" view from a raw row, applying:
 *  - six-mains rule (FL LOTTO/JTP, NY Lotto)
 *  - special bubble decision/label/tone (incl. NY Bonus rule)
 */
export function rowToFiveView(
  row: FiveLikeRow,
  meta: GameMeta,
  opts?: { gameStr?: string; eraCfg?: { mainPick?: number } }
): { mains: number[]; special?: number; sep: boolean; label?: string; className?: string } {
  const base = [row.n1, row.n2, row.n3, row.n4, row.n5].filter(n => Number.isFinite(n)) as number[];
  const mains = [...base];
  // For six-mains styles, treat row.special as the 6th main when provided and needed.
  if ((meta.sixMainsNoSpecial || meta.isNyLotto) && mains.length === 5 && typeof row.special === 'number') {
    mains.push(row.special);
  }
  const show = mains.slice(0, mainPickFor(meta, opts?.eraCfg));
  const sp = sidebarSpecialForRow({
    meta,
    mains: show,
    special: row.special,
    gameStr: opts?.gameStr,
  });
  return { mains: show, special: sp.special, sep: sp.sep, label: sp.label, className: sp.className };
}

/** Return k for digit shapes directly from meta; null for non-digit games. */
export function digitsKFor(meta: GameMeta): 2 | 3 | 4 | 5 | null {
  return isDigitShape(meta.shape) ? (meta.kDigits ?? null) : null;
}


/* ===========================
   GameOverview helpers
   =========================== */

// Families used by GameOverview’s "How to Play" switch
export type OverviewFamily =
  | 'fl_cashpop'
  | 'ny_pick10'
  | 'ny_quick_draw'
  | 'ny_take5'
  | 'digits_ny_numbers'
  | 'digits_ny_win4'
  | 'digits_fl_pick2'
  | 'digits_fl_pick3'
  | 'digits_fl_pick4'
  | 'digits_fl_pick5'
  | 'fl_fantasy5'
  | 'fl_lotto'
  | 'fl_jtp'
  | 'generic';

/** High-level mode used by the Overview fetch/render pipeline */
export type OverviewMode = 'digits' | 'pick10' | 'quickdraw' | 'cashpop' | 'fiveSix';

/** Plan that tells the UI exactly how to behave for Overview */
export type OverviewPlan = {
  mode: OverviewMode;
  /** Key to use for schedule/next-draw labels (canonical, period-aware). */
  labelKey: GameKey;
  /** Header/display name key (usually same as labelKey for digits; otherwise page game). */
  headerKey: GameKey;
  /** Effective period chosen (evening wins when both/all if policy says so) */
  effPeriod: AnyPeriod;
  /** Representative canonical to compute odds/era for logical five/six games */
  repKey?: CanonicalDrawGame;
  /** Digit logical accepted by digit fetchers, when mode==='digits' */
  digitLogical?: 'ny_numbers'|'ny_win4'|'fl_pick2'|'fl_pick3'|'fl_pick4'|'fl_pick5'|'ca_daily3'|'ca_daily4';
  /** k for digit games, if applicable */
  kDigits?: 2|3|4|5;
  /** Overview family for “How to play” content selection */
  family: OverviewFamily;
};

/**
 * Decide the overview family once, centrally.
 * This replaces GameOverview.gameFamily().
 */
export function overviewFamilyFor(
  game?: GameKey | string,
  logical?: LogicalGameKey | string
): OverviewFamily {
  const meta = resolveGameMeta(game as any, logical as any);
  const g = normKey(game as string);
  const lg = normKey(logical as string);

  // Shape-led routing
  if (meta.shape === 'cashpop')   return 'fl_cashpop';
  if (meta.shape === 'pick10')    return 'ny_pick10';
  if (meta.shape === 'quickdraw') return 'ny_quick_draw';
  if (isDigitShape(meta.shape)) {
    // jurisdiction-aware digits
    if (lg.startsWith('ny_') || g.includes('ny_')) {
      return meta.kDigits === 4 ? 'digits_ny_win4' : 'digits_ny_numbers';
    }
    // Florida digits
    switch (meta.kDigits) {
      case 2: return 'digits_fl_pick2';
      case 3: return 'digits_fl_pick3';
      case 4: return 'digits_fl_pick4';
      case 5: return 'digits_fl_pick5';
    }
  }

  // Named 5/6-ball families
  if (lg.startsWith('ny_take5') || g.includes('ny_take5')) return 'ny_take5';
  if (lg.startsWith('fl_fantasy5') || g.startsWith('fl_fantasy5')) return 'fl_fantasy5';
  if (lg.startsWith('fl_cashpop') || g.startsWith('fl_cashpop')) return 'fl_cashpop';
  if (g === 'fl_lotto' || lg.startsWith('fl_lotto') || g.includes('fl_lotto')) return 'fl_lotto';
  if (g.includes('jackpot_triple_play') || lg.includes('jackpot_triple_play')) return 'fl_jtp';

  return 'generic';
}

/**
 * Compute the canonical key used for labels/schedule given a (game, logical, period).
 * Mirrors the ad-hoc logic that used to live in GameOverview.
 */
export function labelKeyFor(game: GameKey, logical?: LogicalGameKey, period?: AnyPeriod): GameKey {
  const meta = resolveGameMeta(game, logical);
  if (logical && isDigitShape(meta.shape)) {
    const eff = effectivePeriod(meta, coerceAnyPeriod(period));
    const per: 'midday'|'evening' = (eff === 'midday' ? 'midday' : 'evening');
    switch (String(logical)) {
      case 'ny_numbers': return (`ny_numbers_${per}` as GameKey);
      case 'ny_win4':    return (`ny_win4_${per}`    as GameKey);
      case 'fl_pick2':
      case 'fl_pick3':
      case 'fl_pick4':
      case 'fl_pick5':   return (`${logical}_${per}`  as GameKey);
      case 'ca_daily3':  return (`ca_daily3_${per}`   as GameKey);
      case 'ca_daily4':  return ('ca_daily4' as GameKey);
    }
  }
  return logical ? repForLogical(logical, meta) : game;
}

/** Header/display should follow the selected digit game; otherwise the page game. */
export function headerKeyFor(game: GameKey, logical?: LogicalGameKey, period?: AnyPeriod): GameKey {
  const meta = resolveGameMeta(game, logical);
  if (logical && isDigitShape(meta.shape)) return labelKeyFor(game, logical, period);
  return game;
}

/** One-stop “plan” for the Overview component. */
export function overviewPlanFor(
  game: GameKey,
  logical?: LogicalGameKey,
  period?: AnyPeriod
): OverviewPlan {
  const meta = resolveGameMeta(game, logical);
  const eff = effectivePeriod(meta, coerceAnyPeriod(period));
  const family = overviewFamilyFor(game, logical);
  const labelKey = labelKeyFor(game, logical, eff);
  const headerKey = headerKeyFor(game, logical, eff);

  // Mode detection driven entirely by meta.shape
  if (isDigitShape(meta.shape)) {
    const lg = digitLogicalFor(game, logical)!; // guarded by isDigitShape
    return {
      mode: 'digits',
      labelKey,
      headerKey,
      effPeriod: eff,
      digitLogical: lg as any,
      kDigits: meta.kDigits!,
      family,
    };
  }
  if (meta.shape === 'pick10') {
    return { mode: 'pick10', labelKey, headerKey, effPeriod: eff, family };
  }
  if (meta.shape === 'quickdraw') {
    return { mode: 'quickdraw', labelKey, headerKey, effPeriod: eff, family };
  }
  if (meta.shape === 'cashpop') {
    return { mode: 'cashpop', labelKey, headerKey, effPeriod: eff, family };
  }
  // five/six style (PB/MM/C4L/Fantasy5/Take5/LOTTO/JTP)
  const rep = logical ? repForLogical(logical, meta) : undefined;
  return { mode: 'fiveSix', labelKey, headerKey, effPeriod: eff, repKey: rep, family };
}

/** Data-only “How to play” steps (kept UI-agnostic). */
export function overviewStepsFor(family: OverviewFamily, meta: GameMeta): string[] {
  // Cash Pop
  if (family === 'fl_cashpop') return [
    'Pick 1 number from 1–15.',
    'Select your draw time (five drawings daily).',
    'Before the draw, a prize is assigned to each number on your ticket.',
    'Match the single winning number to win the shown prize.',
  ];
  // NY Pick 10
  if (family === 'ny_pick10') return [
    'Pick 10 numbers from 1–80.',
    '20 numbers are drawn.',
    'Prizes depend on matches (including a prize for matching none).',
  ];
  // NY Quick Draw
  if (family === 'ny_quick_draw') return [
    'Choose your Spots (how many numbers to play) and pick from 1–80.',
    'Each draw selects 20 numbers.',
    'Prizes depend on Spots and matches.',
  ];
  // NY Take 5
  if (family === 'ny_take5') return [
    'Pick 5 numbers from 1–39.',
    'No special ball. Match 2–5 to win; all 5 wins the jackpot.',
    'Draws twice daily.',
  ];
  // Digits (jurisdiction differences are reflected in meta)
  if (isDigitShape(meta.shape)) {
    const k = meta.kDigits ?? 3;
    const core = [
      `Pick ${k} digit${k>1?'s':''} from 0–9.`,
      'Pick a play type (e.g., Straight, Box).',
      'Choose your draw time (Midday or Evening).',
    ];
    if (meta.usesFireball) core.push('Optionally add FIREBALL for extra winning combinations.');
    else core.push('Optionally cover more orderings on one ticket (cost varies).');
    core.push('Win by matching according to your chosen play type.');
    return core;
  }
  // FL Fantasy 5 (uses family routing)
  if (family === 'fl_fantasy5') return [
    'Pick 5 numbers from 1–36.',
    'No special ball. Match 2–5 to win; all 5 wins the top prize.',
    'Draws twice daily.',
  ];
  // 6-number games with no special (FL LOTTO/JTP) are identified via meta
  if (meta.shape === 'six' && meta.sixMainsNoSpecial) return [
    'Pick 6 numbers from the game’s range.',
    'No special ball. More matches → bigger prizes; all 6 wins the jackpot.',
  ];
  // Generic 5/6 with colored special (PB/MM/C4L/etc.)
  return [
    'Pick the required main numbers (and a special ball when the game uses one).',
    'More matches → bigger prizes; jackpots require all mains (special may apply).',
  ];
}

/**
 * Friendly name for the header line in GameOverview.
 * Keeps display names consistent across the app.
 */
export function displayNameFor(game: GameKey | string): string {
  const g = String(game);
  const s = normKey(g);
  const DISPLAY_MAP: Record<string, string> = {
    multi_powerball: 'Powerball',
    multi_megamillions: 'Mega Millions',
    multi_cash4life: 'Cash4Life',
    ga_fantasy5: 'Fantasy 5',
    ca_superlotto_plus: 'SuperLotto Plus (CA)',
    ca_fantasy5: 'Fantasy 5 (CA)',
    ny_take5: 'Take 5',
    fl_lotto: 'Florida LOTTO',
    fl_jackpot_triple_play: 'Jackpot Triple Play',
  };
  const withPeriodSuffix = (key: string, base: string) =>
    key.endsWith('_midday') ? `${base} (Midday)` :
    key.endsWith('_evening') ? `${base} (Evening)` : base;

  if (DISPLAY_MAP[g]) return DISPLAY_MAP[g];
  if (s.startsWith('ca_daily3')) return withPeriodSuffix(g, 'Daily 3');
  if (s.startsWith('ca_daily4')) return 'Daily 4';
  if (s.includes('ny_numbers')) return 'Numbers';
  if (s.includes('ny_win4'))    return 'Win 4';
  if (s.includes('ny_lotto') || s.includes('ny_nylotto')) return 'NY Lotto';
  if (s.includes('ny_pick10'))  return 'Pick 10';
  if (s.includes('ny_quick_draw')) return 'Quick Draw';
  if (s.startsWith('fl_fantasy5')) return withPeriodSuffix(g, 'Fantasy 5 (FL)');
  if (s.startsWith('fl_pick2'))    return withPeriodSuffix(g, 'Pick 2');
  if (s.startsWith('fl_pick3'))    return withPeriodSuffix(g, 'Pick 3');
  if (s.startsWith('fl_pick4'))    return withPeriodSuffix(g, 'Pick 4');
  if (s.startsWith('fl_pick5'))    return withPeriodSuffix(g, 'Pick 5');
  return g; // debug-friendly fallback
}


/* ===========================
   Digit play-type helpers (single source of truth)
   =========================== */

/** e.g., "3-Way Box" | "6-Way Box" | null (no valid box variant) */
export function boxVariantLabel(digits: number[], k: 2|3|4|5): string | null {
  if (!Array.isArray(digits) || digits.length !== k) return null;
  const ways = multisetPermutationsCount(digits);
  // if there is only one unique arrangement, there's no "Box" variant
  if (ways <= 1) return null;
  return wayLabel(ways, 'Box');
}

/** "Straight" when there are no Box/SB variants (e.g., AA, AAA, AAAA, etc.) */
export function straightOnlyLabel(digits: number[], k: 2|3|4|5): string | null {
  if (!Array.isArray(digits) || digits.length !== k) return null;
  const maxMult = Math.max(...multiplicities(digits));
  return maxMult === k ? 'Straight' : null;
}

/* ===========================
   Play-type menus (moved from HintLegend)
   =========================== */

/**
 * High-level play types shown for a game/logical (jurisdiction-aware).
 * We keep this conservative and uniform across digit games:
 * - FL Pick2/3/4/5: Straight, Box (no Wheel/Combo)
 * - NY Numbers/Win4: Straight, Box (you can extend later if needed)
 *
 * Non-digit shapes return [].
 */
export function playTypesFor(gameOrLogical?: string): string[] {
  const meta = resolveGameMeta(gameOrLogical as any, undefined);
  if (!isDigitShape(meta.shape)) return [];
  // If you later need jurisdiction-specific extras (Wheel), gate on key prefix.
  return ['Straight', 'Box'];
}

/**
 * Children labels for Box by digit k.
 */
export function subVariantsFor(gameOrLogical: string | undefined, parent: string): string[] {
  const meta = resolveGameMeta(gameOrLogical as any, undefined);
  if (!isDigitShape(meta.shape) || !meta.kDigits) return [];
  const k = meta.kDigits;

  const forBox = (): string[] => {
    switch (k) {
      case 2: return [wayLabel(2)]; // AB ↔ BA
      case 3: return [wayLabel(3), wayLabel(6)];
      case 4: return [wayLabel(4), wayLabel(6), wayLabel(12), wayLabel(24)];
      case 5: return [
        wayLabel(5),   // 4+1
        wayLabel(10),  // 3+2
        wayLabel(20),  // 3+1+1
        wayLabel(30),  // 2+2+1
        wayLabel(60),  // 2+1+1+1
        wayLabel(120), // all distinct
      ];
    }
  };

  if (parent === 'Box') return forBox();
  return [];
}

/* ===========================
   Legend groups (single source for HintLegend)
   =========================== */
/**
 * Returns exactly one group for the selected game:
 *  - Digit shapes -> { kind: 'playtypes', title: 'Play Types', items: [...] }
 *  - Non-digit    -> { kind: 'patterns',  title: 'Common Patterns', items: [...] }
 *
 * Note: We don't import HINT_EXPLAIN here to keep registry pure;
 * the renderer can filter labels not present in HINT_EXPLAIN.
 */
export function legendGroupsFor(meta: GameMeta, opts?: { gameStr?: string }): LegendGroup[] {
  if (isDigitShape(meta.shape)) {
    const k = (meta.kDigits ?? 3) as 2 | 3 | 4 | 5;
    const BOX_CHILDREN: Record<2|3|4|5, string[]> = {
      2: ['2-Way Box'],
      3: ['3-Way Box','6-Way Box'],
      4: ['4-Way Box','6-Way Box','12-Way Box','24-Way Box'],
      5: ['5-Way Box','10-Way Box','20-Way Box','30-Way Box','60-Way Box','120-Way Box'],
    };
    const { isFL, isNY, isCA } = flagsFor(opts?.gameStr);

    // Always start with Straight + Box
    const items: LegendItem[] = [
      { label: 'Straight' },
      { label: 'Box', children: BOX_CHILDREN[k] },
    ];

    // California digits: ONLY Straight + Box
    if (!isCA) {
      // Jurisdiction-specific extras
      if (isFL && (k === 3 || k === 4)) items.push({ label: 'Combo (FL)' });
      if (isNY && (k === 3 || k === 4)) items.push({ label: 'Combination (NY)' });

      // Pair-style variants (keep for FL/NY where applicable, but not CA)
      if (k === 2) { items.push({ label: 'Front Number' }, { label: 'Back Number' }); }
      if (k === 3) { items.push({ label: 'Front Pair' },   { label: 'Back Pair' }); }
      if (k === 4) { items.push({ label: 'Front Pair' },   { label: 'Mid Pair' }, { label: 'Back Pair' }); }
    }
    return [{ kind: 'playtypes', title: 'Play Types', items }];
  }
  const PATTERNS_BY_SHAPE: Record<GameMeta['shape'], string[]> = {
    five:      ['3-in-a-row','4-in-a-row','Arithmetic sequence','Birthday-heavy','Tight span'],
    six:       ['3-in-a-row','4-in-a-row','Arithmetic sequence','Birthday-heavy','Tight span'],
    pick10:    ['3-in-a-row','Tight span','Birthday-heavy'],
    quickdraw: ['3-in-a-row','Tight span'],
    cashpop:   [],
    digit2: [], digit3: [], digit4: [], digit5: [],
  };
  return [{ kind: 'patterns', title: 'Common Patterns', items: (PATTERNS_BY_SHAPE[meta.shape] ?? []).map(label => ({ label })) }];
}

/* ===========================
   Central REGISTRY (single source of truth)
   =========================== */

type AnyKey = GameKey | LogicalGameKey | string;

// Base helpers to DRY similar entries
const fiveNoSpecial: GameMeta = { shape:'five', hasSpecial:false, specialTone:null, tagMode:'patterns-only' };
const sixNoSpecial:  GameMeta = { shape:'six',  hasSpecial:false, specialTone:null, tagMode:'patterns-only', sixMainsNoSpecial:true };
const digits = (k: 2|3|4|5, fireball = false): GameMeta =>
  ({ shape: kToShape(k), kDigits: k, hasSpecial:false, specialTone:null, tagMode:'playtypes-only', usesFireball: fireball });
const fiveWithTone = (tone: SpecialTone): GameMeta =>
  ({ shape:'five', hasSpecial:true, specialTone:tone, tagMode:'patterns-only' });
const shapeOnly = (shape: Extract<Shape,'pick10'|'quickdraw'|'cashpop'>, tagMode: TagMode): GameMeta =>
  ({ shape, hasSpecial:false, specialTone:null, tagMode });
const nyLottoMeta: GameMeta = { shape:'six', hasSpecial:true, specialTone:'amber', tagMode:'patterns-only', isNyLotto:true };

/** Generate *_midday and *_evening variants */
function withPeriods(baseKey: string, meta: GameMeta, opts?: { preferEvening?: boolean }) {
  const m = opts?.preferEvening ? { ...meta, preferEveningWhenBoth:true } : meta;
  return {
    [`${baseKey}_midday`]:  m,
    [`${baseKey}_evening`]: m,
  } as Record<string, GameMeta>;
}

const REGISTRY: Record<string, GameMeta> = {
  // ----- Multi-state (5 + colored special) -----
  multi_powerball:    fiveWithTone('red'),
  multi_megamillions: fiveWithTone('blue'),
  multi_cash4life:    fiveWithTone('green'),

  // ----- GA -----
  ga_fantasy5:        { ...fiveNoSpecial },

  // ----- California classic draws -----
  ca_superlotto_plus: fiveWithTone('amber'),
  ca_fantasy5:        { ...fiveNoSpecial },

  // ----- California digits -----
  // Daily 3: twice-daily (prefer evening when both/all)
  ...withPeriods('ca_daily3', digits(3, false), { preferEvening: true }),
  // Daily 4: single daily file (no midday/evening split)
  ca_daily4:          digits(4, false),

  // ----- Florida classic draws -----
  ...withPeriods('fl_fantasy5', fiveNoSpecial, { preferEvening: true }),
  fl_lotto:                { ...sixNoSpecial },
  fl_jackpot_triple_play:  { ...sixNoSpecial },

  // ----- Florida digits (Fireball) -----
  ...withPeriods('fl_pick2', digits(2, true)),
  ...withPeriods('fl_pick3', digits(3, true)),
  ...withPeriods('fl_pick4', digits(4, true)),
  ...withPeriods('fl_pick5', digits(5, true)),

  // ----- Florida Cash Pop -----
  fl_cashpop:         shapeOnly('cashpop','patterns-only'),

  // ----- New York underlying (file-backed) -----
  ny_nylotto:         nyLottoMeta,
  ...withPeriods('ny_numbers', digits(3, false)),
  ...withPeriods('ny_win4',   digits(4, false)),
  ny_pick10:          shapeOnly('pick10','patterns-only'),
  ...withPeriods('ny_take5',  { ...fiveNoSpecial }, { preferEvening: true }),
  ny_quick_draw:      shapeOnly('quickdraw','light-patterns'),

  // ----- New York representative (UI/analysis) -----
  ny_take5:           { ...fiveNoSpecial, preferEveningWhenBoth:true },
  ny_numbers:         digits(3, false),
  ny_win4:            digits(4, false),
  ny_lotto:           nyLottoMeta,
  ny_quick_draw_rep:  shapeOnly('quickdraw','light-patterns'),
  ny_pick10_rep:      shapeOnly('pick10','patterns-only'),
};

type FuzzyRule = { test: (k: string) => boolean; meta: GameMeta | ((k: string) => GameMeta) };
const FUZZY: FuzzyRule[] = [
  { test: k => /pick5/.test(k), meta: k => digits(5, k.startsWith('fl_')) },
  { test: k => /pick4/.test(k), meta: k => digits(4, k.startsWith('fl_')) },
  { test: k => /pick3/.test(k), meta: k => digits(3, k.startsWith('fl_')) },
  { test: k => /pick2/.test(k), meta: k => digits(2, k.startsWith('fl_')) },
  { test: k => /(take5|fantasy5)/.test(k), meta: { ...fiveNoSpecial, preferEveningWhenBoth:true } },
  { test: k => /daily3/.test(k),           meta: digits(3, false) },
  { test: k => /daily4/.test(k),           meta: digits(4, false) },
  { test: k => /(quick[_ ]?draw)/.test(k), meta: shapeOnly('quickdraw','light-patterns') },
  { test: k => /pick10/.test(k),           meta: shapeOnly('pick10','patterns-only') },
  { test: k => /(lotto|jackpot_triple_play)/.test(k), meta: { ...sixNoSpecial } },
  { test: k => /powerball/.test(k),        meta: fiveWithTone('red') },
  { test: k => /mega/.test(k),             meta: fiveWithTone('blue') },
  { test: k => /cash4life/.test(k),        meta: fiveWithTone('green') },
  { test: k => /cashpop/.test(k),          meta: shapeOnly('cashpop','patterns-only') },
];
function fuzzyFallback(key: string | undefined): GameMeta | null {
  if (!key) return null;
  const k = normKey(key);
  for (const r of FUZZY) {
    if (r.test(k)) return typeof r.meta === 'function' ? r.meta(k) : r.meta;
  }
  return null;
}

/* ===========================
   Resolver
   =========================== */

/**
 * Resolve meta for either a canonical GameKey or a LogicalGameKey (or plain string).
 * - Prefer `logical` when provided.
 * - Safe, opinionated defaults on unknowns.
 */
export function resolveGameMeta(
  game?: GameKey | string,
  logical?: LogicalGameKey | string,
): GameMeta {
  const key = (logical || game) as AnyKey | undefined;
  if (key && REGISTRY[key]) return REGISTRY[key];

  const fallback = fuzzyFallback(key as string);
  if (fallback) return fallback;

  // ultra-safe default: 5-ball, no special, pattern tags
  return { ...fiveNoSpecial };
}

/* ===========================
   Cross-file helpers (shared by UI/analysis components)
   =========================== */

/**
 * Shared odds/era representative for logical games.
 * Keeps CURRENT_ERA/jackpot-odds lookups consistent across files.
 */
export function repForLogical(lg: LogicalGameKey, meta: GameMeta): CanonicalDrawGame {
  if (meta.isNyLotto) return 'ny_lotto' as CanonicalDrawGame;           // NY Lotto era (6 + Bonus)
  if (lg === 'ny_take5') return 'ny_take5' as CanonicalDrawGame;         // Take 5 era
  if (String(lg).startsWith('fl_')) return 'fl_fantasy5_evening' as CanonicalDrawGame; // FL anchor
  // California logicals (digits) need a canonical representative for odds/era anchor
  if (lg === 'ca_daily3' || lg === 'ca_daily4') return 'ca_fantasy5' as CanonicalDrawGame;
  // Multistate logicals are already canonical
  return lg as unknown as CanonicalDrawGame;
}

/**
 * Returns a digit logical key accepted by fetchDigitRowsFor, or null if not derivable.
 * Accepts either canonical FL pick* keys (midday/evening) or digit logicals directly.
 */
export function digitLogicalFor(
  game?: GameKey | string,
  logical?: LogicalGameKey | string
): 'ny_numbers'|'ny_win4'|'fl_pick5'|'fl_pick4'|'fl_pick3'|'fl_pick2' | null {
  const key = String(logical ?? game ?? '');
  switch (key) {
    case 'ny_numbers': return 'ny_numbers';
    case 'ny_win4':    return 'ny_win4';
    case 'fl_pick5':   return 'fl_pick5';
    case 'fl_pick4':   return 'fl_pick4';
    case 'fl_pick3':   return 'fl_pick3';
    case 'fl_pick2':   return 'fl_pick2';
    // California digit logicals are supported by fetchDigitRowsFor
    case 'ca_daily3':  return 'ca_daily3' as any;
    case 'ca_daily4':  return 'ca_daily4' as any;
  }
  // Derive from canonical FL keys with period suffixes
  if (key.startsWith('fl_pick5')) return 'fl_pick5';
  if (key.startsWith('fl_pick4')) return 'fl_pick4';
  if (key.startsWith('fl_pick3')) return 'fl_pick3';
  if (key.startsWith('fl_pick2')) return 'fl_pick2';
  // Derive from canonical CA keys
  if (key.startsWith('ca_daily3')) return 'ca_daily3' as any;
  if (key.startsWith('ca_daily4')) return 'ca_daily4' as any;
  return null;
}

// Add near other helpers
export function qdHas3Run(values: number[]): boolean {
  if (values.length < 3) return false;
  const a = [...values].sort((x,y)=>x-y);
  for (let i=2;i<a.length;i++){
    if (a[i-2]+2===a[i-1]+1 && a[i-1]+1===a[i]) return true;
  }
  return false;
}
export function qdIsTight(values: number[], domainMax=80): boolean {
  if (!values.length) return false;
  const a = [...values].sort((x,y)=>x-y);
  const span = a[a.length-1] - a[0];
  const k = values.length;
  const limit = Math.ceil(domainMax / Math.max(8, k+2));
  return span <= limit;
}

export function playTypeLabelsForDigits(digits: number[], meta: GameMeta): string[] {
  if (!isDigitShape(meta.shape) || !meta.kDigits) return [];
  const k = meta.kDigits;
  const out: string[] = [];
  const st = straightOnlyLabel(digits, k);
  const bx = boxVariantLabel(digits, k);
  if (st) out.push(st);
  if (bx) out.push(bx);
  return out;
}

export function isGenerationReady(meta: GameMeta, deps: {
  rowsEra?: unknown[] | null;
  digitStats?: unknown | null;
  p10Stats?: unknown | null;
  qdStats?: unknown | null;
  cpCounts?: unknown | null;
}): boolean {
  if (isDigitShape(meta.shape)) return !!deps.digitStats;
  if (meta.shape === 'pick10')  return !!deps.p10Stats;
  if (meta.shape === 'quickdraw') return !!deps.qdStats;
  if (meta.shape === 'cashpop') return !!deps.cpCounts;
  // five/six
  return Array.isArray(deps.rowsEra) && deps.rowsEra.length > 0;
}

export function eraConfigFor(meta: GameMeta, eraCfg: any) {
  if (meta.sixMainsNoSpecial && eraCfg) return { ...eraCfg, specialMax: 0 };
  return eraCfg;
}



/* ===========================
   Dev-only validation helpers
   =========================== */

function inDev(): boolean {
  // Both in Node and browser builds: rely on process.env when present
  try {
    // @ts-ignore
    return typeof process !== 'undefined' && process?.env?.NODE_ENV !== 'production';
  } catch { return false; }
}

/** Assert that every known key resolves, and digit shapes have kDigits. */
export function validateRegistry(): void {
  // The unions are compile-time only; we validate the *values we know* in REGISTRY.
  const keys = Object.keys(REGISTRY);
  const problems: string[] = [];
  for (const k of keys) {
    const meta = resolveGameMeta(k as any);
    if (!meta) problems.push(`No meta for ${k}`);
    if (isDigitShape(meta.shape) && !meta.kDigits) problems.push(`Digit meta missing kDigits for ${k}`);
  }
  if (problems.length) {
    // eslint-disable-next-line no-console
    console.warn('GameRegistry validation issues:\n' + problems.map(s => ' - '+s).join('\n'));
  }
}

// Run a lightweight self-check in dev builds once on import
if (inDev()) validateRegistry();
