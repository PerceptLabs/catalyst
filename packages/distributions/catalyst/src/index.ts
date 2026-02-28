/**
 * @aspect/catalyst — Distribution package for Workers mode
 *
 * Re-exports the complete Catalyst runtime with QuickJS engine
 * and NodeCompatLoader pre-wired. Consumers import from this
 * package for the standard Workers-compatible experience.
 *
 * Usage:
 *   import { Catalyst, createRuntime } from '@aspect/catalyst';
 *   const runtime = await createRuntime({ name: 'my-app' });
 */

// Core runtime
export {
  // Top-level factory
  Catalyst,
  createRuntime,
  // Engine
  CatalystEngine,
  NodeCompatLoader,
  // Filesystem
  CatalystFS,
  // Network
  FetchProxy,
  // Process management
  ProcessManager,
  CatalystProcess,
  // Package management
  PackageManager,
  PackageCache,
  PackageFetcher,
  NpmResolver,
  PackageJson,
  Lockfile,
  Semver,
  // Build pipeline
  BuildPipeline,
  ContentHashCache,
  HMRManager,
  PassthroughTranspiler,
  EsbuildTranspiler,
  HonoIntegration,
  // WASI
  CatalystWASI,
  WASIBindings,
  WASI_ERRNO,
  BinaryCache,
  // Sync
  SyncClient,
  SyncServer,
  OperationJournal,
  ConflictResolver,
  PROTOCOL_VERSION,
  generateOpId,
  // Version
  VERSION,
} from '@aspect/catalyst-core';

// Re-export all types
export type {
  CatalystConfig,
  EngineConfig,
  ConsoleLevel,
  IEngine,
  IModuleLoader,
  EngineFactory,
  ModuleLoaderFactory,
  EngineInstanceConfig,
  EngineCapabilities,
  ModuleResolution,
  ModuleLoaderCapabilities,
  ModuleLoaderConfig,
  FetchProxyConfig,
  SerializedRequest,
  SerializedResponse,
  ProcessOptions,
  ExecResult,
  Signal,
  ProcessState,
  PackageInfo,
  PackageManagerConfig,
  CacheEntry,
  PackageCacheConfig,
  FetchedPackage,
  PackageFetcherConfig,
  ResolvedPackage,
  NpmResolverConfig,
  PackageJsonData,
  LockfileData,
  LockfileEntry,
  BuildConfig,
  BuildResult,
  BuildError,
  Transpiler,
  HMREvent,
  HonoIntegrationConfig,
  HonoBuildResult,
  WASIExecConfig,
  WASIExecResult,
  CatalystWASIConfig,
  WASIConfig,
  BinaryCacheEntry,
  BinaryCacheConfig,
  SyncClientConfig,
  SyncServerConfig,
  JournalConfig,
  ConflictInfo,
  ConflictResolution,
  ConflictStrategy,
  FileOperation,
  SyncMessage,
  ConnectionState,
  SyncResult,
} from '@aspect/catalyst-core';
