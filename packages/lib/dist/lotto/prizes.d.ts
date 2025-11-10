import type { GameKey, LogicalGameKey } from './types.js';
/**
 * For lotto-style tiers we want to say what kind of payout to expect.
 * - 'jackpot'            → rolls/grows; amount always variable
 * - 'fixed'              → e.g. Powerball $4
 * - 'pari-mutuel'        → CA-style or NY Take 5 / Fantasy 5 / SuperLotto Plus lower tiers
 * - 'fixed-with-multiplier' → fixed base but common add-on (Power Play, Xtra, Megaplier/2025 MM built-in)
 * - 'fixed-or-pari-mutuel'  → base game is fixed in most states, but at least one jurisdiction pays pari-mutuel
 */
export type LottoPayoutKind = 'jackpot' | 'fixed' | 'pari-mutuel' | 'fixed-with-multiplier' | 'fixed-or-pari-mutuel';
/**
 * A single prize/tier line that the UI can render.
 *
 * We support three shapes:
 * - 'lotto'  → 5+special, 5-only, 6-of-N, 4+bonus
 * - 'digits' → exact / any-order
 * - 'pool'   → K-of-N
 */
export type PrizeTier = {
    kind: 'lotto';
    code: string;
    label: string;
    amount?: number | 'JACKPOT';
    mains: number;
    special?: boolean | 'any';
    payoutKind: LottoPayoutKind;
    notes?: string;
} | {
    kind: 'digits';
    code: string;
    label: string;
    exact?: boolean;
    anyOrder?: boolean;
    notes?: string;
} | {
    kind: 'pool';
    code: string;
    label: string;
    matches: number;
    amount?: number | 'JACKPOT';
    notes?: string;
};
/**
 * Get the prize tiers for any game key.
 * Optional opts let Quick Draw tell us how many spots the user picked.
 */
export declare function prizeTableFor(game: GameKey | LogicalGameKey, opts?: {
    poolSpots?: number;
}): PrizeTier[];
