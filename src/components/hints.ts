export const HINT_EXPLAIN: Record<string, string> = {
  'Balanced':
    'No strong hot/cold signals; no obvious sequences or tight clusters.',
  'Pattern looks common':
    'Contains patterns many people choose (runs, many ≤31 “date” numbers, arithmetic sequences, or tight clusters). Avoid to reduce shared-jackpot risk.',
  'Uncommon mix (many rare mains)':
    'At least 3 mains have appeared ≤1 time in the current era sample — a colder mix.',
  'Hot-heavy mains':
    'At least 3 mains show z-score > 1 (hit more than expected recently).',
  'Hot special':
    'Special ball z-score > 1 in the current era (more frequent lately).',
  'Cold special':
    'Special ball z-score < -1 in the current era (less frequent lately).',
};

// Map each hint to a visual tone
export function classifyHint(hint: string): 'hot' | 'cold' | 'neutral' | 'warn' {
  if (hint === 'Balanced') return 'neutral';
  if (hint === 'Hot-heavy mains' || hint === 'Hot special') return 'hot';
  if (hint === 'Cold special' || hint.startsWith('Uncommon mix')) return 'cold';
  if (hint === 'Pattern looks common') return 'warn';
  return 'neutral';
}
