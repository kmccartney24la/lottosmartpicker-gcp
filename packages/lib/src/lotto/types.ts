// packages/lib/src/lotto/types.ts

/* ===========================================================
   Game + routing unions (source of truth)
   =========================================================== */

// Stable game keys (target convention)
export type GameKey =
  // Multi-state
  | 'multi_powerball'
  | 'multi_megamillions'
  | 'multi_cash4life'
  // GA
  | 'ga_fantasy5'
  // California
  | 'ca_superlotto_plus'
  | 'ca_fantasy5'
  // Florida 
  | 'fl_lotto'
  | 'fl_jackpot_triple_play'
  | 'fl_fantasy5'
  | 'fl_pick5'
  | 'fl_pick4'
  | 'fl_pick3'
  | 'fl_pick2'
  // New York — representative (UI/analysis) keys only
  | 'ny_take5'
  | 'ny_numbers'
  | 'ny_win4'
  | 'ny_lotto'
  // (optional rep aliases if you want to keep them)
  | 'ny_quick_draw'
  | 'ny_pick10'
  // Texas — canonical singles
  | 'tx_lotto_texas'
  | 'tx_texas_two_step'
  | 'tx_cash5'
  // Texas — representative keys for the 4x-per-day families
  | 'tx_all_or_nothing'
  | 'tx_pick3'
  | 'tx_daily4';


// Logical keys shown in page/UI routing
export type LogicalGameKey =
  // NY
  | 'ny_take5'
  | 'ny_numbers'
  | 'ny_win4'
  | 'ny_lotto'
  | 'ny_pick10'
  | 'ny_quick_draw'
  // CA (5-ball canonical)
  | 'ca_superlotto_plus'
  | 'ca_fantasy5'
  // CA (digits)
  | 'ca_daily3'
  | 'ca_daily4'
  // Florida
  | 'fl_cashpop'
  | 'fl_fantasy5'
  | 'fl_pick5'
  | 'fl_pick4'
  | 'fl_pick3'
  | 'fl_pick2'
  // Texas
  | 'tx_all_or_nothing'
  | 'tx_pick3'
  | 'tx_daily4'
  | 'tx_texas_two_step'
  // Multi-state
  | 'multi_powerball'
  | 'multi_megamillions'
  | 'multi_cash4life';

/* ===========================================================
   Periods
   =========================================================== */

export type CashPopPeriod = 'morning' | 'matinee' | 'afternoon' | 'evening' | 'latenight';
export type Period =
  | 'midday' | 'evening'
  | 'morning' | 'day' | 'night'
  | 'matinee' | 'afternoon' | 'latenight'
  | 'both' | 'all';

/* ===========================================================
   Game category/narrow unions
   =========================================================== */

// Games with an *era* used by 5-ball analysis/generator.
export type EraGame =
  | 'multi_powerball'
  | 'multi_megamillions'
  | 'multi_cash4life'
  | 'ga_fantasy5'
  | 'ca_superlotto_plus'
  | 'ca_fantasy5'
  | 'ny_take5'
  | 'ny_lotto'
  | 'fl_fantasy5'
  | 'fl_lotto'
  | 'fl_jackpot_triple_play'
  | 'tx_lotto_texas'
  | 'tx_cash5'
  | 'tx_texas_two_step';

// Games backed by NY Open Data (Socrata)
export type SocrataGame =
  | 'multi_powerball'
  | 'multi_megamillions'
  | 'multi_cash4life';

// Games we present a weekly draw schedule for
export type ScheduleGame =
  | 'multi_powerball'
  | 'multi_megamillions'
  | 'multi_cash4life'
  | 'ga_fantasy5'
  | 'ca_superlotto_plus'
  | 'ca_fantasy5'
  | 'fl_fantasy5'
  | 'ny_take5'
  | 'tx_texas_two_step';

/* ===========================================================
   Underlying keys (file-backed, includes flexible variants)
   =========================================================== */

// PATCH: ensure UnderlyingKey includes ALL file-backed variants (NY, FL, CA, TX)

export type UnderlyingKey =
  // Canonical singles can still be addressed as underlyings
  | 'multi_powerball' | 'multi_megamillions' | 'multi_cash4life'
  | 'ga_fantasy5'
  | 'ca_superlotto_plus' | 'ca_fantasy5'
  | 'fl_lotto' | 'fl_jackpot_triple_play'
  | 'tx_lotto_texas' | 'tx_texas_two_step' | 'tx_cash5'
  // NY underlying
  | 'ny_take5_midday' | 'ny_take5_evening'
  | 'ny_numbers_midday' | 'ny_numbers_evening'
  | 'ny_win4_midday' | 'ny_win4_evening'
  | 'ny_nylotto'
  | 'ny_pick10'
  | 'ny_quick_draw'
  // FL underlying
  | 'fl_fantasy5_midday' | 'fl_fantasy5_evening'
  | 'fl_pick5_midday'    | 'fl_pick5_evening'
  | 'fl_pick4_midday'    | 'fl_pick4_evening'
  | 'fl_pick3_midday'    | 'fl_pick3_evening'
  | 'fl_pick2_midday'    | 'fl_pick2_evening'
  // FL Cash Pop (5)
  | 'fl_cashpop_morning' | 'fl_cashpop_matinee' | 'fl_cashpop_afternoon' | 'fl_cashpop_evening' | 'fl_cashpop_latenight'
  // CA digits
  | 'ca_daily3_midday' | 'ca_daily3_evening' | 'ca_daily4'
  // TX 4x-daily families
  | 'tx_all_or_nothing_morning' | 'tx_all_or_nothing_day' | 'tx_all_or_nothing_evening' | 'tx_all_or_nothing_night'
  | 'tx_pick3_morning' | 'tx_pick3_day' | 'tx_pick3_evening' | 'tx_pick3_night'
  | 'tx_daily4_morning' | 'tx_daily4_day' | 'tx_daily4_evening' | 'tx_daily4_night';


/* ===========================================================
   Feature flags (read-only; referenced across UI code)
   =========================================================== */

export const FEATURES = {
  DIGIT_HINTS: (process.env.NEXT_PUBLIC_ENABLE_DIGIT_HINTS ?? '1') === '1',
  PICK10:      (process.env.NEXT_PUBLIC_ENABLE_PICK10 ?? '0') === '1',
} as const;

/* ===========================================================
   Core data row shapes (shared across modules)
   =========================================================== */

export type LottoRow = {
  game: GameKey;
  date: string; // ISO YYYY-MM-DD
  n1: number; n2: number; n3: number; n4: number; n5: number;
  special?: number; // absent when the game has no colored special; for 6-main games we store the 6th main here
};

export type DigitRow   = { date: string; digits: number[] };
export type DigitRowEx = DigitRow & { fb?: number }; // optional Fireball

export type Pick10Row    = { date: string; values: number[] }; // 10 numbers, 1..80
export type QuickDrawRow = { date: string; values: number[] }; // 20 numbers, 1..80
export type CashPopRow   = { date: string; value: number };    // 1 number, 1..15
export type AllOrNothingRow = { date: string; values: number[] }; // 12 numbers, 1..24

export type NyLottoExtendedRow = { date: string; mains: number[]; bonus: number };

/* ===========================================================
   Era types (used by analysis/generator)
   =========================================================== */

export type EraConfig = {
  start: string;      // inclusive YYYY-MM-DD
  mainMax: number;    // size of main ball domain
  specialMax: number; // size of special ball domain (0 if none)
  mainPick: number;   // number of mains drawn (5 for 5+special, 6 for Lotto-style)
  label: string;      // e.g. "5/69 + 1/26"
  description: string;
};

/* ===========================================================
   Weighting recommendation (digits/pick10/qd helpers)
   =========================================================== */

export type WeightingRec = { mode: 'hot' | 'cold'; alpha: number };

/* ===========================================================
   Logical → underlying routing map (static data only)
   =========================================================== */

export type PeriodMap = {
  all: UnderlyingKey[];
  // 2-per-day
  midday?: UnderlyingKey[];
  evening?: UnderlyingKey[];
  both?: UnderlyingKey[]; // legacy alias some callers still send
  // 5-per-day Cash Pop
  morning?: UnderlyingKey[];
  matinee?: UnderlyingKey[];
  afternoon?: UnderlyingKey[];
  latenight?: UnderlyingKey[];
  // Texas day/night
  day?: UnderlyingKey[];
  night?: UnderlyingKey[];
};

export const LOGICAL_TO_UNDERLYING: Record<LogicalGameKey, PeriodMap> = {
  // Multi-state
  multi_powerball:    { all: ['multi_powerball'] },
  multi_megamillions: { all: ['multi_megamillions'] },
  multi_cash4life:    { all: ['multi_cash4life'] },

  // ---- New York ----
  ny_take5:      { all: ['ny_take5_midday','ny_take5_evening'], midday:['ny_take5_midday'], evening:['ny_take5_evening'] },
  ny_numbers:    { all: ['ny_numbers_midday','ny_numbers_evening'], midday:['ny_numbers_midday'], evening:['ny_numbers_evening'] },
  ny_win4:       { all: ['ny_win4_midday','ny_win4_evening'], midday:['ny_win4_midday'], evening:['ny_win4_evening'] },
  ny_lotto:      { all: ['ny_nylotto'] },
  ny_pick10:     { all: ['ny_pick10'] },
  ny_quick_draw: { all: ['ny_quick_draw'] },

  // ---- California (5-ball canonical) ----
  ca_superlotto_plus: { all: ['ca_superlotto_plus'] },
  ca_fantasy5:        { all: ['ca_fantasy5'] },

  // ---- California (digits) ----
  ca_daily3: { all: ['ca_daily3_midday','ca_daily3_evening'], midday:['ca_daily3_midday'], evening:['ca_daily3_evening'] },
  ca_daily4: { all: ['ca_daily4'] },

  // ---- Florida (classic draws) ----
  fl_fantasy5: { all: ['fl_fantasy5_midday','fl_fantasy5_evening'], midday:['fl_fantasy5_midday'], evening:['fl_fantasy5_evening'] },

  // ---- Florida digits ----
  fl_pick5: { all: ['fl_pick5_midday','fl_pick5_evening'], midday:['fl_pick5_midday'], evening:['fl_pick5_evening'] },
  fl_pick4: { all: ['fl_pick4_midday','fl_pick4_evening'], midday:['fl_pick4_midday'], evening:['fl_pick4_evening'] },
  fl_pick3: { all: ['fl_pick3_midday','fl_pick3_evening'], midday:['fl_pick3_midday'], evening:['fl_pick3_evening'] },
  fl_pick2: { all: ['fl_pick2_midday','fl_pick2_evening'], midday:['fl_pick2_midday'], evening:['fl_pick2_evening'] },

  // ---- Florida Cash Pop (5 periods) ----
  fl_cashpop: {
    all:       ['fl_cashpop_morning','fl_cashpop_matinee','fl_cashpop_afternoon','fl_cashpop_evening','fl_cashpop_latenight'],
    morning:   ['fl_cashpop_morning'],
    matinee:   ['fl_cashpop_matinee'],
    afternoon: ['fl_cashpop_afternoon'],
    evening:   ['fl_cashpop_evening'],
    latenight: ['fl_cashpop_latenight'],
  },

  // ---- Texas Two Step ----
  tx_texas_two_step: { all: ['tx_texas_two_step'] },

  // ---- Texas All or Nothing (4 periods) ----
  tx_all_or_nothing: {
    all:     ['tx_all_or_nothing_morning','tx_all_or_nothing_day','tx_all_or_nothing_evening','tx_all_or_nothing_night'],
    morning: ['tx_all_or_nothing_morning'],
    day:     ['tx_all_or_nothing_day'],
    evening: ['tx_all_or_nothing_evening'],
    night:   ['tx_all_or_nothing_night'],
  },

  // ---- Texas Pick 3 (4 periods) ----
  tx_pick3: {
    all:     ['tx_pick3_morning','tx_pick3_day','tx_pick3_evening','tx_pick3_night'],
    morning: ['tx_pick3_morning'],
    day:     ['tx_pick3_day'],
    evening: ['tx_pick3_evening'],
    night:   ['tx_pick3_night'],
  },

  // ---- Texas Daily 4 (4 periods) ----
  tx_daily4: {
    all:     ['tx_daily4_morning','tx_daily4_day','tx_daily4_evening','tx_daily4_night'],
    morning: ['tx_daily4_morning'],
    day:     ['tx_daily4_day'],
    evening: ['tx_daily4_evening'],
    night:   ['tx_daily4_night'],
  },
};
