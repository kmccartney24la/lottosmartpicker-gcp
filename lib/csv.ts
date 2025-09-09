// lib/csv.ts
import type { LottoRow } from '@/lib/lotto';

/** Pure helper: runs in any runtime (no fs/path). */
export function rowsToCSV(rows: LottoRow[], eol: '\n' | '\r\n' = '\n'): string {
  const includeSpecial = rows.some(r => typeof r.special === 'number');
  const header = includeSpecial
    ? 'game,date,n1,n2,n3,n4,n5,special'
    : 'game,date,n1,n2,n3,n4,n5';
  const body = rows
    .map(r =>
      includeSpecial
        ? `${r.game},${r.date},${r.n1},${r.n2},${r.n3},${r.n4},${r.n5},${r.special ?? ''}`
        : `${r.game},${r.date},${r.n1},${r.n2},${r.n3},${r.n4},${r.n5}`
    )
    .join(eol);
  return `${header}${eol}${body}${eol}`;
}
