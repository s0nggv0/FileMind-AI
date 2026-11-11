import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { PrivateFileStorage } from "../src/lib/workspace/private-file-storage";
import { WorkspaceError } from "../src/lib/workspace/authorization";

test("private originals are atomic, idempotent and never overwritten by another payload", async () => {
  const prefix = join(tmpdir(), "filemind-storage-test-");
  const root = await mkdtemp(prefix);
  try {
    const storage = new PrivateFileStorage(root);
    const input = { userId: crypto.randomUUID(), workspaceId: crypto.randomUUID(), documentId: crypto.randomUUID(), extension: "txt", bytes: Buffer.from("notes") };
    const path = await storage.putOriginal(input);
    assert.equal(path, `${input.userId}/${input.workspaceId}/${input.documentId}/original.txt`);
    assert.equal(await storage.putOriginal(input), path);
    await assert.rejects(storage.putOriginal({ ...input, bytes: Buffer.from("other") }), (error: unknown) => error instanceof WorkspaceError && error.status === 409);
    assert.equal((await readFile(join(root, path))).toString(), "notes");
    assert.deepEqual(await readdir(join(root, input.userId, input.workspaceId, input.documentId)), ["original.txt"]);
    await assert.rejects(storage.putOriginal({ ...input, documentId: "../../public" }));
    await assert.rejects(storage.putOriginal({ ...input, extension: "../txt" }));
  } finally {
    assert.ok(resolve(root).startsWith(resolve(prefix)));
    await rm(root, { recursive: true, force: true });
  }
});

test("private file storage refuses a publicly served directory", () => {
  assert.throws(() => new PrivateFileStorage(resolve("public", "uploads")), /outside the public/);
});
