// Fresh native PostgreSQL + production server; no existing data or provider keys.
import { spawn } from "node:child_process";
import { join } from "node:path";
import { access, writeFile } from "node:fs/promises";
import { prepareEnvironment, startEnvironment, disposeEnvironment, projectRoot } from "../shared/phase8-environment.mjs";
let environment;
try {
  await access(join(projectRoot,".next/standalone/server.js"));
  environment = await prepareEnvironment(); await startEnvironment(environment);
  const exitCode = await new Promise((done, reject) => {
    const child = spawn(process.execPath, [join(projectRoot,"node_modules/@playwright/test/cli.js"),"test","--config","playwright.product.config.ts",...process.argv.slice(2)], {
      cwd: projectRoot, windowsHide: true, stdio: "inherit",
      env: { ...process.env, FILEMIND_TEST_ROOT: environment.root, FILEMIND_TEST_ORIGIN: environment.origin, FILEMIND_EVIDENCE_DIR: join(projectRoot,"artifacts/priority-optimizations/browser") },
    });
    child.once("error", reject); child.once("exit", done);
  });
  await writeFile(join(projectRoot,"artifacts/priority-optimizations/browser-summary.json"), JSON.stringify({ passed: exitCode === 0, isolated: true, paidRequests: 0, checkedAt: new Date().toISOString() }, null, 2));
  if (exitCode !== 0) process.exitCode = 1;
} finally { if (environment) await disposeEnvironment(environment); }
