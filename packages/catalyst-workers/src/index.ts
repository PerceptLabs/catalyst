/**
 * @aspect/catalyst-workers — Cloudflare Workers bindings emulation
 *
 * Provides browser-native implementations of KV, R2, and D1 (via separate package)
 * backed by IndexedDB and OPFS.
 */
export { CatalystKV } from './bindings/kv.js';
export { CatalystR2 } from './bindings/r2.js';
export type {
  // KV types
  KVGetType,
  KVPutOptions,
  KVListOptions,
  KVListKey,
  KVListResult,
  KVValueWithMetadata,
  // R2 types
  R2PutOptions,
  R2ListOptions,
  R2HttpMetadata,
  R2ObjectMetadata,
  R2ObjectBody,
  R2Objects,
  // D1 types (for future use)
  D1Result,
  D1Meta,
  D1ExecResult,
} from './bindings/types.js';
