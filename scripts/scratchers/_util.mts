// scripts/scratchers/_util.mts
export const sleep = (ms:number)=>new Promise(r=>setTimeout(r,ms));
export const toNum = (s:string) => {
  const t = s.replace(/[,\$]/g,'').trim();
  if (!t || t === '—' || t.toLowerCase()==='na') return 0;
  if (/^1\s*in\s*/i.test(t)) return parseFloat(t.replace(/^1\s*in\s*/i,'').trim()) || 0;
  return parseFloat(t) || 0;
};
export const priceFromString = (s:string)=> toNum(s.replace(/[^0-9.]/g,''));
export const oddsFromText = (s:string)=> {
  const m = s.match(/1\s*in\s*([0-9.]+)/i);
  return m ? parseFloat(m[1]) : undefined;
};
export function ensureError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (typeof e === 'string') return new Error(e);
  try { return new Error(JSON.stringify(e)); } catch { return new Error(String(e)); }
}
