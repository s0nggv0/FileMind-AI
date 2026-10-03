// Explicit paid-provider verification. Only synthetic fixtures and a fresh,
// disposable target are used; a physical PostgreSQL data directory is never copied.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, readFile, writeFile, mkdir, access, rm } from "node:fs/promises";
import { randomUUID, randomBytes, createHash } from "node:crypto";
import { dirname, join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { createServer } from "node:net";
import { chromium, expect } from "@playwright/test";
import { unzipSync } from "fflate";

const source = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = join(source, "artifacts", `phase7-fresh-${randomUUID()}`);
const qa = join(source, "artifacts/phase7-qa");
const { Client } = createRequire(join(source, "package.json"))("pg");
const report = { passed: false, checkedAt: new Date().toISOString(), fixtureMode: "real browser upload + portable Tesseract OCR + Kimi Vision/Agent/RAG + DashScope vectors", freshDataDirectory: true, copiedDatabase: false, copiedCookie: false, copiedRecoveryKey: false, checks: {} };
let browser, launchB, userA, workspaceA;
let inputFiles, snapshotA, imageA, analysisA, backupFile, backupBytes, countsA;
const textQuery = "How do fencing tokens stop a stale writer from overwriting newer data?";
const imageQuery = "What is the slit width in the spectrometer diagram?";
const pageErrors = [];
const exists = path => access(path).then(() => true, () => false);
const sha = bytes => createHash("sha256").update(bytes).digest("hex");
function within(root, path) { const r = relative(resolve(root), resolve(path)); assert.ok(r && !r.startsWith("..") && !isAbsolute(r), "Verified cleanup must stay in the intended directory"); }
function launch(root, args) {
  const child = spawn(join(root, ".filemind/runtime/node.exe"), [join(root, "scripts/portable-start.mjs"), ...args], { cwd: root, windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
  // Never echo launcher output: verification failures need no configured secrets.
  let output = "";
  child.stdout.on("data", bytes => { output += bytes; }); child.stderr.on("data", bytes => { output += bytes; });
  const finished = new Promise((resolveExit, reject) => { child.on("error", () => reject(new Error("Verification launcher could not start."))); child.on("exit", code => code === 0 ? resolveExit() : reject(new Error("Verification launcher failed."))); });
  finished.catch(() => {}); return { child, finished, diagnostic: () => output.slice(-1800).replace(/postgresql:\/\/\S+/g, "[database address]").replace(/sk-[\w-]+/g, "[API credential]").replace(/[a-f0-9]{64}/g, "[digest]") };
}
async function freePort() { const socket = createServer(); await new Promise(resolveReady => socket.listen(0, "127.0.0.1", resolveReady)); const port = socket.address().port; await new Promise(resolveClose => socket.close(resolveClose)); return port; }
async function ready(origin, launched) {
  for (let n = 0; n < 240; n++) { if (launched && launched.child.exitCode !== null) throw new Error("Fresh launcher exited: " + launched.diagnostic()); try { const response = await fetch(origin + "/api/workspace-config"); if (response.ok && (await response.json()).persistent) return; } catch {} await new Promise(resolveWait => setTimeout(resolveWait, 500)); }
  throw new Error("Fresh portable environment did not become ready.");
}
async function database(root, work) {
  const instance = JSON.parse(await readFile(join(root, ".filemind/postgresql/instance.json"), "utf8"));
  const password = (await readFile(join(root, ".filemind/postgresql/admin.password"), "utf8")).trim();
  const client = new Client({ host: "127.0.0.1", port: instance.port, database: "filemind_ai", user: "filemind_admin", password });
  try { await client.connect(); return await work(client); } finally { await client.end(); }
}
async function json(response) { if (!response.ok()) throw new Error(`Verification ${new URL(response.url()).pathname}: HTTP ${response.status()} (${(await response.json()).error || "request failed"})`); return response.json(); }
async function search(context, origin, query, workspaceId) {
  const response = await context.request.post(origin + "/api/search", { headers: { origin }, data: { query, workspaceId, mode: "ask" }, timeout: 180000 });
  assert.ok(response.ok());
  const events = (await response.text()).split("\n\n").filter(x => x.startsWith("data: ")).map(x => JSON.parse(x.slice(6)));
  const result = events.find(e => e.type === "result")?.data;
  assert.ok(result && !result.answerUnavailable && result.answer && !result.answer.insufficientEvidence && result.answer.citations.length, "Grounded real-provider RAG must return validated citations");
  return result;
}
async function counts(root, user) {
  return database(root, async client => {
    const result = {};
    for (const name of ["workspaces", "documents", "agent_runs", "agent_steps", "organization_proposals", "document_tags", "document_relations", "document_chunks", "chunk_embeddings", "multimodal_analysis", "retrieval_runs"]) result[name] = (await client.query(`select count(*)::int as n from filemind.${name} where user_id=$1`, [user])).rows[0].n;
    return result;
  });
}
async function screenshot(page, path) {
  await page.evaluate(async () => { await document.fonts.ready; if (document.activeElement instanceof HTMLElement) document.activeElement.blur(); window.scrollTo({ top: 0, behavior: "instant" }); });
  await page.screenshot({ path, fullPage: true });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "Settings must not overflow");
}
try {
 if (!process.argv.includes("--restore-only")) {
  console.log("Phase 7: creating isolated PDF/TXT/image workspace in environment A.");
  const originA = "http://127.0.0.1:3083"; await ready(originA);
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
  const a = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const page = await a.newPage();
  page.on("pageerror", e => pageErrors.push(e.message));
  inputFiles = [
    { name: "timezone-meeting.pdf", mimeType: "application/pdf", buffer: await readFile(join(source, "tests/fixtures/rag-holdout/files/timezone-meeting.pdf")) },
    { name: "fencing-backup.txt", mimeType: "text/plain", buffer: Buffer.from("Fencing tokens protect a storage service from stale writers. A paused writer may resume after its lease expires. The storage service records the largest fencing token it has accepted, and rejects writes carrying older tokens. Token 84 supersedes token 83. Comparison at the write boundary prevents delayed writes from overwriting newer data.") },
    { name: "spectrometer-path.png", mimeType: "image/png", buffer: await readFile(join(source, "tests/fixtures/rag-holdout/files/spectrometer-path.png")) },
  ];
  await page.goto(originA + "/workspace"); await page.getByLabel("Choose local files").setInputFiles(inputFiles);
  await page.getByRole("button", { name: "Organize with FileMind" }).click();
  await expect(page.getByRole("heading", { name: "Organization Proposal" })).toBeVisible({ timeout: 280000 });
  workspaceA = new URL(page.url()).searchParams.get("workspace"); assert.ok(workspaceA);
  const reviewed = await json(await a.request.get(originA + `/api/workspaces/${workspaceA}`));
  assert.equal(reviewed.run.engine, "llm"); assert.equal(reviewed.run.simulation, false); assert.ok(reviewed.run.usage.totalTokens > 0);
  report.organizationPlanFallback = reviewed.run.fallback ?? null;
  assert.deepEqual(new Set(reviewed.documents.map(d => d.type)), new Set(["pdf", "txt", "image"])); assert.ok(reviewed.documents.every(d => d.storagePath));
  userA = reviewed.documents[0].storagePath.split("/")[0];
  await page.getByRole("button", { name: "Apply organization plan" }).click(); await expect(page.getByRole("heading", { name: "Workspace organized" })).toBeVisible();
  console.log("Phase 7: verifying real OCR, Vision, vectors and grounded RAG in A.");
  // Applying starts the actual background index. Observe it to completion rather
  // than starting a second image-analysis save against the same revision.
  await expect.poll(async () => { const index = await json(await a.request.get(originA + "/api/index")); return index.documents.length === 3 && index.documents.every(r => r.status === "ready"); }, { timeout: 180000, intervals: [1000, 2000] }).toBe(true);
  snapshotA = await json(await a.request.get(originA + `/api/workspaces/${workspaceA}`));
  imageA = snapshotA.documents.find(d => d.type === "image");
  analysisA = (await json(await a.request.get(originA + `/api/images/${imageA.id}`))).analysis;
  assert.equal(analysisA.visionStatus, "ready"); assert.equal(analysisA.ocrStatus, "ready"); assert.match(analysisA.ocr.text, /0[.,]18|Slit width/i); assert.ok(analysisA.vision.summary.length > 20);
  const textRAGA = await search(a, originA, textQuery, workspaceA); const imageRAGA = await search(a, originA, imageQuery, workspaceA);
  assert.ok(textRAGA.sources.some(s => s.fileType === "txt"));
  assert.ok(imageRAGA.sources.some(s => s.fileType === "image")); assert.match(imageRAGA.answer.answer, /0[.,]18/);
  report.checks.realVisionOCR = true; report.checks.realEmbeddingRAG = true;

  console.log("Phase 7: creating and recovering identity in fresh browser contexts.");
  await page.goto(originA + "/settings"); await page.getByRole("button", { name: "Create recovery key", exact: true }).click();
  const key = await page.getByLabel("New recovery key").textContent(); assert.match(key, /^fm-recovery-v1-/);
  await database(source, async client => { const row = (await client.query("select key_digest from filemind.recovery_credentials where user_id=$1", [userA])).rows[0]; assert.equal(row.key_digest, sha(key)); assert.notEqual(row.key_digest, key); });
  await page.getByRole("button", { name: "I saved my key" }).click();
  const recovery = await browser.newContext(); const recoverPage = await recovery.newPage(); assert.equal((await recovery.cookies()).length, 0);
  await recoverPage.goto(originA + "/settings"); await recoverPage.getByLabel("Recovery Key", { exact: true }).fill(key); await recoverPage.getByRole("button", { name: "Recover identity", exact: true }).click();
  await expect(recoverPage).toHaveURL(originA + "/dashboard");
  assert.ok((await recovery.cookies()).some(c => c.name === "filemind-session" && c.httpOnly && c.sameSite === "Strict"));
  assert.equal((await json(await recovery.request.get(originA + `/api/workspaces/${workspaceA}`))).id, workspaceA);
  await recoverPage.goto(originA + "/settings"); await recoverPage.getByRole("button", { name: "Rotate Recovery Key", exact: true }).click();
  const rotated = await recoverPage.getByLabel("New recovery key").textContent(); assert.notEqual(rotated, key);
  const fresh = await browser.newContext();
  const oldKeyResponse = await fresh.request.post(originA + "/api/identity", { headers: { origin: originA }, data: { action: "recover", key } }); assert.equal(oldKeyResponse.status(), 400); assert.deepEqual(await oldKeyResponse.json(), { error: "Recovery key is invalid." });
  await json(await fresh.request.post(originA + "/api/identity", { headers: { origin: originA }, data: { action: "recover", key: rotated } })); assert.equal((await json(await fresh.request.get(originA + `/api/workspaces/${workspaceA}`))).id, workspaceA);
  report.checks.recoveryDigestOnly = true; report.checks.freshBrowserRecovery = true; report.checks.rotationOldRejectedNewAccepted = true;
  await fresh.close(); await recovery.close();

  console.log("Phase 7: exporting .filemind-backup through Settings.");
  await mkdir(qa, { recursive: true }); const download = page.waitForEvent("download", { timeout: 120000 });
  await page.getByRole("button", { name: "Export FileMind Backup", exact: true }).click();
  backupFile = join(qa, "synthetic.filemind-backup"); await (await download).saveAs(backupFile); backupBytes = await readFile(backupFile);
  await expect(page.getByText("Completed — backup downloaded.")).toBeVisible();
  const previewA = await json(await a.request.post(originA + "/api/backup/validate", { headers: { origin: originA, "content-type": "application/octet-stream" }, data: backupBytes })); assert.equal(previewA.documents, 3); assert.equal(previewA.files, 3); assert.equal(previewA.embeddingCompatible, true); assert.equal(previewA.visionCompatible, true);
  assert.ok((await json(await a.request.get(originA + "/api/identity"))).lastBackupAt);
  countsA = await counts(source, userA); assert.ok(countsA.agent_runs && countsA.agent_steps && countsA.organization_proposals && countsA.document_tags && countsA.retrieval_runs && countsA.chunk_embeddings);
  report.countsA = countsA; report.archiveBytes = backupBytes.length; report.archiveSHA256 = sha(backupBytes); report.checks.browserExport = true;
 } else {
  console.log("Phase 7: resuming environment B from the exact verified A export after infrastructure repair.");
  const previous = JSON.parse(await readFile(join(source, "docs/evaluation/backup-portable-results.json"), "utf8"));
  backupFile = join(qa, "synthetic.filemind-backup"); backupBytes = await readFile(backupFile); assert.equal(sha(backupBytes), previous.archiveSHA256);
  for (const name of ["realVisionOCR", "realEmbeddingRAG", "recoveryDigestOnly", "freshBrowserRecovery", "rotationOldRejectedNewAccepted", "browserExport"]) { assert.equal(previous.checks[name], true); report.checks[name] = true; }
  countsA = previous.countsA; Object.assign(report, { countsA, organizationPlanFallback: previous.organizationPlanFallback, archiveBytes: backupBytes.length, archiveSHA256: sha(backupBytes), sourceStageReused: true });
  const archive = unzipSync(backupBytes); const decode = path => JSON.parse(Buffer.from(archive[path]).toString());
  snapshotA = decode("data/workspaces.json")[0].snapshot; imageA = snapshotA.documents.find(d => d.type === "image"); analysisA = decode("data/multimodal.json")[0].analysis;
  inputFiles = decode("data/documents.json").map(d => ({ name: d.original_name, mimeType: d.mime_type, buffer: Buffer.from(archive[d.storage_path]) }));
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_BROWSER_EXECUTABLE || "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe", headless: true });
 }

  console.log("Phase 7: building B with new credentials and empty database/storage directories.");
  const envText = await readFile(join(source, ".env.local"), "utf8");
  const providerLines = envText.split(/\r?\n/).filter(line => /^(?:AI_ENGINE|KIMI_[A-Z_]+|EMBEDDING_[A-Z_]+|DASHSCOPE_API_KEY|OCR_ENGINE|RAG_[A-Z_]+)=/.test(line)).join("\n");
  assert.match(providerLines, /^AI_ENGINE=llm$/m);
  const dbPort = await freePort(); const webPort = await freePort(); const originB = `http://127.0.0.1:${webPort}`;
  for (const name of ["scripts", "database", ".env.example", ".next/standalone", ".filemind/runtime", ".filemind/postgresql/runtime", ".filemind/vision-verification.json"]) await cp(join(source, name), join(target, name), { recursive: true });
  // Next traces its build-time dotenv file. Replace it with no private data in B;
  // all runtime credentials below are deliberately generated for the new instance.
  const tracedEnv = join(target, ".next/standalone/.env.local"); if (await exists(tracedEnv)) await rm(tracedEnv);
  await writeFile(join(target, ".env.local"), `${providerLines}\nDATABASE_URL=postgresql://filemind_user:${randomBytes(32).toString("hex")}@127.0.0.1:${dbPort}/filemind_ai\nWORKSPACE_SESSION_SECRET=${randomBytes(32).toString("hex")}\nWORKSPACE_COOKIE_SECURE=false\n`, { mode: 0o600 });
  assert.equal(await exists(join(target, ".filemind/postgresql/data")), false); assert.equal(await exists(join(target, ".filemind/storage")), false); assert.equal(await exists(join(target, "node_modules")), false);
  launchB = launch(target, ["--port", String(webPort)]); await ready(originB, launchB);
  const b = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const pageB = await b.newPage(); pageB.on("pageerror", e => pageErrors.push(e.message));
  assert.equal((await json(await b.request.get(originB + "/api/workspaces"))).workspaces.length, 0);
  assert.equal((await database(target, client => client.query("select count(*)::int as n from filemind.documents"))).rows[0].n, 0);
  const previewB = await json(await b.request.post(originB + "/api/backup/validate", { headers: { origin: originB, "content-type": "application/octet-stream" }, data: backupBytes })); assert.equal(previewB.documents, 3);
  await pageB.goto(originB + "/settings"); await pageB.getByLabel("FileMind Backup file").setInputFiles(backupFile); await pageB.getByRole("button", { name: "Validate Backup", exact: true }).click();
  await expect(pageB.getByText("Integrity verified — ready to import")).toBeVisible({ timeout: 30000 });
  await pageB.getByRole("button", { name: "Cancel", exact: true }).click(); assert.equal((await json(await b.request.get(originB + "/api/workspaces"))).workspaces.length, 0); report.checks.cancelBeforeImport = true;
  await pageB.getByLabel("FileMind Backup file").setInputFiles(backupFile); await pageB.getByRole("button", { name: "Validate Backup", exact: true }).click(); await expect(pageB.getByText("Integrity verified — ready to import")).toBeVisible();
  await screenshot(pageB, join(qa, "settings-desktop.png"));
  await pageB.setViewportSize({ width: 390, height: 844 }); await screenshot(pageB, join(qa, "settings-mobile.png"));
  await pageB.setViewportSize({ width: 1440, height: 900 }); await pageB.getByRole("button", { name: "Import Backup", exact: true }).click();
  await expect(pageB.getByText("恢复了 3 份资料，跳过 0 份重复文件。")).toBeVisible({ timeout: 120000 });
  const workspacesB = (await json(await b.request.get(originB + "/api/workspaces"))).workspaces; assert.equal(workspacesB.length, 1); const workspaceB = workspacesB[0].id; assert.notEqual(workspaceB, workspaceA);
  const snapshotB = await json(await b.request.get(originB + `/api/workspaces/${workspaceB}`)); const userB = snapshotB.documents[0].storagePath.split("/")[0]; assert.notEqual(userB, userA);
  assert.equal((await json(await b.request.get(originB + "/api/identity"))).configured, false);
  const countsB = await counts(target, userB); assert.deepEqual(countsB, countsA); report.countsB = countsB;
  for (const d of snapshotB.documents) { const original = inputFiles.find(f => f.name === d.name); assert.ok(original); assert.notEqual(d.id, snapshotA.documents.find(aDoc => aDoc.name === d.name).id); const bytes = await readFile(join(target, ".filemind/storage", d.storagePath)); assert.equal(sha(bytes), sha(original.buffer)); const response = await b.request.get(originB + `/api/documents/${d.id}/original`); assert.ok(response.ok()); assert.equal(sha(await response.body()), sha(original.buffer)); }
  assert.equal(snapshotB.run.status, "completed"); assert.equal(snapshotB.run.engine, "llm"); assert.ok(snapshotB.proposal.documents.length === 3);
  const imageB = snapshotB.documents.find(d => d.type === "image"); const analysisB = (await json(await b.request.get(originB + `/api/images/${imageB.id}`))).analysis; assert.deepEqual({ ...analysisB, documentId: imageA.id }, analysisA);
  report.checks.emptyEnvironmentImport = true; report.checks.originalSHA256 = true; report.checks.visionOCRRestored = true; report.checks.agentProposalTagsRelationsRestored = true; report.checks.idsAndOwnershipRemapped = true;

  console.log("Phase 7: verifying restored Library, vectors, RAG and original-file citations in B.");
  await pageB.getByRole("link", { name: "Open restored Library", exact: true }).click(); await expect(pageB.getByRole("button", { name: /fencing-backup.txt/ })).toBeVisible();
  const indexB = await json(await b.request.get(originB + "/api/index")); assert.ok(indexB.documents.every(d => d.status === "ready"));
  const textRAGB = await search(b, originB, textQuery, workspaceB); const imageRAGB = await search(b, originB, imageQuery, workspaceB); assert.match(imageRAGB.answer.answer, /0[.,]18/); assert.ok(imageRAGB.sources.some(s => s.fileType === "image"));
  const historical = await database(target, client => client.query("select result from filemind.retrieval_runs where user_id=$1 order by created_at", [userB])); assert.ok(historical.rows.every(row => row.result.sources.every(s => s.userId === userB && s.workspaceId === workspaceB)));
  await pageB.goto(originB + "/search"); await pageB.getByLabel("Ask your knowledge").fill(textQuery); await pageB.getByRole("button", { name: "搜索", exact: true }).click(); await expect(pageB.getByRole("button", { name: "Citation 1", exact: true }).first()).toBeVisible({ timeout: 180000 });
  await pageB.getByRole("button", { name: "Citation 1", exact: true }).first().click(); await expect(pageB.getByRole("dialog")).toContainText("Fencing tokens");
  const originalLink = pageB.getByRole("link", { name: "Open original file", exact: false }); await expect(originalLink).toBeVisible(); const originalResponse = await b.request.get(originB + await originalLink.getAttribute("href")); assert.ok(originalResponse.ok());
  assert.ok(textRAGB.answer.citations.length && imageRAGB.answer.citations.length); report.checks.libraryRestored = true; report.checks.searchRAGRestored = true; report.checks.historicalCitationsRemapped = true; report.checks.citationOriginalOpens = true;
  const corrupted = Buffer.from(backupBytes); corrupted[Math.floor(corrupted.length / 2)] ^= 0xff;
  const corruptResponse = await b.request.post(originB + "/api/backup/import", { headers: { origin: originB, "content-type": "application/octet-stream" }, data: corrupted }); assert.equal(corruptResponse.status(), 400); assert.equal((await json(await b.request.get(originB + "/api/workspaces"))).workspaces.length, 1); report.checks.corruptImportRejected = true;
  const duplicate = await json(await b.request.post(originB + "/api/backup/import", { headers: { origin: originB, "content-type": "application/octet-stream" }, data: backupBytes })); assert.equal(duplicate.skippedDocuments, 3); assert.equal(duplicate.documents, 0); assert.equal(duplicate.workspaces, 0); report.checks.duplicatesSkipped = true;
  const crossTenant = await browser.newContext(); assert.equal((await crossTenant.request.get(originB + `/api/documents/${snapshotB.documents[0].id}/original`)).status(), 404); await crossTenant.close(); report.checks.foreignOriginalDenied = true;

  console.log("Phase 7: importing incompatible vectors, then reindexing with real 512-dimensional embeddings.");
  await b.close(); await launch(target, ["--stop"]).finished; await launchB.finished; launchB = undefined;
  const bEnv = await readFile(join(target, ".env.local"), "utf8"); await writeFile(join(target, ".env.local"), bEnv.replace(/^EMBEDDING_DIMENSIONS=.*$/m, "EMBEDDING_DIMENSIONS=512"), { mode: 0o600 });
  launchB = launch(target, ["--port", String(webPort)]); await ready(originB, launchB);
  const mismatch = await browser.newContext();
  const imported = await json(await mismatch.request.post(originB + "/api/backup/import", { headers: { origin: originB, "content-type": "application/octet-stream" }, data: backupBytes })); assert.equal(imported.embeddingCompatible, false); assert.equal(imported.reindexRequired, true);
  const stale = await json(await mismatch.request.get(originB + "/api/index")); assert.ok(stale.documents.every(d => d.status === "stale"));
  const reindex = await json(await mismatch.request.post(originB + "/api/index", { headers: { origin: originB }, data: { workspaceId: imported.workspaceIds[0] }, timeout: 180000 })); assert.ok(reindex.results.every(r => r.status === "ready"));
  const mismatchSnapshot = await json(await mismatch.request.get(originB + `/api/workspaces/${imported.workspaceIds[0]}`)); const mismatchUser = mismatchSnapshot.documents[0].storagePath.split("/")[0];
  await database(target, async client => { const rows = (await client.query("select distinct dimensions,provider from filemind.chunk_embeddings where user_id=$1", [mismatchUser])).rows; assert.deepEqual(rows, [{ dimensions: 512, provider: "dashscope" }]); });
  await search(mismatch, originB, textQuery, imported.workspaceIds[0]); report.checks.embeddingMismatchStaleAndRealReindex = true; await mismatch.close();
  assert.deepEqual(pageErrors, []); report.checks.browserNoPageErrors = true; report.passed = true;
  console.log("Phase 7 recovery + fresh-directory backup verification passed.");
} catch (error) {
  report.error = error instanceof Error ? error.message : "Backup verification failed.";
  console.error(report.error); process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (launchB) { await launch(target, ["--stop"]).finished.catch(() => {}); await launchB.finished.catch(() => {}); }
  if (userA) {
    await database(source, async client => { await client.query("delete from filemind.workspaces where user_id=$1", [userA]); await client.query("delete from filemind.retrieval_runs where user_id=$1", [userA]); await client.query("delete from filemind.profiles where id=$1", [userA]); }).catch(() => {});
    const directory = join(source, ".filemind/storage", userA); within(join(source, ".filemind/storage"), directory); await rm(directory, { recursive: true, force: true });
  }
  within(join(source, "artifacts"), target); await rm(target, { recursive: true, force: true });
  // Synthetic backup remains private and ignored, for local reproducibility only.
  await mkdir(join(source, "docs/evaluation"), { recursive: true }); await writeFile(join(source, "docs/evaluation/backup-portable-results.json"), JSON.stringify(report, null, 2) + "\n");
}
