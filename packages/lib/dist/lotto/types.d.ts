export type GameKey = 'multi_powerball' | 'multi_megamillions' | 'multi_cash4life' | 'ga_fantasy5' | 'ca_superlotto_plus' | 'ca_fantasy5' | 'fl_lotto' | 'fl_jackpot_triple_play' | 'fl_fantasy5_midday' | 'fl_fantasy5_evening' | 'fl_pick5_midday' | 'fl_pick5_evening' | 'fl_pick4_midday' | 'fl_pick4_evening' | 'fl_pick3_midday' | 'fl_pick3_evening' | 'fl_pick2_midday' | 'fl_pick2_evening' | 'ny_nylotto' | 'ny_numbers_midday' | 'ny_numbers_evening' | 'ny_win4_midday' | 'ny_win4_evening' | 'ny_pick10' | 'ny_take5_midday' | 'ny_take5_evening' | 'ny_quick_draw' | 'ny_take5' | 'ny_numbers' | 'ny_win4' | 'ny_lotto' | 'ny_quick_draw_rep' | 'ny_pick10_rep' | 'tx_lotto_texas' | 'tx_texas_two_step' | 'tx_cash5';
export type LogicalGameKey = 'ny_take5' | 'ny_numbers' | 'ny_win4' | 'ny_lotto' | 'ny_pick10' | 'ny_quick_draw' | 'ca_superlotto_plus' | 'ca_fantasy5' | 'ca_daily3' | 'ca_daily4' | 'fl_cashpop' | 'fl_fantasy5' | 'fl_pick5' | 'fl_pick4' | 'fl_pick3' | 'fl_pick2' | 'tx_all_or_nothing' | 'tx_pick3' | 'tx_daily4' | 'multi_powerball' | 'multi_megamillions' | 'multi_cash4life';
export type CashPopPeriod = 'morning' | 'matinee' | 'afternoon' | 'evening' | 'latenight';
export type Period = 'midday' | 'evening' | 'day' | 'night' | 'both' | 'all' | CashPopPeriod;
export type EraGame = 'multi_powerball' | 'multi_megamillions' | 'multi_cash4life' | 'ga_fantasy5' | 'ca_superlotto_plus' | 'ca_fantasy5' | 'ny_take5' | 'ny_lotto' | 'fl_fantasy5' | 'fl_lotto' | 'fl_jackpot_triple_play' | 'tx_lotto_texas' | 'tx_cash5';
export type SocrataGame = 'multi_powerball' | 'multi_megamillions' | 'multi_cash4life';
export type ScheduleGame = 'multi_powerball' | 'multi_megamillions' | 'multi_cash4life' | 'ga_fantasy5' | 'ca_superlotto_plus' | 'ca_fantasy5' | 'fl_fantasy5' | 'ny_take5';
export type UnderlyingKey = GameKey | 'ny_take5_midday' | 'ny_take5_evening' | 'ny_numbers_midday' | 'ny_numbers_evening' | 'ny_win4_midday' | 'ny_win4_evening' | 'ny_nylotto' | 'ny_pick10' | 'ny_quick_draw' | 'fl_cashpop_morning' | 'fl_cashpop_matinee' | 'fl_cashpop_afternoon' | 'fl_cashpop_evening' | 'fl_cashpop_latenight' | 'ca_daily3_midday' | 'ca_daily3_evening' | 'ca_daily4' | 'tx_all_or_nothing_morning' | 'tx_all_or_nothing_day' | 'tx_all_or_nothing_evening' | 'tx_all_or_nothing_night' | 'tx_pick3_morning' | 'tx_pick3_day' | 'tx_pick3_evening' | 'tx_pick3_night' | 'tx_daily4_morning' | 'tx_daily4_day' | 'tx_daily4_evening' | 'tx_daily4_night';
export declare const FEATURES: {
    readonly DIGIT_HINTS: boolean;
    readonly PICK10: boolean;
};
export type LottoRow = {
    game: GameKey;
    date: string;
    n1: number;
    n2: number;
    n3: number;
    n4: number;
    n5: number;
    special?: number;
};
export type DigitRow = {
    date: string;
    digits: number[];
};
export type DigitRowEx = DigitRow & {
    fb?: number;
};
export type Pick10Row = {
    date: string;
    values: number[];
};
export type QuickDrawRow = {
    date: string;
    values: number[];
};
export type CashPopRow = {
    date: string;
    value: number;
};
export type AllOrNothingRow = {
    date: string;
    values: number[];
};
export type NyLottoExtendedRow = {
    date: string;
    mains: number[];
    bonus: number;
};
export type EraConfig = {
    start: string;
    mainMax: number;
    specialMax: number;
    mainPick: number;
    label: string;
    description: string;
};
export type WeightingRec = {
    mode: 'hot' | 'cold';
    alpha: number;
};
export type PeriodMap = {
    all: UnderlyingKey[];
    midday?: UnderlyingKey[];
    evening?: UnderlyingKey[];
    both?: UnderlyingKey[];
    morning?: UnderlyingKey[];
    matinee?: UnderlyingKey[];
    afternoon?: UnderlyingKey[];
    latenight?: UnderlyingKey[];
    day?: UnderlyingKey[];
    night?: UnderlyingKey[];
};
export declare const LOGICAL_TO_UNDERLYING: Record<LogicalGameKey, PeriodMap>;
