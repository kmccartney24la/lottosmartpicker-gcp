import type { GameKey, LogicalGameKey, UnderlyingKey, ScheduleGame, Period } from './lotto/types.js';
type CanonicalDrawGame = GameKey;
export type Shape = 'five' | 'six' | 'digit2' | 'digit3' | 'digit4' | 'digit5' | 'pick10' | 'quickdraw' | 'cashpop' | 'allornothing';
export type SpecialTone = 'red' | 'blue' | 'green' | 'amber' | null;
export type TagMode = 'patterns-only' | 'playtypes-only' | 'light-patterns';
export interface GameMeta {
    shape: Shape;
    kDigits?: 2 | 3 | 4 | 5;
    hasSpecial: boolean;
    specialTone: SpecialTone;
    usesFireball?: boolean;
    tagMode: TagMode;
    preferEveningWhenBoth?: boolean;
    sixMainsNoSpecial?: boolean;
    isNyLotto?: boolean;
    /**
     * Some 5-style games actually draw fewer than 5 mains (e.g. TX Two Step = 4 + Bonus).
     * Let callers + era logic override the main-pick this way.
     */
    mainPickOverride?: 4 | 5 | 6;
}
/** Legend config consumed by HintLegend (UI-agnostic) */
export type LegendItem = {
    label: string;
    children?: string[];
};
export type LegendGroup = {
    kind: 'playtypes';
    title: 'Play Types';
    items: LegendItem[];
} | {
    kind: 'patterns';
    title: 'Common Patterns';
    items: LegendItem[];
};
/** Narrow helper: is a digit shape? */
export declare function isDigitShape(shape: Shape): shape is 'digit2' | 'digit3' | 'digit4' | 'digit5';
/** Tag policy convenience */
export declare function usesPlayTypeTags(meta: GameMeta): boolean;
export declare function hasColoredSpecial(meta: GameMeta): boolean;
export declare function specialToneClass(meta: GameMeta): string;
export declare function specialLabel(meta: GameMeta, game?: string): string;
export type AnyPeriod = Extract<Period, 'midday' | 'evening' | 'both' | 'all'>;
export declare function effectivePeriod(meta: GameMeta, requested?: AnyPeriod): AnyPeriod;
/**
 * Coerce an unknown period (e.g., app-level Period) into AnyPeriod understood by the registry.
 * Returns undefined when not coercible, allowing effectivePeriod to apply defaults.
 */
export declare function coerceAnyPeriod(p?: unknown): AnyPeriod | undefined;
export declare function filterHintsForGame(meta: GameMeta, labels: string[]): string[];
export declare function bonusMustDifferFromMains(meta: GameMeta): boolean;
/** UI modes the sidebar knows how to render */
export type SidebarMode = 'five' | 'digits' | 'pick10' | 'quickdraw' | 'ny_lotto' | 'cashpop';
/** Map meta + optional payload kind → a concrete rendering mode */
export declare function sidebarModeFor(meta: GameMeta, payloadKind?: string): SidebarMode;
/** Header label for the numbers column */
export declare function sidebarHeaderLabel(meta: GameMeta, mode: SidebarMode): 'Numbers' | 'Digits';
/**
 * Decide how (and whether) to show a "special" bubble for a row.
 * - NY Lotto: show Bonus only if it's not one of the mains.
 * - Colored special games: show colored special when present.
 * - Fireball: caller passes specialLabelOverride='Fireball' to force Fireball styling.
 */
export declare function sidebarSpecialForRow(args: {
    meta: GameMeta;
    mains: number[];
    special?: number;
    gameStr?: string;
    specialLabelOverride?: string;
}): {
    special?: number;
    sep: boolean;
    label?: string;
    className?: string;
};
/** Special label — wrapper to keep naming consistent from one import */
export declare function sidebarSpecialLabel(meta: GameMeta, gameStr?: string): string;
/** Robust date key for sorting (ms since epoch). Accepts ISO and US formats. */
export declare function sidebarDateKey(s: string): number;
/** Minimal structural row for classic 5/6 games (keeps registry decoupled from LottoRow). */
export type FiveLikeRow = {
    n1?: number;
    n2?: number;
    n3?: number;
    n4?: number;
    n5?: number;
    special?: number;
};
/** Choose how many mains to show for a five/six style game (era-aware, NY/FL six-mains aware). */
export declare function mainPickFor(meta: GameMeta, eraCfg?: {
    mainPick?: number;
}): number;
/**
 * Build a normalized "five-like" view from a raw row, applying:
 *  - six-mains rule (FL LOTTO/JTP, NY Lotto)
 *  - special bubble decision/label/tone (incl. NY Bonus rule)
 */
export declare function rowToFiveView(row: FiveLikeRow, meta: GameMeta, opts?: {
    gameStr?: string;
    eraCfg?: {
        mainPick?: number;
    };
}): {
    mains: number[];
    special?: number;
    sep: boolean;
    label?: string;
    className?: string;
};
/** Return k for digit shapes directly from meta; null for non-digit games. */
export declare function digitsKFor(meta: GameMeta): 2 | 3 | 4 | 5 | null;
/** Authoritative k for a digit logical (delegates to lotto/digits.ts). */
export declare function kDigitsForLogical(logical?: LogicalGameKey): 2 | 3 | 4 | 5 | null;
/**
 * Convenience: derive digit k from either a logical or a canonical key string.
 * - If it looks like a logical digit key, uses lotto/digits.ts mapping.
 * - Otherwise returns null (non-digit or unknown).
 */
export declare function digitsKForKey(gameOrLogical?: string): 2 | 3 | 4 | 5 | null;
export type OverviewFamily = 'fl_cashpop' | 'ny_pick10' | 'ny_quick_draw' | 'ny_take5' | 'digits_ny_numbers' | 'digits_ny_win4' | 'digits_fl_pick2' | 'digits_fl_pick3' | 'digits_fl_pick4' | 'digits_fl_pick5' | 'fl_fantasy5' | 'fl_lotto' | 'fl_jtp' | 'tx_all_or_nothing' | 'tx_lotto_texas' | 'tx_texas_two_step' | 'digits_tx_daily4' | 'digits_tx_pick3' | 'generic';
/** High-level mode used by the Overview fetch/render pipeline */
export type OverviewMode = 'digits' | 'pick10' | 'quickdraw' | 'cashpop' | 'fiveSix';
/** Plan that tells the UI exactly how to behave for Overview */
export type OverviewPlan = {
    mode: OverviewMode;
    /**
     * Key to use for schedule/next-draw labels.
     * Accepts ScheduleGame or weekly/daily customs supported by schedule.ts (e.g., ny_lotto, tx_lotto_texas).
     */
    labelKey: ScheduleGame | Extract<GameKey | LogicalGameKey, 'ny_lotto' | 'ny_pick10' | 'fl_lotto' | 'fl_jackpot_triple_play' | 'tx_lotto_texas' | 'tx_texas_two_step' | 'tx_cash5'>;
    /** Header/display name key (usually same as labelKey for digits; otherwise page game). */
    headerKey: GameKey | UnderlyingKey;
    /** Effective period chosen (evening wins when both/all if policy says so) */
    effPeriod: AnyPeriod;
    /** Representative canonical to compute odds/era for logical five/six games */
    repKey?: CanonicalDrawGame;
    /** Digit logical accepted by digit fetchers, when mode==='digits' */
    digitLogical?: 'ny_numbers' | 'ny_win4' | 'fl_pick2' | 'fl_pick3' | 'fl_pick4' | 'fl_pick5' | 'ca_daily3' | 'ca_daily4' | 'tx_pick3' | 'tx_daily4';
    /** k for digit games, if applicable */
    kDigits?: 2 | 3 | 4 | 5;
    /** Overview family for “How to play” content selection */
    family: OverviewFamily;
};
/**
 * Decide the overview family once, centrally.
 * This replaces GameOverview.gameFamily().
 */
export declare function overviewFamilyFor(game?: GameKey | string, logical?: LogicalGameKey | string): OverviewFamily;
/**
 * Compute the canonical key used for labels/schedule given a (game, logical, period).
 * Mirrors the ad-hoc logic that used to live in GameOverview.
 */
export declare function labelKeyFor(game: GameKey, logical?: LogicalGameKey, period?: AnyPeriod): OverviewPlan['labelKey'];
/** Header/display should follow the selected digit game; otherwise the page game. */
export declare function headerKeyFor(game: GameKey, logical?: LogicalGameKey, period?: AnyPeriod): GameKey | UnderlyingKey;
/**
 * Human-friendly schedule summary, e.g.:
 *  - "Daily · Midday & Evening"
 *  - "Tue/Fri ≈11:00 PM ET"
 * Delegates to schedule.ts (authoritative).
 */
export declare function drawScheduleSummary(key: GameKey | LogicalGameKey, now?: Date): string;
/**
 * Label for the next draw time in local tz, e.g. "Wed 6:30 PM PT" or "Sat ≈11:00 PM ET".
 * Delegates to schedule.ts (authoritative).
 */
export declare function nextDrawLabelForKey(key: GameKey | LogicalGameKey, now?: Date): string;
/**
 * True if we are within ±90 minutes of the local draw time on a valid draw day.
 * Delegates to schedule.ts (authoritative).
 */
export declare function isInDrawWindow(key: GameKey | LogicalGameKey, now?: Date): boolean;
/** Convenience for Overview: get both schedule labels from an OverviewPlan. */
export declare function scheduleLabelsFor(plan: OverviewPlan, now?: Date): {
    summary: string;
    next: string;
};
/** One-stop “plan” for the Overview component. */
export declare function overviewPlanFor(game: GameKey, logical?: LogicalGameKey, period?: AnyPeriod): OverviewPlan;
/** Data-only “How to play” steps (kept UI-agnostic). */
export declare function overviewStepsFor(family: OverviewFamily, meta: GameMeta): string[];
/**
 * Friendly name for the header line in GameOverview.
 * Keeps display names consistent across the app.
 */
export declare function displayNameFor(game: GameKey | string): string;
/**
 * High-level play types shown for a game/logical (jurisdiction-aware).
 * We keep this conservative and uniform across digit games:
 * - FL Pick2/3/4/5: Straight, Box (no Wheel/Combo)
 * - NY Numbers/Win4: Straight, Box (you can extend later if needed)
 *
 * Non-digit shapes return [].
 */
export declare function playTypesFor(gameOrLogical?: string): string[];
/**
 * Children labels for Box by digit k.
 */
export declare function subVariantsFor(gameOrLogical: string | undefined, parent: string): string[];
/**
 * Returns exactly one group for the selected game:
 *  - Digit shapes -> { kind: 'playtypes', title: 'Play Types', items: [...] }
 *  - Non-digit    -> { kind: 'patterns',  title: 'Common Patterns', items: [...] }
 *
 * Note: We don't import HINT_EXPLAIN here to keep registry pure;
 * the renderer can filter labels not present in HINT_EXPLAIN.
 */
export declare function legendGroupsFor(meta: GameMeta, opts?: {
    gameStr?: string;
}): LegendGroup[];
/**
 * Resolve meta for either a canonical GameKey or a LogicalGameKey (or plain string).
 * - Prefer `logical` when provided.
 * - Safe, opinionated defaults on unknowns.
 */
export declare function resolveGameMeta(game?: GameKey | string, logical?: LogicalGameKey | string): GameMeta;
/**
 * Shared odds/era representative for logical games.
 * Keeps CURRENT_ERA/jackpot-odds lookups consistent across files.
 */
export declare function repForLogical(lg: LogicalGameKey, meta: GameMeta): CanonicalDrawGame;
/**
 * Returns a digit logical key accepted by fetchDigitRowsFor, or null if not derivable.
 * Accepts either canonical FL pick* keys (midday/evening) or digit logicals directly.
 */
export declare function digitLogicalFor(game?: GameKey | string, logical?: LogicalGameKey | string): 'ny_numbers' | 'ny_win4' | 'fl_pick5' | 'fl_pick4' | 'fl_pick3' | 'fl_pick2' | 'ca_daily3' | 'ca_daily4' | 'tx_pick3' | 'tx_daily4' | null;
export declare function qdHas3Run(values: number[]): boolean;
export declare function qdIsTight(values: number[], domainMax?: number): boolean;
export declare function playTypeLabelsForDigits(digits: number[], meta: GameMeta): string[];
export declare function isGenerationReady(meta: GameMeta, deps: {
    rowsEra?: unknown[] | null;
    digitStats?: unknown | null;
    p10Stats?: unknown | null;
    qdStats?: unknown | null;
    aonStats?: unknown | null;
    cpCounts?: unknown | null;
}): boolean;
export declare function eraConfigFor(meta: GameMeta, eraCfg: any): any;
/** Assert that every known key resolves, and digit shapes have kDigits. */
export declare function validateRegistry(): void;
export {};
