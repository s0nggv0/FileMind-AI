import { randomUUID } from "node:crypto";
import { open, rename, unlink } from "node:fs/promises";
import { dirname, join, basename } from "node:path";

export type AtomicWriteStage = "written" | "synced" | "closed" | "before_publish";
/** The caller owns the target directory and serializes immutable publication. */
export async function atomicWriteFile(target: string, bytes: Uint8Array, options: {
  mode?: number; signal?: AbortSignal; checkpoint?: (stage: AtomicWriteStage) => Promise<void>;
} = {}) {
  const temporary = join(dirname(target), `.${basename(target)}.${randomUUID()}.tmp`);
  let file: Awaited<ReturnType<typeof open>> | undefined;
  try {
    options.signal?.throwIfAborted();
    file = await open(temporary, "wx", options.mode ?? 0o600);
    await file.writeFile(bytes); await options.checkpoint?.("written");
    await file.sync(); await options.checkpoint?.("synced");
    await file.close(); file = undefined; await options.checkpoint?.("closed");
    options.signal?.throwIfAborted(); await options.checkpoint?.("before_publish");
    await rename(temporary, target);
  } finally {
    await file?.close().catch(() => {});
    await unlink(temporary).catch(error => { if (error.code !== "ENOENT") throw error; });
  }
}

// SQL operation locks provide cross-process serialization in the application.
// This mutex also protects standalone service callers inside one Node process.
const paths = new Map<string, Promise<unknown>>();
export function withPathMutex<T>(key: string, action: () => Promise<T>): Promise<T>;
export function withPathMutex<T>(key: string, action: () => Promise<T>, tryOnly: boolean): Promise<T | null>;
export async function withPathMutex<T>(key: string, action: () => Promise<T>, tryOnly = false): Promise<T | null> {
  if (tryOnly && paths.has(key)) return null;
  const previous = paths.get(key) ?? Promise.resolve();
  const current = previous.catch(() => {}).then(action);
  paths.set(key, current);
  try { return await current; }
  finally { if (paths.get(key) === current) paths.delete(key); }
}
