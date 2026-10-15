import assert from "node:assert/strict";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { prepareEnvironment, startEnvironment, stopEnvironment, disposeEnvironment } from "../shared/phase8-environment.mjs";

for (const key of Object.keys(process.env)) if (/^(?:KIMI_|EMBEDDING_|DASHSCOPE_)/.test(key) || ["AI_ENGINE", "COMPETITION_MODE", "DATABASE_URL", "WORKSPACE_SESSION_SECRET", "FILE_STORAGE_ROOT", "WORKSPACE_ORIGIN"].includes(key)) delete process.env[key];
let environment;
const report = { checkedAt: new Date().toISOString(), passed: false, freshDatabase: true, copiedUserData: false, cloudCalls: 0, checks: {} };
try {
  environment = await prepareEnvironment({ live: false });
  await appendFile(join(environment.root, ".env.local"), "COMPETITION_MODE=true\nDEMO_MODE=true\n");
  await startEnvironment(environment);
  const config = await (await fetch(environment.origin + "/api/workspace-config")).json();
  assert.equal(config.persistent, true); assert.equal(config.competition, true); assert.equal(config.intelligence, true);
  report.checks.freshPersistentCompetitionStartup = true;
  report.build = JSON.parse(await readFile(join(environment.root, ".next/standalone/build-info.json"), "utf8"));
  const settings = await (await fetch(environment.origin + "/settings")).text();
  assert.ok(settings.includes(report.build.BUILD_VERSION)); assert.ok(settings.includes(report.build.BUILD_COMMIT.slice(0, 7)));
  report.checks.aboutBuildMatches = true;
  const cleanup = await (await fetch(environment.origin + "/cleanup")).text();
  assert.ok(cleanup.includes("暂时没有整理建议")); assert.ok(!cleanup.includes("待审阅的示例建议"));
  report.checks.realEmptyCleanup = true;
  const created = await fetch(environment.origin + "/api/workspaces", { method: "POST", headers: { origin: environment.origin, "content-type": "application/json" }, body: JSON.stringify({ name: "Fresh release startup verification" }) });
  assert.equal(created.status, 201);
  const cookie = created.headers.get("set-cookie").split(";")[0], workspace = await created.json();
  assert.equal(workspace.documents.length, 0);
  report.checks.freshWorkspaceCreation = true;
  await stopEnvironment(environment); await startEnvironment(environment);
  const restored = await fetch(`${environment.origin}/api/workspaces/${workspace.id}`, { headers: { cookie } });
  assert.ok(restored.ok); assert.equal((await restored.json()).name, workspace.name);
  report.checks.restartPreservesFreshWorkspace = true;
  report.passed = true;
} catch {
  report.errorCode = "RELEASE_CLEAN_STARTUP_FAILED"; process.exitCode = 1;
} finally {
  if (environment) await disposeEnvironment(environment);
  await writeFile("docs/evaluation/release-clean-environment.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report));
}
