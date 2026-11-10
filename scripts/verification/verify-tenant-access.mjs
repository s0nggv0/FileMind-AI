// In-memory databases, synthetic originals and logs, with an isolated working
// directory. Never load the application's env files or private runtime assets.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, relative, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../../", import.meta.url));
const root = await mkdtemp(join(tmpdir(), "filemind-tenant-validation-"));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|systemroot|windir|temp|tmp|userprofile|appdata|localappdata)$/i.test(key)));
Object.assign(env, { AI_ENGINE: "mock", DATABASE_URL: "", COMPETITION_MODE: "false", DEMO_MODE: "false", WORKSPACE_SESSION_SECRET: "synthetic-tenant-validation-signing-secret-only" });
try {
  await cp(join(project, "database/migrations"), join(root, "database/migrations"), { recursive: true });
  const image = "tests/fixtures/rag-holdout/files/spectrometer-path.png";
  await mkdir(join(root, "tests/fixtures/rag-holdout/files"), { recursive: true });
  await cp(join(project, image), join(root, image));
  const tests = ["tenant-access", "identity-recovery", "reliability", "storage-recovery", "index-preparation-queue", "demo-workspace", "backup"].map(name => join(project, `tests/${name}.test.ts`));
  process.exitCode = await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [join(project, "node_modules/tsx/dist/cli.mjs"), "--tsconfig", join(project, "tsconfig.json"), "--test", "--test-concurrency=1", ...tests], { cwd: root, env, windowsHide: true, stdio: "inherit" });
    child.once("error", reject); child.once("exit", code => resolve(code ?? 1));
  });
} finally {
  const inside = relative(resolve(tmpdir()), resolve(root));
  assert(!isAbsolute(inside) && /^filemind-tenant-validation-[\w-]+$/.test(inside), "Only the generated synthetic test directory may be removed");
  await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
}
