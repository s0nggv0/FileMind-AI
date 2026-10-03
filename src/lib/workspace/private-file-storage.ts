import { createHash, randomUUID } from "node:crypto";
import { link, lstat, mkdir, readFile, realpath, unlink } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { z } from "zod";
import { uploadConfig } from "@/config/upload";
import { WorkspaceError } from "./authorization";
import { atomicWriteFile, withPathMutex } from "../reliability/atomic-file";

function contained(root: string, target: string) {
  const path = relative(root, target);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}
export class PrivateFileStorage {
  private root: string;
  constructor(root: string, private publicDirectory = resolve("public")) {
    this.root = resolve(root);
    if (contained(this.publicDirectory, this.root)) throw new WorkspaceError("UNAVAILABLE", "Private storage must be outside the public directory.", 503);
  }
  async readOriginal(input: { userId: string; workspaceId: string; documentId: string; extension: string }) {
    const ids = [input.userId, input.workspaceId, input.documentId].map(id => z.uuid().parse(id));
    if (!uploadConfig.extensions.includes(input.extension)) throw new WorkspaceError("NOT_FOUND", "Source not found.", 404);
    const root = await realpath(this.root); const target = join(root, ...ids, `original.${input.extension}`);
    try {
      const resolved = await realpath(target); const info = await lstat(target);
      if (!contained(root, resolved) || !info.isFile() || info.isSymbolicLink() || info.size > uploadConfig.maxFileBytes) throw new Error("Invalid source");
      return await readFile(resolved);
    } catch { throw new WorkspaceError("NOT_FOUND", "Source not found.", 404); }
  }
  async putOriginal(input: { userId: string; workspaceId: string; documentId: string; extension: string; bytes: Buffer }) {
    const ids = [input.userId, input.workspaceId, input.documentId].map(id => z.uuid().parse(id));
    if (!uploadConfig.extensions.includes(input.extension) || input.bytes.length > uploadConfig.maxFileBytes) throw new WorkspaceError("INVALID_STATE", "Invalid original file.");
    const key = `${ids.join("/")}/original.${input.extension}`;
    try {
      await mkdir(this.root, { recursive: true, mode: 0o700 });
      const root = await realpath(this.root);
      const publicRoot = await realpath(this.publicDirectory).catch(() => this.publicDirectory);
      if (contained(publicRoot, root)) throw new WorkspaceError("UNAVAILABLE", "Private storage must be outside the public directory.", 503);
      let directory = root;
      for (const id of ids) {
        directory = join(directory, id);
        await mkdir(directory, { mode: 0o700 }).catch(error => { if (error.code !== "EEXIST") throw error; });
        const info = await lstat(directory);
        if (!info.isDirectory() || info.isSymbolicLink() || !contained(root, await realpath(directory))) throw new WorkspaceError("UNAVAILABLE", "Private storage directory is invalid.", 503);
      }
      const target = join(directory, `original.${input.extension}`);
      await withPathMutex(target, async () => {
        const existing = await lstat(target).catch(error => { if (error.code !== "ENOENT") throw error; return null; });
        if (existing) {
          if (!existing.isFile() || existing.isSymbolicLink() || existing.size !== input.bytes.length) throw new WorkspaceError("CONFLICT", "An original file already exists with different content.", 409);
          const existingHash = createHash("sha256").update(await readFile(target)).digest("hex");
          if (existingHash !== createHash("sha256").update(input.bytes).digest("hex")) throw new WorkspaceError("CONFLICT", "An original file already exists with different content.", 409);
          return;
        }
        // Sync/close/rename creates a complete immutable staging file. Atomic
        // no-replace hard-link publication also protects callers in other
        // processes; a rename directly over the original could overwrite it.
        const staged = join(directory, `${randomUUID()}.ready`);
        try {
          await atomicWriteFile(staged, input.bytes);
          await link(staged, target).catch(async error => {
            if (error.code !== "EEXIST") throw error;
            const info = await lstat(target);
            if (!info.isFile() || info.isSymbolicLink() || info.size !== input.bytes.length || createHash("sha256").update(await readFile(target)).digest("hex") !== createHash("sha256").update(input.bytes).digest("hex")) throw new WorkspaceError("CONFLICT", "An original file already exists with different content.", 409);
          });
        } finally { await unlink(staged).catch(error => { if (error.code !== "ENOENT") throw error; }); }
      });
      return key;
    } catch (error) {
      if (error instanceof WorkspaceError) throw error;
      throw new WorkspaceError("UNAVAILABLE", "File could not be stored. Check the private storage disk and retry.", 503);
    }
  }
}
