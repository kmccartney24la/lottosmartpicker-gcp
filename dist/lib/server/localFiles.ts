// lib/server/localFiles.ts
import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

/** Read a file under /public using Node fs (server-only). */
export async function readPublicFile(relPath: string): Promise<string> {
  // `process.cwd()` is the project root during Next build/runtime on Node
  const full = path.join(process.cwd(), 'public', relPath.replace(/^\//, ''));
  return await readFile(full, 'utf8');
}
