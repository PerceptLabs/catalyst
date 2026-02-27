/**
 * OperationJournal — Append-only log of filesystem mutations
 *
 * Buffers filesystem changes during disconnection.
 * On reconnect, replays journal entries to the server.
 * Supports compaction to prevent unbounded growth.
 */
import type { CatalystFS } from '../fs/CatalystFS.js';
import {
  type FileOperation,
  type FileOperationType,
  generateOpId,
} from './protocol.js';

export interface JournalConfig {
  /** CatalystFS instance for persistence */
  fs?: CatalystFS;
  /** Path to store journal data (default: /.sync-journal.json) */
  journalPath?: string;
  /** Max operations before auto-compaction (default: 1000) */
  maxOperations?: number;
}

export class OperationJournal {
  private operations: FileOperation[] = [];
  private readonly fs?: CatalystFS;
  private readonly journalPath: string;
  private readonly maxOperations: number;

  constructor(config: JournalConfig = {}) {
    this.fs = config.fs;
    this.journalPath = config.journalPath ?? '/.sync-journal.json';
    this.maxOperations = config.maxOperations ?? 1000;
  }

  /** Load journal from persistent storage */
  load(): void {
    if (!this.fs) return;
    try {
      const raw = this.fs.readFileSync(this.journalPath, 'utf-8') as string;
      const data = JSON.parse(raw);
      if (Array.isArray(data.operations)) {
        this.operations = data.operations;
      }
    } catch {
      // No journal yet
    }
  }

  /** Save journal to persistent storage */
  save(): void {
    if (!this.fs) return;
    try {
      this.fs.writeFileSync(
        this.journalPath,
        JSON.stringify({ version: 1, operations: this.operations }),
      );
    } catch {
      // Non-fatal
    }
  }

  /** Record a filesystem operation */
  record(type: FileOperationType, path: string, content?: string, newPath?: string): FileOperation {
    const op: FileOperation = {
      id: generateOpId(),
      type,
      path,
      timestamp: Date.now(),
    };
    if (content !== undefined) op.content = content;
    if (newPath !== undefined) op.newPath = newPath;

    this.operations.push(op);

    // Auto-compact if too many operations
    if (this.operations.length > this.maxOperations) {
      this.compact();
    }

    this.save();
    return op;
  }

  /** Record a write operation */
  recordWrite(path: string, content: string): FileOperation {
    return this.record('write', path, content);
  }

  /** Record a delete operation */
  recordDelete(path: string): FileOperation {
    return this.record('delete', path);
  }

  /** Record a mkdir operation */
  recordMkdir(path: string): FileOperation {
    return this.record('mkdir', path);
  }

  /** Record a rename operation */
  recordRename(oldPath: string, newPath: string): FileOperation {
    return this.record('rename', oldPath, undefined, newPath);
  }

  /**
   * Get all pending operations (not yet acknowledged by server).
   */
  getPending(): FileOperation[] {
    return [...this.operations];
  }

  /**
   * Get operations since a given timestamp.
   */
  getSince(timestamp: number): FileOperation[] {
    return this.operations.filter((op) => op.timestamp >= timestamp);
  }

  /**
   * Acknowledge operations — remove them from the journal.
   */
  acknowledge(operationIds: string[]): void {
    const idSet = new Set(operationIds);
    this.operations = this.operations.filter((op) => !idSet.has(op.id));
    this.save();
  }

  /**
   * Compact the journal — collapse multiple operations on the same path.
   *
   * Rules:
   * - Multiple writes to the same path → keep only the last write
   * - Write then delete → keep only the delete
   * - Delete then write → keep only the write (file recreated)
   * - Multiple mkdir → keep only one
   * - Rename then write to new path → keep rename + write
   */
  compact(): void {
    const pathMap = new Map<string, FileOperation[]>();

    // Group operations by path
    for (const op of this.operations) {
      const key = op.path;
      if (!pathMap.has(key)) pathMap.set(key, []);
      pathMap.get(key)!.push(op);
    }

    const compacted: FileOperation[] = [];

    for (const [_path, ops] of pathMap) {
      if (ops.length === 1) {
        compacted.push(ops[0]);
        continue;
      }

      // Get the last operation for this path
      const last = ops[ops.length - 1];

      if (last.type === 'delete') {
        // Only need the delete
        compacted.push(last);
      } else if (last.type === 'write') {
        // Only need the last write
        compacted.push(last);
      } else if (last.type === 'mkdir') {
        // Only need one mkdir
        compacted.push(last);
      } else if (last.type === 'rename') {
        // Keep the rename
        compacted.push(last);
      }
    }

    // Sort by timestamp to maintain order
    compacted.sort((a, b) => a.timestamp - b.timestamp);
    this.operations = compacted;
    this.save();
  }

  /** Get the number of pending operations */
  get count(): number {
    return this.operations.length;
  }

  /** Clear all operations */
  clear(): void {
    this.operations = [];
    this.save();
  }
}
