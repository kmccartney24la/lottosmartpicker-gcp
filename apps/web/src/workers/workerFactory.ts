'use client';

export function createLspWorker() {
  // Path is relative to THIS file. Next will bundle the TS worker.
  return new Worker(new URL('./lspWorker.ts', import.meta.url), {
    type: 'module',
    name: 'lspWorker',
  });
}
