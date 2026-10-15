import "./prepare-pdf-worker.mjs";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
const pkg = JSON.parse(await readFile(new URL("../../package.json", import.meta.url), "utf8"));
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim();
if (!/^[a-f0-9]{40}$/.test(commit)) throw new Error("Build commit is invalid.");
await mkdir(new URL("../../.filemind/", import.meta.url), { recursive: true });
await writeFile(new URL("../../.filemind/build-info.json", import.meta.url), JSON.stringify({ BUILD_VERSION: pkg.version, BUILD_COMMIT: commit, BUILD_DATE: new Date().toISOString() }, null, 2) + "\n");
console.log(`Build metadata prepared for ${pkg.version} (${commit.slice(0, 12)}).`);
