import { test, expect } from "@playwright/test";
import type { SourceCoverage } from "../../src/lib/retrieval/source-coverage";
for(const width of [390,1440])test(`partial comparison exposes source and copy coverage with usable citations at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const ids=Array.from({length:10},()=>crypto.randomUUID()),run=crypto.randomUUID();
  const sources=ids.slice(0,7).map((documentId,i)=>({id:crypto.randomUUID(),documentId,documentName:`合成方案${i+1}.txt`,content:`合成方案${i+1}通过线为${70+i}分。`,fileType:"txt",location:"L1",sourceId:`S${i+1}`,tags:[],summary:""}));
  const uncovered: SourceCoverage["uncovered"] = [{documentId:ids[7],name:"预算之外.txt",reason:"budget"},{documentId:ids[8],name:"没有请求事实.txt",reason:"no_relevant_evidence"}];
  const result={id:run,query:"比较全部方案",rewrittenQuery:"比较全部方案",mode:"ask",sources,nearest:[],evidenceCount:7,candidateCount:20,mock:true,answerUnavailable:false,semanticUnavailable:false,answerState:"answered",verification:{status:"verified",version:"fixture"},answer:{answer:"合成方案2通过线为71分。 [S2]",confidence:"low",insufficientEvidence:false,citations:[{sourceId:"S2",chunkId:sources[1].id,documentId:ids[1]}]},coverage:{selectedCount:10,evidenceDocumentIds:ids.slice(0,7),citedDocumentIds:[ids[1]],mergedCopies:[{documentId:ids[9],intoDocumentId:ids[0]}],uncovered,unlistedCount:0,complete:false}};
  const coverage: SourceCoverage = result.coverage;
  coverage.uncovered.push({documentId:ids[5],name:"已参与但缺少事实.txt",reason:"missing_facts",detail:"该资料未给出请求的通过线"});
  await page.route("**/api/index*",route=>route.fulfill({json:{documents:[],mock:true}}));
  await page.route("**/api/search*",route=>{
    const params=new URL(route.request().url()).searchParams;
    return route.fulfill({json:params.has("chunkId")?sources[1]:params.has("runId")?result:{recent:[]}});
  });
  await page.goto(`/search?run=${run}`);
  await expect(page.getByText(/比较范围 10 份 · 参与证据 7 份 · 合并副本 1 份 · 回答引用 1 份/)).toBeVisible();
  await expect(page.getByText(/本次仅覆盖部分来源，不能视为完整比较/)).toBeVisible();
  await expect(page.getByText(/预算之外.txt：未进入本次证据或上下文预算/)).toBeVisible();
  await expect(page.getByText(/没有请求事实.txt：未召回足够相关证据/)).toBeVisible();
  await expect(page.getByText(/已参与但缺少事实.txt：参与证据，但缺少请求事实 · 该资料未给出请求的通过线/)).toBeVisible();
  await page.getByRole("button",{name:"引用 2",exact:true}).click();
  await expect(page.getByRole("dialog")).toContainText("合成方案2.txt");await expect(page.getByRole("dialog")).toContainText("71分");
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
