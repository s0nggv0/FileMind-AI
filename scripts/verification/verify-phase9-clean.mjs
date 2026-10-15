import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { appendFile, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { unzipSync } from "fflate";
import { prepareEnvironment, startEnvironment, disposeEnvironment, projectRoot, freePort, database } from "../shared/phase8-environment.mjs";
let environment, cookie="";
const report={passed:false,checkedAt:new Date().toISOString(),freshDatabase:true,copiedUserData:false,competitionMode:true,kimiCalls:0,checks:{},resets:[]};
async function api(path,method="GET",data,identity=cookie){const r=await fetch(environment.origin+path,{method,headers:{origin:environment.origin,...identity?{cookie:identity}:{},...data?{"content-type":"application/json"}:{}},...data?{body:JSON.stringify(data)}:{}});if(r.headers.get("set-cookie"))cookie=r.headers.get("set-cookie").split(";")[0];return r;}
try {
 environment=await prepareEnvironment({live:false});await appendFile(join(environment.root,".env.local"),"COMPETITION_MODE=true\nDEMO_MODE=true\n");await startEnvironment(environment);
 const cfg=await (await api("/api/workspace-config")).json();assert.equal(cfg.persistent,true);assert.equal(cfg.intelligence,true);assert.equal(cfg.competition,true);report.checks.noMockSubstitution=true;
 const normal=await (await api("/api/workspaces","POST",{name:"Preserve ordinary owner"})).json(),normalCookie=cookie;
 const recovery=await (await api("/api/identity","POST",{action:"create"})).json();const key=recovery.key;assert.ok(typeof key==="string");report.checks.recoveryKeyGenerated=true;
 const demo=await (await api("/api/demo","POST",{action:"open"})).json();const demoCookie=cookie;
 assert.equal((await api("/api/demo","POST",{action:"reset",workspaceId:normal.id,confirm:"RESET_DEMO_WORKSPACE"})).status,404);
 const sibling=await (await api("/api/workspaces","POST",{name:"Preserve demo sibling"})).json();
 assert.equal((await api("/api/demo","POST",{action:"reset",workspaceId:sibling.id,confirm:"RESET_DEMO_WORKSPACE"})).status,404);
 assert.equal((await api("/api/demo","POST",{action:"reset",workspaceId:demo.workspaceId,confirm:"wrong"})).status,400);
 const files=unzipSync(Buffer.from(await (await api("/api/demo?download=fixtures")).arrayBuffer()));assert.equal(Object.keys(files).length,8);report.checks.eightMixedFixtures=true;
 for(let i=1;i<=5;i++){
  const previous=await (await api(`/api/workspaces/${demo.workspaceId}`)).json(),doc=randomUUID(),text=`Synthetic reset cycle ${i}.`;
  const saved=await api(`/api/workspaces/${demo.workspaceId}`,"PUT",{...previous,documents:[{id:doc,name:`reset-${i}.txt`,type:"txt",mimeType:"text/plain",size:Buffer.byteLength(text),parseStatus:"completed",metadata:{addedAt:new Date().toISOString()}}],texts:{[doc]:text}});assert.ok(saved.ok);
  const form=new FormData();form.set("documentId",doc);form.set("file",new Blob([text],{type:"text/plain"}),`reset-${i}.txt`);assert.ok((await fetch(`${environment.origin}/api/workspaces/${demo.workspaceId}/files`,{method:"POST",headers:{origin:environment.origin,cookie:demoCookie},body:form})).ok);
  assert.ok((await api("/api/demo","POST",{action:"reset",workspaceId:demo.workspaceId,confirm:"RESET_DEMO_WORKSPACE"})).ok);
  const after=await (await api(`/api/workspaces/${demo.workspaceId}`)).json();assert.equal(after.documents.length,0);assert.equal(after.run,null);assert.equal(Object.keys(after.texts).length,0);assert.ok(after.revision>previous.revision);
  assert.equal((await (await api(`/api/workspaces/${sibling.id}`)).json()).name,sibling.name);assert.equal((await (await api(`/api/workspaces/${normal.id}`,"GET",undefined,normalCookie)).json()).name,normal.name);
  report.resets.push({cycle:i,passed:true,ordinaryOwnerPreserved:true,siblingPreserved:true});
 }
 report.checks.fiveScopedResets=true;
 // Verified backup round trip of synthetic metadata, in the new database.
 const exported=await (await api("/api/backup/export","POST")).text();const archive=exported.trim().split("\n").map(JSON.parse).find(x=>x.type==="result");assert.ok(archive?.base64);const bytes=Buffer.from(archive.base64,"base64");assert.ok(Object.keys(unzipSync(bytes)).length>0);report.checks.backupExport=true;
 const validated=await fetch(environment.origin+"/api/backup/validate",{method:"POST",headers:{origin:environment.origin,cookie:demoCookie,"content-type":"application/zip"},body:bytes});assert.ok(validated.ok);report.checks.backupIntegrityValidation=true;const recovered=await api("/api/identity","POST",{action:"recover",key},"");assert.ok(recovered.ok);assert.equal((await (await api(`/api/workspaces/${normal.id}`)).json()).name,normal.name);cookie=demoCookie;report.checks.recoveryKeyRestoredOwner=true;
 const rows=await database(environment.root,c=>c.query("select count(*)::int as n from filemind.documents"));assert.equal(rows.rows[0].n,0);report.checks.resetDatabaseEmpty=true;
 // No key is copied into this environment, so these smoke failures make no cloud requests.
 const preflight=spawn(process.execPath,[join(projectRoot,"node_modules/tsx/dist/cli.mjs"),join(projectRoot,"scripts/verification/demo-check.ts")],{cwd:environment.root,windowsHide:true,stdio:"ignore",env:{...process.env,FILEMIND_DEMO_CHECK_ROOT:environment.root,PORT:String(await freePort()),KIMI_API_KEY:"",EMBEDDING_API_KEY:"",DASHSCOPE_API_KEY:""}});
 const code=await new Promise((resolve,reject)=>{preflight.once("error",reject);preflight.once("exit",resolve);});assert.equal(code,1);const receipt=JSON.parse(await readFile(join(environment.root,".filemind/diagnostics/demo-preflight.json"),"utf8"));assert.equal(receipt.ready,false);assert.equal(receipt.checks.find(c=>c.name==="OCR Worker").ok,true);report.checks.localOCR=true;report.checks.honestNotReady=true;
 await writeFile(join(projectRoot,"docs/evaluation/phase9-demo-preflight.json"),JSON.stringify({...receipt,scope:"Fresh no-credential Competition Mode, negative readiness acceptance; not an online Ready receipt."},null,2)+"\n");
 report.backupSha256=createHash("sha256").update(bytes).digest("hex");report.passed=true;
}catch{report.errorCode="PHASE9_CLEAN_ACCEPTANCE_FAILED";process.exitCode=1;}
finally{if(environment)await disposeEnvironment(environment);await writeFile(join(projectRoot,"docs/evaluation/phase9-clean-environment.json"),JSON.stringify(report,null,2)+"\n");console.log(JSON.stringify(report));}
