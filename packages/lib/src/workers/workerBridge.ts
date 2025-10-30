'use client';

// Tiny RPC bridge for the Worker with cancel via AbortSignal.
// Usage in app: setWorkerFactory(() => new Worker(...)); then runTask(...)

type Task =
  | 'parseCanonicalCsv'
  | 'parseFlexibleCsv'
  | 'computeStats'
  | 'analyzeGame'
  | 'generateTicket'
  | 'computeDigitStats'
  | 'computePick10Stats'
  | 'computeQuickDrawStats'
  | 'generatePick10Ticket'
  | 'generateQuickDrawTicket'
  | 'computeAllOrNothingStats'
  | 'generateAllOrNothingTicket';

type WorkerFactory = () => Worker;

let _factory: WorkerFactory | null = null;
let _worker: Worker | null = null;

export function setWorkerFactory(factory: WorkerFactory) {
  _factory = factory;
  // reset current worker so we recreate with the latest factory when needed
  if (_worker) {
    _worker.terminate();
    _worker = null;
  }
}

function ensureWorker(): Worker {
  if (_worker) return _worker;

  // Prefer explicit factory, fall back to global for convenience.
  const factory =
    _factory || (globalThis as any).__LSP_WORKER_FACTORY__ as WorkerFactory | undefined;

  if (typeof factory !== 'function') {
    throw new Error(
      'No worker factory registered. Call setWorkerFactory(createLspWorker) in a client initializer.'
    );
  }

  _worker = factory();

  // Wire the message handler once on creation
  _worker.onmessage = (
    e: MessageEvent<{ id: string; ok: boolean; payload?: any; error?: string }>
  ) => {
    const { id, ok, payload, error } = e.data || {};
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    ok ? p.resolve(payload) : p.reject(new Error(error || 'Worker error'));
  };

  return _worker;
}

const pending = new Map<string, { resolve: (v: any) => void; reject: (e: any) => void }>();

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export function runTask<TArgs extends object, TResult>(
  type: Task,
  args: TArgs,
  signal?: AbortSignal
): Promise<TResult> {
  const id = uuid();
  const w = ensureWorker();

  return new Promise<TResult>((resolve, reject) => {
    pending.set(id, { resolve, reject });

    if (signal) {
      if (signal.aborted) {
        pending.delete(id);
        return reject(new DOMException('Aborted', 'AbortError'));
      }
      const onAbort = () => {
        pending.delete(id);
        try { w.postMessage({ id, type: 'cancel' }); } catch {}
        reject(new DOMException('Aborted', 'AbortError'));
        signal.removeEventListener('abort', onAbort);
      };
      signal.addEventListener('abort', onAbort);
    }

    w.postMessage({ id, type, ...args });
  });
}

export function terminateWorker() {
  if (_worker) {
    _worker.terminate();
    _worker = null;
  }
  pending.clear();
}
