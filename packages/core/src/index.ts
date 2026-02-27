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
export { PackageManager, PackageCache, PackageFetcher, NpmResolver, PackageJson, Lockfile } from './pkg/index.js';
export { Semver } from './pkg/index.js';
export type { PackageInfo, PackageManagerConfig, CacheEntry, PackageCacheConfig } from './pkg/index.js';
export type { FetchedPackage, PackageFetcherConfig, ResolvedPackage, NpmResolverConfig } from './pkg/index.js';
export type { PackageJsonData, LockfileData, LockfileEntry } from './pkg/index.js';
export { BuildPipeline, ContentHashCache, HMRManager, PassthroughTranspiler, EsbuildTranspiler } from './dev/index.js';
export { HonoIntegration } from './dev/index.js';
export type { BuildConfig, BuildResult, BuildError, Transpiler, HMREvent, HonoIntegrationConfig, HonoBuildResult } from './dev/index.js';
export { CatalystWASI } from './wasi/index.js';
export type { WASIExecConfig, WASIExecResult, CatalystWASIConfig } from './wasi/index.js';
export { WASIBindings, WASI_ERRNO } from './wasi/index.js';
export type { WASIConfig } from './wasi/index.js';
export { BinaryCache } from './wasi/index.js';
export type { BinaryCacheEntry, BinaryCacheConfig } from './wasi/index.js';
export { SyncClient } from './sync/index.js';
export type { SyncClientConfig } from './sync/index.js';
export { SyncServer } from './sync/index.js';
export type { SyncServerConfig } from './sync/index.js';
export { OperationJournal } from './sync/index.js';
export type { JournalConfig } from './sync/index.js';
export { ConflictResolver, } from './sync/index.js';
export type { ConflictInfo, ConflictResolution, ConflictStrategy } from './sync/index.js';
export { PROTOCOL_VERSION, generateOpId } from './sync/index.js';
export type { FileOperation, SyncMessage, ConnectionState, SyncResult } from './sync/index.js';
export { Catalyst } from './catalyst.js';
export type { CatalystConfig } from './catalyst.js';

