// Node 18+ required (built-in fetch). Run: node scripts/update_csvs.mjs
import fs from 'node:fs/promises';
import path from 'node:path';

// ---------- Helpers ----------
const root = (...p) => path.join(process.cwd(), ...p);
const isoDate = (d) => new Date(d).toISOString().slice(0,10);
const exists = async (p) => !!(await fs.stat(p).catch(()=>false));

async function readLastDateFromCsv(file) {
  if (!await exists(file)) return null;
  const txt = await fs.readFile(file, 'utf8');
  const lines = txt.split(/\r?\n/).map(l=>l.trim()).filter(Boolean);
  if (lines.length <= 1) return null; // only header
  const last = lines[lines.length - 1];
  const dateStr = last.split(',')[0]; // first column is draw_date
  return dateStr || null;
}

async function appendRows(file, header, rows) {
  let out = '';
  const present = await exists(file);
  if (!present) {
    out += header + '\n';
  } else {
    // ensure file ends with newline
    const current = await fs.readFile(file, 'utf8');
    if (!current.endsWith('\n')) await fs.writeFile(file, current + '\n');
  }
  await fs.appendFile(file, rows.map(r => r.join(',')).join('\n') + '\n', 'utf8');
}

// ---------- Cash4Life from NY Open Data ----------
async function updateCash4Life() {
  const file = root('public/data/ga/cash4life.csv');
  const header = 'draw_date,m1,m2,m3,m4,m5,cash_ball';
  const last = await readLastDateFromCsv(file); // YYYY-MM-DD
  const since = last ? last : '2014-06-16'; // dataset start (safe)

  const base = 'https://data.ny.gov/resource/kwxv-fwze.json';
  const params = new URLSearchParams({
    $select: 'draw_date,winning_numbers,cash_ball',
    $where: `draw_date > '${since}'`,     // strict ">" to avoid duplicate last line
    $order: 'draw_date ASC',
    $limit: '50000'
  });
  const url = `${base}?${params.toString()}`;
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`Cash4Life fetch failed: ${res.status}`);
  const arr = await res.json();

  const toRow = (r) => {
    const d = isoDate(r.draw_date);
    const nums = String(r.winning_numbers||'').split(/[^\d]+/).filter(Boolean).map(n=>parseInt(n,10)).slice(0,5);
    const cb = parseInt(r.cash_ball, 10);
    if (nums.length !== 5 || !Number.isFinite(cb)) return null;
    return [d, ...nums, cb];
  };

  const rows = arr.map(toRow).filter(Boolean);
  if (rows.length === 0) return { updated:false, added:0 };
  await appendRows(file, header, rows);
  return { updated:true, added:rows.length };
}

// ---------- Fantasy 5 from pending JSON (manual input) ----------
async function updateFantasy5() {
  const file = root('public/data/ga/fantasy5.csv');
  const header = 'draw_date,m1,m2,m3,m4,m5';
  const pendingFile = root('data/ga/fantasy5_pending.json');

  if (!await exists(pendingFile)) return { updated:false, reason:'no pending file' };

  const last = await readLastDateFromCsv(file);       // YYYY-MM-DD
  const raw = JSON.parse(await fs.readFile(pendingFile, 'utf8'));
  const d = new Date(raw.draw_date);
  if (Number.isNaN(+d)) return { updated:false, reason:'bad draw_date in pending' };

  const dISO = isoDate(d);
  if (last && dISO <= last) return { updated:false, reason:'pending not newer than last CSV date' };

  const nums = [raw.m1, raw.m2, raw.m3, raw.m4, raw.m5].map(n=>parseInt(n,10));
  if (nums.some(n => !Number.isFinite(n) || n < 1 || n > 42)) {
    return { updated:false, reason:'numbers invalid or out of 1..42' };
  }
  await appendRows(file, header, [[dISO, ...nums]]);
  // Optional: clear pending
  await fs.unlink(pendingFile).catch(()=>{});
  return { updated:true, added:1 };
}

// ---------- Run both ----------
async function main() {
  const c4 = await updateCash4Life().catch(e => ({ updated:false, error:String(e) }));
  const f5 = await updateFantasy5().catch(e => ({ updated:false, error:String(e) }));

  console.log('[Cash4Life]', c4);
  console.log('[Fantasy5]', f5);
}
main().catch(e => { console.error(e); process.exit(1); });
