// Use canonical digit helpers from lotto/digits
// If your package entrypoint already re-exports these, you can import from '@lsp/lib' instead.
import { digitKFor as libDigitKFor, boxVariantLabel as libBoxVariantLabel, straightOnlyLabel as libStraightOnlyLabel, } from './lotto/digits.js';
import { drawNightsLabel as schedDrawNightsLabel, isInDrawWindowFor as schedIsInDrawWindowFor, nextDrawLabelFor as schedNextDrawLabelFor, WEEKLY_CUSTOM_KEYS, } from './lotto/schedule.js';
/** Build a "<N>-Way Box" string (kept local to avoid entrypoint coupling). */
function wayLabel(n, base = 'Box') {
    return `${n}-Way ${base}`;
}
/** Map k → Shape for digit games. */
function kToShape(k) {
    return ('digit' + k);
}
/* ===========================
   Internal helpers
   =========================== */
/** Normalize keys and cheap jurisdiction flags */
function normKey(k) { return String(k ?? '').toLowerCase(); }
function flagsFor(key) {
    const k = normKey(key);
    return {
        isFL: k.startsWith('fl_') || k.includes('florida'),
        isNY: k.startsWith('ny_') || k.includes('new_york'),
        isCA: k.startsWith('ca_') || k.includes('california'),
        isTX: k.startsWith('tx_') || k.includes('texas'),
    };
}
/** Narrow helper: is a digit shape? */
export function isDigitShape(shape) {
    return shape.startsWith('digit');
}
/** Tag policy convenience */
export function usesPlayTypeTags(meta) {
    return meta.tagMode === 'playtypes-only';
}
// 1) Colored special presence + class
export function hasColoredSpecial(meta) {
    return !!(meta.hasSpecial && !meta.sixMainsNoSpecial && !meta.isNyLotto);
}
const TONE_CLASS = {
    red: 'num-bubble--red',
    blue: 'num-bubble--blue',
    green: 'num-bubble--green',
    amber: 'num-bubble--amber',
};
export function specialToneClass(meta) {
    return meta.specialTone ? TONE_CLASS[meta.specialTone] : 'num-bubble--amber';
}
// 2) Special bubble label
export function specialLabel(meta, game) {
    if (meta.isNyLotto)
        return 'Bonus';
    const g = normKey(game);
    const SPECIAL_LABEL_BY_SUBSTR = [
        ['powerball', 'Powerball'],
        ['megamillions', 'Mega Ball'],
        ['cash4life', 'Cash Ball'],
        // California SuperLotto Plus uses a "Mega" number (not Mega Millions)
        ['superlotto', 'Mega'],
        // Texas Two Step uses a Bonus Ball
        // keep both needles to be resilient to future key variations
        ['two_step', 'Bonus Ball'],
        ['texas_two_step', 'Bonus Ball'],
    ];
    for (const [needle, label] of SPECIAL_LABEL_BY_SUBSTR) {
        if (g.includes(needle))
            return label;
    }
    return 'Special';
}
export function effectivePeriod(meta, requested) {
    if (!requested)
        return meta.preferEveningWhenBoth ? 'evening' : 'evening';
    if ((requested === 'both' || requested === 'all') && meta.preferEveningWhenBoth)
        return 'evening';
    return requested;
}
/**
 * Coerce an unknown period (e.g., app-level Period) into AnyPeriod understood by the registry.
 * Returns undefined when not coercible, allowing effectivePeriod to apply defaults.
 */
export function coerceAnyPeriod(p) {
    return (p === 'midday' || p === 'evening' || p === 'both' || p === 'all')
        ? p
        : undefined;
}
// 4) Filter hints if no colored special
export function filterHintsForGame(meta, labels) {
    if (hasColoredSpecial(meta))
        return labels;
    return labels.filter(h => h !== 'Hot special' && h !== 'Cold special');
}
// 5) NY Lotto rule: bonus ≠ mains
export function bonusMustDifferFromMains(meta) {
    return !!meta.isNyLotto;
}
/** Map meta + optional payload kind → a concrete rendering mode */
export function sidebarModeFor(meta, payloadKind) {
    if (payloadKind)
        return payloadKind;
    if (meta.isNyLotto)
        return 'ny_lotto';
    const byShape = {
        cashpop: 'cashpop',
        pick10: 'pick10',
        quickdraw: 'quickdraw',
        allornothing: 'quickdraw', // render like multi-number lists
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
export function sidebarHeaderLabel(meta, mode) {
    if (mode === 'digits' || mode === 'cashpop')
        return 'Digits';
    return 'Numbers';
}
/**
 * Decide how (and whether) to show a "special" bubble for a row.
 * - NY Lotto: show Bonus only if it's not one of the mains.
 * - Colored special games: show colored special when present.
 * - Fireball: caller passes specialLabelOverride='Fireball' to force Fireball styling.
 */
export function sidebarSpecialForRow(args) {
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
export function sidebarSpecialLabel(meta, gameStr) {
    return specialLabel(meta, gameStr);
}
/** Robust date key for sorting (ms since epoch). Accepts ISO and US formats. */
export function sidebarDateKey(s) {
    if (!s)
        return 0;
    const t = s.trim();
    if (/^\d{4}-\d{2}-\d{2}/.test(t)) {
        const n = Date.parse(t);
        return Number.isFinite(n) ? n : 0;
    }
    if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(t)) {
        const [m, d, y] = t.split('/').map(Number);
        const yy = (y ?? 0) < 100 ? 2000 + (y ?? 0) : (y ?? 0);
        const n = new Date(yy, (m ?? 1) - 1, d ?? 1).getTime();
        return Number.isFinite(n) ? n : 0;
    }
    const n = Date.parse(t);
    return Number.isFinite(n) ? n : 0;
}
/** Choose how many mains to show for a five/six style game (era-aware, NY/FL six-mains aware). */
export function mainPickFor(meta, eraCfg) {
    // Explicit override always wins
    if (meta.mainPickOverride)
        return meta.mainPickOverride;
    // 6-main styles
    if (meta.sixMainsNoSpecial || meta.isNyLotto)
        return 6;
    const fallback = typeof eraCfg?.mainPick === 'number' ? eraCfg.mainPick : 5;
    return Math.max(1, Math.min(6, fallback || 5));
}
/**
 * Build a normalized "five-like" view from a raw row, applying:
 *  - six-mains rule (FL LOTTO/JTP, NY Lotto)
 *  - special bubble decision/label/tone (incl. NY Bonus rule)
 */
export function rowToFiveView(row, meta, opts) {
    const base = [row.n1, row.n2, row.n3, row.n4, row.n5].filter(n => Number.isFinite(n));
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
export function digitsKFor(meta) {
    if (!isDigitShape(meta.shape))
        return null;
    // Prefer explicit meta.kDigits, but if missing, fall back to library mapping
    // by inferring a logical from our context where possible.
    return (meta.kDigits ?? null);
}
/** Authoritative k for a digit logical (delegates to lotto/digits.ts). */
export function kDigitsForLogical(logical) {
    if (!logical)
        return null;
    try {
        return libDigitKFor(logical);
    }
    catch {
        return null;
    }
}
/**
 * Convenience: derive digit k from either a logical or a canonical key string.
 * - If it looks like a logical digit key, uses lotto/digits.ts mapping.
 * - Otherwise returns null (non-digit or unknown).
 */
export function digitsKForKey(gameOrLogical) {
    if (!gameOrLogical)
        return null;
    const s = gameOrLogical.toLowerCase();
    // Recognize known logical digit families
    if (s.startsWith('ny_numbers'))
        return kDigitsForLogical('ny_numbers');
    if (s.startsWith('ny_win4'))
        return kDigitsForLogical('ny_win4');
    if (s.startsWith('fl_pick'))
        return kDigitsForLogical(s.includes('pick5') ? 'fl_pick5' : s.includes('pick4') ? 'fl_pick4' : s.includes('pick3') ? 'fl_pick3' : 'fl_pick2');
    if (s.startsWith('ca_daily3'))
        return kDigitsForLogical('ca_daily3');
    if (s.startsWith('ca_daily4'))
        return kDigitsForLogical('ca_daily4');
    if (s.startsWith('tx_pick3'))
        return kDigitsForLogical('tx_pick3');
    if (s.startsWith('tx_daily4'))
        return kDigitsForLogical('tx_daily4');
    return null;
}
/**
 * Decide the overview family once, centrally.
 * This replaces GameOverview.gameFamily().
 */
export function overviewFamilyFor(game, logical) {
    const meta = resolveGameMeta(game, logical);
    const g = normKey(game);
    const lg = normKey(logical);
    // Shape-led routing
    if (meta.shape === 'cashpop')
        return 'fl_cashpop';
    if (meta.shape === 'pick10')
        return 'ny_pick10';
    if (meta.shape === 'quickdraw')
        return 'ny_quick_draw';
    if (meta.shape === 'allornothing')
        return 'ny_pick10'; // closest existing content
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
    if (lg.startsWith('ny_take5') || g.includes('ny_take5'))
        return 'ny_take5';
    if (lg.startsWith('fl_fantasy5') || g.startsWith('fl_fantasy5'))
        return 'fl_fantasy5';
    if (lg.startsWith('fl_cashpop') || g.startsWith('fl_cashpop'))
        return 'fl_cashpop';
    if (g === 'fl_lotto' || lg.startsWith('fl_lotto') || g.includes('fl_lotto'))
        return 'fl_lotto';
    if (g.includes('jackpot_triple_play') || lg.includes('jackpot_triple_play'))
        return 'fl_jtp';
    if (g.includes('tx_all_or_nothing'))
        return 'tx_all_or_nothing';
    // Texas-specific draw games
    if (g.includes('tx_lotto_texas'))
        return 'tx_lotto_texas';
    if (g.includes('tx_texas_two_step'))
        return 'tx_texas_two_step';
    // Texas digits
    if (g.includes('tx_daily4'))
        return 'digits_tx_daily4';
    if (g.includes('tx_pick3'))
        return 'digits_tx_pick3';
    return 'generic';
}
/**
 * Compute the canonical key used for labels/schedule given a (game, logical, period).
 * Mirrors the ad-hoc logic that used to live in GameOverview.
 */
export function labelKeyFor(game, logical, period) {
    const meta = resolveGameMeta(game, logical);
    const k = (logical ?? game);
    const s = (x) => x.toLowerCase();
    const { isNY, isFL, isCA, isTX } = flagsFor(k);
    // If the page game itself is a known schedule game, use it directly.
    const SCHEDULE_SET = new Set([
        'multi_powerball',
        'multi_megamillions',
        'multi_cash4life',
        'ga_fantasy5',
        'ca_superlotto_plus',
        'ca_fantasy5',
        'fl_fantasy5',
        'ny_take5',
    ]);
    if (SCHEDULE_SET.has(game))
        return game;
    // Weekly/single-daily customs — use canonical keys from schedule.ts
    if (WEEKLY_CUSTOM_KEYS.has(game))
        return game;
    if (logical && WEEKLY_CUSTOM_KEYS.has(logical))
        return logical;
    // Otherwise, pick a jurisdiction-appropriate daily representative that schedule.ts knows.
    // Digits/quickdraw/cashpop (and unknowns) proxy to a daily family for “Draw schedule”/“Next expected”.
    if (isNY)
        return 'ny_take5';
    if (isFL)
        return 'fl_fantasy5';
    if (isCA) {
        // Prefer SLP for variety if the logical mentions it, else Fantasy 5.
        return s(k).includes('superlotto') ? 'ca_superlotto_plus' : 'ca_fantasy5';
    }
    if (s(k).startsWith('ga_'))
        return 'ga_fantasy5';
    // Texas shapes that aren't in CUSTOM_SET fall back to a daily multi-state label.
    // Cash4Life is daily and reasonable for generic “Next expected” phrasing.
    if (s(k).startsWith('tx_'))
        return 'multi_cash4life';
    // Final fallback: multistate daily schedule.
    return 'multi_cash4life';
}
/** Header/display should follow the selected digit game; otherwise the page game. */
export function headerKeyFor(game, logical, period) {
    const meta = resolveGameMeta(game, logical);
    if (logical && isDigitShape(meta.shape))
        return labelKeyFor(game, logical, period);
    return game;
}
/* ===========================
   Schedule wrappers (delegates to lotto/schedule.ts)
   =========================== */
/**
 * Human-friendly schedule summary, e.g.:
 *  - "Daily · Midday & Evening"
 *  - "Tue/Fri ≈11:00 PM ET"
 * Delegates to schedule.ts (authoritative).
 */
export function drawScheduleSummary(key, now = new Date()) {
    return schedDrawNightsLabel(key, now);
}
/**
 * Label for the next draw time in local tz, e.g. "Wed 6:30 PM PT" or "Sat ≈11:00 PM ET".
 * Delegates to schedule.ts (authoritative).
 */
export function nextDrawLabelForKey(key, now = new Date()) {
    return schedNextDrawLabelFor(key, now);
}
/**
 * True if we are within ±90 minutes of the local draw time on a valid draw day.
 * Delegates to schedule.ts (authoritative).
 */
export function isInDrawWindow(key, now = new Date()) {
    return schedIsInDrawWindowFor(key, now);
}
/** Convenience for Overview: get both schedule labels from an OverviewPlan. */
export function scheduleLabelsFor(plan, now = new Date()) {
    const key = plan.labelKey;
    return { summary: drawScheduleSummary(key, now), next: nextDrawLabelForKey(key, now) };
}
/** One-stop “plan” for the Overview component. */
export function overviewPlanFor(game, logical, period) {
    const meta = resolveGameMeta(game, logical);
    const eff = effectivePeriod(meta, coerceAnyPeriod(period));
    const family = overviewFamilyFor(game, logical);
    const labelKey = labelKeyFor(game, logical, eff);
    const headerKey = headerKeyFor(game, logical, eff);
    // Mode detection driven entirely by meta.shape
    if (isDigitShape(meta.shape)) {
        const lg = digitLogicalFor(game, logical); // guarded by isDigitShape
        return {
            mode: 'digits',
            labelKey,
            headerKey,
            effPeriod: eff,
            digitLogical: lg,
            // Prefer meta.kDigits, but backstop with the library’s mapping to avoid drift.
            kDigits: (meta.kDigits ?? kDigitsForLogical(lg)),
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
export function overviewStepsFor(family, meta) {
    //
    // ===== MULTISTATE / COMMON 5+SPECIAL =====
    //
    if (family === 'generic' && meta.shape === 'five' && meta.hasSpecial) {
        return [
            'Pick five (5) numbers from the game’s main pool.',
            'Pick one (1) special ball (name varies by game).',
            'Match all five main numbers and the special ball to win the jackpot.',
            'Lower-tier prizes are available for matching some of the numbers.',
        ];
    }
    // Powerball-style
    if (family === 'generic' && String(meta.specialTone ?? '').length) {
        return [
            'Pick the required main numbers from the main pool.',
            'Pick the special ball (Powerball, Mega Ball, Cash Ball, or similar).',
            'Match all mains + the special to win the top prize.',
            'You can still win for partial matches.',
        ];
    }
    //
    // ===== TEXAS GAMES (explicitly handled) =====
    //
    // Lotto Texas
    if (family === 'tx_lotto_texas')
        return [
            'Select six (6) numbers from 1 to 54.',
            'Match 3, 4, 5, or all 6 numbers drawn to win prizes.',
            'Match all six numbers to win the jackpot.',
        ];
    // Texas Two Step
    if (family === 'tx_texas_two_step')
        return [
            'Select four (4) numbers from 1 to 35 in the main play area.',
            'Select one (1) Bonus Ball number from 1 to 35.',
            'Win by matching the Bonus Ball and some/all of your main numbers.',
            'Match all four main numbers plus the Bonus Ball to win the jackpot.',
        ];
    // Texas Cash Five (5 from 35, no special)
    if (family === 'generic' && String(meta ?? '').includes('tx_cash5')) {
        return [
            'Pick 5 numbers from the game’s range (typically 1–35).',
            'No special/bonus ball.',
            'Match 2–5 numbers to win; all 5 wins the top prize.',
        ];
    }
    // Texas All or Nothing
    if (family === 'tx_all_or_nothing')
        return [
            'Select twelve (12) numbers from 1 to 24.',
            'Twenty-four (24) numbers are drawn — you win by matching all 12 or none of the 12.',
            'Prizes are also awarded for near-misses (11 or 1, 10 or 2, 9 or 3, etc.).',
        ];
    // Texas Daily 4
    if (family === 'digits_tx_daily4')
        return [
            'Pick four (4) single-digit numbers from 0 to 9, or ask for a Quick Pick.',
            'Choose a play type: Straight (Exact Order), Box (Any Order), Straight/Box (Exact + Any), Combo, or Front/Mid/Back Pair.',
            'STRAIGHT: Match all 4 digits in exact order.',
            'BOX: Match all 4 digits in any order (prize depends on number of unique digits).',
            'COMBO: Buys every Straight combination for the digits you picked.',
            'PAIR options: Win by matching just two digits in the correct position.',
            'You may also add Fireball on Texas digits to create extra winning combinations.',
        ];
    // Texas Pick 3
    if (family === 'digits_tx_pick3')
        return [
            'Pick three (3) single-digit numbers from 0 to 9, or ask for a Quick Pick.',
            'Choose a play type: Straight, Box, Straight/Box, or Combo.',
            'STRAIGHT: Match all 3 digits in exact order.',
            'BOX: Match all 3 digits in any order.',
            'STRAIGHT/BOX: Play both exact and any for more coverage.',
            'COMBO: Buys every Straight combination of your 3 digits.',
            'You may also add Fireball on Texas digits to create extra winning combinations.',
        ];
    //
    // ===== FLORIDA / CA / NY-LIKE 5-NO-SPECIAL GAMES =====
    //
    // FL Fantasy 5
    if (family === 'fl_fantasy5')
        return [
            'Pick 5 numbers from 1–36.',
            'There is no special or bonus ball.',
            'Match 2–5 numbers to win; all 5 wins the top prize.',
            'Draws twice daily.',
        ];
    // NY Take 5
    if (family === 'ny_take5')
        return [
            'Pick 5 numbers from 1–39.',
            'No special/bonus ball.',
            'Match 2–5 numbers to win; all 5 wins the jackpot.',
            'Draws twice daily.',
        ];
    //
    // ===== CA GAMES =====
    //
    if (family === 'generic' && String(meta ?? '').includes('ca_superlotto_plus')) {
        return [
            'Pick five (5) numbers from 1–47.',
            'Pick one (1) MEGA number from 1–27.',
            'Match all 5 numbers plus the MEGA to win the jackpot.',
            'Partial matches still win prizes.',
        ];
    }
    if (family === 'generic' && String(meta ?? '').includes('ca_fantasy5')) {
        return [
            'Pick 5 numbers from the game’s range.',
            'No special/bonus ball.',
            'Match 2–5 numbers to win; all 5 wins the top prize.',
        ];
    }
    //
    // ===== FL 6-NO-SPECIAL (LOTTO / JTP) =====
    //
    if (meta.shape === 'six' && meta.sixMainsNoSpecial)
        return [
            'Pick 6 numbers from the game’s range.',
            'No special or bonus ball — all 6 drawn numbers are main numbers.',
            'Match more numbers to win bigger prizes; match all 6 to win the jackpot.',
        ];
    //
    // ===== CASH POP =====
    //
    if (family === 'fl_cashpop')
        return [
            'Pick 1 number from 1–15.',
            'Select your draw time (multiple drawings daily).',
            'Each number on your ticket gets a prize amount before the draw.',
            'Match the single winning number to win the shown prize.',
        ];
    //
    // ===== PICK 10 / QUICK DRAW =====
    //
    if (family === 'ny_pick10')
        return [
            'Pick 10 numbers from 1–80.',
            '20 numbers are drawn.',
            'Prizes depend on how many of your 10 numbers match (including a prize for 0 matches).',
        ];
    if (family === 'ny_quick_draw')
        return [
            'Choose how many Spots you want to play (1–10 usually).',
            'Select your numbers from 1–80.',
            'Each draw selects 20 numbers.',
            'Prizes depend on your Spot selection and how many matches you get.',
        ];
    //
    // ===== DIGITS (generic fallback) =====
    //
    if (isDigitShape(meta.shape)) {
        const k = meta.kDigits ?? 3;
        const core = [
            `Pick ${k} digit${k > 1 ? 's' : ''} from 0–9 (or ask for Quick Pick).`,
            'Choose a play type (Straight, Box, etc.).',
            'Choose your draw time (Midday, Evening, or as offered).',
        ];
        if (meta.usesFireball) {
            core.push('Pay extra to add FIREBALL to form extra winning combinations from the drawn numbers.');
        }
        else {
            core.push('You can cover more orderings on one ticket; cost varies by play type.');
        }
        core.push('Win by matching the drawn digits according to your chosen play type.');
        return core;
    }
    //
    // ===== LAST-RESORT GENERIC =====
    //
    return [
        'Pick the required main numbers shown for the game.',
        'If the game uses a special/bonus ball, pick that too.',
        'Match the drawn numbers to win — more matches = bigger prizes.',
    ];
}
/**
 * Friendly name for the header line in GameOverview.
 * Keeps display names consistent across the app.
 */
export function displayNameFor(game) {
    const g = String(game);
    const s = normKey(g);
    const DISPLAY_MAP = {
        multi_powerball: 'Powerball',
        multi_megamillions: 'Mega Millions',
        multi_cash4life: 'Cash4Life',
        ga_fantasy5: 'Fantasy 5',
        ca_superlotto_plus: 'SuperLotto Plus (CA)',
        ca_fantasy5: 'Fantasy 5 (CA)',
        ny_take5: 'Take 5',
        fl_lotto: 'Florida LOTTO',
        fl_jackpot_triple_play: 'Jackpot Triple Play',
        fl_cashpop: 'Cash Pop',
        tx_all_or_nothing: 'All or Nothing',
        tx_pick3: 'Pick 3',
        tx_daily4: 'Daily 4',
        tx_lotto_texas: 'Lotto Texas',
        tx_texas_two_step: 'Texas Two Step',
        tx_cash5: 'Cash Five',
    };
    const withPeriodSuffix = (key, base) => key.endsWith('_midday') ? `${base} (Midday)` :
        key.endsWith('_evening') ? `${base} (Evening)` : base;
    if (DISPLAY_MAP[g])
        return DISPLAY_MAP[g];
    if (s.startsWith('ca_daily3'))
        return withPeriodSuffix(g, 'Daily 3');
    if (s.startsWith('ca_daily4'))
        return 'Daily 4';
    if (s.includes('ny_numbers'))
        return 'Numbers';
    if (s.includes('ny_win4'))
        return 'Win 4';
    if (s.includes('ny_lotto') || s.includes('ny_nylotto'))
        return 'NY Lotto';
    if (s.includes('ny_pick10'))
        return 'Pick 10';
    if (s.includes('ny_quick_draw'))
        return 'Quick Draw';
    if (s.startsWith('fl_fantasy5'))
        return withPeriodSuffix(g, 'Fantasy 5 (FL)');
    if (s.startsWith('fl_pick2'))
        return withPeriodSuffix(g, 'Pick 2');
    if (s.startsWith('fl_pick3'))
        return withPeriodSuffix(g, 'Pick 3');
    if (s.startsWith('fl_pick4'))
        return withPeriodSuffix(g, 'Pick 4');
    if (s.startsWith('fl_pick5'))
        return withPeriodSuffix(g, 'Pick 5');
    return g; // debug-friendly fallback
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
export function playTypesFor(gameOrLogical) {
    const meta = resolveGameMeta(gameOrLogical, undefined);
    if (!isDigitShape(meta.shape))
        return [];
    // If you later need jurisdiction-specific extras (Wheel), gate on key prefix.
    return ['Straight', 'Box'];
}
/**
 * Children labels for Box by digit k.
 */
export function subVariantsFor(gameOrLogical, parent) {
    const meta = resolveGameMeta(gameOrLogical, undefined);
    if (!isDigitShape(meta.shape) || !meta.kDigits)
        return [];
    const k = meta.kDigits;
    const forBox = () => {
        switch (k) {
            case 2: return [wayLabel(2)]; // AB ↔ BA
            case 3: return [wayLabel(3), wayLabel(6)];
            case 4: return [wayLabel(4), wayLabel(6), wayLabel(12), wayLabel(24)];
            case 5: return [
                wayLabel(5), // 4+1
                wayLabel(10), // 3+2
                wayLabel(20), // 3+1+1
                wayLabel(30), // 2+2+1
                wayLabel(60), // 2+1+1+1
                wayLabel(120), // all distinct
            ];
        }
    };
    if (parent === 'Box')
        return forBox();
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
export function legendGroupsFor(meta, opts) {
    if (isDigitShape(meta.shape)) {
        const k = (meta.kDigits ?? 3);
        const BOX_CHILDREN = {
            2: ['2-Way Box'],
            3: ['3-Way Box', '6-Way Box'],
            4: ['4-Way Box', '6-Way Box', '12-Way Box', '24-Way Box'],
            5: ['5-Way Box', '10-Way Box', '20-Way Box', '30-Way Box', '60-Way Box', '120-Way Box'],
        };
        const { isFL, isNY, isCA, isTX } = flagsFor(opts?.gameStr);
        // Always start with Straight + Box
        const items = [
            { label: 'Straight' },
            { label: 'Box', children: BOX_CHILDREN[k] },
        ];
        // California digits: ONLY Straight + Box
        if (!isCA) {
            // Jurisdiction-specific extras
            if (isFL && (k === 3 || k === 4))
                items.push({ label: 'Combo' });
            if (isNY && (k === 3 || k === 4))
                items.push({ label: 'Combination' });
            // Texas digits (Daily 4 / Pick 3): reuse existing combo semantics.
            // TX's "Combo" is functionally the same idea as FL's — cover all Straight orders.
            if (isTX && (k === 3 || k === 4)) {
                items.push({ label: 'Combo' });
            }
            // Pair-style variants (keep for FL/NY where applicable, but not CA)
            if (k === 2) {
                items.push({ label: 'Front Number' }, { label: 'Back Number' });
            }
            if (k === 3) {
                items.push({ label: 'Front Pair' }, { label: 'Back Pair' });
            }
            if (k === 4) {
                items.push({ label: 'Front Pair' }, { label: 'Mid Pair' }, { label: 'Back Pair' });
            }
        }
        return [{ kind: 'playtypes', title: 'Play Types', items }];
    }
    const PATTERNS_BY_SHAPE = {
        five: ['3-in-a-row', '4-in-a-row', 'Arithmetic sequence', 'Birthday-heavy', 'Tight span'],
        six: ['3-in-a-row', '4-in-a-row', 'Arithmetic sequence', 'Birthday-heavy', 'Tight span'],
        pick10: ['3-in-a-row', 'Tight span', 'Birthday-heavy'],
        quickdraw: ['3-in-a-row', 'Tight span'],
        allornothing: ['3-in-a-row', '4-in-a-row', 'Tight span', 'Balanced'],
        cashpop: [],
        digit2: [], digit3: [], digit4: [], digit5: [],
    };
    return [{ kind: 'patterns', title: 'Common Patterns', items: (PATTERNS_BY_SHAPE[meta.shape] ?? []).map(label => ({ label })) }];
}
// Base helpers to DRY similar entries
const fiveNoSpecial = { shape: 'five', hasSpecial: false, specialTone: null, tagMode: 'patterns-only' };
const sixNoSpecial = { shape: 'six', hasSpecial: false, specialTone: null, tagMode: 'patterns-only', sixMainsNoSpecial: true };
const digits = (k, fireball = false) => ({ shape: kToShape(k), kDigits: k, hasSpecial: false, specialTone: null, tagMode: 'playtypes-only', usesFireball: fireball });
const fiveWithTone = (tone) => ({ shape: 'five', hasSpecial: true, specialTone: tone, tagMode: 'patterns-only' });
const shapeOnly = (shape, tagMode) => ({ shape, hasSpecial: false, specialTone: null, tagMode });
const nyLottoMeta = { shape: 'six', hasSpecial: true, specialTone: 'amber', tagMode: 'patterns-only', isNyLotto: true };
/** Generate *_midday and *_evening variants */
function withPeriods(baseKey, meta, opts) {
    const m = opts?.preferEvening ? { ...meta, preferEveningWhenBoth: true } : meta;
    return {
        [`${baseKey}_midday`]: m,
        [`${baseKey}_evening`]: m,
    };
}
const REGISTRY = {
    // ----- Multi-state (5 + colored special) -----
    multi_powerball: fiveWithTone('red'),
    multi_megamillions: fiveWithTone('blue'),
    multi_cash4life: fiveWithTone('green'),
    // ----- GA -----
    ga_fantasy5: { ...fiveNoSpecial },
    // ----- California classic draws -----
    ca_superlotto_plus: fiveWithTone('amber'),
    ca_fantasy5: { ...fiveNoSpecial },
    // ----- California digits -----
    // Daily 3: twice-daily (prefer evening when both/all)
    ...withPeriods('ca_daily3', digits(3, false), { preferEvening: true }),
    // Daily 4: single daily file (no midday/evening split)
    ca_daily4: digits(4, false),
    // ----- Florida classic draws -----
    ...withPeriods('fl_fantasy5', fiveNoSpecial, { preferEvening: true }),
    fl_lotto: { ...sixNoSpecial },
    fl_jackpot_triple_play: { ...sixNoSpecial },
    // ----- Florida digits (Fireball) -----
    ...withPeriods('fl_pick2', digits(2, true)),
    ...withPeriods('fl_pick3', digits(3, true)),
    ...withPeriods('fl_pick4', digits(4, true)),
    ...withPeriods('fl_pick5', digits(5, true)),
    // ----- Florida Cash Pop -----
    fl_cashpop: shapeOnly('cashpop', 'patterns-only'),
    // ----- Texas classic draws -----
    // Lotto Texas: 6 mains, no special
    tx_lotto_texas: { ...sixNoSpecial },
    // Cash Five: 5 mains, no special
    tx_cash5: { ...fiveNoSpecial },
    // Texas Two Step: 4 mains + Bonus Ball (colored)
    // we mark it as a "5-style" game (so it flows through regular 5+special UI),
    // but override to 4 mains so sidebars/lists don't try to show a 5th main.
    tx_texas_two_step: {
        ...fiveWithTone('amber'),
        mainPickOverride: 4,
    },
    // ----- Texas digits & All or Nothing -----
    // All or Nothing is a 12-from-24 k-of-N game; give it its own shape.
    // We still keep tags light to avoid noisy chips.
    tx_all_or_nothing: { shape: 'allornothing', hasSpecial: false, specialTone: null, tagMode: 'light-patterns' },
    // Texas digits use Fireball
    tx_pick3: digits(3, true),
    tx_daily4: digits(4, true),
    // ----- New York underlying (file-backed) -----
    ny_nylotto: nyLottoMeta,
    ...withPeriods('ny_numbers', digits(3, false)),
    ...withPeriods('ny_win4', digits(4, false)),
    ny_pick10: shapeOnly('pick10', 'patterns-only'),
    ...withPeriods('ny_take5', { ...fiveNoSpecial }, { preferEvening: true }),
    ny_quick_draw: shapeOnly('quickdraw', 'light-patterns'),
    // ----- New York representative (UI/analysis) -----
    ny_take5: { ...fiveNoSpecial, preferEveningWhenBoth: true },
    ny_numbers: digits(3, false),
    ny_win4: digits(4, false),
    ny_lotto: nyLottoMeta,
    ny_quick_draw_rep: shapeOnly('quickdraw', 'light-patterns'),
    ny_pick10_rep: shapeOnly('pick10', 'patterns-only'),
};
const FUZZY = [
    { test: k => /pick5/.test(k), meta: k => digits(5, k.startsWith('fl_') || k.startsWith('tx_')) },
    { test: k => /pick4/.test(k), meta: k => digits(4, k.startsWith('fl_') || k.startsWith('tx_')) },
    { test: k => /pick3/.test(k), meta: k => digits(3, k.startsWith('fl_') || k.startsWith('tx_')) },
    { test: k => /pick2/.test(k), meta: k => digits(2, k.startsWith('fl_') || k.startsWith('tx_')) },
    { test: k => /(take5|fantasy5)/.test(k), meta: { ...fiveNoSpecial, preferEveningWhenBoth: true } },
    { test: k => /daily3/.test(k), meta: digits(3, false) },
    { test: k => /daily4/.test(k), meta: digits(4, false) },
    { test: k => /(quick[_ ]?draw)/.test(k), meta: shapeOnly('quickdraw', 'light-patterns') },
    { test: k => /pick10/.test(k), meta: shapeOnly('pick10', 'patterns-only') },
    { test: k => /(lotto|jackpot_triple_play)/.test(k), meta: { ...sixNoSpecial } },
    { test: k => /powerball/.test(k), meta: fiveWithTone('red') },
    { test: k => /mega/.test(k), meta: fiveWithTone('blue') },
    { test: k => /cash4life/.test(k), meta: fiveWithTone('green') },
    { test: k => /cashpop/.test(k), meta: shapeOnly('cashpop', 'patterns-only') },
];
function fuzzyFallback(key) {
    if (!key)
        return null;
    const k = normKey(key);
    for (const r of FUZZY) {
        if (r.test(k))
            return typeof r.meta === 'function' ? r.meta(k) : r.meta;
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
export function resolveGameMeta(game, logical) {
    const key = (logical || game);
    if (key && REGISTRY[key])
        return REGISTRY[key];
    const fallback = fuzzyFallback(key);
    if (fallback)
        return fallback;
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
export function repForLogical(lg, meta) {
    if (meta.isNyLotto)
        return 'ny_lotto'; // NY Lotto era (6 + Bonus)
    if (lg === 'ny_take5')
        return 'ny_take5'; // Take 5 era
    // Florida logicals:
    // - Six-mains (no special) draw games should anchor to themselves for odds/era.
    // - Digits + Fantasy 5 can still anchor to Fantasy 5 for consistency.
    if (String(lg).startsWith('fl_')) {
        if (lg === 'fl_lotto')
            return 'fl_lotto';
        if (lg === 'fl_jackpot_triple_play')
            return 'fl_jackpot_triple_play';
        if (lg === 'fl_fantasy5')
            return 'fl_fantasy5';
        // FL digits fall back to Fantasy 5 for a stable daily-era anchor
        return 'fl_fantasy5';
    }
    // California logicals (digits) need a canonical representative for odds/era anchor
    if (lg === 'ca_daily3' || lg === 'ca_daily4')
        return 'ca_fantasy5';
    // Texas digit logicals fall back to themselves for odds context or can be anchored later if needed
    // Multistate logicals are already canonical
    return lg;
}
/**
 * Returns a digit logical key accepted by fetchDigitRowsFor, or null if not derivable.
 * Accepts either canonical FL pick* keys (midday/evening) or digit logicals directly.
 */
export function digitLogicalFor(game, logical) {
    const key = String(logical ?? game ?? '');
    switch (key) {
        case 'ny_numbers': return 'ny_numbers';
        case 'ny_win4': return 'ny_win4';
        case 'fl_pick5': return 'fl_pick5';
        case 'fl_pick4': return 'fl_pick4';
        case 'fl_pick3': return 'fl_pick3';
        case 'fl_pick2': return 'fl_pick2';
        // California digit logicals are supported by fetchDigitRowsFor
        case 'ca_daily3': return 'ca_daily3';
        case 'ca_daily4': return 'ca_daily4';
        // Texas digit logicals
        case 'tx_pick3': return 'tx_pick3';
        case 'tx_daily4': return 'tx_daily4';
    }
    // Derive from canonical FL keys with period suffixes
    if (key.startsWith('fl_pick5'))
        return 'fl_pick5';
    if (key.startsWith('fl_pick4'))
        return 'fl_pick4';
    if (key.startsWith('fl_pick3'))
        return 'fl_pick3';
    if (key.startsWith('fl_pick2'))
        return 'fl_pick2';
    // Derive from canonical CA keys
    if (key.startsWith('ca_daily3'))
        return 'ca_daily3';
    if (key.startsWith('ca_daily4'))
        return 'ca_daily4';
    // Derive from canonical TX keys (4-per-day variants)
    if (key.startsWith('tx_pick3'))
        return 'tx_pick3';
    if (key.startsWith('tx_daily4'))
        return 'tx_daily4';
    return null;
}
// Add near other helpers
export function qdHas3Run(values) {
    if (values.length < 3)
        return false;
    const a = [...values].sort((x, y) => x - y);
    for (let i = 2; i < a.length; i++) {
        if (a[i - 2] + 2 === a[i - 1] + 1 && a[i - 1] + 1 === a[i])
            return true;
    }
    return false;
}
export function qdIsTight(values, domainMax = 80) {
    if (!values.length)
        return false;
    const a = [...values].sort((x, y) => x - y);
    if (a.length === 0)
        return false; // or whatever makes sense for the caller
    const span = a[a.length - 1] - a[0];
    const k = values.length;
    const limit = Math.ceil(domainMax / Math.max(8, k + 2));
    return span <= limit;
}
export function playTypeLabelsForDigits(digits, meta) {
    if (!isDigitShape(meta.shape) || !meta.kDigits)
        return [];
    const k = meta.kDigits;
    const out = [];
    const st = libStraightOnlyLabel(digits, k);
    const bx = libBoxVariantLabel(digits, k);
    if (st)
        out.push(st);
    if (bx)
        out.push(bx);
    return out;
}
export function isGenerationReady(meta, deps) {
    if (isDigitShape(meta.shape))
        return !!deps.digitStats;
    if (meta.shape === 'pick10')
        return !!deps.p10Stats;
    if (meta.shape === 'quickdraw')
        return !!deps.qdStats;
    if (meta.shape === 'allornothing')
        return !!deps.aonStats;
    if (meta.shape === 'cashpop')
        return !!deps.cpCounts;
    // five/six
    return Array.isArray(deps.rowsEra) && deps.rowsEra.length > 0;
}
export function eraConfigFor(meta, eraCfg) {
    if (meta.sixMainsNoSpecial && eraCfg)
        return { ...eraCfg, specialMax: 0 };
    return eraCfg;
}
/* ===========================
   Dev-only validation helpers
   =========================== */
function inDev() {
    // Both in Node and browser builds: rely on process.env when present
    try {
        // @ts-ignore
        return typeof process !== 'undefined' && process?.env?.NODE_ENV !== 'production';
    }
    catch {
        return false;
    }
}
/** Assert that every known key resolves, and digit shapes have kDigits. */
export function validateRegistry() {
    // The unions are compile-time only; we validate the *values we know* in REGISTRY.
    const keys = Object.keys(REGISTRY);
    const problems = [];
    for (const k of keys) {
        const meta = resolveGameMeta(k);
        if (!meta)
            problems.push(`No meta for ${k}`);
        if (isDigitShape(meta.shape) && !meta.kDigits)
            problems.push(`Digit meta missing kDigits for ${k}`);
    }
    if (problems.length) {
        // eslint-disable-next-line no-console
        console.warn('GameRegistry validation issues:\n' + problems.map(s => ' - ' + s).join('\n'));
    }
}
// Run a lightweight self-check in dev builds once on import
if (inDev())
    validateRegistry();
// Extra guard: validate schedule label keys in dev
function validateScheduleMapping() {
    try {
        const scheduleKnown = new Set([
            'multi_powerball', 'multi_megamillions', 'multi_cash4life',
            'ga_fantasy5', 'ca_superlotto_plus', 'ca_fantasy5', 'fl_fantasy5', 'ny_take5',
        ]);
        // Quick probe over representative keys you commonly pass in
        const probe = [
            'ny_lotto', 'ny_pick10', 'fl_lotto', 'fl_jackpot_triple_play',
            'tx_lotto_texas', 'tx_texas_two_step', 'tx_cash5',
            'multi_powerball', 'fl_fantasy5', 'ny_take5',
        ];
        const problems = [];
        for (const key of probe) {
            const label = labelKeyFor(key, undefined, undefined);
            const ok = scheduleKnown.has(label) || WEEKLY_CUSTOM_KEYS.has(label);
            if (!ok)
                problems.push(`labelKeyFor(${key}) → ${String(label)} not recognized by schedule.ts`);
        }
        if (problems.length) {
            // eslint-disable-next-line no-console
            console.warn('Schedule mapping warnings:\n' + problems.map(s => ' - ' + s).join('\n'));
        }
    }
    catch { /* noop in prod */ }
}
if (inDev())
    validateScheduleMapping();
