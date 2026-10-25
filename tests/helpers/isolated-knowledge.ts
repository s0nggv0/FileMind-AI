import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "../../scripts/database/migrate-database.mjs";
import type { TransactionalTenantDatabase } from "../../src/lib/workspace/postgres-repository";
import { runTenantQuery, runTenantTransaction } from "../../src/lib/workspace/tenant-query";
import { PostgresWorkspaceRepository } from "../../src/lib/workspace/postgres-repository";
import { PostgresKnowledgeRepository } from "../../src/lib/retrieval/postgres-knowledge";
import { PortableVectorStore } from "../../src/lib/retrieval/portable-vector-store";

export async function isolatedKnowledge() {
  const db = new PGlite();
  await applyMigrations({ query: async (s: string, p?: unknown[]) => p ? db.query(s, p) : (await db.exec(s)).at(-1)! });
  await db.exec("create role scoped_test; grant usage on schema filemind to scoped_test; grant select,insert,update,delete on all tables in schema filemind to scoped_test; grant execute on function filemind.save_workspace(uuid,jsonb,integer) to scoped_test;");
  const client = () => ({ query: async (s: string, p?: unknown[]) => { const r = await db.query(s, p); if (s.startsWith("begin")) await db.exec("set local role scoped_test"); return r; }, release() {} });
  const tenant: TransactionalTenantDatabase = { query: (u,s,p) => runTenantQuery(client(),u,s,p), transaction: (u,w,r) => runTenantTransaction(client(),u,w,r) };
  return { db, tenant, workspaces: new PostgresWorkspaceRepository(tenant), knowledge: new PostgresKnowledgeRepository(tenant), vectors: new PortableVectorStore(tenant) };
}
