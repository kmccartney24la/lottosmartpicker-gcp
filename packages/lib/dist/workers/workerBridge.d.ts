type Task = 'parseCanonicalCsv' | 'parseFlexibleCsv' | 'computeStats' | 'analyzeGame' | 'generateTicket' | 'computeDigitStats' | 'computePick10Stats' | 'computeQuickDrawStats' | 'generatePick10Ticket' | 'generateQuickDrawTicket' | 'computeAllOrNothingStats' | 'generateAllOrNothingTicket';
type WorkerFactory = () => Worker;
export declare function setWorkerFactory(factory: WorkerFactory): void;
export declare function runTask<TArgs extends object, TResult>(type: Task, args: TArgs, signal?: AbortSignal): Promise<TResult>;
export declare function terminateWorker(): void;
export {};
