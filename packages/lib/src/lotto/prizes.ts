// packages/lib/src/lotto/prizes.ts
import type {
  GameKey,
  LogicalGameKey,
  EraGame,
  DigitRow,
} from './types.js';
import { resolveEraGame } from './era.js';

/**
 * For lotto-style tiers we want to say what kind of payout to expect.
 * - 'jackpot'            → rolls/grows; amount always variable
 * - 'fixed'              → e.g. Powerball $4
 * - 'pari-mutuel'        → CA-style or NY Take 5 / Fantasy 5 / SuperLotto Plus lower tiers
 * - 'fixed-with-multiplier' → fixed base but common add-on (Power Play, Xtra, Megaplier/2025 MM built-in)
 * - 'fixed-or-pari-mutuel'  → base game is fixed in most states, but at least one jurisdiction pays pari-mutuel
 */
export type LottoPayoutKind =
  | 'jackpot'
  | 'fixed'
  | 'pari-mutuel'
  | 'fixed-with-multiplier'
  | 'fixed-or-pari-mutuel';

/**
 * A single prize/tier line that the UI can render.
 *
 * We support three shapes:
 * - 'lotto'  → 5+special, 5-only, 6-of-N, 4+bonus
 * - 'digits' → exact / any-order
 * - 'pool'   → K-of-N
 */
export type PrizeTier =
  | {
      kind: 'lotto';
      code: string;
      label: string;
      // fixed dollar amount or jackpot for true-fixed tiers only
      amount?: number | 'JACKPOT';
      // how many main/white numbers must match
      mains: number;
      // whether the bonus/special must match.
      // true → must match, false → must NOT match, 'any' → no bonus in this game
      special?: boolean | 'any';
      // new: how this prize is actually paid out in the real game
      payoutKind: LottoPayoutKind;
      // optional extra explanatory text the UI can surface
      notes?: string;
    }
  | {
      kind: 'digits';
      code: string;
      label: string;
      exact?: boolean;
      anyOrder?: boolean;
      notes?: string;
    }
  | {
      kind: 'pool';
      code: string;
      label: string;
      matches: number;
      amount?: number | 'JACKPOT';
      notes?: string;
    };

/* ------------------------------------------------------------------ */
/* 5/6-ball style prize tables, keyed by era game                      */
/* ------------------------------------------------------------------ */

const LOTTO_PRIZES: Record<EraGame, PrizeTier[]> = {
  /* --------------------- MULTI-STATE --------------------- */

  // Powerball: 9 fixed tiers, Power Play multiplies non-jackpot prizes.
  // CA is the exception and pays non-jackpot prizes pari-mutuel, so we note that. :contentReference[oaicite:14]{index=14}
  multi_powerball: [
    {
      kind: 'lotto',
      code: 'JACKPOT',
      label: 'Jackpot (5 of 5 + Powerball)',
      amount: 'JACKPOT',
      mains: 5,
      special: true,
      payoutKind: 'jackpot',
      notes: 'Grand Prize shared among all 5+PB winners.',
    },
    {
      kind: 'lotto',
      code: '5',
      label: 'Match 5 (no Powerball)',
      amount: 1_000_000,
      mains: 5,
      special: false,
      payoutKind: 'fixed-with-multiplier',
      notes: 'Base $1,000,000; Power Play makes it $2,000,000. California pays this pari-mutuel.',
    },
    {
      kind: 'lotto',
      code: '4+PB',
      label: 'Match 4 + Powerball',
      amount: 50_000,
      mains: 4,
      special: true,
      payoutKind: 'fixed-with-multiplier',
      notes: 'Power Play multiplies; California pays pari-mutuel.',
    },
    {
      kind: 'lotto',
      code: '4',
      label: 'Match 4 (no Powerball)',
      amount: 100,
      mains: 4,
      special: false,
      payoutKind: 'fixed-with-multiplier',
      notes: 'Power Play multiplies; California pays pari-mutuel.',
    },
    {
      kind: 'lotto',
      code: '3+PB',
      label: 'Match 3 + Powerball',
      amount: 100,
      mains: 3,
      special: true,
      payoutKind: 'fixed-with-multiplier',
      notes: 'Power Play multiplies; California pays pari-mutuel.',
    },
    {
      kind: 'lotto',
      code: '3',
      label: 'Match 3 (no Powerball)',
      amount: 7,
      mains: 3,
      special: false,
      payoutKind: 'fixed-with-multiplier',
      notes: 'Power Play multiplies; California pays pari-mutuel.',
    },
    {
      kind: 'lotto',
      code: '2+PB',
      label: 'Match 2 + Powerball',
      amount: 7,
      mains: 2,
      special: true,
      payoutKind: 'fixed-with-multiplier',
      notes: 'Power Play multiplies; California pays pari-mutuel.',
    },
    {
      kind: 'lotto',
      code: '1+PB',
      label: 'Match 1 + Powerball',
      amount: 4,
      mains: 1,
      special: true,
      payoutKind: 'fixed-with-multiplier',
      notes: 'Power Play multiplies; California pays pari-mutuel.',
    },
    {
      kind: 'lotto',
      code: '0+PB',
      label: 'Powerball only',
      amount: 4,
      mains: 0,
      special: true,
      payoutKind: 'fixed-with-multiplier',
      notes: 'Power Play multiplies; California pays pari-mutuel.',
    },
  ],

  // Mega Millions: classic 9-tier structure, but CA pays tiers 2–9 pari-mutuel,
  // and from April 2025 the national game added built-in multipliers and a $10M 2nd prize; we keep it
  // generic and mark tiers as "fixed-with-multiplier". :contentReference[oaicite:15]{index=15}
  multi_megamillions: [
    {
      kind: 'lotto',
      code: 'JACKPOT',
      label: 'Jackpot (5 of 5 + Mega Ball)',
      amount: 'JACKPOT',
      mains: 5,
      special: true,
      payoutKind: 'jackpot',
      notes: 'Grand Prize shared among all 5+MB winners.',
    },
    {
      kind: 'lotto',
      code: '5',
      label: '2nd-level prize: Match 5 (no Mega Ball)',
      // in 2025 rules this is $10M; before that it was $1M and Megaplier could boost it
      amount: 10_000_000,
      mains: 5,
      special: false,
      payoutKind: 'fixed-with-multiplier',
      notes:
        'Amount and multiplier rules depend on draw date and jurisdiction; California pays pari-mutuel.',
    },
    {
      kind: 'lotto',
      code: '4+MB',
      label: 'Match 4 + Mega Ball',
      amount: 20_000,
      mains: 4,
      special: true,
      payoutKind: 'fixed-with-multiplier',
      notes: 'Older draws: $10,000 plus Megaplier; CA pays pari-mutuel.',
    },
    {
      kind: 'lotto',
      code: '4',
      label: 'Match 4 (no Mega Ball)',
      amount: 500,
      mains: 4,
      special: false,
      payoutKind: 'fixed-with-multiplier',
      notes: 'Older draws: $500 plus Megaplier; CA pays pari-mutuel.',
    },
    {
      kind: 'lotto',
      code: '3+MB',
      label: 'Match 3 + Mega Ball',
      amount: 200,
      mains: 3,
      special: true,
      payoutKind: 'fixed-with-multiplier',
      notes: 'Older draws: $200 plus Megaplier; CA pays pari-mutuel.',
    },
    {
      kind: 'lotto',
      code: '3',
      label: 'Match 3 (no Mega Ball)',
      amount: 10,
      mains: 3,
      special: false,
      payoutKind: 'fixed-with-multiplier',
      notes: 'Older draws: $10 plus Megaplier; CA pays pari-mutuel.',
    },
    {
      kind: 'lotto',
      code: '2+MB',
      label: 'Match 2 + Mega Ball',
      amount: 10,
      mains: 2,
      special: true,
      payoutKind: 'fixed-with-multiplier',
      notes: 'Older draws: $10 plus Megaplier; CA pays pari-mutuel.',
    },
    {
      kind: 'lotto',
      code: '1+MB',
      label: 'Match 1 + Mega Ball',
      amount: 4,
      mains: 1,
      special: true,
      payoutKind: 'fixed-with-multiplier',
      notes: 'Older draws: $4 plus Megaplier; CA pays pari-mutuel.',
    },
    {
      kind: 'lotto',
      code: '0+MB',
      label: 'Mega Ball only',
      amount: 2,
      mains: 0,
      special: true,
      payoutKind: 'fixed-with-multiplier',
      notes: 'Older draws: $2 plus Megaplier; CA pays pari-mutuel.',
    },
  ],

  // Cash4Life: top 2 are lifetime annuities; rest are fixed. Some states reserve the right to pay pari-mutuel on rare events. :contentReference[oaicite:16]{index=16}
  multi_cash4life: [
    {
      kind: 'lotto',
      code: 'JACKPOT',
      label: '$1,000 a Day for Life (5 + Cash Ball)',
      amount: 'JACKPOT',
      mains: 5,
      special: true,
      payoutKind: 'jackpot',
      notes: 'Top prize is for life; may be paid as cash option.',
    },
    {
      kind: 'lotto',
      code: '5',
      label: '$1,000 a Week for Life (5 only)',
      mains: 5,
      special: false,
      payoutKind: 'jackpot',
      notes: 'Second prize is for life; may be paid as cash option.',
    },
    {
      kind: 'lotto',
      code: '4+CB',
      label: 'Match 4 + Cash Ball',
      amount: 2_500,
      mains: 4,
      special: true,
      payoutKind: 'fixed',
    },
    {
      kind: 'lotto',
      code: '4',
      label: 'Match 4 (no Cash Ball)',
      amount: 500,
      mains: 4,
      special: false,
      payoutKind: 'fixed',
    },
    {
      kind: 'lotto',
      code: '3+CB',
      label: 'Match 3 + Cash Ball',
      amount: 100,
      mains: 3,
      special: true,
      payoutKind: 'fixed',
    },
    {
      kind: 'lotto',
      code: '3',
      label: 'Match 3 (no Cash Ball)',
      amount: 25,
      mains: 3,
      special: false,
      payoutKind: 'fixed',
    },
    {
      kind: 'lotto',
      code: '2+CB',
      label: 'Match 2 + Cash Ball',
      amount: 10,
      mains: 2,
      special: true,
      payoutKind: 'fixed',
    },
    {
      kind: 'lotto',
      code: '2',
      label: 'Match 2 (no Cash Ball)',
      amount: 4,
      mains: 2,
      special: 'any',
      payoutKind: 'fixed',
    },
    {
      kind: 'lotto',
      code: '1+CB',
      label: 'Match 1 + Cash Ball',
      amount: 2,
      mains: 1,
      special: true,
      payoutKind: 'fixed',
    },
  ],

  /* --------------------- 5-of-N, no bonus (Fantasy 5 style) --------------------- */

  // Georgia Fantasy 5 – top 3 pari-mutuel, 2 = free ticket. :contentReference[oaicite:17]{index=17}
  ga_fantasy5: [
    {
      kind: 'lotto',
      code: '5',
      label: 'Jackpot (5 of 5)',
      amount: 'JACKPOT',
      mains: 5,
      special: 'any',
      payoutKind: 'jackpot',
      notes: 'Pari-mutuel daily jackpot; shared among all 5-of-5 winners.',
    },
    {
      kind: 'lotto',
      code: '4',
      label: 'Match 4 of 5 (pari-mutuel)',
      mains: 4,
      special: 'any',
      payoutKind: 'pari-mutuel',
      notes: 'Actual amount depends on sales and number of winners.',
    },
    {
      kind: 'lotto',
      code: '3',
      label: 'Match 3 of 5 (pari-mutuel)',
      mains: 3,
      special: 'any',
      payoutKind: 'pari-mutuel',
      notes: 'Largest slice of pool because many winners.',
    },
    {
      kind: 'lotto',
      code: '2',
      label: 'Match 2 of 5 (free ticket / fixed low prize)',
      mains: 2,
      special: 'any',
      payoutKind: 'fixed',
      notes: 'Usually free ticket.',
    },
  ],

  // California Fantasy 5 – top 3 pari-mutuel, 2 = free play. :contentReference[oaicite:18]{index=18}
  ca_fantasy5: [
    {
      kind: 'lotto',
      code: '5',
      label: 'Top prize (pari-mutuel): 5 of 5',
      amount: 'JACKPOT',
      mains: 5,
      special: 'any',
      payoutKind: 'pari-mutuel',
      notes: 'Starts around $60k–$80k and grows until won.',
    },
    {
      kind: 'lotto',
      code: '4',
      label: 'Match 4 of 5 (pari-mutuel)',
      mains: 4,
      special: 'any',
      payoutKind: 'pari-mutuel',
    },
    {
      kind: 'lotto',
      code: '3',
      label: 'Match 3 of 5 (pari-mutuel)',
      mains: 3,
      special: 'any',
      payoutKind: 'pari-mutuel',
    },
    {
      kind: 'lotto',
      code: '2',
      label: 'Match 2 of 5 (free play)',
      mains: 2,
      special: 'any',
      payoutKind: 'fixed',
    },
  ],

  // Florida Fantasy 5 – fully pari-mutuel, with roll-down when jackpot not hit. :contentReference[oaicite:19]{index=19}
  fl_fantasy5: [
    {
      kind: 'lotto',
      code: '5',
      label: 'Top prize (pari-mutuel): 5 of 5',
      amount: 'JACKPOT',
      mains: 5,
      special: 'any',
      payoutKind: 'pari-mutuel',
      notes: 'If no 5-of-5 winner, top pool rolls down to 4-of-5 (capped per-winner).',
    },
    {
      kind: 'lotto',
      code: '4',
      label: 'Match 4 of 5 (pari-mutuel)',
      mains: 4,
      special: 'any',
      payoutKind: 'pari-mutuel',
    },
    {
      kind: 'lotto',
      code: '3',
      label: 'Match 3 of 5 (pari-mutuel)',
      mains: 3,
      special: 'any',
      payoutKind: 'pari-mutuel',
    },
    {
      kind: 'lotto',
      code: '2',
      label: 'Match 2 of 5 (free ticket)',
      mains: 2,
      special: 'any',
      payoutKind: 'fixed',
    },
  ],

  // New York Take 5 – 5/4/3 pari-mutuel, 2 = free ticket. :contentReference[oaicite:20]{index=20}
  ny_take5: [
    {
      kind: 'lotto',
      code: '5',
      label: 'Top prize (pari-mutuel): 5 of 5',
      amount: 'JACKPOT',
      mains: 5,
      special: 'any',
      payoutKind: 'pari-mutuel',
      notes: '50% of sales to prize pool; 20% of that to jackpot.',
    },
    {
      kind: 'lotto',
      code: '4',
      label: 'Match 4 of 5 (pari-mutuel)',
      mains: 4,
      special: 'any',
      payoutKind: 'pari-mutuel',
    },
    {
      kind: 'lotto',
      code: '3',
      label: 'Match 3 of 5 (pari-mutuel)',
      mains: 3,
      special: 'any',
      payoutKind: 'pari-mutuel',
    },
    {
      kind: 'lotto',
      code: '2',
      label: 'Match 2 of 5 (free ticket)',
      mains: 2,
      special: 'any',
      payoutKind: 'fixed',
    },
  ],

  // Texas Cash Five – current TX rules: fixed. :contentReference[oaicite:21]{index=21}
  tx_cash5: [
    {
      kind: 'lotto',
      code: '5',
      label: 'Top prize: 5 of 5',
      amount: 25_000,
      mains: 5,
      special: 'any',
      payoutKind: 'fixed',
      notes: 'Top prize may be reduced if there are many winners.',
    },
    {
      kind: 'lotto',
      code: '4',
      label: 'Match 4 of 5',
      amount: 350,
      mains: 4,
      special: 'any',
      payoutKind: 'fixed',
    },
    {
      kind: 'lotto',
      code: '3',
      label: 'Match 3 of 5',
      amount: 15,
      mains: 3,
      special: 'any',
      payoutKind: 'fixed',
    },
    {
      kind: 'lotto',
      code: '2',
      label: 'Match 2 of 5 (free Quick Pick)',
      mains: 2,
      special: 'any',
      payoutKind: 'fixed',
    },
  ],

  /* --------------------- 6-of-N --------------------- */

  // Florida Lotto – base game is fixed, and each ticket gets a random multiplier for non-jackpot prizes. :contentReference[oaicite:22]{index=22}
  fl_lotto: [
    {
      kind: 'lotto',
      code: '6',
      label: 'Jackpot (6 of 6)',
      amount: 'JACKPOT',
      mains: 6,
      special: 'any',
      payoutKind: 'jackpot',
    },
    {
      kind: 'lotto',
      code: '5',
      label: 'Match 5 of 6 (multiplied)',
      amount: 3_000,
      mains: 5,
      special: 'any',
      payoutKind: 'fixed-with-multiplier',
      notes: 'Prize is multiplied 2x–10x by the ticket; amount shown is base.',
    },
    {
      kind: 'lotto',
      code: '4',
      label: 'Match 4 of 6 (multiplied)',
      amount: 50,
      mains: 4,
      special: 'any',
      payoutKind: 'fixed-with-multiplier',
      notes: 'Prize is multiplied 2x–10x by the ticket; amount shown is base.',
    },
    {
      kind: 'lotto',
      code: '3',
      label: 'Match 3 of 6 (multiplied)',
      amount: 5,
      mains: 3,
      special: 'any',
      payoutKind: 'fixed-with-multiplier',
      notes: 'Prize is multiplied 2x–10x by the ticket; amount shown is base.',
    },
    {
      kind: 'lotto',
      code: '2',
      label: 'Match 2 of 6 (free ticket)',
      mains: 2,
      special: 'any',
      payoutKind: 'fixed',
    },
  ],

  // Florida Jackpot Triple Play – fixed table. :contentReference[oaicite:23]{index=23}
  fl_jackpot_triple_play: [
    {
      kind: 'lotto',
      code: '6',
      label: 'Jackpot (6 of 6)',
      amount: 'JACKPOT',
      mains: 6,
      special: 'any',
      payoutKind: 'jackpot',
      notes: 'Combo add-on is separate and not listed here.',
    },
    {
      kind: 'lotto',
      code: '5',
      label: 'Match 5 of 6',
      amount: 500,
      mains: 5,
      special: 'any',
      payoutKind: 'fixed',
    },
    {
      kind: 'lotto',
      code: '4',
      label: 'Match 4 of 6',
      amount: 25,
      mains: 4,
      special: 'any',
      payoutKind: 'fixed',
    },
    {
      kind: 'lotto',
      code: '3',
      label: 'Match 3 of 6',
      amount: 1,
      mains: 3,
      special: 'any',
      payoutKind: 'fixed',
    },
  ],

  // Texas Lotto Texas – 6-of-54, 5/4 are estimated, 3 is fixed. Extra! affects lower tiers. :contentReference[oaicite:24]{index=24}
  tx_lotto_texas: [
    {
      kind: 'lotto',
      code: '6',
      label: 'Jackpot (6 of 6)',
      amount: 'JACKPOT',
      mains: 6,
      special: 'any',
      payoutKind: 'jackpot',
    },
    {
      kind: 'lotto',
      code: '5',
      label: '2nd-level prize (pari-mutuel): 5 of 6',
      mains: 5,
      special: 'any',
      payoutKind: 'pari-mutuel',
      notes: 'Advertised around $2,000; Extra! can add $10,000.',
    },
    {
      kind: 'lotto',
      code: '4',
      label: '3rd-level prize (pari-mutuel): 4 of 6',
      mains: 4,
      special: 'any',
      payoutKind: 'pari-mutuel',
      notes: 'Advertised around $50; Extra! can add $100.',
    },
    {
      kind: 'lotto',
      code: '3',
      label: 'Match 3 of 6',
      amount: 3,
      mains: 3,
      special: 'any',
      payoutKind: 'fixed',
      notes: 'Extra! makes this $13.',
    },
  ],

  // New York LOTTO – 6/59 + bonus, with 3-of-6 fixed $1. :contentReference[oaicite:25]{index=25}
  ny_lotto: [
    {
      kind: 'lotto',
      code: '6',
      label: 'Jackpot (6 of 6)',
      amount: 'JACKPOT',
      mains: 6,
      special: 'any',
      payoutKind: 'jackpot',
      notes: '75% of prize fund; shared among all 6-of-6 winners.',
    },
    {
      kind: 'lotto',
      code: '5+BONUS',
      label: '2nd-level prize (pari-mutuel): 5 of 6 + Bonus',
      mains: 5,
      special: true,
      payoutKind: 'pari-mutuel',
      notes: 'About 7.25% of prize fund; can roll if no winner.',
    },
    {
      kind: 'lotto',
      code: '5',
      label: '3rd-level prize (pari-mutuel): 5 of 6',
      mains: 5,
      special: false,
      payoutKind: 'pari-mutuel',
      notes: 'About 5.5% of prize fund; recent draws show ~$1,400 per winner.',
    },
    {
      kind: 'lotto',
      code: '4',
      label: '4th-level prize (pari-mutuel): 4 of 6',
      mains: 4,
      special: 'any',
      payoutKind: 'pari-mutuel',
      notes: 'About 6.25% of prize fund; often around $25–$30.',
    },
    {
      kind: 'lotto',
      code: '3',
      label: 'Match 3 of 6 (fixed)',
      amount: 1,
      mains: 3,
      special: 'any',
      payoutKind: 'fixed',
    },
  ],

  // Texas Two Step – several tiers are “estimated / may be higher or lower”; two bottom tiers are fixed. :contentReference[oaicite:26]{index=26}
  tx_texas_two_step: [
    {
      kind: 'lotto',
      code: 'JACKPOT',
      label: 'Jackpot (4 of 4 + Bonus)',
      amount: 'JACKPOT',
      mains: 4,
      special: true,
      payoutKind: 'jackpot',
    },
    {
      kind: 'lotto',
      code: '4',
      label: 'Match 4 of 4 (no Bonus) – estimated',
      mains: 4,
      special: false,
      payoutKind: 'pari-mutuel',
      notes: 'Texas publishes an estimated $1,500.',
    },
    {
      kind: 'lotto',
      code: '3+Bonus',
      label: 'Match 3 + Bonus – estimated',
      mains: 3,
      special: true,
      payoutKind: 'pari-mutuel',
      notes: 'Texas publishes an estimated $50.',
    },
    {
      kind: 'lotto',
      code: '3',
      label: 'Match 3 (no Bonus) – estimated',
      mains: 3,
      special: false,
      payoutKind: 'pari-mutuel',
      notes: 'Texas publishes an estimated $20.',
    },
    {
      kind: 'lotto',
      code: '2+Bonus',
      label: 'Match 2 + Bonus – estimated',
      mains: 2,
      special: true,
      payoutKind: 'pari-mutuel',
      notes: 'Texas publishes an estimated $20.',
    },
    {
      kind: 'lotto',
      code: '1+Bonus',
      label: 'Match 1 + Bonus',
      amount: 7,
      mains: 1,
      special: true,
      payoutKind: 'fixed',
    },
    {
      kind: 'lotto',
      code: '0+Bonus',
      label: 'Bonus only',
      amount: 5,
      mains: 0,
      special: true,
      payoutKind: 'fixed',
    },
  ],

  // California SuperLotto Plus – non-jackpot tiers are pari-mutuel except the $2 and $1 ones. :contentReference[oaicite:27]{index=27}
  ca_superlotto_plus: [
    {
      kind: 'lotto',
      code: 'JACKPOT',
      label: 'Jackpot (5 of 5 + Mega)',
      amount: 'JACKPOT',
      mains: 5,
      special: true,
      payoutKind: 'jackpot',
    },
    {
      kind: 'lotto',
      code: '5',
      label: '2nd-level prize (pari-mutuel): 5 of 5',
      mains: 5,
      special: false,
      payoutKind: 'pari-mutuel',
    },
    {
      kind: 'lotto',
      code: '4+Mega',
      label: '3rd-level prize (pari-mutuel): 4 of 5 + Mega',
      mains: 4,
      special: true,
      payoutKind: 'pari-mutuel',
    },
    {
      kind: 'lotto',
      code: '4',
      label: '4th-level prize (pari-mutuel): 4 of 5',
      mains: 4,
      special: false,
      payoutKind: 'pari-mutuel',
    },
    {
      kind: 'lotto',
      code: '3+Mega',
      label: 'Match 3 of 5 + Mega (pari-mutuel)',
      mains: 3,
      special: true,
      payoutKind: 'pari-mutuel',
    },
    {
      kind: 'lotto',
      code: '3',
      label: 'Match 3 of 5 (pari-mutuel)',
      mains: 3,
      special: false,
      payoutKind: 'pari-mutuel',
    },
    {
      kind: 'lotto',
      code: '2+Mega',
      label: 'Match 2 of 5 + Mega (pari-mutuel)',
      mains: 2,
      special: true,
      payoutKind: 'pari-mutuel',
    },
    {
      kind: 'lotto',
      code: '1+Mega',
      label: 'Match 1 + Mega',
      amount: 2,
      mains: 1,
      special: true,
      payoutKind: 'fixed',
    },
    {
      kind: 'lotto',
      code: '0+Mega',
      label: 'Mega only',
      amount: 1,
      mains: 0,
      special: true,
      payoutKind: 'fixed',
    },
  ],
};

/* ------------------------------------------------------------------ */
/* Digit-game prize templates                                         */
/* ------------------------------------------------------------------ */

const DIGIT_KEYS = new Set<GameKey | LogicalGameKey>([
  'fl_pick2',
  'fl_pick3',
  'fl_pick4',
  'fl_pick5',
  'ny_numbers',
  'ny_win4',
  'tx_pick3',
  'tx_daily4',
  'ca_daily3',
  'ca_daily4',
]);

function digitPrizeTableFor(key: GameKey | LogicalGameKey): PrizeTier[] {
  // We still keep it simple; UI only needs to know which bucket the ticket fell into.
  return [
    {
      kind: 'digits',
      code: 'EXACT',
      label: 'Top result (exact order)',
      exact: true,
      notes: 'Actual payout varies by wager type and state (straight, box, fireball).',
    },
    {
      kind: 'digits',
      code: 'ANY',
      label: 'All digits, any order',
      anyOrder: true,
      notes: 'Represents boxed/any-order style wins.',
    },
  ];
}

/* ------------------------------------------------------------------ */
/* Pool / Keno-ish games (NY Pick 10, NY Quick Draw)                  */
/* ------------------------------------------------------------------ */

function buildPoolTiers(matchDomain: number): PrizeTier[] {
  const tiers: PrizeTier[] = [];
  for (let m = matchDomain; m >= 1; m--) {
    tiers.push({
      kind: 'pool',
      code: `MATCH_${m}`,
      label: `Matched ${m} of ${matchDomain}`,
      matches: m,
      notes: 'Actual prize depends on game rules for this draw.',
    });
  }
  tiers.push({
    kind: 'pool',
    code: 'MATCH_0',
    label: 'Matched 0',
    matches: 0,
    notes: 'Actual prize depends on game rules for this draw.',
  });
  return tiers;
}

/**
 * Get the prize tiers for any game key.
 * Optional opts let Quick Draw tell us how many spots the user picked.
 */
export function prizeTableFor(
  game: GameKey | LogicalGameKey,
  opts?: { poolSpots?: number }
): PrizeTier[] {
  // 1) digits, handled first
  if (DIGIT_KEYS.has(game)) {
    return digitPrizeTableFor(game);
  }

  // 2) explicit pool-ish games
  if (game === 'ny_pick10') {
    return buildPoolTiers(10);
  }
  if (game === 'ny_quick_draw') {
    const spots = opts?.poolSpots ?? 10;
    return buildPoolTiers(spots);
  }

  // 3) fallback to era-based lotto games
  const eraKey = resolveEraGame(game);
  return LOTTO_PRIZES[eraKey] ?? [];
}
