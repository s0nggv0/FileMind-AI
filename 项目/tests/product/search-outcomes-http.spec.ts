import { test, expect } from "@playwright/test";
import { isolatedNativeDatabase as database } from "../helpers/native-database";

test("native search reports preparation, missing recall, stale sources and legacy history within the signed scope", async ({ context, browser }) => {
  const root = process.env.FILEMIND_TEST_ROOT;
  if (!root) throw new Error("Use scripts/verification/verify-priority-optimizations.mjs for a disposable database");
  const origin = process.env.FILEMIND_TEST_ORIGIN!, headers = { origin };
  const workspace = await (await context.request.post("/api/workspaces", { headers, data: { name: "Synthetic search outcomes" } })).json();
  const documentId = crypto.randomUUID();
  const owner = await database(root, async client => {
    const user = (await client.query("select user_id from filemind.workspaces where id=$1", [workspace.id])).rows[0].user_id;
    await client.query(`insert into filemind.documents(id,user_id,workspace_id,original_name,display_name,mime_type,file_type,file_size,parse_status,metadata,text_content,index_status)
      values($1,$2,$3,'retention.txt','retention.txt','text/plain','txt',24,'completed','{}','Retention is 6 hours.','not_indexed')`, [documentId, user, workspace.id]);
    return user;
  });
  async function search(query: string, documentIds = [documentId]) {
    const response = await context.request.post("/api/search", { headers, data: { query, mode: "find", workspaceId: workspace.id, documentIds } });
    expect(response.status()).toBe(200);
    const events = (await response.text()).split("\n\n").filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6)));
    expect(events.some(event => event.type === "draft")).toBe(false);
    return events.find(event => event.type === "result").data;
  }
  const pending = await search("Retention");
  expect(pending.issues).toEqual(expect.arrayContaining(["PREPARATION_INCOMPLETE", "NO_RELEVANT_CONTENT"]));
  expect(pending.workspaceId).toBe(workspace.id); expect(pending.selectedDocumentIds).toEqual([documentId]);
  expect((await context.request.post("/api/index", { headers, data: { workspaceId: workspace.id, documentId, unfinishedOnly: true } })).status()).toBe(200);
  const found = await search("Retention");
  expect(found.sources.map((s: { documentId: string }) => s.documentId)).toEqual([documentId]);
  expect(found.issues).not.toContain("PREPARATION_INCOMPLETE");
  const absent = await search("Unrelated quantum gravity");
  expect(absent.issues).toContain("NO_RELEVANT_CONTENT"); expect(absent.issues).not.toContain("MISSING_REQUESTED_FACTS");
  const legacyId = crypto.randomUUID();
  await database(root, async client => {
    await client.query(`insert into filemind.retrieval_runs(id,user_id,workspace_id,query,mode,top_k,retrieved_chunk_ids,evidence_ids,reranker_status,latency,result)
      values($1,$2,$3,'Retention?','ask',1,'{}','{}','disabled','{}',$4)`, [legacyId, owner, workspace.id, { ...found, id: legacyId, mode: "ask", issues: undefined, answer: { answer: "UNVERIFIED LEGACY DRAFT", citations: [], confidence: "high", insufficientEvidence: true } }]);
  });
  const legacy = await (await context.request.get(`/api/search?runId=${legacyId}`)).json();
  expect(legacy.issues).toContain("HISTORY_UNVERIFIED"); expect(legacy.answer).toBeNull(); expect(legacy.verification).toBeUndefined();
  expect(legacy.sources).toEqual(found.sources); expect(legacy.selectedDocumentIds).toEqual([documentId]);
  await database(root, client => client.query("update filemind.document_chunks set content='Changed source' where id=$1", [found.sources[0].id]));
  expect((await (await context.request.get(`/api/search?runId=${found.id}`)).json()).issues).toContain("SOURCES_CHANGED");
  const foreign = await browser.newContext();
  try {
    await foreign.request.post(`${origin}/api/workspaces`, { headers, data: { name: "Separate synthetic identity" } });
    const denied = await foreign.request.post(`${origin}/api/search`, { headers, data: { query: "Retention", mode: "find", workspaceId: workspace.id, documentIds: [documentId] } });
    expect(denied.status()).toBe(404); expect(await denied.json()).toEqual({ reason: "SOURCES_CHANGED" });
    expect((await foreign.request.get(`${origin}/api/search?runId=${legacyId}`)).status()).toBe(404);
  } finally { await foreign.close(); }
  await database(root, client => client.query("delete from filemind.documents where id=$1 and user_id=$2", [documentId, owner]));
  const deleted = await context.request.post("/api/search", { headers, data: { query: "Retention", mode: "ask", workspaceId: workspace.id, documentIds: [documentId] } });
  expect(deleted.status()).toBe(404); expect(await deleted.json()).toEqual({ reason: "SOURCES_CHANGED" });
  const unavailable = await context.request.get(`/api/search?chunkId=${found.sources[0].id}`);
  expect(unavailable.status()).toBe(404); expect(await unavailable.json()).toEqual({ reason: "SOURCES_CHANGED" });
});
