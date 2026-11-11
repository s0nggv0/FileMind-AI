import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { createElement, isValidElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { isolatedKnowledge } from "./helpers/isolated-knowledge";
import { PostgresWorkspaceRepository, type TenantDatabase } from "../src/lib/workspace/postgres-repository";
import { WorkspaceSnapshotSchema, type WorkspaceSnapshot } from "../src/lib/workspace/schemas";
import { readAppliedPlans, readLibraryDocuments, readWorkspaceOverview } from "../src/lib/workspace/presentation-reads";

const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const user = uuid(1), foreign = uuid(2), base = Date.parse("2026-10-01T00:00:00Z");
function snapshot(index: number): WorkspaceSnapshot {
  const documents = Array.from({ length: 30 }, (_, n) => ({
    id: uuid(100000 + index * 30 + n), name: `synthetic-${index}-${n}.txt`, type: "txt",
    mimeType: "text/plain", size: 20, parseStatus: "completed", metadata: { addedAt: new Date(base).toISOString() },
  }));
  const plan = {
    documents: documents.map(d => ({ id: d.id, document: d, originalName: d.name, name: d.name, category: "Study", tags: ["Z", "A"], summary: "Synthetic summary", renameDecision: "pending" })),
    relationships: ["pending", "accepted", "ignored"].map((decision, n) => ({ id: `edge-${n}`, source: documents[0].id, target: documents[n + 1].id, reason: "Synthetic relationship", decision })),
    duplicates: ["accepted", "ignored"].map((decision, n) => ({ id: `duplicate-${n}`, documentIds: [documents[0].id, documents[n + 1].id], reason: "Synthetic duplicate", decision, kind: "name" })),
    simulation: true,
  };
  return WorkspaceSnapshotSchema.parse({
    id: uuid(1000 + index), name: `Synthetic workspace ${index}`, revision: index, documents, proposal: plan, texts: {},
    updatedAt: new Date(base + index * 1000).toISOString(),
    run: { id: uuid(10000 + index), status: index % 4 === 0 ? "waiting_for_review" : "completed", simulation: true,
      startedAt: base, documents, steps: [], progress: 100, result: plan,
      // The first event is deliberately newest by timestamp, but outside the last
      // three appended events: preserve the existing per-workspace activity rule.
      activity: Array.from({ length: 5 }, (_, n) => ({ id: uuid(20000 + index * 5 + n), at: n === 0 ? base * 2 : base + index * 100 + n, message: `Synthetic event ${index}-${n}` })),
    },
  });
}

interface Measurement { queries: number; rows: number; bytes: number }
function meter(db: TenantDatabase) {
  const measurement: Measurement = { queries: 0, rows: 0, bytes: 0 };
  return { measurement, database: { async query(owner: string, sql: string, values?: unknown[]) {
    assert.equal(owner, user); assert.equal(values?.[0], user);
    const result = await db.query(owner, sql, values);
    measurement.queries++; measurement.rows += result.rows.length;
    measurement.bytes += Buffer.byteLength(JSON.stringify(result.rows));
    return result;
  } } satisfies TenantDatabase };
}

// Frozen pre-change read contract (4cf4589): three queries shared by all pages.
// Keep the old document projection so the byte comparison measures real results.
async function legacyRead(db: TenantDatabase) {
  const workspaces = await new PostgresWorkspaceRepository(db).list(user);
  await db.query(user, `select (select count(*) from filemind.workspaces where user_id=$1) as total_workspaces,
    (select count(*) from filemind.documents where user_id=$1) as total_documents`, [user]);
  const response = await db.query(user, `select d.id,d.display_name,d.file_type,d.file_size::integer,d.index_status,
    case when d.storage_path is null then 'not_stored' else d.storage_status end as storage_status,
    d.summary,d.category,d.created_at,d.updated_at,
    coalesce((select jsonb_agg(jsonb_build_object('tag',t.tag) order by t.tag) from filemind.document_tags t
      where t.user_id=$1 and t.workspace_id=d.workspace_id and t.document_id=d.id),'[]'::jsonb) as document_tags
    from filemind.documents d where d.user_id=$1 order by d.created_at desc limit 1500`, [user]);
  return { workspaces, documents: response.rows as { id: string }[], plans: workspaces.flatMap(w => w.run?.status === "completed" && w.run.result ? [{
    ...w.run.result, workspaceId: w.id, revision: w.revision, relationships: w.run.result.relationships.filter(r => r.decision !== "ignored"),
  }] : []) };
}

test("page reads preserve bounded business scope, ordering, isolation and rendered states; measure transfer", async t => {
  const f = await isolatedKnowledge();
  const require = createRequire(import.meta.url), replaced: [string, NodeJS.Module | undefined][] = [];
  const database: TenantDatabase = { query: (owner, sql, values) => f.tenant.query(owner, sql, values) };
  function substitute(id: string, exports: unknown) {
    const filename = require.resolve(id); replaced.push([filename, require.cache[filename]]);
    require.cache[filename] = { id: filename, filename, loaded: true, exports } as NodeJS.Module;
  }
  let persistent = true, owner: string | null = user, recoveries = 0;
  substitute("server-only", {});
  substitute("../src/lib/server/database", { database, persistenceConfigured: () => persistent });
  substitute("../src/lib/server/identity", { getUserId: async () => owner });
  substitute("../src/lib/server/reliability", { recoverTenantBeforeAccess: async () => { recoveries++; } });
  substitute("next/navigation", { useRouter: () => ({ refresh() {}, push() {}, replace() {} }), useSearchParams: () => new URLSearchParams() });
  substitute("../src/features/workspace/store/workspace-store", { useWorkspaceStore: (select: (state: { applied: [] }) => unknown) => select({ applied: [] }) });
  const pages = ["dashboard", "library", "graph", "cleanup"].map(name => ({ name,
    render: async (params: Record<string, string> = {}) => {
      const page = require(`../src/app/(product)/${name}/page.tsx`) as { default(props: unknown): Promise<ReturnType<typeof createElement>> };
      return renderToStaticMarkup(await page.default({ searchParams: Promise.resolve(params) }));
    },
  }));
  const snapshots: WorkspaceSnapshot[] = [];
  async function seed(start: number, count: number) {
    const batch = Array.from({ length: count }, (_, n) => snapshot(start + n)); snapshots.push(...batch);
    await f.tenant.query(user, "insert into filemind.profiles(id) values($1) on conflict do nothing", [user]);
    await f.tenant.query(user, `insert into filemind.workspaces(id,user_id,name,revision,snapshot,updated_at)
      select (s->>'id')::uuid,$1,s->>'name',(s->>'revision')::integer,s,(s->>'updatedAt')::timestamptz
      from jsonb_array_elements($2::jsonb) s`, [user, JSON.stringify(batch)]);
    await f.tenant.query(user, `insert into filemind.documents(id,user_id,workspace_id,original_name,display_name,mime_type,file_type,file_size,parse_status,metadata,summary,category,created_at,updated_at)
      select (d->>'id')::uuid,$1,w.id,d->>'name',d->>'name','text/plain','txt',20,'completed',d->'metadata','Synthetic summary','Study',
        w.updated_at + (right(d->>'id',12)::bigint % 30) * interval '1 millisecond',w.updated_at
      from filemind.workspaces w cross join lateral jsonb_array_elements(w.snapshot->'documents') d
      where w.user_id=$1 on conflict(id) do nothing`, [user]);
    await f.tenant.query(user, `insert into filemind.document_tags(user_id,workspace_id,document_id,tag)
      select $1,workspace_id,id,tag from filemind.documents cross join unnest(array['Z','A']) tag
      where user_id=$1 on conflict do nothing`, [user]);
  }
  try {
    await t.test("empty and anonymous/unconfigured pages do no unexpected IO", async () => {
      const overview = await readWorkspaceOverview(f.tenant, user);
      assert.deepEqual(overview, { workspaces: [], activity: [], documents: [], totalDocuments: 0, totalWorkspaces: 0, recentReviewWorkspaces: 0 });
      assert.deepEqual(await readLibraryDocuments(f.tenant, user), { documents: [], totalDocuments: 0 });
      assert.deepEqual(await readAppliedPlans(f.tenant, user), { plans: [], totalWorkspaces: 0 });
      for (const page of pages) {
        const html = await page.render();
        assert.match(html, /还没有保存的工作区|当前会话的资料库为空|工作区暂无关联|暂时没有整理建议/);
      }
      const access = require("../src/lib/server/workspace-presentation") as typeof import("../src/lib/server/workspace-presentation");
      for (const state of [{ persistent: true, owner: null }, { persistent: false, owner: user }]) {
        persistent = state.persistent; owner = state.owner;
        const original = database.query; database.query = async () => { throw new Error("Empty access must not read business data"); };
        try { await access.getWorkspaceOverview(); await access.getLibraryDocuments(); await access.getAppliedPlans(); }
        finally { database.query = original; }
      }
      persistent = true; owner = user;
      assert.ok(recoveries >= 10);
    });

    await seed(1, 1);
    await f.workspaces.create(foreign, "Foreign workspace must stay invisible");
    await t.test("ordinary pages receive actual documents, plans, review revisions and links", async () => {
      const overview = await readWorkspaceOverview(f.tenant, user), library = await readLibraryDocuments(f.tenant, user), plans = await readAppliedPlans(f.tenant, user);
      assert.equal(overview.totalDocuments, 30); assert.equal(overview.totalWorkspaces, 1);
      assert.equal(overview.documents.length, 4); assert.equal(overview.activity.length, 3);
      assert.deepEqual(library.documents[0].tags, ["A", "Z"]);
      assert.equal(library.documents[0].storageStatus, "not_stored");
      assert.deepEqual(plans.plans, (await legacyRead(f.tenant)).plans);
      assert.equal(plans.plans[0].duplicates[1].decision, "ignored");
      for (const page of pages) {
        const html = await page.render();
        assert.match(html, page.name === "dashboard" ? /Synthetic workspace 1/ : /synthetic-1-/);
        assert.doesNotMatch(html, /Foreign workspace/);
      }
      // Radix dialogs portal only after hydration. Verify the page's unchanged
      // direct-link handoff without pretending SSR exercises that client effect.
      const libraryPage = require("../src/app/(product)/library/page.tsx") as { default(props: unknown): Promise<{ props: { children: ReactNode[] } }> };
      const { SessionLibrary } = require("../src/features/workspace/components/session-results");
      const direct = await libraryPage.default({ searchParams: Promise.resolve({ document: uuid(999999), chunkId: "invalid" }) });
      const session = direct.props.children.find(child => isValidElement(child) && child.type === SessionLibrary);
      assert.ok(isValidElement<{ initialSelectedId: string; citationInvalid: boolean; persistent: boolean }>(session));
      assert.equal(session.props.initialSelectedId, uuid(999999));
      assert.equal(session.props.citationInvalid, true); assert.equal(session.props.persistent, true);
    });

    await seed(2, 49);
    await t.test("exact 50/1500 boundary preserves complete results without an overflow warning", async () => {
      const library = await readLibraryDocuments(f.tenant, user), overview = await readWorkspaceOverview(f.tenant, user);
      assert.equal(library.totalDocuments, 1500); assert.equal(library.documents.length, 1500);
      assert.equal(overview.workspaces.length, 50); assert.equal(overview.totalWorkspaces, 50);
      assert.doesNotMatch(await pages[0].render(), /历史、最近待审阅统计及动态仅覆盖/);
      assert.doesNotMatch(await pages[1].render(), /暂不分页/);
    });

    await seed(51, 1);
    await t.test("overflow retains old scope, excludes older completed plans, and measures actual result bytes", async () => {
      const old = meter(f.tenant), legacy = await legacyRead(old.database);
      const dashboard = meter(f.tenant), overview = await readWorkspaceOverview(dashboard.database, user);
      const libraryRead = meter(f.tenant), library = await readLibraryDocuments(libraryRead.database, user);
      const appliedRead = meter(f.tenant), applied = await readAppliedPlans(appliedRead.database, user);
      assert.equal(overview.totalDocuments, 1530); assert.equal(overview.totalWorkspaces, 51);
      assert.equal(overview.workspaces.length, 50); assert.equal(overview.documents.length, 4); assert.equal(overview.activity.length, 10);
      assert.deepEqual(overview.workspaces.map(w => w.id), legacy.workspaces.map(w => w.id));
      assert.deepEqual(library.documents.map(d => d.id).sort(), legacy.documents.map(d => d.id).sort());
      assert.equal(library.documents.length, 1500); assert.equal(library.totalDocuments, 1530);
      assert.deepEqual(applied.plans, legacy.plans);
      assert.ok(!applied.plans.some(p => p.workspaceId === uuid(1001)), "The oldest completed workspace must not leak past the latest-workspace business scope");
      assert.equal(overview.recentReviewWorkspaces, legacy.workspaces.filter(w => w.run?.status === "waiting_for_review").length);
      const activities = legacy.workspaces.flatMap(w => w.run!.activity.slice(-3).map(e => ({ ...e, workspaceId: w.id }))).sort((a, b) => b.at - a.at).slice(0, 10);
      assert.deepEqual(overview.activity, activities);
      for (const document of library.documents) {
        const relations = legacy.plans.flatMap(p => p.relationships).filter(r => r.source === document.id || r.target === document.id).length;
        assert.equal(document.relations, relations);
      }
      assert.equal(old.measurement.queries, 3); assert.equal(dashboard.measurement.queries, 2);
      assert.equal(libraryRead.measurement.queries, 1); assert.equal(appliedRead.measurement.queries, 1);
      for (const [name, measurement] of [["before (each page)", old.measurement], ["dashboard", dashboard.measurement], ["library", libraryRead.measurement], ["graph / cleanup (each)", appliedRead.measurement]] as const) {
        t.diagnostic(`${name}: ${JSON.stringify(measurement)}`);
        if (name !== "before (each page)") assert.ok(measurement.bytes < old.measurement.bytes);
      }
      for (const page of pages) {
        const html = await page.render();
        assert.match(html, page.name === "dashboard" ? /历史、最近待审阅统计及动态仅覆盖/ : page.name === "library" ? /暂不分页/ : /已保存方案范围/);
        assert.match(html, page.name === "library" ? /1530/ : /51/);
      }
      assert.equal((await f.workspaces.get(user, uuid(1001))).documents.length, 30, "Out-of-range workspaces remain accessible by ID");
      assert.equal((await readAppliedPlans(f.tenant, foreign)).totalWorkspaces, 1);
      assert.deepEqual((await readLibraryDocuments(f.tenant, foreign)).documents, []);
      const draft = await readWorkspaceOverview(f.tenant, foreign);
      assert.equal(draft.workspaces[0].status, "draft"); assert.equal(draft.workspaces[0].documentCount, 0);
      assert.deepEqual(draft.activity, []);
    });

    await t.test("equal timestamps have a deterministic ID tie-break at both cutoffs", async () => {
      // A later edit must not promote an old import into the recent-file list.
      await f.tenant.query(user, "update filemind.documents set updated_at=$2 where user_id=$1 and id=$3", [user, new Date(base * 2), snapshots[0].documents[0].id]);
      assert.ok(!(await readWorkspaceOverview(f.tenant, user)).documents.some(d => d.id === snapshots[0].documents[0].id));
      await f.tenant.query(user, "update filemind.workspaces set updated_at=$2 where user_id=$1", [user, new Date(base)]);
      await f.tenant.query(user, "update filemind.documents set created_at=$2 where user_id=$1", [user, new Date(base)]);
      const overview = await readWorkspaceOverview(f.tenant, user), library = await readLibraryDocuments(f.tenant, user), applied = await readAppliedPlans(f.tenant, user);
      const ordered = snapshots.toSorted((a, b) => b.id.localeCompare(a.id));
      assert.deepEqual(overview.workspaces.map(w => w.id), ordered.slice(0, 50).map(w => w.id));
      const ids = snapshots.flatMap(w => w.documents.map(d => d.id)).sort().reverse();
      assert.deepEqual(library.documents.map(d => d.id), ids.slice(0, 1500));
      assert.deepEqual(overview.documents.map(d => d.id), ids.slice(0, 4));
      assert.deepEqual(applied.plans.map(p => p.workspaceId), ordered.slice(0, 50).filter(w => w.run?.status === "completed").map(w => w.id));
    });
  } finally {
    for (const [filename, previous] of replaced.reverse()) { if (previous) require.cache[filename] = previous; else delete require.cache[filename]; }
    await f.db.close();
  }
});
