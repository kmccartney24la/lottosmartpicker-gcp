// scripts-clean.js
import { rmSync, existsSync } from 'node:fs';
const paths = [
  'package-lock.json',
  'node_modules',
  'apps/web/node_modules',
  'packages/lib/node_modules',
  'packages/scripts/node_modules'
];
for (const p of paths) {
  try {
    if (existsSync(p)) rmSync(p, { recursive: true, force: true });
  } catch {}
}
// Also nuke any nested lockfiles (some deps mistakenly ship these)
try {
  if (existsSync('node_modules/.package-lock.json')) rmSync('node_modules/.package-lock.json', { force: true });
} catch {}
console.log('clean done');
