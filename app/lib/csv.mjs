// lib/csv.mjs
export function toCanonicalCsv(rows) {
  // rows: [{ draw_date:'YYYY-MM-DD', num1..num5, special?:number }]
  // - dedupe by draw_date
  // - sort ascending
  const map = new Map();
  for (const r of rows) map.set(r.draw_date, r);
  const deduped = Array.from(map.values()).sort((a,b) => a.draw_date.localeCompare(b.draw_date));

  const header = ['draw_date','num1','num2','num3','num4','num5','special'];
  const lines = [header.join(',')];

  for (const r of deduped) {
    const cols = [
      r.draw_date,
      r.num1, r.num2, r.num3, r.num4, r.num5,
      r.special ?? '' // Fantasy 5 has no special
    ];
    // Basic validity
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(r.draw_date))) continue;
    if ([r.num1,r.num2,r.num3,r.num4,r.num5].some(n => !Number.isFinite(Number(n)))) continue;
    lines.push(cols.join(','));
  }

  return lines.join('\n') + '\n';
}

export function latestCsv(fullCsv) {
  const lines = fullCsv.trim().split(/\r?\n/);
  const header = lines[0] || '';
  const last = lines[lines.length - 1];
  if (!last || last === header) return header + '\n';
  return header + '\n' + last + '\n';
}
