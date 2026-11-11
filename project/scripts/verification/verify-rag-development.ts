import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
import { readFile,writeFile,open } from "node:fs/promises";
import { join,resolve,relative } from "node:path";
import { randomUUID,createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import mammoth from "mammoth";
import { PortableOCRProvider } from "../../src/lib/multimodal/portable-ocr";
import { createKimiProvider } from "../../src/lib/ai/providers/kimi-provider";
import { readModelConfig } from "../../src/lib/ai/models";
import { generateGroundedAnswer } from "../../src/lib/retrieval/rag";
import type { Evidence } from "../../src/lib/retrieval/types";
const project=resolve(fileURLToPath(new URL("../..",import.meta.url)));
async function main(){
  const root=process.env.FILEMIND_TEST_ROOT!;assert.match(relative(join(project,"artifacts"),root),/^phase8-fresh-[\w-]+$/);loadEnvConfig(root,false,{info(){},error(){}});
  const provider=createKimiProvider({apiKey:process.env.KIMI_API_KEY,baseURL:process.env.KIMI_BASE_URL,models:readModelConfig(process.env)}),userId=randomUUID(),workspaceId=randomUUID(),path=(name:string)=>join(root,"tests/fixtures/demo/files",name);
  const calls:unknown[]=[];
  const originalGenerate=provider.generateObject.bind(provider);
  provider.generateObject=async input=>{const result=await originalGenerate(input);calls.push({input:JSON.parse(input.prompt),output:result.object});return result;};
  const make=(name:string,content:string,source:"text"|"ocr"="text"):Evidence=>({id:randomUUID(),userId,workspaceId,documentId:randomUUID(),documentName:name,fileType:name.endsWith(".png")?"image":name.split('.').at(-1)!,content,contentHash:createHash("sha256").update(content).digest("hex"),chunkIndex:0,chunkVersion:"chunk-v1",tokenEstimate:300,pageStart:name.endsWith("pdf")?1:null,pageEnd:name.endsWith("pdf")?1:null,lineStart:null,lineEnd:null,paragraphStart:null,paragraphEnd:null,charStart:0,charEnd:content.length,headingPath:[],summary:"",tags:[],score:.8,semanticScore:.8,chunkSource:source});
  const pdfjs=await import("pdfjs-dist/legacy/build/pdf.mjs"),task=pdfjs.getDocument({data:new Uint8Array(await readFile(path("ai-attention-notes.pdf"))),useSystemFonts:true});let pdfText="";try{const pdf=await task.promise;pdfText=(await (await pdf.getPage(1)).getTextContent()).items.map(v=>"str" in v?v.str:"").join(" ");}finally{await task.destroy();}
  const ocr=await new PortableOCRProvider().extractText({bytes:await readFile(path("transformer-slide.png")),filename:"transformer-slide.png",mimeType:"image/png"},AbortSignal.timeout(60000)),docx=(await mammoth.extractRawText({buffer:await readFile(path("project-plan.docx"))})).value;
  const groups=[{query:"哪些资料讲过 Query Key Value？简短解释三者作用，引用资料。",sources:[make("transformer-slide.png",ocr.text,"ocr"),make("ai-attention-notes.pdf",pdfText),make("project-plan.docx",docx)]},{query:"Aurora Demo 的 temporary audit records 保留多久？解释新旧文档差异，并引用双方。",sources:[make("demo-audit-policy-v1.txt",await readFile(path("demo-audit-policy-v1.txt"),"utf8")),make("demo-audit-policy-v2.txt",await readFile(path("demo-audit-policy-v2.txt"),"utf8"))]}];
  const results=[];
  for(const group of groups){const answer=await generateGroundedAnswer(group.query,group.sources,{userId},provider,async(_scope,id)=>group.sources.find(s=>s.id===id)??null,AbortSignal.timeout(180000));results.push({query:group.query,...answer});console.log(JSON.stringify({available:!answer.unavailable,refused:answer.answer?.insufficientEvidence??null,errorCode:"errorCode" in answer?answer.errorCode:null,verification:"verification" in answer?answer.verification:null}));}
  const ledger=await open(join(project,"docs/evaluation/phase8-rag-development.jsonl"),"a");try{await ledger.writeFile(JSON.stringify({developmentOnly:true,checkedAt:new Date().toISOString(),results,calls})+"\n");await ledger.sync();}finally{await ledger.close();}
  await writeFile(join(root,"rag-development-finished.json"),JSON.stringify({finished:true}));
}
void main().catch(()=>{console.error("Synthetic RAG development drill could not finish.");process.exitCode=1;});
