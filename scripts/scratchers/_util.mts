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

export function sleep(ms:number){ return new Promise(r=>setTimeout(r,ms)); }

export function ensureError(e: unknown): Error {
  if (e instanceof Error) return e;
  if (typeof e === 'string') return new Error(e);
  try { return new Error(`Non-Error thrown: ${JSON.stringify(e)}`); }
  catch { return new Error(`Non-Error thrown: ${String(e)}`); }
}

export async function withRetry<T>(fn: () => Promise<T>, label: string, tries = 3) {
  let last: Error | null = null;
  for (let i = 1; i <= tries; i++) {
    try { return await fn(); }
    catch (e) {
      const err = ensureError(e);
      last = err;
      console.warn(`[${label}] attempt ${i}/${tries} failed: ${err.message}`);
      if (i < tries) await sleep(1500 * i);
    }
  }
  throw last ?? new Error(`[${label}] Unknown failure`);
}

