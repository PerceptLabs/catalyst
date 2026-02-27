/**
 * ProcessManager — Manages sandboxed child processes
 *
 * Each child process runs in its own CatalystEngine instance,
 * providing isolated JavaScript execution with optional CatalystFS access.
 *
 * Features:
 * - exec(): Run code, wait for completion, return stdout/stderr
 * - spawn(): Start code, stream stdout/stderr in real-time
 * - kill(): Send signals to running processes
 * - Process tree management (PID tracking, listing)
 */
import { CatalystEngine } from '../engine/CatalystEngine.js';
import type { CatalystFS } from '../fs/CatalystFS.js';
import { CatalystWASI } from '../wasi/CatalystWASI.js';
import { CatalystProcess, type Signal } from './CatalystProcess.js';

export interface ProcessOptions {
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number; // ms, default 30000
}

export interface ExecResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  pid: number;
}

export interface ProcessManagerConfig {
  fs?: CatalystFS;
  maxProcesses?: number; // default 32
}

export class ProcessManager {
  private nextPid = 1;
  private processes = new Map<number, CatalystProcess>();
  private fs?: CatalystFS;
  private maxProcesses: number;

  constructor(config: ProcessManagerConfig = {}) {
    this.fs = config.fs;
    this.maxProcesses = config.maxProcesses ?? 32;
  }

  /**
   * Execute a WASI binary file from CatalystFS.
   * Returns collected stdout, stderr, and exit code.
   */
  async execWasm(
    path: string,
    args: string[] = [],
    options: ProcessOptions = {},
  ): Promise<ExecResult> {
    if (!this.fs) {
      throw new Error('CatalystFS required for WASI execution');
    }

    const pid = this.nextPid++;
    const wasi = CatalystWASI.create({ fs: this.fs });

    try {
      const result = await wasi.execFile(path, {
        args: [path, ...args],
        env: options.env,
      });

      return {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        pid,
      };
    } catch (err: any) {
      return {
        stdout: '',
        stderr: err?.message ?? String(err),
        exitCode: 1,
        pid,
      };
    }
  }

  /**
   * Execute code and wait for completion.
   * Returns collected stdout, stderr, and exit code.
   */
  async exec(code: string, options: ProcessOptions = {}): Promise<ExecResult> {
    const proc = this.spawn(code, options);

    return new Promise<ExecResult>((resolve, reject) => {
      const timeout = options.timeout ?? 30000;
      let timer: ReturnType<typeof setTimeout> | null = null;

      if (timeout > 0) {
        timer = setTimeout(() => {
          proc.kill('SIGKILL');
          reject(new Error(`Process ${proc.pid} timed out after ${timeout}ms`));
        }, timeout);
      }

      proc.on('exit', (exitCode: number) => {
        if (timer) clearTimeout(timer);
        resolve({
          stdout: proc.stdout,
          stderr: proc.stderr,
          exitCode,
          pid: proc.pid,
        });
      });
    });
  }

  /**
   * Spawn a new process that runs the given code.
   * Returns immediately with a CatalystProcess handle.
   * The process runs asynchronously.
   */
  spawn(code: string, options: ProcessOptions = {}): CatalystProcess {
    if (this.processes.size >= this.maxProcesses) {
      throw new Error(`Maximum process limit (${this.maxProcesses}) reached`);
    }

    const pid = this.nextPid++;
    const proc = new CatalystProcess(pid);
    this.processes.set(pid, proc);

    // Clean up when process exits
    proc.on('exit', () => {
      // Keep in process list for a short time so callers can read stdout/stderr
      setTimeout(() => this.processes.delete(pid), 1000);
    });

    // Start the process asynchronously
    this.startProcess(proc, code, options).catch((err) => {
      // If start fails, mark as exited with error
      if (proc.state === 'starting' || proc.state === 'running') {
        proc._exit(1);
      }
    });

    return proc;
  }

  /** Start a process by creating an isolated engine and running code */
  private async startProcess(
    proc: CatalystProcess,
    code: string,
    options: ProcessOptions,
  ): Promise<void> {
    // Check if process was already killed before we start
    if (proc.state === 'killed' || proc.state === 'exited') return;

    try {
      const engine = await CatalystEngine.create({
        fs: this.fs,
        env: options.env,
      });

      // Check again after async engine creation
      if (proc.state === 'killed' || proc.state === 'exited') {
        engine.dispose();
        return;
      }

      proc._setEngine(engine);

      // Run the code
      try {
        await engine.eval(code);
        if (proc.state === 'running') {
          proc._exit(0);
        }
      } catch (err: any) {
        // Runtime error — collect error in stderr
        if (proc.state === 'running') {
          proc._exit(1);
        }
      }
    } catch (err: any) {
      // Engine creation failed
      proc._exit(1);
    }
  }

  /** Send a signal to a process */
  kill(pid: number, signal: Signal = 'SIGTERM'): boolean {
    const proc = this.processes.get(pid);
    if (!proc) return false;
    return proc.kill(signal);
  }

  /** Get a process by PID */
  getProcess(pid: number): CatalystProcess | undefined {
    return this.processes.get(pid);
  }

  /** List all tracked processes */
  listProcesses(): CatalystProcess[] {
    return [...this.processes.values()];
  }

  /** List only running processes */
  listRunning(): CatalystProcess[] {
    return this.listProcesses().filter((p) => p.state === 'running');
  }

  /** Kill all running processes */
  killAll(signal: Signal = 'SIGTERM'): void {
    for (const proc of this.processes.values()) {
      if (proc.state === 'running') {
        proc.kill(signal);
      }
    }
  }

  /** Get the number of currently tracked processes */
  get processCount(): number {
    return this.processes.size;
  }

  /** Get the number of running processes */
  get runningCount(): number {
    return this.listRunning().length;
  }
}
