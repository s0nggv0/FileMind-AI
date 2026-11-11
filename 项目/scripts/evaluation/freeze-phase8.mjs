import { readFile,readdir,writeFile,access } from "node:fs/promises";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const sha=bytes=>createHash("sha256").update(bytes).digest("hex");
async function walk(directory){const paths=[];for(const entry of await readdir(directory,{withFileTypes:true})){const path=`${directory}/${entry.name}`;if(entry.isDirectory())paths.push(...await walk(path));else if(/\.(ts|tsx|sql)$/.test(path))paths.push(path);}return paths;}
assert.equal(await access("tests/fixtures/rag-blind").then(()=>true,()=>false),false,"Blind corpus must not exist before algorithm freeze");
const paths=[...await walk("src"),...await walk("database/migrations"),"next.config.ts","package.json","package-lock.json",".gitattributes","scripts/evaluation/freeze-phase8.mjs","scripts/shared/phase8-environment.mjs","scripts/evaluation/evaluate-rag-blind.ts","scripts/evaluation/blind-protocol.ts","scripts/evaluation/run-rag-blind.mjs","scripts/shared/tenant-pool.ts","scripts/runtime/operation-lease.mjs","scripts/runtime/storage-recovery.mjs","scripts/portable-start.mjs","scripts/runtime/portable-start.mjs","scripts/runtime/portable-paths.mjs","scripts/runtime/startup-recovery.mjs","scripts/build/prepare-portable.mjs","scripts/fixtures/synthetic-formats.ts","docs/evaluation/blind-protocol.md"];
const files=Object.fromEntries(await Promise.all(paths.sort().map(async path=>[path,sha((await readFile(path,"utf8")).replaceAll("\r\n","\n"))])));
const {stdout}=await promisify(execFile)("git",["rev-parse","HEAD"]);
await promisify(execFile)("git",["diff","--exit-code","HEAD","--",...paths]);
await writeFile("docs/evaluation/phase8-algorithm-freeze.json",JSON.stringify({version:"phase8-algorithm-freeze-v1",frozenAt:new Date().toISOString(),commit:stdout.trim(),policy:"Production and harness frozen before rag-blind corpus creation; do not tune using Run #1.",models:{answer:"kimi-k2.6",judge:"kimi-k2.6",embedding:"qwen3.7-text-embedding-flash",dimensions:1024},files},null,2)+"\n",{flag:"wx"});
console.log(`Frozen ${paths.length} source/protocol files. Corpus has not yet been created.`);
