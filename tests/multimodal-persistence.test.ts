import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { randomUUID } from "node:crypto";
import { applyMigrations } from "../scripts/migrate-database.mjs";
import { PostgresWorkspaceRepository, type TransactionalTenantDatabase } from "../src/lib/workspace/postgres-repository";
import { runTenantQuery, runTenantTransaction } from "../src/lib/workspace/tenant-query";
import { MultimodalPipeline } from "../src/lib/multimodal/pipeline";
import { MultimodalRepository } from "../src/lib/multimodal/repository";
import { PostgresKnowledgeRepository } from "../src/lib/retrieval/postgres-knowledge";
import { DocumentChunker } from "../src/lib/retrieval/chunker";
import { IndexingPipeline } from "../src/lib/retrieval/indexing";
import { PortableVectorStore } from "../src/lib/retrieval/portable-vector-store";
import { MockEmbeddingProvider } from "../src/lib/retrieval/embedding-provider";
test("image analysis FORCE RLS and chunk strategy reindex preserve identity without position conflicts", async () => {
  const sql = new PGlite();
  try {
    await applyMigrations({ query: async (statement: string, values?: unknown[]) => values ? sql.query(statement, values) : (await sql.exec(statement)).at(-1)! });
    await sql.exec("create role mm_user; grant usage on schema filemind to mm_user; grant select,insert,update,delete on all tables in schema filemind to mm_user; grant execute on function filemind.save_workspace(uuid,jsonb,integer) to mm_user;");
    const client=()=>({query:async(q:string,p?:unknown[])=>{const r=await sql.query(q,p);if(q.startsWith("begin"))await sql.exec("set local role mm_user");return r;},release(){}});
    const db:TransactionalTenantDatabase={query:(u,s,p)=>runTenantQuery(client(),u,s,p),transaction:(u,w,r)=>runTenantTransaction(client(),u,w,r)};
    const userId = randomUUID(); const outsider = randomUUID(); const ws = await new PostgresWorkspaceRepository(db).create(userId, "Image tests");
    const id = randomUUID(); const image = { id, name: "diagram.png", type: "image" as const, mimeType: "image/png", size: 100, parseStatus: "completed" as const, metadata: { addedAt: new Date().toISOString(), width: 1200, height: 720 } };
    const result = await new MultimodalPipeline(null, { getEngineInfo: () => ({ engine: "fixture", version: "1" }), extractText: async () => ({ text: "A meaningful long OCR source describes attention, matrix transformations and their distinct relationships. ".repeat(100), confidence: 0.9, blocks: [] }) }).analyze(id, { bytes: new Uint8Array([1]), mimeType: "image/png", filename: image.name }, "hash", new AbortController().signal);
    await new PostgresWorkspaceRepository(db).save(userId, { ...ws, documents: [{ ...image, metadata: { ...image.metadata, structure: result.structure } }], texts: { [id]: result.text } });
    const mm = new MultimodalRepository(db); await mm.save({ userId, workspaceId: ws.id }, result.analysis);
    assert.equal((await mm.get({ userId }, id))?.ocrStatus, "ready"); assert.equal(await mm.get({ userId: outsider }, id), null);
    await assert.rejects(mm.save({ userId: outsider, workspaceId: ws.id }, result.analysis));
    for (const target of [800, 400, 1200, 800]) {
      const repo = new PostgresKnowledgeRepository(db, new DocumentChunker({ chunkTargetTokens: target, chunkMaxTokens: target + 200, overlapTokens: 100 }));
      const doc = (await repo.documents({ userId }))[0], chunks=repo.buildChunks(doc);
      assert.ok(chunks.length > 1); assert.ok(chunks.every(c => c.chunkSource === "ocr" && c.pageStart === null));
      assert.equal((await new IndexingPipeline(repo,new PortableVectorStore(db),new MockEmbeddingProvider()).indexDocument(doc)).status,"ready");
      const retrieved = await repo.lexicalSearch({ userId }, "matrix transformations"); assert.ok(retrieved.length);
      assert.equal((await repo.lexicalSearch({ userId: outsider }, "matrix transformations")).length, 0);
    }
    assert.deepEqual((await db.query(userId, "select content_source,image_width,image_height from filemind.documents where id=$1", [id])).rows[0], { content_source: "image", image_width: 1200, image_height: 720 });
    await mm.save({ userId, workspaceId: ws.id }, { ...result.analysis, imageType: "slide", visionStatus: "ready", vision: { imageType: "slide", summary: "A learning slide about attention.", topics: ["Self Attention"], visibleConcepts: [], tags: ["Machine learning"], confidence: 0.9 } });
    const workspaceRepo = new PostgresWorkspaceRepository(db);
    for (const owner of [userId, outsider]) {
      const other = await workspaceRepo.create(owner, "Related concept fixture"); const textId = randomUUID();
      await workspaceRepo.save(owner, { ...other, documents: [{ id: textId, name: "concept.txt", type: "txt", mimeType: "text/plain", size: 40, parseStatus: "completed", metadata: { addedAt: new Date().toISOString() } }], texts: { [textId]: "Self-attention relates tokens in a sequence." } });
    }
    const related = await mm.related({ userId }, id); assert.equal(related.length, 1); assert.equal((related[0] as { name: string }).name, "concept.txt");
    assert.deepEqual(await mm.related({ userId: outsider }, id), []);
  } finally { await sql.close(); }
});
