// src/components/hint.ts
export const HINT_EXPLAIN: Record<string, string> = {
  'Balanced':
    'No strong hot/cold signals; no obvious sequences or tight clusters.',
  'Hot mains':
    'At least 3 numbers show z-score > 1 (hit more than expected recently).',
  'Cold mains':
    'At least 3 numbers have appeared ≤1 time — a colder mix.',
  'Hot special':
    'Special ball z-score > 1 (more frequent lately).',
  'Cold special':
    'Special ball z-score < -1 (less frequent lately).',
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
  return 'neutral';
}

/** User-facing label mapping (short + friendly). */
const HINT_DISPLAY: Record<string, string> = {
  // unify “mains” and “digits” → “numbers”
  'Hot mains': 'Hot numbers',
  'Cold mains': 'Cold numbers',
  'Hot digits': 'Hot numbers',
  'Cold digits': 'Cold numbers',
  // everything else keeps its own label by default
};

/** Convert internal hint label → display label (fallback to original). */
export function displayHint(label: string): string {
  return HINT_DISPLAY[label] ?? label;
}
