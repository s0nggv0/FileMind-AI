import { test } from "node:test";
import assert from "node:assert/strict";
import { uploadConfig } from "../src/config/upload";
import { registerFile, parseDocument, getDocumentContent, releaseDocument, validateFiles, parserResourceCounts } from "../src/features/workspace/services/file-parser";
import { MockAgentEngine } from "../src/features/workspace/services/mock-agent";
import { normalizedFilename } from "../src/lib/workspace/organization-rules";
import { createWorkspaceStore } from "../src/features/workspace/store/workspace-store";
import type { AgentRun, DemoFault } from "../src/types/workspace";

const file = (name = "Transformer notes.txt") => new File(["Transformer attention lecture notes."], name, { type: "text/plain" });
test("validation accepts supported files and bounds size, MIME and count", () => {
  assert.equal(validateFiles([file()], 0).accepted.length, 1);
  assert.match(validateFiles([file("script.exe")], 0).errors[0], /不支持/);
  assert.match(validateFiles([new File(["x"], "photo.png", { type: "text/html" })], 0).errors[0], /不支持/);
  const oversized = { name: "big.txt", type: "text/plain", size: uploadConfig.maxFileBytes + 1 } as File;
  assert.match(validateFiles([oversized], 0).errors[0], /超过/);
  assert.equal(validateFiles(Array.from({ length: 31 }, () => file()), 0).accepted.length, 30);
  assert.equal(validateFiles([file()], 30).accepted.length, 0);
});
test("real plain-text extraction uses references and releases resources", async () => {
  const before = parserResourceCounts(); const document = registerFile(file());
  const parsed = await parseDocument(document, new AbortController().signal);
  assert.equal(parsed.metadata.characters, 36); assert.match(getDocumentContent(parsed), /Transformer/);
  assert.equal("file" in parsed, false); releaseDocument(document.id); assert.deepEqual(parserResourceCounts(), before);
});
test("filename normalization identifies versions without content claims", () => {
  assert.equal(normalizedFilename("report-final-2.docx"), normalizedFilename("report.docx"));
  assert.equal(normalizedFilename("report (1).docx"), "report");
  assert.notEqual(normalizedFilename("unrelated.docx"), "report");
});
async function runWithFault(fault: DemoFault) {
  const engine = new MockAgentEngine(1);
  const documents = [registerFile(file()), registerFile(file("report-final.txt"))];
  const initial = engine.createRun(documents, fault); let latest = initial;
  const update = (run: AgentRun) => { latest = run; };
  await engine.executeRun(initial.id, update);
  return { engine, initial, documents, update, latest: () => latest, cleanup: () => { engine.disposeRun(initial.id); documents.forEach((document) => releaseDocument(document.id)); } };
}
test("run emits planning, live tools and review then applies only on request", async () => {
  const context = await runWithFault("none");
  try {
    const run = context.latest(); assert.equal(run.status, "waiting_for_review"); assert.equal(run.progress, 100);
    assert.equal(new Set(run.steps.map((step) => step.tool)).size, 7); assert.equal(run.result?.documents.length, 2);
    assert.equal(run.result?.documents[0].category, "Artificial Intelligence");
    await context.engine.applyPlan(run.id, run.result!, context.update);
    assert.equal(context.latest().status, "completed");
  } finally { context.cleanup(); }
});
test("parse failure can retry, and a second failure can be skipped without losing other documents", async () => {
  const context = await runWithFault("parse");
  try {
    const failed = context.latest().steps.find((step) => step.status === "failed")!;
    assert.equal(context.latest().status, "running");
    await context.engine.retryStep(context.initial.id, failed.id, context.update);
    assert.equal(context.latest().status, "waiting_for_review");
  } finally { context.cleanup(); }
  const skipped = await runWithFault("parse");
  try {
    await skipped.engine.skipStep(skipped.initial.id, skipped.latest().steps.find((step) => step.status === "failed")!.id, skipped.update);
    assert.equal(skipped.latest().result?.documents.length, 1);
    assert.equal(skipped.latest().documents[0].parseStatus, "skipped");
  } finally { skipped.cleanup(); }
});
test("tool failure transitions through retry to review; agent failure is explicit", async () => {
  const context = await runWithFault("tool");
  try {
    const failed = context.latest().steps.find((step) => step.status === "failed")!;
    assert.equal(failed.tool, "generate_tags");
    await context.engine.retryStep(context.initial.id, failed.id, context.update);
    assert.equal(context.latest().status, "waiting_for_review");
  } finally { context.cleanup(); }
  const agent = await runWithFault("agent");
  try { assert.equal(agent.latest().status, "failed"); assert.match(agent.latest().error!, /助手故障/); } finally { agent.cleanup(); }
});
test("cancel prevents late events and is terminal", async () => {
  const engine = new MockAgentEngine(10); const document = registerFile(file());
  const run = engine.createRun([document]); let latest = run;
  const execution = engine.executeRun(run.id, (value) => { latest = value; });
  engine.cancelRun(run.id); await execution;
  assert.equal(latest.status, "cancelled"); assert.equal(latest.result, undefined);
  engine.disposeRun(run.id); releaseDocument(document.id);
});
test("store locks mutations, edits proposal, applies once, retains Library snapshot on reset", async () => {
  const store = createWorkspaceStore(new MockAgentEngine(1));
  await store.getState().start(); assert.equal(store.getState().run, null);
  store.getState().addFiles([file("final2.txt"), file("final2.txt")]);
  assert.equal(store.getState().documents.length, 2);
  const start = store.getState().start(); store.getState().clearFiles(); store.getState().addFiles([file()]);
  assert.equal(store.getState().documents.length, 2); await start;
  const id = store.getState().proposal!.documents[0].id;
  store.getState().editDocument(id, { category: "Study", tags: ["Custom"], renameDecision: "ignored" });
  store.getState().decide("duplicates", store.getState().proposal!.duplicates[0].id, "accepted");
  await Promise.all([store.getState().apply(), store.getState().apply()]);
  assert.equal(store.getState().applied.length, 1); assert.equal(store.getState().applied[0].documents[0].category, "Study");
  assert.equal(store.getState().applied[0].duplicates[0].decision, "accepted");
  store.getState().reset(); assert.equal(store.getState().documents.length, 0); assert.equal(store.getState().applied[0].documents.length, 2);
});
for (const action of ["retry", "skip"] as const) test(`${action} transport failure leaves the run recoverable and preserves files`, async () => {
  const engine = new MockAgentEngine(1); const store = createWorkspaceStore(engine);
  store.getState().addFiles([file()]); store.getState().setFault("parse"); await store.getState().start();
  const failed = store.getState().run!.steps.find(step => step.status === "failed")!;
  engine[action === "retry" ? "retryStep" : "skipStep"] = async () => { throw new Error("Workspace storage is temporarily unavailable."); };
  await store.getState()[action](failed.id);
  assert.equal(store.getState().run?.status, "failed"); assert.equal(store.getState().saveStatus, "error"); assert.match(store.getState().errors[0], /storage/);
  assert.equal(store.getState().documents.length, 1);
  assert.equal(store.getState().documents[0].id, failed.input.documentId);
  store.getState().reset();
});
