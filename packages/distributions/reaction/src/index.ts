/**
 * @aspect/reaction — Distribution package for Full mode (Deno-in-WASM)
 *
 * Wires DenoEngine + DenoNativeLoader for 100% Node.js compatibility.
 *
 * Usage:
 *   import { Reaction } from '@aspect/reaction';
 *   const runtime = await Reaction.create({ name: 'my-app' });
 *   await runtime.engine.evalFile('/project/server.js');
 */

import { Catalyst } from '../../../shared/core/src/catalyst.js';
import type { CatalystConfig } from '../../../shared/core/src/catalyst.js';
import { createDenoEngine } from '../../../engines/deno/src/engine.js';
import { createDenoNativeLoader } from '../../../engines/deno/src/loaders/deno-native-loader.js';

export interface ReactionConfig extends Omit<CatalystConfig, 'engineFactory' | 'moduleLoaderFactory'> {
  wasm?: { wasmUrl?: string; cache?: boolean };
}

export class Reaction {
  static async create(config: ReactionConfig = {}): Promise<Catalyst> {
    return Catalyst.create({
      ...config,
      engineFactory: createDenoEngine,
      moduleLoaderFactory: createDenoNativeLoader,
    });
  }
}

// Re-exports
export { DenoEngine, createDenoEngine, OpsBridge, DenoWasmLoader, DenoNativeLoader, createDenoNativeLoader }
  from '../../../engines/deno/src/index.js';
export type { DenoEngineConfig, OpsBridgeConfig, OpResult, DenoWasmInstance, WasmLoaderConfig, WasmCapabilities, WasmLoaderStatus }
  from '../../../engines/deno/src/index.js';
export { Catalyst } from '../../../shared/core/src/catalyst.js';
