import { test } from "node:test";
import assert from "node:assert/strict";
import { PersistenceClient } from "../src/features/workspace/services/persistence-client";
import { WorkspaceSnapshotSchema } from "../src/lib/workspace/schemas";
import type { AgentRun } from "../src/types/workspace";

test("a failed save rejects its caller while later queued saves use the latest revision", async (t) => {
  const client = new PersistenceClient();
  client.persistent = true;
  client.snapshot = WorkspaceSnapshotSchema.parse({
    id: crypto.randomUUID(), name: "Queue test", revision: 3,
    documents: [], texts: {}, run: null, proposal: null, updatedAt: new Date().toISOString(),
  });
  let server = structuredClone(client.snapshot);
  const revisions: number[] = [];
  t.mock.method(globalThis, "fetch", async (_url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    revisions.push(body.revision);
    if (revisions.length === 1) return Response.json({ error: "保存服务暂时不可用" }, { status: 503 });
    if (body.revision !== server.revision) return Response.json({ error: "版本冲突" }, { status: 409 });
    server = { ...server, run: body.run, revision: server.revision + 1 };
    return Response.json(server);
  });
  const run: AgentRun = {
    id: crypto.randomUUID(), status: "running", simulation: true, startedAt: Date.now(),
    documents: [], steps: [], activity: [], progress: 10,
  };
  const first = client.saveRun(run);
  const second = client.saveRun({ ...run, progress: 50 });
  const third = client.saveRun({ ...run, progress: 90 });

  await assert.rejects(first, /保存服务暂时不可用/);
  await Promise.all([second, third]);
  assert.deepEqual(revisions, [3, 3, 4]);
  assert.equal(client.snapshot?.revision, 5);
  assert.equal(client.snapshot?.run?.progress, 90);
});
