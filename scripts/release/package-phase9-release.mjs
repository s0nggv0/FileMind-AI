// Allowlisted executable artifact. Never copy an existing user's configuration or data.
import { access, cp, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createReadStream, openSync, writeSync, closeSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { join, resolve, relative } from 'node:path';
import { Zip, ZipDeflate } from 'fflate';
import { build } from 'esbuild';
import { copyPortableRuntimeScripts } from './runtime-assets.mjs';
const project=resolve('.'), output=join(project,'artifacts/release');
const version=JSON.parse(await readFile('package.json','utf8')).version;
const root=join(output,`FileMind-AI-${version}-windows-x64-${randomUUID().slice(0,8)}`);
await mkdir(root,{recursive:true});
for(const name of ['.next/standalone','.filemind/runtime','.filemind/postgresql/runtime','database/migrations','tests/fixtures/demo','tests/fixtures/phase9-demo','docs/competition','LICENSE']) {
 await cp(join(project,name),join(root,name),{recursive:true,dereference:true,filter:path=>!/(?:^|\/)\.env(?:\.|$)/.test(path.replaceAll('\\','/'))});
}
await mkdir(join(root,'docs/evaluation'),{recursive:true});
for(const name of await readdir(join(project,'docs/evaluation'))){if(['phase9-release-artifact.json','phase9-portable-release.json','phase9-final-checks.json'].includes(name))continue;if(/^phase9-.*\.(?:json|md)$/.test(name)||['final-evaluation-summary.md','rag-hard-results.json','rag-holdout-results.json','phase8-blind-analysis.json','phase6-refusal-regression.json'].includes(name))await cp(join(project,'docs/evaluation',name),join(root,'docs/evaluation',name));}
await copyPortableRuntimeScripts(project,root);
let example=await readFile('.env.example','utf8');
example=example.replace(/^AI_ENGINE=.*$/m,'AI_ENGINE=llm').replace(/^COMPETITION_MODE=.*$/m,'COMPETITION_MODE=true').replace(/^DEMO_MODE=.*$/m,'DEMO_MODE=true');
await writeFile(join(root,'.env.example'),example);
await build({entryPoints:[join(project,'scripts/verification/demo-check.ts')],outfile:join(root,'.next/standalone/demo-check.cjs'),bundle:true,platform:'node',format:'cjs',target:'node22',packages:'external',logLevel:'silent'});
for(const [name,args] of [['start','scripts/portable-start.mjs'],['stop','scripts/portable-start.mjs --stop'],['preflight','.next/standalone/demo-check.cjs']]) {
 const [script,...extra]=args.split(' ');
 await writeFile(join(root,`${name}.ps1`),`$ErrorActionPreference = 'Stop'\nSet-Location -LiteralPath $PSScriptRoot\n& (Join-Path $PSScriptRoot '.filemind/runtime/node.exe') (Join-Path $PSScriptRoot '${script}') ${extra.join(' ')} @args\nexit $LASTEXITCODE\n`);
}
async function files(dir){const list=[];for(const item of await readdir(dir,{withFileTypes:true})){const path=join(dir,item.name);if(item.isSymbolicLink())throw new Error('Artifact must not contain symlinks');if(item.isDirectory())list.push(...await files(path));else if(item.isFile())list.push(path);}return list;}
const paths=await files(root);
for(const path of paths){const rel=relative(root,path).replaceAll('\\','/');if(/(?:^|\/)(?:\.env\.local|admin\.password|instance\.json|launcher\.lock|stop\.request)$/.test(rel)||/^\.filemind\/(?:storage|logs|diagnostics|postgresql\/data)(?:\/|$)/.test(rel))throw new Error('Private artifact path rejected');}
await access(join(root,'.filemind/postgresql/runtime/pgsql/server_license.txt'));await access(join(root,'.filemind/runtime/node-LICENSE'));
const manifest={version,createdAt:new Date().toISOString(),candidateStatus:'NOT READY',privateDataIncluded:false,build:JSON.parse(await readFile(join(root,'.next/standalone/build-info.json'),'utf8')),files:[]};
const privateConfig=Object.fromEntries((await readFile(join(project,'.env.local'),'utf8').catch(()=>'')).split(/\r?\n/).flatMap(line=>{const match=line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);return match?[[match[1],match[2].replace(/^['"]|['"]$/g,'')]]:[]}));
const secrets=Object.entries(privateConfig).filter(([key,value])=>/KEY|SECRET|PASSWORD/.test(key)&&value.length>=16).map(([,value])=>Buffer.from(value));
try{const password=decodeURIComponent(new URL(privateConfig.DATABASE_URL).password);if(password.length>=16)secrets.push(Buffer.from(password));}catch{}
const overlap=Math.max(0,...secrets.map(value=>value.length));
for(const path of paths){const hash=createHash('sha256');let tail=Buffer.alloc(0);for await(const chunk of createReadStream(path)){hash.update(chunk);const check=Buffer.concat([tail,chunk]);if(secrets.some(secret=>check.includes(secret)))throw new Error(`Configured secret detected in artifact: ${relative(root,path)}`);tail=check.subarray(Math.max(0,check.length-overlap));}manifest.files.push({path:relative(root,path).replaceAll('\\','/'),bytes:(await stat(path)).size,sha256:hash.digest('hex')});}
await writeFile(join(root,'release-manifest.json'),JSON.stringify(manifest,null,2)+'\n');
const archive=join(output,`FileMind-AI-${version}-windows-x64.zip`),fd=openSync(archive,'w');let zipError;
const zip=new Zip((error,bytes)=>{if(error)zipError=error;else writeSync(fd,bytes);});
try {for(const path of await files(root)){const entry=new ZipDeflate(relative(root,path).replaceAll('\\','/'),{level:6});zip.add(entry);for await(const chunk of createReadStream(path))entry.push(new Uint8Array(chunk),false);entry.push(new Uint8Array(),true);if(zipError)throw zipError;}zip.end();if(zipError)throw zipError;}finally{closeSync(fd);}
const hash=createHash('sha256');for await(const chunk of createReadStream(archive))hash.update(chunk);
const receipt={version,candidateStatus:'NOT READY',archive:relative(project,archive).replaceAll('\\','/'),folder:relative(project,root).replaceAll('\\','/'),bytes:(await stat(archive)).size,sha256:hash.digest('hex'),files:manifest.files.length+1,build:manifest.build,privatePathsExcluded:true,configuredSecretsExcluded:true,runtimeLicensesIncluded:true,kimiCalls:0};
await writeFile(archive+'.sha256',`${receipt.sha256}  ${archive.split(/[\\/]/).pop()}\n`);await writeFile('docs/evaluation/phase9-release-artifact.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
