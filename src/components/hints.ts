// src/components/hint.ts
export const HINT_EXPLAIN: Record<string, string> = {
  'Balanced':
    'No strong hot/cold signals; no obvious sequences or tight clusters.',
  'Hot mains':
    'At least 3 mains show z-score > 1 (hit more than expected recently).',
'Cold mains':
    'At least 3 mains have appeared ≤1 time — a colder mix.',
  'Hot special':
    'Special ball z-score > 1 (more frequent lately).',
  'Cold special':
    'Special ball z-score < -1 (less frequent lately).',
'Pattern looks common':
    'Contains patterns many people choose.',
};

// Map each hint to a visual tone
export function classifyHint(hint: string): 'hot' | 'cold' | 'neutral' | 'warn' {
  if (hint === 'Balanced') return 'neutral';
  if (hint === 'Hot mains' || hint === 'Hot special') return 'hot';
  if (hint === 'Cold special' || hint.startsWith('Cold mains')) return 'cold';
  if (hint === 'Pattern looks common') return 'warn';
  return 'neutral';
}
