// src/components/hint.ts
export const HINT_EXPLAIN: Record<string, string> = {
  /* Core (all games) */
  'Balanced':
    'No strong hot/cold signals; no obvious sequences or tight clusters.',
  'Hot mains':
    'At least three of your main numbers have been hitting more than usual in recent draws.',
  'Cold mains':
    'At least three of your main numbers have shown up rarely in recent draws.',
  'Hot special':
    'Your special (bonus) number has been hitting more than usual in recent draws.',
  'Cold special':
    'Your special (bonus) number has shown up rarely in recent draws.',
  '3-in-a-row':
    'Contains a consecutive run of three numbers (e.g., 21-22-23).',
  '4-in-a-row':
    'Contains a consecutive run of four numbers (very common pick pattern).',
  'Arithmetic sequence':
    'All numbers form a fixed-interval sequence (e.g., 2-6-10-14-18).',
  'Birthday-heavy':
    'Four or more numbers are 31 or under — a common pick bias.',
  'Tight span':
    'Numbers are clustered in a very narrow range of the pool.',
  // Digit-game native
  'Pair':
    'Two matching digits (e.g., 1-1-3).',
  'Triple':
    'Three matching digits (e.g., 7-7-7).',
  'Quad':
    'All four digits match (e.g., 5-5-5-5).',
  'Palindrome':
    'Reads the same forward and backward (e.g., 1-2-1).',
  'Sequential digits':
    'Ascending or descending sequence of digits.',
  'Low-heavy':
    'Most digits are 0–4.',
  'High-heavy':
    'Most digits are 5–9.',
  'Sum outlier':
    'Digit sum is unusually low or high for this game.',
  'Hot digits':
    'Many digits show higher-than-expected recent frequency.',
  'Cold digits':
    'Many digits show lower-than-expected recent frequency.',

  /* Digit-game play types (simple, newcomer-friendly) */
  'Straight':
    'Your digits must match the winning numbers in the exact same order.',
  'Box':
    'Match in any order. Payout depends on the number of unique orders for your digits.',
  'Wheel':
    'Plays every possible order of your digits on separate Straight bets. Cost scales with the number of orders.',
  /* Jurisdiction-specific cover-all-orders */
  'Combo (FL)':
    'Florida Pick 3/4: wager on each possible Straight combination of your digits on one ticket. Cost scales with # of orders; wins Straight prizes.',
  'Combination (NY)':
    'NY Numbers/Win4: play all Straight permutations on one ticket. Cost scales with # of orders; wins Straight prizes.',
  'Front Pair':
    'Match the first two digits in exact order (often available on Pick 3 or Pick 4).',
  'Mid Pair':
    'Match the middle two digits in exact order (usually for Pick 4).',
  'Back Pair':
    'Match the last two digits in exact order (often available on Pick 3 or Pick 4).',
  'Front Number':
    'Pick just the first digit. Win if that first digit matches exactly.',
  'Back Number':
    'Pick just the last digit. Win if that last digit matches exactly.',
  /* Box subtypes by game size */
  '2-Way Box':
    'Pick 2: digits are different; 2 unique orders.',
  '3-Way Box':
    'Pick 3: one pair + one distinct digit; 3 unique orders.',
  '6-Way Box':
    'Pick 3: three distinct digits; 6 unique orders. Pick 4: two pairs; 6 unique orders.',
  '4-Way Box':
    'Pick 4: three identical + one distinct; 4 unique orders.',
  '12-Way Box':
    'Pick 4: one pair + two distinct digits; 12 unique orders.',
  '24-Way Box':
    'Pick 4: four distinct digits; 24 unique orders.',
  '5-Way Box':
    'Pick 5: four identical + one distinct; 5 unique orders.',
  '10-Way Box':
    'Pick 5: three identical + a pair; 10 unique orders.',
  '20-Way Box':
    'Pick 5: three identical + two distinct; 20 unique orders.',
  '30-Way Box':
    'Pick 5: two pairs + one distinct; 30 unique orders.',
  '60-Way Box':
    'Pick 5: one pair + three distinct; 60 unique orders.',
  '120-Way Box':
    'Pick 5: five distinct digits; 120 unique orders.',
};


// Map each hint to a visual tone
export function classifyHint(hint: string): 'hot' | 'cold' | 'neutral' | 'warn' {
  if (hint === 'Balanced') return 'neutral';
  if (hint === 'Hot mains' || hint === 'Hot digits' || hint === 'Hot special') return 'hot';
  if (hint === 'Cold special' || hint === 'Cold mains' || hint === 'Cold digits') return 'cold';
  if (
    hint === '3-in-a-row' || hint === '4-in-a-row' ||
    hint === 'Arithmetic sequence' || hint === 'Birthday-heavy' ||
    hint === 'Tight span' || hint === 'Sequential digits' ||
    hint === 'Pair' || hint === 'Triple' || hint === 'Quad' ||
    hint === 'Palindrome' || hint === 'Low-heavy' || hint === 'High-heavy' ||
    hint === 'Sum outlier'
  ) return 'warn';
  // Play types are informational, not “good” or “bad”
  if (
    hint === 'Straight' || hint === 'Box' ||  hint === 'Wheel' || hint === 'Combo (FL)' || hint === 'Combination (NY)' ||
    hint === '2-Way Box' || hint === '3-Way Box' || hint === '4-Way Box' || 
    hint === '6-Way Box' || hint === '12-Way Box' || hint === '24-Way Box' ||
    hint === '5-Way Box' || hint === '10-Way Box' || hint === '20-Way Box' ||
    hint === '30-Way Box' || hint === '60-Way Box' || hint === '120-Way Box' ||
    hint === 'Front Pair' || hint === 'Mid Pair' || 
    hint === 'Back Pair' || hint === 'Front Number' || hint === 'Back Number'
  ) return 'neutral';
  return 'neutral';
}

/** User-facing label mapping (short + friendly). */
const HINT_DISPLAY: Record<string, string> = {
  // unify “mains” and “digits” → “numbers”
  'Hot mains': 'Hot numbers',
  'Cold mains': 'Cold numbers',
  'Hot digits': 'Hot numbers',
  'Cold digits': 'Cold numbers',
  // friendlier surface labels while keeping jurisdiction-specific tooltips
  'Combo (FL)': 'Combo',
  'Combination (NY)': 'Combination',
  // everything else keeps its own label by default
};

/** Convert internal hint label → display label (fallback to original). */
export function displayHint(label: string): string {
  return HINT_DISPLAY[label] ?? label;
}
