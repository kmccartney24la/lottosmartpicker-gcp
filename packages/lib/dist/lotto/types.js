// packages/lib/src/lotto/types.ts
/* ===========================================================
   Feature flags (read-only; referenced across UI code)
   =========================================================== */
export const FEATURES = {
    DIGIT_HINTS: (process.env.NEXT_PUBLIC_ENABLE_DIGIT_HINTS ?? '1') === '1',
    PICK10: (process.env.NEXT_PUBLIC_ENABLE_PICK10 ?? '0') === '1',
};
export const LOGICAL_TO_UNDERLYING = {
    // Multi-state
    multi_powerball: { all: ['multi_powerball'] },
    multi_megamillions: { all: ['multi_megamillions'] },
    multi_cash4life: { all: ['multi_cash4life'] },
    // ---- New York ----
    ny_take5: { all: ['ny_take5_midday', 'ny_take5_evening'], midday: ['ny_take5_midday'], evening: ['ny_take5_evening'] },
    ny_numbers: { all: ['ny_numbers_midday', 'ny_numbers_evening'], midday: ['ny_numbers_midday'], evening: ['ny_numbers_evening'] },
    ny_win4: { all: ['ny_win4_midday', 'ny_win4_evening'], midday: ['ny_win4_midday'], evening: ['ny_win4_evening'] },
    ny_lotto: { all: ['ny_nylotto'] },
    ny_pick10: { all: ['ny_pick10'] },
    ny_quick_draw: { all: ['ny_quick_draw'] },
    // ---- California (5-ball canonical) ----
    ca_superlotto_plus: { all: ['ca_superlotto_plus'] },
    ca_fantasy5: { all: ['ca_fantasy5'] },
    // ---- California (digits) ----
    ca_daily3: { all: ['ca_daily3_midday', 'ca_daily3_evening'], midday: ['ca_daily3_midday'], evening: ['ca_daily3_evening'] },
    ca_daily4: { all: ['ca_daily4'] },
    // ---- Florida (classic draws) ----
    fl_fantasy5: { all: ['fl_fantasy5_midday', 'fl_fantasy5_evening'], midday: ['fl_fantasy5_midday'], evening: ['fl_fantasy5_evening'] },
    // ---- Florida digits ----
    fl_pick5: { all: ['fl_pick5_midday', 'fl_pick5_evening'], midday: ['fl_pick5_midday'], evening: ['fl_pick5_evening'] },
    fl_pick4: { all: ['fl_pick4_midday', 'fl_pick4_evening'], midday: ['fl_pick4_midday'], evening: ['fl_pick4_evening'] },
    fl_pick3: { all: ['fl_pick3_midday', 'fl_pick3_evening'], midday: ['fl_pick3_midday'], evening: ['fl_pick3_evening'] },
    fl_pick2: { all: ['fl_pick2_midday', 'fl_pick2_evening'], midday: ['fl_pick2_midday'], evening: ['fl_pick2_evening'] },
    // ---- Florida Cash Pop (5 periods) ----
    fl_cashpop: {
        all: ['fl_cashpop_morning', 'fl_cashpop_matinee', 'fl_cashpop_afternoon', 'fl_cashpop_evening', 'fl_cashpop_latenight'],
        morning: ['fl_cashpop_morning'],
        matinee: ['fl_cashpop_matinee'],
        afternoon: ['fl_cashpop_afternoon'],
        evening: ['fl_cashpop_evening'],
        latenight: ['fl_cashpop_latenight'],
    },
    // ---- Texas All or Nothing (4 periods) ----
    tx_all_or_nothing: {
        all: ['tx_all_or_nothing_morning', 'tx_all_or_nothing_day', 'tx_all_or_nothing_evening', 'tx_all_or_nothing_night'],
        morning: ['tx_all_or_nothing_morning'],
        day: ['tx_all_or_nothing_day'],
        evening: ['tx_all_or_nothing_evening'],
        night: ['tx_all_or_nothing_night'],
    },
    // ---- Texas Pick 3 (4 periods) ----
    tx_pick3: {
        all: ['tx_pick3_morning', 'tx_pick3_day', 'tx_pick3_evening', 'tx_pick3_night'],
        morning: ['tx_pick3_morning'],
        day: ['tx_pick3_day'],
        evening: ['tx_pick3_evening'],
        night: ['tx_pick3_night'],
    },
    // ---- Texas Daily 4 (4 periods) ----
    tx_daily4: {
        all: ['tx_daily4_morning', 'tx_daily4_day', 'tx_daily4_evening', 'tx_daily4_night'],
        morning: ['tx_daily4_morning'],
        day: ['tx_daily4_day'],
        evening: ['tx_daily4_evening'],
        night: ['tx_daily4_night'],
    },
};
