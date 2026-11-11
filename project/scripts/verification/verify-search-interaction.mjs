// Client-only acceptance shell: no environment files, API routes, database or models.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { cp, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { join, resolve, relative, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";

const project = fileURLToPath(new URL("../../", import.meta.url));
const scratch = join(project, "artifacts");
await mkdir(scratch, { recursive: true });
const root = await mkdtemp(join(scratch, "filemind-search-ui-"));
const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => /^(path|systemroot|windir|temp|tmp|userprofile|appdata|localappdata|programfiles(?:\(x86\))?)$/i.test(key)));
Object.assign(env, { NEXT_TELEMETRY_DISABLED: "1", AI_ENGINE: "mock", DATABASE_URL: "", COMPETITION_MODE: "false" });
let server;
let serverDone;
const run = (args, options = {}) => {
  const child = spawn(process.execPath, args, { cwd: root, env, windowsHide: true, stdio: "inherit", ...options });
  const done = new Promise((resolve, reject) => { child.once("error", reject); child.once("exit", code => resolve(code)); });
  return { child, done };
};
try {
  // Copy source directories explicitly; never traverse the project root.
  for (const name of ["components", "config", "features", "hooks", "lib", "mocks", "store", "types"]) {
    await cp(join(project, "src", name), join(root, "src", name), { recursive: true });
  }
  for (const name of ["package.json", "tsconfig.json", "postcss.config.mjs"]) await cp(join(project, name), join(root, name));
  await mkdir(join(root, "src/app/search"), { recursive: true });
  await mkdir(join(root, "src/app/library"), { recursive: true });
  await cp(join(project, "src/app/globals.css"), join(root, "src/app/globals.css"));
  await writeFile(join(root, "next.config.mjs"), "export default { reactStrictMode: true, devIndicators: false };\n");
  await writeFile(join(root, "src/app/layout.tsx"), `import "./globals.css";
export default function Layout({children}: {children: React.ReactNode}) {
  return <html lang="zh-CN"><body><main className="p-5">{children}</main></body></html>;
}`);
  await writeFile(join(root, "src/app/search/page.tsx"), `import { KnowledgeSearch } from "@/features/search/knowledge-search";
export default async function Page({searchParams}: {searchParams: Promise<Record<string,string|undefined>>}) {
  const p = await searchParams;
  return <KnowledgeSearch key={[p.workspace,p.document,p.documents,p.run,p.q].join(":")} persistent mock initialWorkspace={p.workspace} initialDocument={p.document} initialDocuments={p.documents?.split(",")} initialQuery={p.q} initialMode={p.mode === "find" ? "find" : "ask"} />;
}`);
  await writeFile(join(root, "src/app/library/page.tsx"), `import { LibraryBrowser } from "@/features/library/library-browser";
import { parseCitationAnchor } from "@/lib/retrieval/citation-contract";
export default async function Page({searchParams}: {searchParams: Promise<Record<string,string>>}) {
  const p = await searchParams;
  return <LibraryBrowser documents={[]} categories={[]} dataset="workspace" persistent initialSelectedId={p.document} citation={p.chunkId ? parseCitationAnchor(new URLSearchParams(p)) : undefined} runId={p.run} />;
}`);
  const port = await new Promise((resolve, reject) => {
    const socket = createServer(); socket.once("error", reject);
    socket.listen(0, "127.0.0.1", () => { const port = socket.address().port; socket.close(() => resolve(port)); });
  });
  const origin = `http://127.0.0.1:${port}`;
  const edge = "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe";
  await writeFile(join(root, "playwright.config.cjs"), `const {defineConfig} = require(${JSON.stringify(join(project,"node_modules/@playwright/test"))});
module.exports = defineConfig(${JSON.stringify({ testDir: join(project,"tests/product"), outputDir: join(root,"test-results"), timeout: 120000, expect: { timeout: 15000 }, workers: 1, reporter: "list", use: { baseURL: origin, browserName: "chromium", headless: true, launchOptions: { ...(existsSync(edge) ? { executablePath: edge } : {}) } } })});`);
  const started = run([join(project,"node_modules/next/dist/bin/next"), "dev", "--webpack", "--hostname", "127.0.0.1", "--port", String(port)]);
  server = started.child;
  serverDone = started.done;
  let exited = false;
  void started.done.then(() => { exited = true; });
  const deadline = Date.now() + 120000;
  while (true) {
    assert(!exited, "Isolated Next server exited before readiness");
    try { if ((await fetch(`${origin}/search`, { signal: AbortSignal.timeout(1000) })).ok) break; }
    catch (error) { if (error.cause?.code === "EACCES") throw new Error("The isolated browser runner requires local HTTP access", { cause: error }); }
    assert(Date.now() < deadline, "Isolated Next server readiness timed out");
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const defaults = ["search-interaction.spec.ts", "search-recovery.spec.ts", "search-boundaries.spec.ts", "comparison-coverage.spec.ts", "citation-reading.spec.ts", "--grep-invert", "native"];
  const tests = run([join(project,"node_modules/@playwright/test/cli.js"), "test", "--config", join(root,"playwright.config.cjs"), ...(process.argv.length > 2 ? process.argv.slice(2) : defaults)], { cwd: project });
  process.exitCode = await tests.done;
} finally {
  if (server && server.exitCode === null) {
    if (process.platform === "win32") {
      await new Promise(resolve => { const stop = spawn("taskkill", ["/pid", String(server.pid), "/t", "/f"], { windowsHide: true, stdio: "ignore" }); stop.once("exit", resolve); stop.once("error", resolve); });
    } else server.kill("SIGTERM");
    await serverDone;
  }
  const inside = relative(resolve(scratch), resolve(root));
  assert(!isAbsolute(inside) && /^filemind-search-ui-[\w-]+$/.test(inside), "Only the generated temporary shell may be removed");
  await rm(root, { recursive: true, force: true, maxRetries: 3, retryDelay: 500 });
}
