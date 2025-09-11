export const HINT_EXPLAIN: Record<string, string> = {
  'Balanced':
    'No strong hot/cold signals; no obvious sequences or tight clusters.',
  'Pattern looks common':
    'Contains patterns many people choose (runs, many ≤31 “date” numbers, arithmetic sequences, or tight clusters). Avoid to reduce shared-jackpot risk.',
  'Cold mains':
    'At least 3 mains have appeared ≤1 time — a colder mix.',
  'Hot mains':
    'At least 3 mains show z-score > 1 (hit more than expected recently).',
  'Hot special':
    'Special ball z-score > 1 (more frequent lately).',
  'Cold special':
    'Special ball z-score < -1 (less frequent lately).',
};

// Map each hint to a visual tone
export function classifyHint(hint: string): 'hot' | 'cold' | 'neutral' | 'warn' {
  if (hint === 'Balanced') return 'neutral';
  if (hint === 'Hot mains' || hint === 'Hot special') return 'hot';
  if (hint === 'Cold special' || hint.startsWith('Cold mains')) return 'cold';
  if (hint === 'Pattern looks common') return 'warn';
  return 'neutral';
}
