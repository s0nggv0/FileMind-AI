// Disposable acceptance environment. Copies executable/runtime assets only.
// Existing databases, originals, cookies, recovery keys and logs are never copied.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomBytes, randomUUID } from "node:crypto";
import { access, cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const { Client } = createRequire(join(projectRoot, "package.json"))("pg");
const exists = path => access(path).then(() => true, () => false);
export function assertTestRoot(path) {
  const root = resolve(path), rel = relative(join(projectRoot, "artifacts"), root);
  assert.ok(rel && !rel.startsWith("..") && !isAbsolute(rel) && /^phase8-fresh-[\w-]+$/.test(rel), "Disposable root must be an exact Phase 8 artifacts child");
  return root;
}
export async function freePort() {
  const socket = createServer();
  await new Promise((ready, reject) => { socket.once("error", reject); socket.listen(0, "127.0.0.1", ready); });
  const port = socket.address().port;
  await new Promise(done => socket.close(done));
  return port;
}
export async function prepareEnvironment({ live = false } = {}) {
  const root = assertTestRoot(join(projectRoot, "artifacts", `phase8-fresh-${randomUUID()}`));
  await mkdir(root, { recursive: true });
  const assets = ["scripts", "database", ".env.example", ".next/standalone", ".filemind/runtime", ".filemind/postgresql/runtime", "tests/fixtures/demo"];
  for (const name of assets) await cp(join(projectRoot, name), join(root, name), { recursive: true });
  // Defensive removal for older traced builds. Never copy the source dotenv.
  const traced = join(root, ".next/standalone/.env.local");
  if (await exists(traced)) await rm(traced);
  let providerLines = "AI_ENGINE=mock\n";
  if (live) {
    const env = await readFile(join(projectRoot, ".env.local"), "utf8");
    providerLines = env.split(/\r?\n/).filter(line => /^(?:AI_ENGINE|KIMI_[A-Z_]+|EMBEDDING_[A-Z_]+|DASHSCOPE_API_KEY|OCR_ENGINE|RAG_[A-Z_]+)=/.test(line)).join("\n") + "\n";
    assert.match(providerLines, /^AI_ENGINE=llm$/m);
    // Read status, never print credentials or complete configuration.
    const values = Object.fromEntries(providerLines.trim().split("\n").map(line => [line.slice(0, line.indexOf("=")), line.slice(line.indexOf("=") + 1).replace(/^['"]|['"]$/g, "")]));
    for (const key of ["KIMI_BASE_URL", "EMBEDDING_BASE_URL"]) if (values[key]) {
      const endpoint = new URL(values[key]);
      assert.equal(endpoint.protocol, "https:"); assert.equal(endpoint.username, ""); assert.equal(endpoint.password, "");
      assert.ok(["api.moonshot.cn", "api.moonshot.ai", "dashscope.aliyuncs.com", "dashscope-intl.aliyuncs.com"].includes(endpoint.hostname), "Synthetic live acceptance uses only configured Kimi and DashScope destinations");
    }
    const visionReceipt = join(projectRoot, ".filemind/vision-verification.json");
    if (await exists(visionReceipt)) await cp(visionReceipt, join(root, ".filemind/vision-verification.json"));
  }
  const dbPort = await freePort(), port = await freePort();
  await writeFile(join(root, ".env.local"), `${providerLines}DATABASE_URL=postgresql://filemind_user:${randomBytes(32).toString("hex")}@127.0.0.1:${dbPort}/filemind_ai\nWORKSPACE_SESSION_SECRET=${randomBytes(32).toString("hex")}\nWORKSPACE_COOKIE_SECURE=false\n`, { mode: 0o600, flag: "wx" });
  for (const name of [".filemind/postgresql/data", ".filemind/storage", ".filemind/postgresql/instance.json", ".filemind/postgresql/admin.password"]) assert.equal(await exists(join(root, name)), false);
  return { root, port, origin: `http://127.0.0.1:${port}`, live };
}
function launch(root, args) {
  assertTestRoot(root);
  const child = spawn(join(root, ".filemind/runtime/node.exe"), [join(root, "scripts/portable-start.mjs"), ...args], { cwd: root, windowsHide: true, stdio: ["ignore", "ignore", "ignore"] });
  const finished = new Promise((done, reject) => { child.once("error", () => reject(new Error("Disposable launcher failed to spawn"))); child.once("exit", code => code === 0 ? done() : reject(new Error("Disposable launcher exited unsuccessfully"))); });
  finished.catch(() => {});
  return { child, finished };
}
export async function database(root, work) {
  assertTestRoot(root);
  const instance = JSON.parse(await readFile(join(root, ".filemind/postgresql/instance.json"), "utf8"));
  const password = (await readFile(join(root, ".filemind/postgresql/admin.password"), "utf8")).trim();
  const client = new Client({ host: "127.0.0.1", port: instance.port, database: "filemind_ai", user: "filemind_admin", password, connectionTimeoutMillis: 5000 });
  try { await client.connect(); return await work(client); } finally { await client.end(); }
}
export async function startEnvironment(environment) {
  const launched = launch(environment.root, ["--port", String(environment.port)]);
  environment.launched = launched;
  for (let n = 0; n < 240; n++) {
    if (launched.child.exitCode !== null) throw new Error("Disposable server exited before readiness");
    try {
      const response = await fetch(environment.origin + "/api/workspace-config");
      if (response.ok && (await response.json()).persistent) {
        const rows = await database(environment.root, client => client.query("select count(*)::int as n from filemind.documents"));
        assert.equal(rows.rows[0].n, 0, "Acceptance database must be empty before any provider call");
        return environment;
      }
    } catch (error) { if (error instanceof assert.AssertionError) throw error; }
    await new Promise(done => setTimeout(done, 500));
  }
  throw new Error("Disposable environment did not become ready");
}
export async function stopEnvironment(environment) {
  if (environment.launched) {
    await launch(environment.root, ["--stop"]).finished;
    await environment.launched.finished;
    environment.launched = undefined;
  }
}
export async function disposeEnvironment(environment) {
  await stopEnvironment(environment);
  // Stop must complete before deleting the verified disposable directory.
  await rm(assertTestRoot(environment.root), { recursive: true, force: true });
}
