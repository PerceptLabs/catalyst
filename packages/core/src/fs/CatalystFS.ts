/**
 * CatalystFS — Core filesystem layer
 *
 * Wraps ZenFS to provide a Node.js-like fs API backed by
 * IndexedDB (Phase 1), OPFS (Phase 2), or InMemory.
 */
import type { CatalystFSConfig } from './types.js';

// ZenFS types — we use dynamic imports for configure/fs
type ZenFSModule = typeof import('@zenfs/core');

export class CatalystFS {
  private _fs: any;
  private _name: string;

  private constructor(fs: any, name: string) {
    this._fs = fs;
    this._name = name;
  }

  /**
   * Create a new CatalystFS instance.
   * For Phase 1, uses IndexedDB backend in browser, InMemory in Node.
   */
  static async create(nameOrConfig?: string | CatalystFSConfig): Promise<CatalystFS> {
    const config: CatalystFSConfig =
      typeof nameOrConfig === 'string'
        ? { name: nameOrConfig }
        : nameOrConfig ?? {};

    const name = config.name ?? 'catalyst-default';

    const zenfs: ZenFSModule = await import('@zenfs/core');
    const { InMemory } = zenfs;

    // Determine which backend to use
    const isNode =
      typeof globalThis.window === 'undefined' &&
      typeof globalThis.document === 'undefined';

    if (isNode) {
      // Node environment — always use InMemory
      await zenfs.configure({ mounts: { '/': InMemory } });
    } else {
      // Browser environment — use IndexedDB for persistence (Phase 1)
      try {
        const { IndexedDB } = await import('@zenfs/dom');
        await zenfs.configure({
          mounts: {
            '/': { backend: IndexedDB, storeName: name },
          },
        });
      } catch {
        // Fallback to InMemory if IndexedDB unavailable
        await zenfs.configure({ mounts: { '/': InMemory } });
      }
    }

    return new CatalystFS(zenfs.fs, name);
  }

  /** Get the underlying ZenFS fs object for raw access */
  get rawFs(): any {
    return this._fs;
  }

  /** Instance name */
  get name(): string {
    return this._name;
  }

  // ---- Synchronous methods ----

  readFileSync(path: string, encoding?: BufferEncoding): string | Uint8Array {
    if (encoding) {
      return this._fs.readFileSync(path, encoding) as string;
    }
    return this._fs.readFileSync(path) as Uint8Array;
  }

  writeFileSync(path: string, data: string | Uint8Array | ArrayBufferView, options?: { encoding?: BufferEncoding }): void {
    this._fs.writeFileSync(path, data, options);
  }

  mkdirSync(path: string, options?: { recursive?: boolean }): void {
    this._fs.mkdirSync(path, options);
  }

  readdirSync(path: string, options?: { withFileTypes?: boolean }): string[] | any[] {
    return this._fs.readdirSync(path, options);
  }

  statSync(path: string): any {
    return this._fs.statSync(path);
  }

  unlinkSync(path: string): void {
    this._fs.unlinkSync(path);
  }

  rmdirSync(path: string, options?: { recursive?: boolean }): void {
    this._fs.rmdirSync(path, options);
  }

  renameSync(oldPath: string, newPath: string): void {
    this._fs.renameSync(oldPath, newPath);
  }

  existsSync(path: string): boolean {
    return this._fs.existsSync(path);
  }

  copyFileSync(src: string, dest: string): void {
    this._fs.copyFileSync(src, dest);
  }

  appendFileSync(path: string, data: string | Uint8Array): void {
    this._fs.appendFileSync(path, data);
  }

  // ---- Async methods ----

  async readFile(path: string, encoding?: BufferEncoding): Promise<string | Uint8Array> {
    return this._fs.promises.readFile(path, encoding ? { encoding } : undefined);
  }

  async writeFile(path: string, data: string | Uint8Array, options?: { encoding?: BufferEncoding }): Promise<void> {
    return this._fs.promises.writeFile(path, data, options);
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    return this._fs.promises.mkdir(path, options);
  }

  async readdir(path: string, options?: { withFileTypes?: boolean }): Promise<string[] | any[]> {
    return this._fs.promises.readdir(path, options);
  }

  async stat(path: string): Promise<any> {
    return this._fs.promises.stat(path);
  }

  async unlink(path: string): Promise<void> {
    return this._fs.promises.unlink(path);
  }

  async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    return this._fs.promises.rmdir(path, options);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    return this._fs.promises.rename(oldPath, newPath);
  }

  async copyFile(src: string, dest: string): Promise<void> {
    return this._fs.promises.copyFile(src, dest);
  }
}
