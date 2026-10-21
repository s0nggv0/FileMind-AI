// Opt-in, original synthetic sources. 14 HTTP attempts total, including SDK retries.
import { loadEnvConfig } from "@next/env";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createKimiProvider } from "../../src/lib/ai/providers/kimi-provider";
import { readModelConfig } from "../../src/lib/ai/models";
import { generateGroundedAnswer } from "../../src/lib/retrieval/rag";
import type { Evidence } from "../../src/lib/retrieval/types";
async function main() {
  if (!process.argv.includes("--live")) throw new Error("Explicit --live required");
  loadEnvConfig(process.cwd(), false, { info() {}, error() {} });
  await mkdir("artifacts/product-optimization", { recursive: true });
  const budgetPath = "artifacts/product-optimization/model-budget.json", limit = 14;
  let used = await readFile(budgetPath,"utf8").then(s => JSON.parse(s).used as number, () => 0);
  if (!Number.isInteger(used) || used >= limit) throw new Error("Retained live budget exhausted");
  const provider = createKimiProvider({ apiKey: process.env.KIMI_API_KEY, baseURL: process.env.KIMI_BASE_URL, models: readModelConfig(process.env), fetch: async (input,init) => {
    if (used >= limit) throw new Error("PRODUCT_SAMPLE_BUDGET_EXHAUSTED");
    used++; await writeFile(budgetPath,JSON.stringify({limit,used}));
    return fetch(input,init);
  } });
  const userId=crypto.randomUUID(), workspaceId=crypto.randomUUID();
  const evidence = (name:string,content:string): Evidence => ({id:crypto.randomUUID(),documentId:crypto.randomUUID(),userId,workspaceId,chunkIndex:0,content,contentHash:content,chunkVersion:"chunk-v1",tokenEstimate:40,pageStart:null,pageEnd:null,lineStart:1,lineEnd:2,paragraphStart:null,paragraphEnd:null,headingPath:[],charStart:0,charEnd:content.length,documentName:name,fileType:"txt",summary:"",tags:[],score:0.9,semanticScore:0.9});
  const a=evidence("青禾实验方案A.txt","青禾实验方案A：通过线为72分。该方案未声明替代其他方案。"), b=evidence("青禾实验方案B.txt","青禾实验方案B：通过线为68分。该方案未声明替代其他方案。");
  const sources=[a,{...a,id:crypto.randomUUID(),documentId:crypto.randomUUID(),documentName:"青禾实验方案A副本.txt"},b];
  const retryMissing = process.argv.includes("--retry-missing");
  const prior = retryMissing ? JSON.parse(await readFile("docs/evaluation/product-question-samples.json","utf8")) : null;
  const rows: unknown[] = retryMissing ? prior.rows : [];
  let failures=0;
  for (const query of retryMissing ? ["青禾实验的样本量是多少？"] : ["青禾实验方案A与方案B的通过线分别是多少，是否一致？","青禾实验的通过线是多少？请说明资料之间的分歧。","青禾实验的样本量是多少？"]) {
    const result=await generateGroundedAnswer(query,sources,{userId},provider,async (_s,id)=>sources.find(s=>s.id===id)??null,AbortSignal.timeout(120000));
    const absent=query.includes("样本量");
    const passed=absent ? result.answer?.insufficientEvidence===true : !!(result.verification?.accepted && /72/.test(result.answer?.answer??"") && /68/.test(result.answer?.answer??"") && !result.answer?.clarification?.required && result.answer.citations.length===2);
    if(!passed)failures++;
    rows.push({query,passed,...(retryMissing?{afterPromptCorrection:true}:{}),answer:result.answer,verification:result.verification ? {accepted:result.verification.accepted,reason:result.verification.reason}:null,unavailable:result.unavailable,sourceCount:result.sources.length});
    console.log(JSON.stringify({sample:rows.length,passed,callsUsed:used,unavailable:result.unavailable}));
    if (result.unavailable || used >= limit) break;
  }
  await writeFile("docs/evaluation/product-question-samples.json",JSON.stringify({checkedAt:new Date().toISOString(),live:true,synthetic:true,retrievalTested:false,scope:"Three bounded grounded-answer samples, two paraphrased comparisons and one absent fact. No global accuracy or user-success claim.",limit,callsUsed:used,rows},null,2)+"\n");
  if(failures || (!retryMissing && rows.length!==3))process.exitCode=1;
}
void main().catch(()=>{ console.error("Product question samples unavailable; credentials and diagnostics suppressed."); process.exitCode=1; });
