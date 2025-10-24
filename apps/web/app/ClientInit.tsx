'use client';

import { useEffect } from 'react';
import Script from 'next/script';
import { setWorkerFactory } from '@lsp/lib/workers/workerBridge';
import { createLspWorker } from '../src/workers/workerFactory';

export default function ClientInit() {
  useEffect(() => {
    // Register the worker factory once on the client
    setWorkerFactory(createLspWorker);

    // Optional global fallback if some code looks for it
    (globalThis as any).__LSP_WORKER_FACTORY__ = createLspWorker;

    // Optional: allow enabling via global flag for USE_WORKER
    (globalThis as any).__LSP_USE_WORKER__ = true;
  }, []);

  // Defensive init for a third-party script (e.g., "h1-check.js") that may expose detectStore().
  // We never assume it's present or that it returns a Promise; we guard every step.
  const onThirdPartyReady = () => {
    try {
      // Common attach points; adjust if your script uses a different global.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const mod: any =
        (globalThis as any).__H1_CHECK__ ||
        (globalThis as any).H1_CHECK ||
        (globalThis as any).h1Check;

      const detect =
        mod?.default?.detectStore ??
        mod?.detectStore;

      if (typeof detect === 'function') {
        const result = detect();
        const isThenable = !!result && typeof (result as any).then === 'function';
        if (isThenable) {
          (result as Promise<unknown>)
            .then(() => {
              // Store ready; no-op or place follow-up work here.
            })
            .catch(() => {
              // Swallow to avoid crashing the app under strict CSP
            });
        }
        // If not a promise, we consider it a no-op and do nothing.
      }
    } catch {
      // Never let a flaky third-party init crash the app.
    }
  };

  return (
    <>
      {/* Guarded load; adjust src if your script lives elsewhere. */}
      <Script
        id="third-party-h1-check"
        src="/scripts/h1-check.js"
        strategy="afterInteractive"
        onLoad={onThirdPartyReady}
        onError={() => { /* optional: console.warn('h1-check failed to load'); */ }}
      />
    </>
  );
}
