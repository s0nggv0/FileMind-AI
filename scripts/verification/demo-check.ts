import { loadEnvConfig } from "@next/env";
import { readFile, mkdir, unlink, statfs, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { createHash, randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { Pool } from "pg";
import { z } from "zod";
import { atomicWriteFile } from "../../src/lib/reliability/atomic-file";
import { createKimiProvider } from "../../src/lib/ai/providers/kimi-provider";
import { readModelConfig } from "../../src/lib/ai/models";
import { DashScopeEmbeddingProvider } from "../../src/lib/retrieval/dashscope-provider";
import { KimiVisionProvider } from "../../src/lib/multimodal/kimi-vision";
import { PortableOCRProvider } from "../../src/lib/multimodal/portable-ocr";
import { ensureStorageDirectory } from "../runtime/storage-recovery.mjs";

async function main() {
  const root=resolve(process.env.FILEMIND_DEMO_CHECK_ROOT||process.cwd());loadEnvConfig(root,false,{info(){},error(){}});
  const checks:{name:string;ok:boolean;durationMs:number;detail?:unknown}[]=[];
  async function check(name:string,work:()=>Promise<unknown>) {const start=performance.now();try{const detail=await work();checks.push({name,ok:true,durationMs:performance.now()-start,...detail!==undefined?{detail}:{}});console.log(`${name} ........ OK`);}catch{checks.push({name,ok:false,durationMs:performance.now()-start});console.log(`${name} ........ FAILED`);}}
  const pool=new Pool({connectionString:process.env.DATABASE_URL,max:1,connectionTimeoutMillis:5000});
  await check("Database",async()=>{await pool.query("select 1");return {reachable:true};});await pool.end();
  await check("Storage",async()=>{const dir=resolve(root,process.env.FILE_STORAGE_ROOT||".filemind/storage");await ensureStorageDirectory(dir);const path=join(dir,`.preflight-${randomUUID()}.tmp`),bytes=Buffer.from("synthetic preflight write");try{await atomicWriteFile(path,bytes);if(!(await readFile(path)).equals(bytes))throw new Error();}finally{await unlink(path).catch(()=>{});}});
  await check("Kimi Key",async()=>{if(!process.env.KIMI_API_KEY?.trim())throw new Error();});
  await check("DashScope Key",async()=>{if(!(process.env.EMBEDDING_API_KEY||process.env.DASHSCOPE_API_KEY)?.trim())throw new Error();});
  await check("Kimi Smoke",async()=>{const p=createKimiProvider({apiKey:process.env.KIMI_API_KEY,baseURL:process.env.KIMI_BASE_URL,models:readModelConfig(process.env)});const r=await p.generateObject({schema:z.object({ready:z.literal(true)}),system:"Reply using the required schema. This is a synthetic readiness test.",prompt:"Return ready: true.",signal:AbortSignal.timeout(60000)});if(!r.object.ready)throw new Error();return {model:p.models.main};});
  await check("Embedding Smoke",async()=>{const p=new DashScopeEmbeddingProvider({apiKey:process.env.EMBEDDING_API_KEY||process.env.DASHSCOPE_API_KEY||"",baseURL:process.env.EMBEDDING_BASE_URL||"",model:process.env.EMBEDDING_MODEL||"",dimensions:Number(process.env.EMBEDDING_DIMENSIONS||1024)}),r=await p.embedQuery("Synthetic FileMind demo readiness.");return {provider:r.provider,model:r.model,dimensions:r.dimensions};});
  const fixtures=join(root,"tests/fixtures/demo");
  await check("Demo Data",async()=>{const manifest=JSON.parse(await readFile(join(fixtures,"manifest.json"),"utf8"));if(manifest.documents!==10)throw new Error();for(const file of manifest.files){if(!/^[a-z0-9-]+\.(pdf|docx|md|txt|png|jpg)$/.test(file.name))throw new Error();const bytes=await readFile(join(fixtures,"files",file.name));if(bytes.length!==file.bytes||createHash("sha256").update(bytes).digest("hex")!==file.sha256)throw new Error();}return {documents:10,recommended:8};});
  const image={bytes:new Uint8Array(await readFile(join(fixtures,"files/transformer-slide.png"))),filename:"transformer-slide.png",mimeType:"image/png" as const};
  await check("Vision Smoke",async()=>{const marker=join(root,".filemind/vision-verification.json");await unlink(marker).catch((error:NodeJS.ErrnoException)=>{if(error.code!=="ENOENT")throw error;});const p=new KimiVisionProvider({apiKey:process.env.KIMI_API_KEY,baseURL:process.env.KIMI_BASE_URL});const r=await p.analyzeImage(image,AbortSignal.timeout(90000));if(!r.analysis.summary||!/attention|transformer/i.test(JSON.stringify(r.analysis)))throw new Error();await atomicWriteFile(marker,Buffer.from(JSON.stringify({verified:true,provider:"kimi",model:p.getModelInfo().model,baseURL:process.env.KIMI_BASE_URL||"https://api.moonshot.cn/v1",checkedAt:new Date().toISOString()})));return {model:p.getModelInfo().model,localVerificationWritten:true};});
  await check("OCR Worker",async()=>{const r=await new PortableOCRProvider().extractText(image,AbortSignal.timeout(90000));if(!/Query/i.test(r.text)||!/Value/i.test(r.text))throw new Error();return {engine:"tesseract.js",confidence:r.confidence};});
  await check("Disk Space",async()=>{const disk=await statfs(root);const availableBytes=disk.bavail*disk.bsize;if(availableBytes<500*1024*1024)throw new Error();return {availableBytes};});
  await check("Port",async()=>{const port=Number(process.env.PORT||3000);const server=createServer();try{await new Promise<void>((done,reject)=>{server.once("error",reject);server.listen(port,"127.0.0.1",done);});return {port,available:true};}finally{if(server.listening)await new Promise<void>(done=>server.close(()=>done()));}});
  await check("Build Version",async()=>{const build=(await readFile(join(root,".next/standalone/.next/BUILD_ID"),"utf8")).trim();if(!build)throw new Error();return {buildId:build};});
  const report={version:"demo-preflight-v1",checkedAt:new Date().toISOString(),ready:checks.every(c=>c.ok),syntheticSmoke:true,checks};
  await mkdir(join(root,".filemind/diagnostics"),{recursive:true});await writeFile(join(root,".filemind/diagnostics/demo-preflight.json"),JSON.stringify(report,null,2)+"\n");
  console.log(report.ready?"READY: 12 / 12 checks passed.":"NOT READY: preflight has failed checks. Check the named services.");if(!report.ready)process.exitCode=1;
}
void main().catch(()=>{console.error("Demo preflight could not finish; connection details suppressed.");process.exitCode=1;});
