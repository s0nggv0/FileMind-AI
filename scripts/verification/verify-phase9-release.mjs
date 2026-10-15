import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { join } from 'node:path';
import { projectRoot, assertTestRoot, freePort, startEnvironment, disposeEnvironment } from '../shared/phase8-environment.mjs';
const python=process.argv[2];assert.ok(python,'Pass a local Python executable for ZIP integrity checks.');
for(const key of ['KIMI_API_KEY','EMBEDDING_API_KEY','DASHSCOPE_API_KEY','DATABASE_URL','WORKSPACE_SESSION_SECRET'])delete process.env[key];
const artifact=JSON.parse(await readFile('docs/evaluation/phase9-release-artifact.json','utf8'));
let environment;const report={checkedAt:new Date().toISOString(),passed:false,archiveSha256:artifact.sha256,build:artifact.build,kimiCalls:0,copiedPrivateData:false,checks:{}};
const run=(command,args,cwd)=>new Promise((done,reject)=>{const child=spawn(command,args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe']});let out='';child.stdout.on('data',data=>out+=data);child.stderr.on('data',()=>{});child.once('error',reject);child.once('exit',code=>done({code,out}));});
try {
 const root=assertTestRoot(join(projectRoot,'artifacts',`phase8-fresh-${randomUUID()}`));
 const unpacked=await run(python,[join(projectRoot,'scripts/release/unpack-phase9-release.py'),join(projectRoot,artifact.archive),root],projectRoot);assert.equal(unpacked.code,0);Object.assign(report.checks,JSON.parse(unpacked.out));
 environment={root,port:await freePort()};environment.origin=`http://127.0.0.1:${environment.port}`;await startEnvironment(environment);
 const config=await (await fetch(environment.origin+'/api/workspace-config')).json();assert.equal(config.persistent,true);assert.equal(config.competition,true);assert.equal(config.intelligence,true);report.checks.freshPersistentCompetitionStartup=true;
 const html=await (await fetch(environment.origin+'/settings')).text();assert.ok(html.includes('1.0.0-rc.1'));assert.ok(html.includes(artifact.build.BUILD_COMMIT.slice(0,7)));report.checks.aboutBuildMatchesManifest=true;
 process.env.PORT=String(await freePort());
 const check=await run(join(root,'.filemind/runtime/node.exe'),[join(root,'.next/standalone/demo-check.cjs')],root);assert.equal(check.code,1);
 const receipt=JSON.parse(await readFile(join(root,'.filemind/diagnostics/demo-preflight.json'),'utf8'));assert.equal(receipt.ready,false);assert.equal(receipt.checks.filter(x=>x.ok).length,7);assert.equal(receipt.checks.find(x=>x.name==='OCR Worker').ok,true);report.checks.compiledPortablePreflight=true;report.checks.bundledLocalOCR=true;report.preflight={ready:false,passed:7,total:12,scope:'No credentials; expected NOT READY'};
 report.passed=true;
}catch{report.errorCode='PHASE9_RELEASE_ACCEPTANCE_FAILED';process.exitCode=1;}
finally{if(environment)await disposeEnvironment(environment);await writeFile('docs/evaluation/phase9-portable-release.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
