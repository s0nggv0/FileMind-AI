import { spawn } from "node:child_process";
import { cp, readFile, rm, access, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join, relative, isAbsolute } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import assert from "node:assert/strict";
import { databasePathMatches, parsePostmasterPid } from "../runtime/portable-paths.mjs";

const source = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const target = join(source, "artifacts/portable copy 验收");
const { Client } = createRequire(join(source, ".next/standalone/server.js"))("pg");
let workspace; let user; let cookie; let documentId; let storagePath;
let indexedChunk; let savedSearch; let originalRevision; let imageId; let imagePath; let imageAnalysis; let imageVectors;
let persistedVector;
const report = { passed: false, checkedAt: new Date().toISOString(), fixtureMode: "real Kimi Vision + portable OCR + DashScope + grounded Kimi", unicodeAndSpaces: true, rootNodeModulesRequired: false, globalNodeRequired: false, chunksRestored: false, vectorsRestored: false, citationRestored: false, searchAfterCopy: false, simultaneousDatabasesIsolated: false, imageOriginalRestored: false, imageAnalysisRestored: false, imageVectorsRestored: false, imageSearchAfterCopy: false, portableOCRAfterCopy: false };
const alive = new Map();
const exists = path => access(path).then(() => true, () => false);

function child(root, args) {
  const process_ = spawn(join(root, ".filemind/runtime/node.exe"), [join(root, "scripts/portable-start.mjs"), ...args], { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  process_.stdout.on("data", bytes => { output += bytes; });
  process_.stderr.on("data", bytes => { output += bytes; });
  const completion = new Promise((resolveExit, reject) => {
    process_.on("error", () => reject(new Error("Portable verification process could not start.")));
    process_.on("exit", code => code === 0 ? resolveExit() : reject(new Error(`Portable verification process failed: ${output.slice(-1200)}`)));
  });
  completion.catch(() => {});
  return { completion, process_ };
}

async function start(root, port) {
  const launched = child(root, ["--port", String(port)]);
  alive.set(root, launched);
  for (let attempt = 0; attempt < 120; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/workspace-config`);
      if (response.ok && (await response.json()).persistent) return;
    } catch {}
    if (launched.process_.exitCode !== null) await launched.completion;
    await new Promise(resolveWait => setTimeout(resolveWait, 500));
  }
  throw new Error("Portable server did not become ready.");
}

async function stop(root) {
  await child(root, ["--stop"]).completion;
  if (alive.has(root)) await alive.get(root).completion;
  alive.delete(root);
  assert.equal(await exists(join(root, ".filemind/postgresql/data/postmaster.pid")), false, "Database must be stopped before copying");
  assert.equal(await exists(join(root, ".filemind/launcher.lock")), false, "Launcher must be stopped before copying");
}

async function db(root, callback, application = false) {
  const instance = JSON.parse(await readFile(join(root, ".filemind/postgresql/instance.json"), "utf8"));
  let client;
  if (application) {
    const env = await readFile(join(root, ".env.local"), "utf8");
    client = new Client({ connectionString: env.match(/^DATABASE_URL=(.*)$/m)[1].trim() });
  } else {
    const password = (await readFile(join(root, ".filemind/postgresql/admin.password"), "utf8")).trim();
    client = new Client({ host: "127.0.0.1", port: instance.port, database: "filemind_ai", user: "filemind_admin", password });
  }
  try { await client.connect(); return await callback(client); }
  finally { await client.end(); }
}

async function api(port, path, init = {}) {
  const origin = `http://127.0.0.1:${port}`;
  const headers = { origin, ...(cookie ? { cookie } : {}), ...(init.body && !(init.body instanceof FormData) ? { "content-type": "application/json" } : {}) };
  const response = await fetch(origin + path, { ...init, headers });
  if (response.headers.get("set-cookie")) cookie = response.headers.get("set-cookie").split(";")[0];
  assert.equal(response.ok, true, `HTTP persistence request ${init.method ?? "GET"} ${path} failed with ${response.status}`);
  return response.json();
}

function assertWithin(root, path) {
  const inside = relative(resolve(root), resolve(path));
  assert.ok(inside && !inside.startsWith("..") && !isAbsolute(inside), "Cleanup path must remain within the intended directory");
}

async function cleanup(root) {
  if (!workspace || !user) return;
  await db(root, async client => {
    await client.query("delete from filemind.workspaces where id=$1 and user_id=$2", [workspace, user]);
    await client.query("delete from filemind.profiles where id=$1 and not exists(select 1 from filemind.workspaces where user_id=$1)", [user]);
  });
  const storage = join(root, ".filemind/storage");
  const directory = join(storage, user, workspace);
  assertWithin(storage, directory);
  await rm(directory, { recursive: true, force: true });
}

try {
  assert.equal(await exists(target), false, "Verification copy already exists; do not overwrite it");
  await start(source, 3083);
  const previousFixtures = await db(source, async client => (await client.query("select id,user_id from filemind.workspaces where name='Synthetic relocation verification' and snapshot->'documents'->0->>'name'='relocation.txt' and snapshot->'texts' ? (snapshot->'documents'->0->>'id') and snapshot->'texts'->>(snapshot->'documents'->0->>'id')='Synthetic portable document: persists after the entire folder moves.' and created_at > now()-interval '1 day'")).rows);
  for (const fixture of previousFixtures) { workspace = fixture.id; user = fixture.user_id; await cleanup(source); }
  workspace = undefined; user = undefined;
  const snapshot = await api(3083, "/api/workspaces", { method: "POST", body: JSON.stringify({ name: "Synthetic relocation verification" }) });
  workspace = snapshot.id;
  documentId = randomUUID();
  const bytes = Buffer.from("Synthetic portable document: persists after the entire folder moves.");
  const document = { id: documentId, name: "relocation.txt", type: "txt", mimeType: "text/plain", size: bytes.length, parseStatus: "completed", contentHash: createHash("sha256").update(bytes).digest("hex"), metadata: { addedAt: new Date().toISOString(), characters: bytes.length } };
  const imageBytes = await readFile(join(source, "tests/fixtures/rag-hard/images/transformer-slide.png"));
  imageId = randomUUID();
  const imageDocument = { id: imageId, name: "transformer-slide.png", type: "image", mimeType: "image/png", size: imageBytes.length, parseStatus: "completed", contentHash: createHash("sha256").update(imageBytes).digest("hex"), metadata: { addedAt: new Date().toISOString() } };
  await api(3083, `/api/workspaces/${workspace}`, { method: "PUT", body: JSON.stringify({ ...snapshot, documents: [document, imageDocument], texts: { [documentId]: bytes.toString() } }) });
  const form = new FormData();
  form.set("documentId", documentId); form.set("file", new Blob([bytes], { type: "text/plain" }), "relocation.txt");
  const saved = await api(3083, `/api/workspaces/${workspace}/files`, { method: "POST", body: form });
  storagePath = saved.documents[0].storagePath;
  user = storagePath.split("/")[0];
  assert.equal(saved.texts[documentId], bytes.toString());
  await db(source, async client => {
    const pidBytes = (await client.query("select pg_read_binary_file('postmaster.pid') as pid_bytes")).rows[0].pid_bytes;
    assert.equal(databasePathMatches(parsePostmasterPid(pidBytes).directory, resolve(source, ".filemind/postgresql/data")), true);
    const role = (await client.query("select rolsuper,rolcreatedb,rolcreaterole,rolbypassrls from pg_roles where rolname='filemind_user'")).rows[0];
    assert.deepEqual(role, { rolsuper: false, rolcreatedb: false, rolcreaterole: false, rolbypassrls: false });
    assert.deepEqual((await client.query("select datname from pg_database where not datistemplate and datname <> 'postgres' order by datname")).rows.map(row => row.datname), ['filemind_ai']);
    assert.equal((await client.query("select count(*)::int as n from information_schema.tables where table_schema='filemind'")).rows[0].n, 15);
  });
  await db(source, async client => {
    assert.equal((await client.query("select count(*)::int as n from filemind.workspaces")).rows[0].n, 0);
    await client.query("begin");
    await client.query("select set_config('filemind.user_id',$1,true)", [user]);
    assert.equal((await client.query("select count(*)::int as n from filemind.workspaces")).rows[0].n, 1);
    await client.query("rollback");
  }, true);
  const imageForm = new FormData(); imageForm.set("documentId", imageId); imageForm.set("file", new Blob([imageBytes], { type: "image/png" }), "transformer-slide.png");
  const imageSaved = await api(3083, `/api/workspaces/${workspace}/files`, { method: "POST", body: imageForm });
  imagePath = imageSaved.documents.find(d => d.id === imageId).storagePath;
  await api(3083, "/api/index", { method: "POST", body: JSON.stringify({ workspaceId: workspace }) });
  imageAnalysis = (await api(3083, `/api/images/${imageId}`)).analysis;
  assert.equal(imageAnalysis.visionStatus, "ready"); assert.equal(imageAnalysis.ocrStatus, "ready");
  assert.match(imageAnalysis.ocr.text, /Self Attention/i);
  originalRevision = (await api(3083, `/api/workspaces/${workspace}`)).revision;
  await db(source, async client => { imageVectors = (await client.query("select chunk_id,embedding,dimensions,model,provider from filemind.chunk_embeddings where user_id=$1 and document_id=$2 order by chunk_id", [user, imageId])).rows; assert.ok(imageVectors.length); });
  const search = await fetch("http://127.0.0.1:3083/api/search", { method: "POST", headers: { origin: "http://127.0.0.1:3083", cookie, "content-type": "application/json" }, body: JSON.stringify({ query: "Synthetic portable document", mode: "ask", workspaceId: workspace }) });
  const events = (await search.text()).split("\n\n").filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6)));
  savedSearch = events.find(e => e.type === "result")?.data;
  assert.ok(savedSearch?.answer?.citations.length, "Stored search must cite a real chunk before copying");
  indexedChunk = await api(3083, `/api/search?chunkId=${savedSearch.sources[0].id}`);
  assert.equal(indexedChunk.content, bytes.toString());
  await db(source, async client => { persistedVector = (await client.query("select embedding,dimensions,model,provider from filemind.chunk_embeddings where user_id=$1 and document_id=$2", [user, documentId])).rows[0]; assert.ok(persistedVector); });
  await stop(source);
  for (const name of ["scripts", "database", ".env.example", ".env.local", ".filemind", ".next/standalone", "启动 FileMind.bat", "停止 FileMind.bat"]) {
    await cp(join(source, name), join(target, name), { recursive: true });
  }
  assert.equal(await exists(join(target, "node_modules")), false);
  await start(target, 3084);
  const restored = await api(3084, `/api/workspaces/${workspace}`);
  assert.equal(restored.texts[documentId], bytes.toString());
  assert.equal((await readFile(join(target, ".filemind/storage", storagePath))).equals(bytes), true);
  assert.equal((await readFile(join(target, ".filemind/storage", imagePath))).equals(imageBytes), true); report.imageOriginalRestored = true;
  assert.deepEqual((await api(3084, `/api/images/${imageId}`)).analysis, imageAnalysis); report.imageAnalysisRestored = true;
  await db(target, async client => { assert.deepEqual((await client.query("select chunk_id,embedding,dimensions,model,provider from filemind.chunk_embeddings where user_id=$1 and document_id=$2 order by chunk_id", [user, imageId])).rows, imageVectors); }); report.imageVectorsRestored = true;
  const restoredSearch = await api(3084, `/api/search?runId=${savedSearch.id}`);
  assert.deepEqual(restoredSearch.answer.citations, savedSearch.answer.citations);
  assert.equal((await api(3084, `/api/search?chunkId=${indexedChunk.id}`)).content, indexedChunk.content);
  report.chunksRestored = true; report.citationRestored = true;
  await db(target, async client => { assert.deepEqual((await client.query("select embedding,dimensions,model,provider from filemind.chunk_embeddings where user_id=$1 and document_id=$2", [user, documentId])).rows[0], persistedVector); });
  report.vectorsRestored = true;
  const copiedSearch = await fetch("http://127.0.0.1:3084/api/search", { method: "POST", headers: { origin: "http://127.0.0.1:3084", cookie, "content-type": "application/json" }, body: JSON.stringify({ query: "Synthetic portable document", mode: "ask", workspaceId: workspace }) });
  const copiedEvents = (await copiedSearch.text()).split("\n\n").filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6)));
  assert.equal(copiedEvents.find(e => e.type === "result")?.data.answer.citations[0].chunkId, indexedChunk.id); report.searchAfterCopy = true;
  const imageSearch = await fetch("http://127.0.0.1:3084/api/search", { method: "POST", headers: { origin: "http://127.0.0.1:3084", cookie, "content-type": "application/json" }, body: JSON.stringify({ query: "我的 Transformer 截图中 Query、Key、Value 分别有什么作用？", mode: "ask", workspaceId: workspace }) });
  const imageEvents = (await imageSearch.text()).split("\n\n").filter(line => line.startsWith("data: ")).map(line => JSON.parse(line.slice(6)));
  assert.ok(imageEvents.find(e => e.type === "result")?.data.answer?.citations.some(c => c.documentId === imageId)); report.imageSearchAfterCopy = true;
  // Remove only the synthetic OCR cache so the moved standalone must actually run its bundled worker/languages.
  await db(target, async client => { await client.query("update filemind.multimodal_analysis set analysis=jsonb_set(analysis,'{ocrCacheKey}',to_jsonb('synthetic-retry'::text)) where user_id=$1 and document_id=$2", [user, imageId]); });
  await api(3084, "/api/index", { method: "POST", body: JSON.stringify({ documentId: imageId }) });
  const copiedAnalysis = (await api(3084, `/api/images/${imageId}`)).analysis;
  assert.equal(copiedAnalysis.usage.requests, 0); assert.equal(copiedAnalysis.ocrStatus, "ready"); assert.match(copiedAnalysis.ocr.text, /Self Attention/i); report.portableOCRAfterCopy = true;
  const currentRestored = await api(3084, `/api/workspaces/${workspace}`);
  const changed = await api(3084, `/api/workspaces/${workspace}`, { method: "PUT", body: JSON.stringify({ ...currentRestored, name: "Moved folder verified" }) });
  assert.equal(changed.revision, currentRestored.revision + 1);
  await db(target, async client => {
    const pidBytes = (await client.query("select pg_read_binary_file('postmaster.pid') as pid_bytes")).rows[0].pid_bytes;
    assert.equal(databasePathMatches(parsePostmasterPid(pidBytes).directory, resolve(target, ".filemind/postgresql/data")), true);
  });
  await start(source, 3083);
  const original = await api(3083, `/api/workspaces/${workspace}`);
  assert.equal(original.name, "Synthetic relocation verification");
  assert.equal(original.revision, originalRevision);
  const sourcePort = JSON.parse(await readFile(join(source, ".filemind/postgresql/instance.json"), "utf8")).port;
  const targetPort = JSON.parse(await readFile(join(target, ".filemind/postgresql/instance.json"), "utf8")).port;
  assert.notEqual(sourcePort, targetPort);
  report.simultaneousDatabasesIsolated = true;
  await cleanup(target);
  await stop(target);
  await cleanup(source);
  await stop(source);
  assertWithin(join(source, "artifacts"), target);
  await rm(target, { recursive: true, force: true });
  report.passed = true;
  console.log("PASS: copied folder with Unicode/spaces; no root node_modules or global Node; private PostgreSQL/files/chunks/vectors/search/citations restored; simultaneous copies use different ports and isolated databases; application role/FORCE RLS checked; both databases stopped cleanly; synthetic records removed.");
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  for (const root of alive.keys()) {
    try { await cleanup(root); } catch {}
    try { await stop(root); } catch {}
  }
  await writeFile(join(source, "docs/phase-checklists/multimodal-portable-copy.json"), JSON.stringify(report, null, 2) + "\n");
}
