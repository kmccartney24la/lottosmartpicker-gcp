// app/api/export/route.ts
import { NextResponse } from 'next/server';
import type { GameKey, LottoRow } from '@lib/lotto';
import { getCurrentEraConfig } from '@lib/lotto';
import { remoteFor } from '@lib/server/remotes';

// ---- parse canonical CSV (matches your lib/lotto.ts version) ----
function parseCanonicalCsv(csv: string, gameDefault: GameKey): LottoRow[] {
  const lines = csv.trim().split(/\r?\n/);
  if (!lines.length) return [];
  const cols = lines.shift()!.split(',').map(s => s.trim().toLowerCase());
  const idx = (k:string)=> cols.indexOf(k);
  const iGame = idx('game'), iDate = idx('draw_date');
  const i1 = idx('m1'), i2 = idx('m2'), i3 = idx('m3'), i4 = idx('m4'), i5 = idx('m5');
  const iSpec = idx('special');

  const out: LottoRow[] = [];
  for (const line of lines) {
    const t = line.split(',').map(s=>s.trim());
    if (t.length < 6) continue;
    const game = (iGame >= 0 && t[iGame]) ? (t[iGame] as GameKey) : gameDefault;
    const d = iDate >= 0 ? new Date(t[iDate]) : new Date(NaN);
    if (!Number.isFinite(d.valueOf())) continue;
    const date = d.toISOString().slice(0,10);
    const mains = [t[i1],t[i2],t[i3],t[i4],t[i5]].map(v=>parseInt(v,10));
    if (mains.some(n=>!Number.isFinite(n))) continue;
    const special = (iSpec >= 0 && t[iSpec] !== '' && t[iSpec] != null) ? parseInt(t[iSpec],10) : undefined;
    const [n1,n2,n3,n4,n5] = mains;
    out.push({ game, date, n1,n2,n3,n4,n5, special });
  }
  return out;
}

function applyFilters(rows: LottoRow[], opts: { since?: string; until?: string; latestOnly?: boolean }): LottoRow[] {
  let out = rows;
  if (opts.since) out = out.filter(r => r.date >= opts.since!);
  if (opts.until) {
    const end = new Date(opts.until);
    end.setDate(end.getDate() + 1);
    const endISO = end.toISOString().slice(0,10);
    out = out.filter(r => r.date < endISO);
  }
  if (opts.latestOnly) out = out.slice(-1);
  return out;
}

function rowsToCSV(rows: LottoRow[], eol = '\n'): string {
  const includeSpecial = rows.some(r => typeof r.special === 'number');
  const header = includeSpecial ? 'game,date,n1,n2,n3,n4,n5,special' : 'game,date,n1,n2,n3,n4,n5';
  const body = rows.map(r =>
    includeSpecial
      ? `${r.game},${r.date},${r.n1},${r.n2},${r.n3},${r.n4},${r.n5},${r.special ?? ''}`
      : `${r.game},${r.date},${r.n1},${r.n2},${r.n3},${r.n4},${r.n5}`
  ).join(eol);
  return `${header}${eol}${body}${eol}`;
}

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const game = searchParams.get('game') as GameKey | null;
  if (!game) return NextResponse.json({ error: 'Missing ?game=' }, { status: 400 });

  const sinceParam = searchParams.get('since') || undefined;
  const until = searchParams.get('until') || undefined;
  const latestOnly = ['1','true'].includes((searchParams.get('latestOnly')||'').toLowerCase());

  const since = sinceParam ?? getCurrentEraConfig(game).start;
  const remote = remoteFor(game);
  if (!remote) return NextResponse.json({ error: `No remote URL configured for ${game}` }, { status: 500 });

  try {
    const r = await fetch(remote, { cache: 'no-store' });
    if (!r.ok) throw new Error(`Upstream ${r.status}`);
    const csv = await r.text();
    const all = parseCanonicalCsv(csv, game);
    const rows = applyFilters(all, { since, until, latestOnly });
    const out = rowsToCSV(rows);
    const filename = `${game}_${since ?? 'start'}_${until ?? 'today'}${latestOnly ? '_latest' : ''}.csv`;
    return new NextResponse(out, {
      headers: {
        'content-type': 'text/csv; charset=utf-8',
        'content-disposition': `attachment; filename="${filename}"`,
        'cache-control': 'no-store',
      },
    });
  } catch (e:any) {
    return NextResponse.json({ error: e?.message || 'Export failed' }, { status: 500 });
  }
}
