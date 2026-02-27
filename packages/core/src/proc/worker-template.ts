/**
 * Worker template for CatalystProc
 *
 * Generates the source code for a Worker that boots QuickJS-WASM
 * and executes commands in an isolated context. For use when true
 * Worker-based isolation is needed.
 *
 * Architecture:
 * - Worker receives 'exec' messages with code to evaluate
 * - Worker sends 'stdout', 'stderr', 'exit', 'ready' messages back
 * - Worker maintains its own QuickJS instance
 * - Worker can be terminated with 'kill' message or Worker.terminate()
 *
 * Note: Currently, ProcessManager uses inline CatalystEngine instances
 * for process isolation (simpler, works in all environments). This
 * template is provided for future use when true thread-level isolation
 * is needed (e.g., for long-running processes or CPU-bound workloads).
 */

export interface WorkerMessage {
  type: 'exec' | 'kill' | 'stdin';
  code?: string;
  signal?: number;
  data?: string;
}

export interface WorkerResponse {
  type: 'ready' | 'stdout' | 'stderr' | 'exit' | 'error';
  data?: string;
  code?: number;
}

/**
 * Get the Worker entry code as a string.
 * Can be used to create a Worker from a Blob URL:
 *
 * ```ts
 * const blob = new Blob([getWorkerSource()], { type: 'application/javascript' });
 * const url = URL.createObjectURL(blob);
 * const worker = new Worker(url, { type: 'module' });
 * ```
 */
export function getWorkerSource(): string {
  return `
// CatalystProc Worker Entry
// Boots QuickJS-WASM and executes commands in isolation

let ctx = null;
let runtime = null;

async function boot() {
  try {
    const { getQuickJS } = await import('quickjs-emscripten');
    const QuickJS = await getQuickJS();
    runtime = QuickJS.newRuntime();
    runtime.setMemoryLimit(256 * 1024 * 1024);
    runtime.setMaxStackSize(1024 * 1024);
    ctx = runtime.newContext();

    // Wire console to postMessage
    var consoleObj = ctx.newObject();
    ['log', 'info', 'debug', 'warn'].forEach(function(level) {
      var fn = ctx.newFunction('console_' + level, function() {
        var args = [];
        for (var i = 0; i < arguments.length; i++) {
          try { args.push(ctx.dump(arguments[i])); }
          catch(e) { args.push(String(arguments[i])); }
        }
        self.postMessage({ type: 'stdout', data: args.join(' ') + '\\n' });
      });
      ctx.setProp(consoleObj, level, fn);
      fn.dispose();
    });

    var errorFn = ctx.newFunction('console_error', function() {
      var args = [];
      for (var i = 0; i < arguments.length; i++) {
        try { args.push(ctx.dump(arguments[i])); }
        catch(e) { args.push(String(arguments[i])); }
      }
      self.postMessage({ type: 'stderr', data: args.join(' ') + '\\n' });
    });
    ctx.setProp(consoleObj, 'error', errorFn);
    errorFn.dispose();

    ctx.setProp(ctx.global, 'console', consoleObj);
    consoleObj.dispose();

    self.postMessage({ type: 'ready' });
  } catch (e) {
    self.postMessage({ type: 'error', data: 'Boot failed: ' + e.message });
    self.postMessage({ type: 'exit', code: 1 });
  }
}

self.addEventListener('message', function(event) {
  var msg = event.data;

  if (msg.type === 'exec' && ctx) {
    try {
      var result = ctx.evalCode(msg.code || '', '<process>');
      if (result.error) {
        var err = ctx.dump(result.error);
        result.error.dispose();
        self.postMessage({ type: 'stderr', data: String(err) + '\\n' });
        self.postMessage({ type: 'exit', code: 1 });
      } else {
        result.value.dispose();
        self.postMessage({ type: 'exit', code: 0 });
      }
    } catch (e) {
      self.postMessage({ type: 'stderr', data: (e.message || String(e)) + '\\n' });
      self.postMessage({ type: 'exit', code: 1 });
    }
  }

  if (msg.type === 'kill') {
    try {
      if (ctx) { ctx.dispose(); ctx = null; }
      if (runtime) { runtime.dispose(); runtime = null; }
    } catch(e) {}
    var exitCode = 128 + (msg.signal || 15);
    self.postMessage({ type: 'exit', code: exitCode });
    self.close();
  }
});

boot();
`;
}

/**
 * Signal numbers for common signals.
 */
export const SIGNALS: Record<string, number> = {
  SIGTERM: 15,
  SIGKILL: 9,
  SIGINT: 2,
};
