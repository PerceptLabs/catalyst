/**
 * PackageManager — Orchestrates package installation, resolution, and caching
 *
 * API:
 * - install(name, version?) — resolve, fetch, cache
 * - installAll(packageJsonPath?) — read package.json, install all deps
 * - resolve(name) — check if package is in /node_modules/
 * - remove(name) — remove from cache + lockfile
 * - clear() — wipe entire cache
 * - list() — list installed packages
 */
import type { CatalystFS } from '../fs/CatalystFS.js';
import { NpmResolver, type NpmResolverConfig } from './NpmResolver.js';
import { PackageFetcher, type PackageFetcherConfig } from './PackageFetcher.js';
import { PackageCache, type PackageCacheConfig } from './PackageCache.js';
import { PackageJson } from './PackageJson.js';
import { Lockfile } from './Lockfile.js';

export interface PackageInfo {
  name: string;
  version: string;
  path: string;
  cached: boolean;
}

export interface PackageManagerConfig {
  fs: CatalystFS;
  resolver?: NpmResolverConfig;
  fetcher?: PackageFetcherConfig;
  cache?: PackageCacheConfig;
  lockfilePath?: string;
}

export class PackageManager {
  private fs: CatalystFS;
  private resolver: NpmResolver;
  private fetcher: PackageFetcher;
  private cache: PackageCache;
  private lockfile: Lockfile;
  private lockfilePath: string;

  constructor(config: PackageManagerConfig) {
    this.fs = config.fs;
    this.resolver = new NpmResolver(config.resolver);
    this.fetcher = new PackageFetcher(config.fetcher);
    this.cache = new PackageCache(config.fs, config.cache);
    this.lockfilePath = config.lockfilePath ?? '/catalyst-lock.json';
    this.lockfile = Lockfile.read(config.fs, this.lockfilePath);
  }

  /**
   * Install a package: resolve version -> fetch code -> write to /node_modules/
   * Returns immediately if the package is already cached at the right version.
   */
  async install(name: string, versionRange?: string): Promise<PackageInfo> {
    const range = versionRange ?? 'latest';

    // Check lockfile first for pinned version
    const locked = this.lockfile.get(name);
    if (locked && this.cache.isCached(name, locked.version)) {
      return {
        name,
        version: locked.version,
        path: `/node_modules/${name}`,
        cached: true,
      };
    }

    // Use lockfile version if available (but not cached)
    if (locked) {
      const fetched = await this.fetcher.fetch(name, locked.version);
      this.cache.store(name, locked.version, fetched.code, {
        source: fetched.source,
      });
      return {
        name,
        version: locked.version,
        path: `/node_modules/${name}`,
        cached: false,
      };
    }

    // Resolve version from registry, fallback to CDN-only
    let version: string;
    let dependencies: Record<string, string> = {};
    let tarballUrl = '';
    let integrity = '';

    try {
      const resolved = await this.resolver.resolve(name, range);
      version = resolved.version;
      dependencies = resolved.dependencies;
      tarballUrl = resolved.tarballUrl;
      integrity = resolved.integrity ?? '';
    } catch {
      // Registry resolution failed — let the CDN handle version resolution
      version = range === 'latest' ? 'latest' : range;
    }

    // Check if resolved version is already cached
    if (version !== 'latest' && this.cache.isCached(name, version)) {
      this.updateLockfile(name, version, tarballUrl, integrity, dependencies);
      return {
        name,
        version,
        path: `/node_modules/${name}`,
        cached: true,
      };
    }

    // Fetch and cache
    const fetched = await this.fetcher.fetch(name, version);
    // If CDN resolved version differently, use the actual version
    const finalVersion = version === 'latest' ? fetched.version : version;
    this.cache.store(name, finalVersion, fetched.code, {
      source: fetched.source,
      integrity: integrity || undefined,
    });

    this.updateLockfile(name, finalVersion, tarballUrl, integrity, dependencies);

    return {
      name,
      version: finalVersion,
      path: `/node_modules/${name}`,
      cached: false,
    };
  }

  /** Update lockfile and write to disk */
  private updateLockfile(
    name: string,
    version: string,
    resolved: string,
    integrity: string,
    dependencies: Record<string, string>,
  ): void {
    this.lockfile.set(name, {
      version,
      resolved: resolved || `esm.sh/${name}@${version}`,
      integrity,
      dependencies,
    });
    this.lockfile.write(this.fs, this.lockfilePath);
  }

  /**
   * Install all dependencies from package.json.
   */
  async installAll(packageJsonPath = '/package.json'): Promise<PackageInfo[]> {
    const pkgJson = PackageJson.read(this.fs, packageJsonPath);
    const deps = pkgJson.getDependencies();
    const results: PackageInfo[] = [];

    for (const [name, version] of Object.entries(deps)) {
      const info = await this.install(name, version);
      results.push(info);
    }

    return results;
  }

  /** Check if a package is installed, return its path or null */
  resolve(name: string): string | null {
    const pkgDir = `/node_modules/${name}`;
    try {
      if (
        this.fs.existsSync(`${pkgDir}/index.js`) ||
        this.fs.existsSync(`${pkgDir}/package.json`)
      ) {
        return pkgDir;
      }
    } catch {}
    return null;
  }

  /** Remove an installed package */
  async remove(name: string): Promise<void> {
    this.cache.remove(name);
    this.lockfile.remove(name);
    this.lockfile.write(this.fs, this.lockfilePath);
  }

  /** Clear all installed packages */
  async clear(): Promise<void> {
    this.cache.clear();
    this.lockfile.clear();
    this.lockfile.write(this.fs, this.lockfilePath);
  }

  /** List all installed packages */
  list(): PackageInfo[] {
    const entries = this.cache.list();
    return entries.map((e) => ({
      name: e.name,
      version: e.version,
      path: `/node_modules/${e.name}`,
      cached: true,
    }));
  }

  /** Get the lockfile */
  getLockfile(): Lockfile {
    return this.lockfile;
  }

  /** Get the cache */
  getCache(): PackageCache {
    return this.cache;
  }
}
