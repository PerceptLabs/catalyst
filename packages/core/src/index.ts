// @aspect/catalyst-core
// Browser-native runtime engine — core package

export const VERSION = '0.0.1';

export { CatalystFS } from './fs/index.js';
export { CatalystEngine } from './engine/index.js';
export type { EngineConfig, ConsoleLevel } from './engine/index.js';
export { FetchProxy } from './net/index.js';
export type { FetchProxyConfig, SerializedRequest, SerializedResponse } from './net/index.js';
export { ProcessManager, CatalystProcess } from './proc/index.js';
export type { ProcessOptions, ExecResult, Signal, ProcessState } from './proc/index.js';

