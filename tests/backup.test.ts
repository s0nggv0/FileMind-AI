import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { mkdtemp, rm, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { zipSync, unzipSync, strToU8 } from 'fflate';
import { applyMigrations } from '../scripts/database/migrate-database.mjs';
import { runTenantQuery, runTenantTransaction } from '../src/lib/workspace/tenant-query';
import { PostgresWorkspaceRepository, type TransactionalTenantDatabase } from '../src/lib/workspace/postgres-repository';
import { PrivateFileStorage } from '../src/lib/workspace/private-file-storage';
import { BackupService } from '../src/lib/backup/service';
import { compatibility } from '../src/lib/backup/format';
import { sha256 } from '../src/lib/backup/archive';
import { PostgresKnowledgeRepository } from '../src/lib/retrieval/postgres-knowledge';
import { PortableVectorStore } from '../src/lib/retrieval/portable-vector-store';
import { MockEmbeddingProvider } from '../src/lib/retrieval/embedding-provider';
import { IndexingPipeline } from '../src/lib/retrieval/indexing';
import { MultimodalRepository } from '../src/lib/multimodal/repository';
import { buildRAGContext, generateGroundedAnswer } from '../src/lib/retrieval/rag';
import type { AIProvider } from '../src/lib/ai/provider';
import {verifierFixtureResponse} from './helpers/verifier-fixture';
async function environment() {
    const db = new PGlite();
    await applyMigrations({ query: async (s: string, p?: unknown[]) => p ? db.query(s, p) : (await db.exec(s)).at(-1)! });
    await db.exec('create role backup_tenant; grant usage on schema filemind to backup_tenant; grant select,insert,update,delete on all tables in schema filemind to backup_tenant; grant execute on function filemind.save_workspace(uuid,jsonb,integer) to backup_tenant;');
    const client = () => ({ query: async (s: string, p?: unknown[]) => { const r = await db.query(s, p); if (s.startsWith('begin'))
            await db.exec('set local role backup_tenant'); return r; }, release() { } });
    const tenant: TransactionalTenantDatabase = { query: (u, s, p) => runTenantQuery(client(), u, s, p), transaction: (u, work, read) => runTenantTransaction(client(), u, work, read) };
    return { db, tenant, repo: new PostgresWorkspaceRepository(tenant), knowledge: new PostgresKnowledgeRepository(tenant), vectors: new PortableVectorStore(tenant) };
}
async function seed(env: Awaited<ReturnType<typeof environment>>, root: string) {
    const user = crypto.randomUUID(), id = crypto.randomUUID(), imageId = crypto.randomUUID(), runId = crypto.randomUUID();
    const w = await env.repo.create(user, 'Backup fixture');
    const text = Buffer.from('Fencing tokens reject a stale writer. Token 84 supersedes token 83.');
    const image = await readFile('tests/fixtures/rag-holdout/files/spectrometer-path.png');
    const storage = new PrivateFileStorage(root);
    const documents = [];
    for (const [docId, name, type, mimeType, bytes] of [[id, 'fencing.txt', 'txt', 'text/plain', text], [imageId, 'optics.png', 'image', 'image/png', image]] as const) {
        documents.push({ id: docId, name, type, mimeType, size: bytes.length, parseStatus: 'completed' as const, contentHash: sha256(bytes), storagePath: await storage.putOriginal({ userId: user, workspaceId: w.id, documentId: docId, extension: name.split('.').pop()!, bytes }), metadata: { addedAt: new Date().toISOString(), ...(type === 'image' ? { structure: { knowledgeSections: [{ charStart: 0, charEnd: 71, source: 'ocr' as const }] } } : {}) } });
    }
    const proposal = { documents: documents.map(d => ({ id: d.id, document: d, originalName: d.name, name: d.name, category: 'Study', tags: ['Fixture'], summary: 'Synthetic test knowledge', renameDecision: 'accepted' as const })), duplicates: [], relationships: [{ id: 'r1', source: id, target: imageId, reason: 'Synthetic relationship', decision: 'accepted' as const, kind: 'shared_concept' as const }], simulation: true };
    const run = { id: runId, status: 'completed' as const, engine: 'mock' as const, simulation: true, startedAt: Date.now(), completedAt: Date.now(), progress: 100, documents, steps: [{ id: crypto.randomUUID(), title: 'Read', description: 'Fixture read', tool: 'read_document' as const, status: 'completed' as const, progress: 100, input: { documentId: id }, output: 'Read fixture' }], activity: [], result: proposal };
    await env.repo.save(user, { ...w, documents, texts: { [id]: text.toString(), [imageId]: 'Entrance slit collimator diffraction grating detector. Slit width 0.18 mm.' }, run, proposal });
    await new MultimodalRepository(env.tenant).save({ userId: user, workspaceId: w.id }, { documentId: imageId, imageType: 'diagram', vision: { imageType: 'diagram', summary: 'Optical path', topics: ['Optics'], tags: ['Optics'], visibleConcepts: ['Diffraction grating'], confidence: 0.9 }, ocr: { text: 'Slit width 0.18 mm', confidence: 0.95, blocks: [] }, visionStatus: 'ready', ocrStatus: 'ready', provider: 'kimi', model: 'kimi-k2.6', ocrEngine: 'tesseract', analysisVersion: 'multimodal-v1', visionPromptVersion: 'vision-v1', visionCacheKey: 'fixture', ocrCacheKey: 'fixture', createdAt: new Date().toISOString(), usage: { requests: 0, latencyMs: 0 } });
    const provider = new MockEmbeddingProvider();
    const indexed = await new IndexingPipeline(env.knowledge, env.vectors, provider).indexLibrary({ userId: user });
    assert.ok(indexed.every(r => r.status === 'ready'), JSON.stringify(indexed));
    const evidence = await env.knowledge.lexicalSearch({ userId: user }, 'fencing tokens');
    const sources = buildRAGContext(evidence).sources;
    const result = { id: crypto.randomUUID(), query: 'fencing tokens', rewrittenQuery: 'fencing tokens', mode: 'ask', answer: { answer: 'Fencing tokens reject stale writers [S1].', citations: [{ sourceId: 'S1', chunkId: sources[0].id, documentId: id }], confidence: 'high', insufficientEvidence: false }, sources, nearest: sources, semanticUnavailable: false, answerUnavailable: false, mock: true, evidenceCount: sources.length, candidateCount: sources.length };
    await env.tenant.query(user, "insert into filemind.retrieval_runs(id,user_id,workspace_id,query,mode,top_k,retrieved_chunk_ids,evidence_ids,reranker_status,latency,result) values($1,$2,$3,$4,'ask',20,$5,$5,'disabled','{}',$6)", [result.id, user, w.id, result.query, sources.map(s => s.id), result]);
    return { user, workspaceId: w.id, id, imageId, provider, text, image };
}
function repackage(bytes: Uint8Array, edit: (files: Record<string, Uint8Array>) => void, rechecksum = false) { const files = unzipSync(bytes); edit(files); if (rechecksum) {
    const manifest = JSON.parse(Buffer.from(files['manifest.json']).toString());
    for (const path of Object.keys(manifest.checksums))
        manifest.checksums[path] = sha256(files[path]);
    files['manifest.json'] = strToU8(JSON.stringify(manifest));
    files['manifest.sha256'] = strToU8(sha256(files['manifest.json']));
} return zipSync(files); }
test('verified backup exports all owned knowledge and restores into empty DB with ID remapping, search and citations', async () => {
    const root = await mkdtemp(join(tmpdir(), 'filemind-backup-test-'));
    const a = await environment(), b = await environment();
    try {
        const fixture = await seed(a, join(root, 'a'));
        await a.repo.create(crypto.randomUUID(), 'Foreign secret workspace');
        const current = compatibility(fixture.provider.getModelInfo());
        const serviceA = new BackupService(a.tenant, join(root, 'a'), current);
        const stages: string[] = [];
        const exported = await serviceA.export(fixture.user, s => stages.push(s));
        assert.deepEqual(stages, ['Preparing metadata', 'Collecting files', 'Generating manifest', 'Calculating checksums', 'Packaging', 'Completed']);
        const validated = serviceA.validate(exported.bytes);
        assert.equal(validated.data.documents.length, 2);
        assert.equal(validated.data.agent_runs.length, 1);
        assert.equal(validated.data.agent_steps.length, 1);
        assert.equal(validated.data.organization_proposals.length, 1);
        assert.equal(validated.data.document_relations.length, 1);
        assert.equal(validated.data.multimodal_analysis.length, 1);
        assert.equal(validated.data.retrieval_runs.length, 1);
        assert.ok(validated.data.chunk_embeddings.length >= 2);
        assert.ok(!JSON.stringify(validated.data).includes(fixture.user));
        assert.ok(!JSON.stringify(validated.data).includes('Foreign secret workspace'));
        const user = crypto.randomUUID(), serviceB = new BackupService(b.tenant, join(root, 'b'), current);
        const restored = await serviceB.import(user, exported.bytes);
        assert.equal(restored.documents, 2);
        assert.equal(restored.embeddingCompatible, true);
        const saved = await b.repo.get(user, restored.workspaceIds[0]);
        assert.notEqual(saved.id, fixture.workspaceId);
        assert.notEqual(saved.documents[0].id, fixture.id);
        assert.equal(saved.run?.status, 'completed');
        const mm = await new MultimodalRepository(b.tenant).get({ userId: user }, saved.documents.find(d => d.type === 'image')!.id);
        assert.equal(mm?.ocr?.text, 'Slit width 0.18 mm');
        assert.equal(mm?.vision?.summary, 'Optical path');
        const semantic = await b.vectors.searchSimilar({ userId: user }, await fixture.provider.embedQuery('fencing tokens'), 20);
        assert.ok(semantic.length);
        const lexical = await b.knowledge.lexicalSearch({ userId: user }, 'fencing tokens');
        assert.ok(lexical.length);
        const provider = { name: 'fixture', models: { main: 'fixture', small: 'fixture' }, generateObject: async (input: {
                prompt: string;
            }) => { const verification=verifierFixtureResponse(input.prompt);if(verification)return {object:verification,usage:{promptTokens:0,completionTokens:0,totalTokens:0}}; const s = JSON.parse(input.prompt).evidence.untrustedSources[0]; return { object: {statements:[{text:'Fencing tokens reject stale writers.',sourceIds:[s.sourceId]}],confidence:'high',insufficientEvidence:false,evidenceDecision:{supported:true,missingInformation:[]}}, usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } }; } } as unknown as AIProvider;
        const answer = await generateGroundedAnswer('fencing tokens', lexical, { userId: user }, provider, b.knowledge.getSource.bind(b.knowledge), new AbortController().signal);
        assert.equal(answer.unavailable, false);
        assert.equal(answer.answer?.citations.length, 1);
        const document = saved.documents.find(d => d.type === 'txt')!;
        assert.ok((await new PrivateFileStorage(join(root, 'b')).readOriginal({ userId: user, workspaceId: saved.id, documentId: document.id, extension: 'txt' })).equals(fixture.text));
        assert.equal((await b.tenant.query(user, 'select count(*)::int as n from filemind.retrieval_runs where user_id=$1', [user])).rows[0] && ((await b.tenant.query(user, 'select result from filemind.retrieval_runs where user_id=$1', [user])).rows[0] as {
            result: {
                sources: {
                    userId: string;
                }[];
            };
        }).result.sources[0].userId, user);
        const duplicate = await serviceB.import(user, exported.bytes);
        assert.equal(duplicate.documents, 0);
        assert.equal(duplicate.workspaces, 0);
        assert.equal(duplicate.skippedDocuments, 2);
        const partialUser = crypto.randomUUID(), existingWorkspace = await b.repo.create(partialUser, 'Existing duplicate');
        await b.repo.save(partialUser, { ...existingWorkspace, documents: [{ ...document, id: crypto.randomUUID(), storagePath: undefined }], texts: {} }).then(async saved => {
            await b.tenant.query(partialUser, 'update filemind.documents set text_content=$3 where user_id=$1 and workspace_id=$2', [partialUser, saved.id, fixture.text.toString()]);
        });
        const partial = await serviceB.import(partialUser, exported.bytes);
        assert.equal(partial.documents, 1); assert.equal(partial.skippedDocuments, 1);
        const partialSnapshot = await b.repo.get(partialUser, partial.workspaceIds[0]);
        assert.equal(partialSnapshot.documents[0].type, 'image'); assert.equal(partialSnapshot.proposal?.relationships.length, 0);
        const mismatchedUser = crypto.randomUUID();
        const mismatch = new BackupService(b.tenant, join(root, 'b'), compatibility({ provider: 'changed', model: 'new-space', dimensions: 64 }));
        const other = await mismatch.import(mismatchedUser, exported.bytes);
        assert.equal(other.reindexRequired, true);
        assert.equal(other.embeddingCompatible, false);
        const statuses = (await b.db.query<{
            index_status: string;
        }>('select index_status from filemind.documents where workspace_id=$1', [other.workspaceIds[0]])).rows;
        assert.ok(statuses.every(s => s.index_status === 'stale'));
        const reindexed = await new IndexingPipeline(b.knowledge, b.vectors, fixture.provider).indexLibrary({ userId: mismatchedUser });
        assert.ok(reindexed.every(r => r.status === 'ready'));
        assert.ok((await b.vectors.searchSimilar({ userId: mismatchedUser }, await fixture.provider.embedQuery('fencing tokens'), 20)).length);
        const visionMismatch = new BackupService(b.tenant, join(root, 'b'), compatibility(fixture.provider.getModelInfo(), { provider: 'kimi', model: 'future', analysisVersion: 'future', promptVersion: 'future' }));
        const visionUser = crypto.randomUUID(), visionImport = await visionMismatch.import(visionUser, exported.bytes);
        assert.equal(visionImport.visionCompatible, false);
        const historical = (await new MultimodalRepository(b.tenant).get({ userId: visionUser }, (await b.repo.get(visionUser, visionImport.workspaceIds[0])).documents.find(d => d.type === 'image')!.id))!;
        assert.equal(historical.visionStatus, 'stale');
        assert.equal(historical.vision?.summary, 'Optical path');
    }
    finally {
        await a.db.close();
        await b.db.close();
        await rm(root, { recursive: true, force: true });
    }
});
test('corrupt archives, future formats, unsafe paths, symlinks and dangling references are rejected before writes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'filemind-backup-invalid-'));
    const env = await environment();
    try {
        const fixture = await seed(env, root);
        const service = new BackupService(env.tenant, root, compatibility(fixture.provider.getModelInfo()));
        const { bytes } = await service.export(fixture.user);
        assert.throws(() => service.validate(repackage(bytes, f => { f['data/documents.json'] = strToU8('[]'); })), /integrity/);
        assert.throws(() => service.validate(repackage(bytes, f => { const file = Object.keys(f).find(p => p.endsWith('.png'))!; f[file] = strToU8('corrupted'); })), /integrity/);
        assert.throws(() => service.validate(repackage(bytes, f => { const m = JSON.parse(Buffer.from(f['manifest.json']).toString()); m.version = 99; f['manifest.json'] = strToU8(JSON.stringify(m)); f['manifest.sha256'] = strToU8(sha256(f['manifest.json'])); })), /newer/);
        for (const path of ['../escape.txt', '/absolute.txt', 'C:/escape.txt', 'files/../../bad.txt', 'files\\escape.txt'])
            assert.throws(() => service.validate(zipSync({ [path]: strToU8('bad') })), /Unsafe/);
        assert.throws(() => service.validate(zipSync({ 'manifest.json': [strToU8('target'), { os: 3, attrs: 0o120777 << 16 }] })), /Unsafe/);
        assert.throws(() => service.validate(repackage(bytes, f => { const d = JSON.parse(Buffer.from(f['data/documents.json']).toString()); d[0].workspace_id = crypto.randomUUID(); f['data/documents.json'] = strToU8(JSON.stringify(d)); }, true)), /references/);
        assert.throws(() => service.validate(repackage(bytes, f => { f['manifest.json'][0] ^= 1; })), /integrity/);
        for (const [key, value] of [['display_name', null], ['created_at', 'invalid-date'], ['index_status', 'unknown']]) {
            assert.throws(() => service.validate(repackage(bytes, f => { const rows = JSON.parse(Buffer.from(f['data/documents.json']).toString()); rows[0][String(key)] = value; f['data/documents.json'] = strToU8(JSON.stringify(rows)); }, true)), /schema/);
        }
        assert.throws(() => service.validate(zipSync({ 'manifest.json': strToU8(' '.repeat(2 * 1024 * 1024)) })), /limits/);
        const dishonestSize = Buffer.from(zipSync({ 'manifest.json': strToU8(' '.repeat(2 * 1024 * 1024)) }));
        const centralOffset = dishonestSize.readUInt32LE(dishonestSize.length - 6);
        dishonestSize.writeUInt32LE(100, 22); dishonestSize.writeUInt32LE(100, centralOffset + 24);
        assert.throws(() => service.validate(dishonestSize), /integrity/);
    }
    finally {
        await env.db.close();
        await rm(root, { recursive: true, force: true });
    }
});
test('interrupted import and file-copy failure roll back metadata and quarantine published/staged bytes', async t => {
    const root = await mkdtemp(join(tmpdir(), 'filemind-backup-rollback-'));
    const env = await environment();
    try {
        const fixture = await seed(env, join(root, 'source'));
        const service = new BackupService(env.tenant, join(root, 'source'), compatibility(fixture.provider.getModelInfo()));
        const { bytes } = await service.export(fixture.user);
        const user = crypto.randomUUID();
        const destination = new BackupService(env.tenant, join(root, 'target'), compatibility(fixture.provider.getModelInfo()));
        const controller = new AbortController();
        await assert.rejects(destination.import(user, bytes, { signal: controller.signal, beforeCommit: async () => { controller.abort(); } }), /Check recovery status/);
        assert.equal((await env.db.query('select id from filemind.workspaces where user_id=$1', [user])).rows.length, 0);
        assert.equal((await env.db.query('select id from filemind.profiles where id=$1', [user])).rows.length, 1);
        const journal = (await env.db.query<{ status: string; payload: { quarantineIds: string[] } }>('select status,payload from filemind.operation_journal where user_id=$1', [user])).rows[0];
        assert.equal(journal.status, 'rolled_back'); assert.equal(journal.payload.quarantineIds.length, 3);
        assert.equal((await readdir(join(root, 'quarantine', user))).length, 3);
        const walk = async (path: string): Promise<string[]> => { const fs = await import('node:fs/promises'); const out: string[] = []; for (const e of await fs.readdir(path, { withFileTypes: true })) {
            if (e.isDirectory())
                out.push(...await walk(join(path, e.name)));
            else
                out.push(join(path, e.name));
        } return out; };
        assert.deepEqual(await walk(join(root, 'target')), []);
        const originalPut = PrivateFileStorage.prototype.putOriginal; let copies = 0;
        t.mock.method(PrivateFileStorage.prototype, 'putOriginal', async function (this: PrivateFileStorage, input: Parameters<PrivateFileStorage['putOriginal']>[0]) {
            if (++copies === 2) throw new Error('Simulated file copy failure');
            return originalPut.call(this, input);
        });
        const failedUser = crypto.randomUUID(); await assert.rejects(destination.import(failedUser, bytes), /Check recovery status/);
        assert.equal((await env.db.query('select id from filemind.workspaces where user_id=$1', [failedUser])).rows.length, 0);
        assert.deepEqual(await walk(join(root, 'target')), []);
        const failedJournal = (await env.db.query<{ status: string; payload: { quarantineIds: string[] } }>('select status,payload from filemind.operation_journal where user_id=$1', [failedUser])).rows[0];
        assert.equal(failedJournal.status, 'rolled_back'); assert.equal(failedJournal.payload.quarantineIds.length, 2);
        t.mock.restoreAll();
        const committedUser = crypto.randomUUID();
        await assert.rejects(destination.import(committedUser, bytes, { checkpoint: async stage => { if (stage === 'committed') throw new Error('Lost response after commit'); } }), /Check recovery status/);
        assert.equal((await env.db.query('select id from filemind.documents where user_id=$1', [committedUser])).rows.length, 2);
        const { RecoveryService } = await import('../src/lib/reliability/recovery');
        const recovery = new RecoveryService(env.tenant, join(root, 'target'));
        assert.equal((await recovery.recover(committedUser)).recovered, 1);
        assert.equal((await recovery.reconcile(committedUser)).referenced, 2);
        assert.equal((await recovery.recover(committedUser)).recovered, 0);
    }
    finally {
        await env.db.close();
        await rm(root, { recursive: true, force: true });
    }
});
