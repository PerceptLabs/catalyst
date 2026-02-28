// CatalystProc — Process management layer
export { ProcessManager } from './ProcessManager.js';
export { CatalystProcess } from './CatalystProcess.js';
export type { ProcessOptions, ExecResult, ProcessManagerConfig } from './ProcessManager.js';
export type { Signal, ProcessState } from './CatalystProcess.js';
export { getWorkerSource, SIGNALS } from './worker-template.js';
export type { WorkerMessage, WorkerResponse } from './worker-template.js';
