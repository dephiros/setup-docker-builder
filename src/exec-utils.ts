import { promisify } from "util";
import { exec } from "child_process";

const execAsync = promisify(exec);

// Memory limit for the bbolt check systemd scope (MemoryMax).
export const BOLT_CHECK_MEMORY_MAX_BYTES = 512 * 1024 * 1024;

// File size threshold for skipping bbolt check and md5sum hash computation.
// Set to ~80% of MemoryMax to leave headroom for Go runtime, GC metadata,
// and bbolt's own allocations (~50-60 MB overhead on top of the mmap'd file).
export const BOLT_CHECK_MAX_FILE_BYTES = 400 * 1024 * 1024;

export class ExecTimeoutError extends Error {
  constructor(label: string, timeoutMs: number) {
    super(`${label} timed out after ${timeoutMs}ms`);
    this.name = "ExecTimeoutError";
  }
}

/**
 * Wraps execAsync with a Promise.race-based timeout that abandons the call
 * if it doesn't complete within the specified duration.
 *
 * This is necessary because Node.js exec's built-in timeout option still waits
 * for the child process to exit after sending a signal. If the process is stuck
 * in uninterruptible sleep (D state) due to e.g. a Ceph network partition,
 * the built-in timeout will hang forever. Promise.race lets us abandon the
 * promise and move on, even though the zombie process remains until I/O completes.
 */
export async function execWithTimeout(
  command: string,
  timeoutMs: number,
  label?: string,
): Promise<{ stdout: string; stderr: string }> {
  const displayLabel = label || command.substring(0, 80);
  return Promise.race([
    execAsync(command),
    new Promise<never>((_, reject) =>
      setTimeout(
        () => reject(new ExecTimeoutError(displayLabel, timeoutMs)),
        timeoutMs,
      ),
    ),
  ]);
}
