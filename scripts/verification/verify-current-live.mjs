import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const stage = process.argv[2];
if (!["preflight", "demo"].includes(stage)) throw new Error("Use preflight or demo; real synthetic provider calls consume the fixed 60-request rehearsal budget.");
const root = resolve("artifacts/competition-release");
await mkdir(root, { recursive: true });
const stamp = new Date().toISOString().replaceAll(":", "-").replaceAll(".", "-");
const receipt = `docs/evaluation/release-${stage}-${stamp}.json`;
const env = {
  ...process.env,
  FILEMIND_LIVE_BUDGET_ROOT: join(root, "live-budget"),
  FILEMIND_LIVE_REQUEST_LIMIT: "60",
  NODE_OPTIONS: `${process.env.NODE_OPTIONS || ""} --import=${pathToFileURL(resolve("scripts/verification/live-request-budget.mjs")).href}`.trim(),
  FILEMIND_PREFLIGHT_REPORT: receipt,
  FILEMIND_DEMO_REPORT: receipt,
  FILEMIND_CAPTURE_DIR: join(root, "screenshots"),
  FILEMIND_RECORD_DIR: join(root, "recordings", stamp),
};
const command = stage === "demo" ? ["scripts/verification/verify-demo.mjs", "--live"] : ["scripts/verification/verify-demo-preflight.mjs"];
const child = spawn(process.execPath, command, { env, windowsHide: true, stdio: "inherit" });
const code = await new Promise((done, reject) => { child.once("error", reject); child.once("exit", done); });
const requests = await readFile(join(env.FILEMIND_LIVE_BUDGET_ROOT, "requests.jsonl"), "utf8").catch(error => { if (error.code === "ENOENT") return ""; throw error; });
const summary = { stage, receipt, exitCode: code, cumulativeRequests: requests.trim() ? requests.trim().split("\n").length : 0, limit: 60, syntheticOnly: true };
await writeFile(join(root, `${stage}-${stamp}.json`), JSON.stringify(summary, null, 2) + "\n", { flag: "wx" });
console.log(JSON.stringify(summary));
process.exitCode = code ?? 1;
