import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { AsyncLocalStorage } from "node:async_hooks";
import { createHmac } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, isAbsolute } from "node:path";
import type { TransactionalTenantDatabase } from "../src/lib/workspace/postgres-repository";
import { WorkspaceError } from "../src/lib/workspace/authorization";
import { isolatedKnowledge } from "./helpers/isolated-knowledge";

// Load the real server functions with request-local Cookie and database doubles.
// No Next server, environment file, native database or provider is initialized.
const require = createRequire(import.meta.url), secret = "synthetic-session-signing-secret-for-tests-only";
const signed = (id: string) => `${id}.${createHmac("sha256", secret).update(id).digest("hex")}`;
interface Fixture {
  cookie?: string;
  writes: { name: string; value: string; options: Record<string, unknown> }[];
  persistent: boolean;
  queries: { user: string; sql: string; values?: unknown[] }[];
  query: TransactionalTenantDatabase["query"];
  lease?: NonNullable<TransactionalTenantDatabase["withOperationLock"]>;
}
const requests = new AsyncLocalStorage<Fixture>();
function current() { const value = requests.getStore(); assert.ok(value, "A synthetic request is required"); return value; }
function fixture(cookie = signed(crypto.randomUUID())): Fixture {
  return { cookie, writes: [], persistent: true, queries: [], query: async () => ({ rows: [] }) };
}
const database: TransactionalTenantDatabase = {
  async query(user, sql, values) { const state = current(); state.queries.push({ user, sql, values }); return state.query(user, sql, values); },
  async transaction() { throw new Error("Unexpected business transaction before recovery"); },
  async withOperationLock(key, work, tryOnly) { return current().lease ? current().lease!(key, work, tryOnly) : work(new AbortController().signal); },
};
const replaced: [string, NodeJS.Module | undefined][] = [];
function substitute(id: string, exports: unknown) {
  const filename = require.resolve(id);
  replaced.push([filename, require.cache[filename]]);
  require.cache[filename] = { id: filename, filename, loaded: true, exports } as NodeJS.Module;
}
substitute("server-only", {});
substitute("next/headers", { cookies: async () => ({
  get: () => current().cookie ? { value: current().cookie } : undefined,
  set: (name: string, value: string, options: Record<string, unknown>) => { current().writes.push({ name, value, options }); current().cookie = value; },
}) });
substitute("../src/lib/server/database", { database, persistenceConfigured: () => current().persistent });
substitute("../src/lib/server/knowledge", { configuredEmbedding: () => null });
substitute("../src/lib/server/search", { searchService: {} });
substitute("../src/lib/server/multimodal", {});
substitute("../src/lib/ai/get-provider", { getAIProvider: () => { throw new Error("Providers must never run in this fixture"); } });
const backup = require("../src/lib/server/backup") as typeof import("../src/lib/server/backup");
substitute("../src/lib/server/backup", { ...backup, backupService: () => ({ validate: () => ({ preview: {} }) }) });
const identity = require("../src/lib/server/identity") as typeof import("../src/lib/server/identity");
const { recoverTenantBeforeAccess } = require("../src/lib/server/reliability") as typeof import("../src/lib/server/reliability");
let storageRoot: string;
before(async () => {
  process.env.WORKSPACE_SESSION_SECRET = secret;
  process.env.WORKSPACE_ORIGIN = "http://synthetic.local";
  process.env.WORKSPACE_COOKIE_SECURE = "false";
  process.env.AI_ENGINE = "llm"; // Exercise the agent entry; its provider is a throwing double.
  process.env.DEMO_MODE = "true";
  process.env.COMPETITION_MODE = "false";
  storageRoot = await mkdtemp(join(tmpdir(), "filemind-tenant-access-"));
  process.env.FILE_STORAGE_ROOT = join(storageRoot, "storage");
});
after(async () => {
  for (const [filename, previous] of replaced.reverse()) { if (previous) require.cache[filename] = previous; else delete require.cache[filename]; }
  const inside = relative(resolve(tmpdir()), resolve(storageRoot));
  assert.ok(!isAbsolute(inside) && /^filemind-tenant-access-[\w-]+$/.test(inside));
  await rm(storageRoot, { recursive: true, force: true });
});

test("Cookie verification and explicit issuance perform no recovery, database queries or operation leases", async () => {
  const user = crypto.randomUUID();
  for (const cookie of [signed(user), "", "forged", `${user}.bad`, `invalid.${"a".repeat(64)}`, `${user}.${"a".repeat(64)}`]) {
    const state = fixture(cookie);
    state.query = async () => { throw new Error("Identity must not perform database/recovery IO"); };
    state.lease = async () => { throw new Error("Identity must not acquire operation leases"); };
    await requests.run(state, async () => {
      assert.equal(await identity.getUserId(), cookie === signed(user) ? user : null);
      assert.equal(state.writes.length, 0);
      const created = await identity.getOrCreateUserId();
      assert.equal(await identity.getUserId(), created);
      if (cookie === signed(user)) { assert.equal(created, user); assert.equal(state.writes.length, 0); }
      else {
        assert.notEqual(created, user);
        assert.equal(state.writes.length, 1);
        assert.equal(state.writes[0].name, "filemind-session");
        assert.deepEqual(state.writes[0].options, { httpOnly: true, sameSite: "strict", secure: false, path: "/", maxAge: 31536000 });
      }
      await identity.issueIdentityCookie(user);
      assert.equal(await identity.getUserId(), user);
      assert.deepEqual(state.queries, []);
    });
  }
});

test("the explicit recovery barrier skips anonymous/nonpersistent access and propagates failures unchanged", async () => {
  const user = crypto.randomUUID(), failure = new Error("Synthetic recovery failure"), state = fixture();
  state.query = async () => { throw failure; };
  await requests.run(state, async () => {
    await recoverTenantBeforeAccess(null);
    state.persistent = false; await recoverTenantBeforeAccess(user);
    assert.equal(state.queries.length, 0);
    state.persistent = true;
    await assert.rejects(recoverTenantBeforeAccess(user), error => error === failure);
    assert.equal(state.queries.length, 1);
    assert.equal(state.queries[0].user, user);
  });
});

test("concurrent requests for the same owner each await recovery, without sharing a completion or failure cache", async () => {
  const user = crypto.randomUUID(), a = fixture(signed(user)), b = fixture(signed(user));
  let releaseA!: () => void, releaseB!: () => void;
  a.query = () => new Promise(resolve => { releaseA = () => resolve({ rows: [] }); });
  b.query = () => new Promise(resolve => { releaseB = () => resolve({ rows: [] }); });
  const completed: string[] = [];
  const first = requests.run(a, async () => { await recoverTenantBeforeAccess(user); completed.push("a"); });
  const second = requests.run(b, async () => { await recoverTenantBeforeAccess(user); completed.push("b"); });
  assert.equal(a.queries.length, 1); assert.equal(b.queries.length, 1); assert.deepEqual(completed, []);
  releaseA(); await first; assert.deepEqual(completed, ["a"]);
  releaseB(); await second; assert.deepEqual(completed, ["a", "b"]);
  a.query = async () => { throw new Error("Newly interrupted operation"); };
  await requests.run(a, () => assert.rejects(recoverTenantBeforeAccess(user), /Newly interrupted/));
  b.query = async () => ({ rows: [] });
  await requests.run(b, () => recoverTenantBeforeAccess(user));
  assert.equal(a.queries.length, 2); assert.equal(b.queries.length, 2);
});

type Entry = { path: string; method: string; body?: object; raw?: string };
const id = crypto.randomUUID();
const entries: Entry[] = [
  { path: "documents", method: "GET" }, { path: "documents/[id]", method: "GET" }, { path: "documents/[id]", method: "PATCH", body: {} },
  { path: "documents/[id]/original", method: "GET" }, { path: "images/[id]", method: "GET" }, { path: "duplicates", method: "PATCH", body: {} },
  { path: "workspaces", method: "GET" }, { path: "workspaces", method: "POST", body: { name: "Synthetic tenant" } },
  ...["GET", "PUT", "PATCH"].map(method => ({ path: "workspaces/[id]", method, body: method === "GET" ? undefined : {} })),
  { path: "workspaces/[id]/files", method: "POST" }, { path: "multimodal", method: "POST", body: {} },
  { path: "ai/agent", method: "POST", body: { workspaceId: id, runId: crypto.randomUUID(), revision: 0 } },
  { path: "search", method: "GET" }, { path: "search", method: "POST", body: { query: "Synthetic search", mode: "find" } },
  { path: "index", method: "GET" }, { path: "index", method: "POST", body: {} },
  { path: "maintenance", method: "GET" }, { path: "maintenance", method: "POST" },
  { path: "identity", method: "GET" }, { path: "identity", method: "POST", body: { action: "create" } },
  { path: "identity", method: "POST", body: { action: "rotate" } },
  { path: "demo", method: "GET" }, { path: "demo", method: "POST", body: { action: "reset", workspaceId: id, confirm: "RESET_DEMO_WORKSPACE" } },
  ...["export", "import", "validate"].map(action => ({ path: `backup/${action}`, method: "POST", raw: "synthetic-backup-double" })),
];
for (const entry of entries) test(`${entry.method} /api/${entry.path} blocks tenant IO when recovery fails`, async () => {
  const route = require(`../src/app/api/${entry.path}/route.ts`) as Record<string, (request: Request, context: unknown) => Promise<Response>>;
  for (const failure of [new Error("Synthetic unavailable recovery"), new WorkspaceError("CONFLICT", "Synthetic recovery conflict", 409)]) {
    const state = fixture(); state.query = async () => { throw failure; };
    const response = await requests.run(state, () => route[entry.method](new Request(`http://synthetic.local/api/${entry.path.replace("[id]", id)}`, {
      method: entry.method, headers: { origin: "http://synthetic.local", "content-type": "application/json" },
      ...(entry.method !== "GET" ? { body: entry.raw ?? JSON.stringify(entry.body ?? {}) } : {}),
    }), { params: Promise.resolve({ id }) }));
    assert.equal(response.status, failure instanceof WorkspaceError ? 409 : 503);
    assert.equal(state.queries.length, 1, "No business queries may follow a failed barrier");
    assert.match(state.queries[0].sql, /^select \* from filemind.operation_journal/);
    assert.equal(state.queries[0].user, state.cookie!.split(".")[0]);
  }
});

test("anonymous document/search entries preserve empty/404 semantics without recovery IO", async () => {
  for (const [path, status] of [["documents", 200], ["documents/[id]", 404], ["search", 200], ["search?runId=" + id, 404]] as const) {
    const route = require(`../src/app/api/${path.split("?")[0]}/route.ts`) as { GET(request: Request, context: unknown): Promise<Response> };
    const state = fixture("forged");
    const response = await requests.run(state, () => route.GET(new Request(`http://synthetic.local/api/${path}`), { params: Promise.resolve({ id }) }));
    assert.equal(response.status, status); assert.deepEqual(state.queries, []); assert.deepEqual(state.writes, []);
  }
});

test("Server Component tenant presentation stops on recovery failure; identity-only pages do no recovery", async () => {
  const { getWorkspacePresentation } = require("../src/lib/server/workspace-presentation") as typeof import("../src/lib/server/workspace-presentation");
  const state = fixture(), failure = new Error("Synthetic presentation recovery failure");
  state.query = async () => { throw failure; };
  await requests.run(state, () => assert.rejects(getWorkspacePresentation(), error => error === failure));
  assert.equal(state.queries.length, 1);
  for (const name of ["search", "settings"]) {
    const page = require(`../src/app/(product)/${name}/page.tsx`) as { default(props: unknown): Promise<unknown> };
    const pure = fixture(); pure.query = async () => { throw failure; };
    await requests.run(pure, () => page.default({ searchParams: Promise.resolve({}) }));
    assert.deepEqual(pure.queries, []); assert.deepEqual(pure.writes, []);
  }
});

test("a tenant read waits for recovery; another owner's request receives its own recovery and data scope", async () => {
  const { GET } = require("../src/app/api/documents/route") as { GET(): Promise<Response> };
  const a = fixture(), b = fixture(); let release!: () => void;
  a.query = async (_user, sql) => sql.includes("operation_journal") ? new Promise(resolve => { release = () => resolve({ rows: [] }); }) : { rows: [{ name: "Synthetic A" }] };
  b.query = async (_user, sql) => ({ rows: sql.includes("operation_journal") ? [] : [{ name: "Synthetic B" }] });
  const pending = requests.run(a, GET);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(a.queries.length, 1);
  const foreign = await requests.run(b, GET); assert.deepEqual(await foreign.json(), { documents: [{ name: "Synthetic B" }] });
  assert.equal(a.queries.length, 1);
  release(); const response = await pending; assert.deepEqual(await response.json(), { documents: [{ name: "Synthetic A" }] });
  for (const state of [a, b]) {
    assert.equal(state.queries.length, 2); assert.match(state.queries[0].sql, /operation_journal/); assert.match(state.queries[1].sql, /from filemind.documents/);
    assert.ok(state.queries.every(q => q.user === state.cookie!.split(".")[0] && q.values?.[0] === q.user));
  }
});

test("request recovery respects an active lease, fails closed on lease loss, and repairs an interrupted index before reading tenant data", async () => {
  const f = await isolatedKnowledge();
  const { GET } = require("../src/app/api/documents/route") as { GET(): Promise<Response> };
  async function seed(user: string) {
    const document = crypto.randomUUID(), operation = crypto.randomUUID(), workspace = await f.workspaces.create(user, "Synthetic interrupted index");
    await f.workspaces.save(user, { ...workspace, documents: [{ id: document, name: "synthetic.txt", type: "txt", mimeType: "text/plain", size: 9, parseStatus: "completed", metadata: { addedAt: new Date().toISOString() } }], texts: { [document]: "Synthetic" } });
    await f.tenant.query(user, "insert into filemind.operation_journal(id,user_id,operation_type,resource_id,lock_key,status,stage,payload,owner_instance) values($1,$2,'reindex',$3,$4,'running','embedding','{}',$5)", [operation, user, document, `index:${document}`, crypto.randomUUID()]);
    await f.tenant.query(user, "update filemind.documents set index_build_id=$2,index_build_status='embedding' where user_id=$1 and id=$3", [user, operation, document]);
    return { document, operation };
  }
  try {
    const user = crypto.randomUUID(), foreign = crypto.randomUUID(), own = await seed(user), other = await seed(foreign);
    const held = fixture(signed(user)); held.query = f.tenant.query;
    held.lease = async (key, _work, tryOnly) => { assert.equal(key, `${user}:index:${own.document}`); assert.equal(tryOnly, true); return null; };
    assert.equal((await requests.run(held, GET)).status, 200);
    assert.equal((await f.db.query<{ stage: string }>("select stage from filemind.operation_journal where id=$1", [own.operation])).rows[0].stage, "embedding");

    const lost = fixture(signed(user)), controller = new AbortController();
    lost.query = async (owner, sql, values) => {
      const result = await f.tenant.query(owner, sql, values);
      if (sql.includes("stage='recovering'")) controller.abort(new Error("Synthetic physical lease loss"));
      return result;
    };
    lost.lease = async (_key, work) => work(controller.signal);
    assert.equal((await requests.run(lost, GET)).status, 503);
    assert.ok(!lost.queries.some(q => q.sql.includes("from filemind.documents d")), "Interrupted recovery must block the business read");
    assert.equal((await f.db.query<{ stage: string }>("select stage from filemind.operation_journal where id=$1", [own.operation])).rows[0].stage, "recovering");

    const next = fixture(signed(user)); next.query = f.tenant.query;
    const response = await requests.run(next, GET);
    assert.equal(response.status, 200);
    assert.deepEqual((await response.json()).documents.map((d: { id: string }) => d.id), [own.document]);
    const repairIndex = next.queries.findIndex(q => q.sql.includes("index_build_status='interrupted'"));
    const readIndex = next.queries.findIndex(q => q.sql.includes("from filemind.documents d"));
    assert.ok(repairIndex >= 0 && readIndex > repairIndex);
    assert.equal((await f.db.query<{ stage: string }>("select stage from filemind.operation_journal where id=$1", [own.operation])).rows[0].stage, "recovered");
    assert.equal((await f.db.query<{ index_build_status: string }>("select index_build_status from filemind.documents where id=$1", [own.document])).rows[0].index_build_status, "interrupted");
    assert.equal((await f.db.query<{ stage: string }>("select stage from filemind.operation_journal where id=$1", [other.operation])).rows[0].stage, "embedding");
  } finally { await f.db.close(); }
});
