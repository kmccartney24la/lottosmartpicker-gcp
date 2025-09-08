// scripts/repair-lotto-csv.ts
/* eslint-disable no-console */
// Usage:
//   pnpm ts-node scripts/repair-lotto-csv.ts <in.csv> <out.csv> [--game powerball|megamillions]
// Notes:
//   - If --game omitted, script tries to infer from ranges.
//   - Handles files that have literal "\n" inside a single line and stray ellipses "…" or "...".

import fs from 'node:fs';
import path from 'node:path';

type GameKey = 'powerball'|'megamillions';
const RANGES: Record<GameKey, {mainMax:number; specMax:number}> = {
  powerball: { mainMax:69, specMax:26 },
  megamillions: { mainMax:70, specMax:25 },
};

function usage(msg?:string) {
  if (msg) console.error('Error:', msg);
  console.error('Usage: pnpm ts-node scripts/repair-lotto-csv.ts <in.csv> <out.csv> [--game powerball|megamillions]');
  process.exit(msg ? 1 : 0);
}

const [, , inPath, outPath, ...rest] = process.argv;
if (!inPath || !outPath) usage();

let forcedGame: GameKey|undefined;
for (let i=0;i<rest.length;i++) {
  if (rest[i]==='--game' && rest[i+1]) {
    const g = rest[i+1] as GameKey;
    if (g!=='powerball' && g!=='megamillions') usage('Invalid --game');
    forcedGame = g; i++;
  }
}

const raw = fs.readFileSync(path.resolve(inPath), 'utf8');

// Normalize: real newlines, strip ellipses noise
let text = raw.replaceAll('\\n', '\n').replaceAll('\r\n', '\n').replaceAll('\r', '\n');
// remove Unicode ellipsis and triple dots that may splice digits
text = text.replaceAll('…', '').replaceAll('...', '');

// Split lines
const lines = text.split('\n').filter(l => l.trim().length>0);

// Helpers
const dateRe = /(\d{4}-\d{2}-\d{2})/;
function onlyInts(s: string) {
  return (s.match(/\d+/g) || []).map(t => parseInt(t,10)).filter(n => Number.isFinite(n));
}

type Row = { game: GameKey; date: string; n1:number; n2:number; n3:number; n4:number; n5:number; special:number };
const out: Row[] = [];

function inferGame(mainMax:number, specMax:number): GameKey|undefined {
  if (mainMax<=69 && specMax<=26) return 'powerball';
  if (mainMax<=70 && specMax<=25) return 'megamillions';
  return undefined;
}

for (const lineOrig of lines) {
  const line = lineOrig.trim();
  if (!line) continue;

  // Skip header-ish lines
  if (/^game\s*,\s*date\s*,/i.test(line)) continue;

  // Try read game from row if present
  let rowGame: GameKey|undefined = forcedGame;
  if (!rowGame) {
    if (/^powerball/i.test(line)) rowGame = 'powerball';
    else if (/^megamillions/i.test(line)) rowGame = 'megamillions';
  }

  // Extract date
  const md = line.match(dateRe);
  if (!md) continue; // no date found
  const date = md[1];

  // Numbers: remove the date substring to avoid grabbing Y-M-D, then take first 6 ints
  const lineNoDate = line.replace(date, ' ');
  const nums = onlyInts(lineNoDate);
  if (nums.length < 6) continue;
  const [n1,n2,n3,n4,n5,special] = nums.slice(0,6);

  // If still no game, infer from ranges on the fly
  if (!rowGame) {
    const maxMain = Math.max(n1,n2,n3,n4,n5);
    const g = inferGame(maxMain, special);
    if (!g) continue;
    rowGame = g;
  }

  const ranges = RANGES[rowGame];
  const mains = [n1,n2,n3,n4,n5];
  const mainsValid = mains.every(n => n>=1 && n<=ranges.mainMax);
  const specValid = special>=1 && special<=ranges.specMax;
  if (!mainsValid || !specValid) {
    // Try fallback: maybe the line had "game," prefix with commas shifting tokens
    // but we already stripped ellipses and parsed by ints; if out of range, drop row
    continue;
  }

  out.push({ game: rowGame, date, n1,n2,n3,n4,n5, special });
}

// Basic sanity: ensure sorted by date
out.sort((a,b) => a.date.localeCompare(b.date));

const header = 'game,date,n1,n2,n3,n4,n5,special';
const body = out.map(r => `${r.game},${r.date},${r.n1},${r.n2},${r.n3},${r.n4},${r.n5},${r.special}`).join('\n');
fs.writeFileSync(path.resolve(outPath), `${header}\n${body}\n`, 'utf8');

console.log(`Wrote ${out.length} rows → ${outPath}`);
