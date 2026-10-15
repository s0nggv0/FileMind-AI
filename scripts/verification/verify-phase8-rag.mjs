import { spawn } from "node:child_process";
import { join } from "node:path";
import { prepareEnvironment, startEnvironment, disposeEnvironment, projectRoot } from "../shared/phase8-environment.mjs";

if (!process.argv.includes("--live")) throw new Error("Real synthetic-provider acceptance requires --live");
let environment;
try {
  environment = await prepareEnvironment({ live: true });
  console.log("Starting fresh isolated database: zero copied originals or user data.");
  await startEnvironment(environment);
  console.log("Empty database confirmed. Only the synthetic QKV fixture will be sent to Kimi and DashScope.");
  const child = spawn(process.execPath, [join(projectRoot, "node_modules/@playwright/test/cli.js"), "test", "--config", "playwright.rag-live.config.ts"], { cwd: projectRoot, windowsHide: true, stdio: "inherit", env: { ...process.env, FILEMIND_TEST_ROOT: environment.root, FILEMIND_TEST_ORIGIN: environment.origin } });
  const code = await new Promise((done, reject) => { child.once("error", reject); child.once("exit", done); });
  if (code !== 0) process.exitCode = 1;
} finally { if (environment) await disposeEnvironment(environment); }
