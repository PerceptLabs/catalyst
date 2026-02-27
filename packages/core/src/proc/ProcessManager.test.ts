/**
 * ProcessManager — Node tests
 * Tests process tree logic, signal handling state machine, stdio buffering,
 * and worker template generation.
 */
import { describe, it, expect } from 'vitest';
import { CatalystProcess, type Signal, type ProcessState } from './CatalystProcess.js';
import { getWorkerSource, SIGNALS } from './worker-template.js';

describe('CatalystProcess — State Machine', () => {
  it('should start in "starting" state', () => {
    const proc = new CatalystProcess(1);
    expect(proc.pid).toBe(1);
    expect(proc.state).toBe('starting');
    expect(proc.exitCode).toBeNull();
    expect(proc.stdout).toBe('');
    expect(proc.stderr).toBe('');
  });

  it('should transition to "exited" state', () => {
    const proc = new CatalystProcess(1);
    proc._exit(0);
    expect(proc.state).toBe('exited');
    expect(proc.exitCode).toBe(0);
  });

  it('should transition to "exited" with non-zero code', () => {
    const proc = new CatalystProcess(2);
    proc._exit(1);
    expect(proc.state).toBe('exited');
    expect(proc.exitCode).toBe(1);
  });

  it('should transition to "killed" state on SIGTERM', () => {
    const proc = new CatalystProcess(3);
    // Simulate engine attachment
    proc._setEngine({ on: () => {}, dispose: () => {} } as any);
    proc.kill('SIGTERM');
    expect(proc.state).toBe('killed');
    expect(proc.exitCode).toBe(143); // 128 + 15
  });

  it('should transition to "killed" state on SIGKILL', () => {
    const proc = new CatalystProcess(4);
    proc._setEngine({ on: () => {}, dispose: () => {} } as any);
    proc.kill('SIGKILL');
    expect(proc.state).toBe('killed');
    expect(proc.exitCode).toBe(137); // 128 + 9
  });

  it('should not allow kill on non-running process', () => {
    const proc = new CatalystProcess(5);
    proc._exit(0);
    const result = proc.kill('SIGTERM');
    expect(result).toBe(false);
    expect(proc.state).toBe('exited');
    expect(proc.exitCode).toBe(0);
  });

  it('should not exit twice', () => {
    const proc = new CatalystProcess(6);
    const exitCodes: number[] = [];
    proc.on('exit', (code: number) => exitCodes.push(code));

    proc._exit(0);
    proc._exit(1); // Should be ignored
    expect(proc.exitCode).toBe(0);
    expect(exitCodes).toEqual([0]);
  });
});

describe('CatalystProcess — Events', () => {
  it('should emit exit event', () => {
    const proc = new CatalystProcess(10);
    let exitCode: number | null = null;
    proc.on('exit', (code: number) => {
      exitCode = code;
    });
    proc._exit(42);
    expect(exitCode).toBe(42);
  });

  it('should emit exit event with signal on kill', () => {
    const proc = new CatalystProcess(11);
    let exitCode: number | null = null;
    let exitSignal: string | null = null;
    proc.on('exit', (code: number, signal?: string) => {
      exitCode = code;
      exitSignal = signal ?? null;
    });
    proc._setEngine({ on: () => {}, dispose: () => {} } as any);
    proc.kill('SIGKILL');
    expect(exitCode).toBe(137);
    expect(exitSignal).toBe('SIGKILL');
  });

  it('should support once() for one-time listeners', () => {
    const proc = new CatalystProcess(12);
    let count = 0;
    proc.once('exit', () => count++);
    proc._exit(0);
    // Can't fire again since process already exited, but once should only fire once
    expect(count).toBe(1);
  });

  it('should support off() to remove listeners', () => {
    const proc = new CatalystProcess(13);
    let count = 0;
    const handler = () => count++;
    proc.on('exit', handler);
    proc.off('exit', handler);
    proc._exit(0);
    expect(count).toBe(0);
  });
});

describe('CatalystProcess — Stdio Buffering', () => {
  it('should collect stdout chunks', () => {
    const proc = new CatalystProcess(20);
    // Simulate engine console events
    const consoleHandlers: any[] = [];
    proc._setEngine({
      on: (event: string, handler: any) => {
        if (event === 'console') consoleHandlers.push(handler);
      },
      dispose: () => {},
    } as any);

    // Simulate console.log calls
    for (const handler of consoleHandlers) {
      handler('log', 'hello');
      handler('log', 'world');
    }

    expect(proc.stdout).toBe('hello\nworld\n');
    expect(proc.stderr).toBe('');
  });

  it('should collect stderr chunks', () => {
    const proc = new CatalystProcess(21);
    const consoleHandlers: any[] = [];
    proc._setEngine({
      on: (event: string, handler: any) => {
        if (event === 'console') consoleHandlers.push(handler);
      },
      dispose: () => {},
    } as any);

    for (const handler of consoleHandlers) {
      handler('error', 'oops');
    }

    expect(proc.stderr).toBe('oops\n');
    expect(proc.stdout).toBe('');
  });

  it('should stream stdout events in real-time', () => {
    const proc = new CatalystProcess(22);
    const chunks: string[] = [];
    proc.on('stdout', (data: string) => chunks.push(data));

    const consoleHandlers: any[] = [];
    proc._setEngine({
      on: (event: string, handler: any) => {
        if (event === 'console') consoleHandlers.push(handler);
      },
      dispose: () => {},
    } as any);

    for (const handler of consoleHandlers) {
      handler('log', 'chunk1');
      handler('log', 'chunk2');
    }

    expect(chunks).toEqual(['chunk1\n', 'chunk2\n']);
  });
});

describe('CatalystProcess — Uptime', () => {
  it('should track uptime', async () => {
    const proc = new CatalystProcess(30);
    await new Promise((r) => setTimeout(r, 50));
    expect(proc.uptime).toBeGreaterThanOrEqual(40);
  });
});

describe('Worker Template', () => {
  it('should generate valid worker source code', () => {
    const source = getWorkerSource();
    expect(typeof source).toBe('string');
    expect(source.length).toBeGreaterThan(100);
    expect(source).toContain('quickjs-emscripten');
    expect(source).toContain('self.postMessage');
    expect(source).toContain('self.addEventListener');
  });

  it('should define signal numbers', () => {
    expect(SIGNALS.SIGTERM).toBe(15);
    expect(SIGNALS.SIGKILL).toBe(9);
    expect(SIGNALS.SIGINT).toBe(2);
  });
});

describe('Process States', () => {
  it('should have valid state transitions', () => {
    // starting → running (via _setEngine)
    const proc1 = new CatalystProcess(40);
    expect(proc1.state).toBe('starting');
    proc1._setEngine({ on: () => {}, dispose: () => {} } as any);
    expect(proc1.state).toBe('running');

    // running → exited (via _exit)
    const proc2 = new CatalystProcess(41);
    proc2._setEngine({ on: () => {}, dispose: () => {} } as any);
    proc2._exit(0);
    expect(proc2.state).toBe('exited');

    // running → killed (via kill)
    const proc3 = new CatalystProcess(42);
    proc3._setEngine({ on: () => {}, dispose: () => {} } as any);
    proc3.kill('SIGTERM');
    expect(proc3.state).toBe('killed');
  });
});
