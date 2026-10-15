import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const git=(...args)=>execFileSync("git",args,{windowsHide:true,maxBuffer:100*1024*1024});
const dotenv=await readFile(".env.local","utf8").catch(()=>"");
const values=Object.fromEntries(dotenv.split(/\r?\n/).filter(s=>s.includes("=")&&!s.startsWith("#")).map(s=>[s.slice(0,s.indexOf("=")),s.slice(s.indexOf("=")+1).replace(/^['"]|['"]$/g,"")]));
const configured=Object.entries(values).filter(([key,value])=>/KEY|SECRET|PASSWORD/.test(key)&&value.length>=16).map(([,v])=>v);
try{const password=decodeURIComponent(new URL(values.DATABASE_URL).password);if(password.length>=16)configured.push(password);}catch{}
const objects=git("rev-list","--objects","--all").toString().trim().split("\n").map(line=>{const i=line.indexOf(" ");return {oid:i<0?line:line.slice(0,i),path:i<0?"":line.slice(i+1)};});
const hits=[],envPaths=new Set();let blobs=0;
function inspect(bytes,location){
 const body=bytes.toString("utf8");
 for(const secret of configured)if(bytes.includes(Buffer.from(secret)))hits.push({...location,kind:"configured-secret"});
 for(const match of body.matchAll(/\b(?:sk-[a-zA-Z0-9_-]{32,}|fm-recovery-v1-[a-zA-Z0-9_-]{35,})\b/g))if(!/synthetic|fixture|example|dummy|test/i.test(match[0]))hits.push({...location,kind:"credential-pattern",fingerprint:createHash("sha256").update(match[0]).digest("hex").slice(0,12)});
}
for(const object of objects){if(git("cat-file","-t",object.oid).toString().trim()!=="blob")continue;blobs++;const bytes=git("cat-file","blob",object.oid);
 if(/(^|\/)\.env(?:\.|$)/.test(object.path)&&!object.path.endsWith(".env.example"))envPaths.add(object.path);
 inspect(bytes,{oid:object.oid,path:object.path,scope:"history"});
}
const worktree=git("ls-files","--cached","--others","--exclude-standard","-z").toString().split("\0").filter(Boolean);
for(const path of worktree){const bytes=await readFile(path).catch(error=>{if(error.code==="ENOENT")return null;throw error;});if(bytes)inspect(bytes,{path,scope:"worktree"});}
const lock=JSON.parse(await readFile("package-lock.json","utf8"));
const licenses=Object.entries(lock.packages).filter(([path])=>path).map(([path,pkg])=>({package:path.replace(/^.*node_modules\//,""),version:pkg.version,license:pkg.license??"UNRECORDED",development:!!pkg.dev}));
await writeFile(process.env.FILEMIND_LICENSE_REPORT||"docs/evaluation/phase9-dependency-licenses.json",JSON.stringify({checkedAt:new Date().toISOString(),packages:licenses.length,unrecorded:licenses.filter(x=>x.license==="UNRECORDED").length,licenses},null,2)+"\n");
const report={checkedAt:new Date().toISOString(),refs:"--all",objects:objects.length,blobs,worktreeFiles:worktree.length,configuredSecretValuesChecked:configured.length,hits,trackedEnvironmentPaths:[...envPaths],passed:!hits.length&&!envPaths.size,privateDocuments:"Tracked fixture directories contain original synthetic data; this scan cannot identify all private content semantically.",historyRewritten:false};
await writeFile(process.env.FILEMIND_SECURITY_REPORT||"docs/evaluation/phase9-secret-scan.json",JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify({...report,hits:hits.map(x=>({path:x.path,oid:x.oid,kind:x.kind}))}));if(!report.passed)process.exitCode=1;
