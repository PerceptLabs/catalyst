/**
 * Catalyst — Top-level factory for creating a fully-wired Catalyst instance
 *
 * Composes all layers: CatalystFS, CatalystEngine, ProcessManager,
 * PackageManager, BuildPipeline, HMRManager.
 */
import { CatalystFS } from './fs/CatalystFS.js';
import { CatalystEngine, type EngineConfig } from './engine/CatalystEngine.js';
import { FetchProxy, type FetchProxyConfig } from './net/FetchProxy.js';
import { ProcessManager } from './proc/ProcessManager.js';
import { PackageManager, type PackageManagerConfig } from './pkg/PackageManager.js';
import { BuildPipeline, type BuildConfig, type Transpiler } from './dev/BuildPipeline.js';
import { HMRManager } from './dev/HMRManager.js';

export interface CatalystConfig {
  /** Instance name (used for persistence) */
  name?: string;
  /** Engine configuration */
  engine?: Omit<EngineConfig, 'fs' | 'fetchProxy'>;
  /** Fetch proxy configuration */
  fetch?: FetchProxyConfig;
  /** Package manager configuration */
  packages?: Omit<PackageManagerConfig, 'fs'>;
  /** Build pipeline configuration */
  build?: {
    transpiler?: Transpiler;
    config?: BuildConfig;
  };
}

export class Catalyst {
  readonly fs: CatalystFS;
  readonly processes: ProcessManager;
  readonly packages: PackageManager;
  readonly buildPipeline: BuildPipeline;
  readonly hmr: HMRManager;
  readonly fetchProxy?: FetchProxy;

  private _engine: CatalystEngine | null = null;
  private engineConfig: Omit<EngineConfig, 'fs' | 'fetchProxy'>;

  private constructor(
    fs: CatalystFS,
    engineConfig: Omit<EngineConfig, 'fs' | 'fetchProxy'>,
    fetchProxy: FetchProxy | undefined,
    processes: ProcessManager,
    packages: PackageManager,
    buildPipeline: BuildPipeline,
    hmr: HMRManager,
  ) {
    this.fs = fs;
    this.engineConfig = engineConfig;
    this.fetchProxy = fetchProxy;
    this.processes = processes;
    this.packages = packages;
    this.buildPipeline = buildPipeline;
    this.hmr = hmr;
  }

  /**
   * Create a new Catalyst instance with all layers wired together.
   */
  static async create(config: CatalystConfig = {}): Promise<Catalyst> {
    const fs = await CatalystFS.create(config.name ?? 'catalyst');

    const fetchProxy = config.fetch ? new FetchProxy(config.fetch) : undefined;

    const processes = new ProcessManager({ fs });

    const packages = new PackageManager({
      fs,
      ...config.packages,
    });

    const buildPipeline = new BuildPipeline(fs, config.build?.transpiler);

    const hmr = new HMRManager(fs, buildPipeline, config.build?.config);

    return new Catalyst(
      fs,
      config.engine ?? {},
      fetchProxy,
      processes,
      packages,
      buildPipeline,
      hmr,
    );
  }

  /**
   * Get or create the CatalystEngine (lazy-initialized).
   */
  async getEngine(): Promise<CatalystEngine> {
    if (!this._engine) {
      this._engine = await CatalystEngine.create({
        fs: this.fs,
        fetchProxy: this.fetchProxy,
        ...this.engineConfig,
      });
    }
    return this._engine;
  }

  /**
   * Evaluate JavaScript code in the sandbox.
   */
  async eval(code: string, filename?: string): Promise<any> {
    const engine = await this.getEngine();
    return engine.eval(code, filename);
  }

  /**
   * Evaluate async JavaScript code (supports await, fetch, etc.).
   */
  async evalAsync(code: string, filename?: string): Promise<any> {
    const engine = await this.getEngine();
    return engine.evalAsync(code, filename);
  }

  /**
   * Dispose all resources.
   */
  dispose(): void {
    this.hmr.stop();
    this.processes.killAll();
    this._engine?.dispose();
    this._engine = null;
    this.fs.destroy();
  }
}
