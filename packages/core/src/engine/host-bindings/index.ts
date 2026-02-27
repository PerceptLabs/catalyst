/**
 * Host bindings barrel export.
 * Each binding returns a pure JS source string that can be injected
 * into QuickJS via evalCode(). The source defines module.exports so
 * it integrates with a CommonJS-style require() shim.
 */

export { getPathSource } from './path.js';
export { getConsoleSource } from './console.js';
export { getProcessSource } from './process.js';
export { getBufferSource } from './buffer.js';
export { getEventsSource } from './events.js';
export { getTimersSource } from './timers.js';
export { getUrlSource } from './url.js';
export { getAssertSource } from './assert.js';
export { getCryptoSource } from './crypto.js';
export { getUtilSource } from './util.js';

import { getPathSource } from './path.js';
import { getConsoleSource } from './console.js';
import { getProcessSource } from './process.js';
import { getBufferSource } from './buffer.js';
import { getEventsSource } from './events.js';
import { getTimersSource } from './timers.js';
import { getUrlSource } from './url.js';
import { getAssertSource } from './assert.js';
import { getCryptoSource } from './crypto.js';
import { getUtilSource } from './util.js';

/**
 * Convenience map: module name -> source getter.
 * Useful for building a require() shim that resolves built-in modules.
 */
export function getBuiltinModules(): Record<string, () => string> {
  return {
    path: getPathSource,
    console: getConsoleSource,
    process: getProcessSource,
    buffer: getBufferSource,
    events: getEventsSource,
    timers: getTimersSource,
    url: getUrlSource,
    assert: getAssertSource,
    crypto: getCryptoSource,
    util: getUtilSource,
  };
}
