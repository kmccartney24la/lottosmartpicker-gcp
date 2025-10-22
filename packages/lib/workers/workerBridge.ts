// lib/workers/workerBridge.ts
// Tiny RPC bridge for the Worker with cancel via AbortSignal.
// Usage: call(run<'computeStats'>(..., signal))

type Task =
  | 'parseCanonicalCsv'
  | 'parseFlexibleCsv'
  | 'computeStats'
  | 'analyzeGame'
  | 'generateTicket'
  // non-5-ball tasks
  | 'computeDigitStats'
  | 'computePick10Stats'
  | 'computeQuickDrawStats'
  | 'generatePick10Ticket'
  | 'generateQuickDrawTicket';

let _worker: Worker | null = null;
function getWorker(): Worker {
  if (_worker) return _worker;
  _worker = new Worker(new URL('../../src/workers/lspWorker.ts', import.meta.url), { type: 'module' });
  return _worker;
}

const pending = new Map<string, { resolve: (v:any)=>void; reject: (e:any)=>void }>();
getWorker().onmessage = (e: MessageEvent<{ id: string; ok: boolean; payload?: any; error?: string }>) => {
  const { id, ok, payload, error } = e.data || {};
  const p = pending.get(id); if (!p) return;
  pending.delete(id);
  ok ? p.resolve(payload) : p.reject(new Error(error || 'Worker error'));
};

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function runTask<TArgs extends object, TResult>(
  type: Task,
  args: TArgs,
  signal?: AbortSignal
): Promise<TResult> {
  const id = uuid();
  const w = getWorker();
  const promise = new Promise<TResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });
    if (signal) {
      if (signal.aborted) {
        pending.delete(id);
        return reject(new DOMException('Aborted', 'AbortError'));
      }
      const onAbort = () => {
        // remove and notify worker to drop late replies
        pending.delete(id);
        try { w.postMessage({ id, type: 'cancel' }); } catch {}
        reject(new DOMException('Aborted', 'AbortError'));
        signal.removeEventListener('abort', onAbort);
      };
      signal.addEventListener('abort', onAbort);
    }
    w.postMessage({ id, type, ...args });
  });
  return promise;
}

export function terminateWorker() {
  if (_worker) { _worker.terminate(); _worker = null; }
  pending.clear();
}
