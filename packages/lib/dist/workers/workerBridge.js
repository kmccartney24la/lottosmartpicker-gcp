'use client';
let _factory = null;
let _worker = null;
export function setWorkerFactory(factory) {
    _factory = factory;
    // reset current worker so we recreate with the latest factory when needed
    if (_worker) {
        _worker.terminate();
        _worker = null;
    }
}
function ensureWorker() {
    if (_worker)
        return _worker;
    // Prefer explicit factory, fall back to global for convenience.
    const factory = _factory || globalThis.__LSP_WORKER_FACTORY__;
    if (typeof factory !== 'function') {
        throw new Error('No worker factory registered. Call setWorkerFactory(createLspWorker) in a client initializer.');
    }
    _worker = factory();
    // Wire the message handler once on creation
    _worker.onmessage = (e) => {
        const { id, ok, payload, error } = e.data || {};
        const p = pending.get(id);
        if (!p)
            return;
        pending.delete(id);
        ok ? p.resolve(payload) : p.reject(new Error(error || 'Worker error'));
    };
    return _worker;
}
const pending = new Map();
function uuid() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
export function runTask(type, args, signal) {
    const id = uuid();
    const w = ensureWorker();
    return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        if (signal) {
            if (signal.aborted) {
                pending.delete(id);
                return reject(new DOMException('Aborted', 'AbortError'));
            }
            const onAbort = () => {
                pending.delete(id);
                try {
                    w.postMessage({ id, type: 'cancel' });
                }
                catch { }
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
