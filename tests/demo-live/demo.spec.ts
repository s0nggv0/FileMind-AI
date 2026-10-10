import { test, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { unzipSync } from "fflate";
test("dedicated demo: bundled fixtures, mixed import/review/apply, provider mode, confirmation and scoped reset",async({page,context})=>{
  const live=process.env.FILEMIND_DEMO_LIVE==="true",headers={origin:process.env.FILEMIND_TEST_ORIGIN!};
  const report:{[k:string]:unknown}={passed:false,live,syntheticFixtures:true,checkedAt:new Date().toISOString()},start=performance.now();
  const completedStages:string[]=[];report.completedStages=completedStages;
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  const normal=await (await context.request.post("/api/workspaces",{headers,data:{name:"Preserve normal workspace"}})).json();
  const originalCookies=await context.cookies();
  try {
    const cfg=await (await context.request.get("/api/workspace-config")).json();expect(cfg.intelligence).toBe(live);
    const response=await context.request.get("/api/demo?download=fixtures");expect(response.ok()).toBe(true);const zip=unzipSync(await response.body());expect(Object.keys(zip)).toHaveLength(8);
    await page.goto("/settings");await expect(page.getByRole("heading",{name:"比赛演示工作区"})).toBeVisible();await expect(page.getByRole("heading",{name:"界面状态预览"})).toHaveCount(0);
    await page.getByRole("button",{name:"打开专用演示工作区"}).click();await expect(page).toHaveURL(/workspace\?workspace=/);
    const workspace=new URL(page.url()).searchParams.get("workspace")!;
    expect((await context.request.post("/api/demo",{headers,data:{action:"reset",workspaceId:normal.id,confirm:"RESET_DEMO_WORKSPACE"}})).status()).toBe(404);
    const files=Object.entries(zip).filter(([name])=>live||name.endsWith(".txt"));
    const mime=(name:string)=>name.endsWith(".pdf")?"application/pdf":name.endsWith(".docx")?"application/vnd.openxmlformats-officedocument.wordprocessingml.document":name.endsWith(".png")?"image/png":name.endsWith(".jpg")?"image/jpeg":name.endsWith(".md")?"text/markdown":"text/plain";
    await page.getByLabel("选择本地文件").setInputFiles(files.map(([name,bytes])=>({name,mimeType:mime(name),buffer:Buffer.from(bytes)})));
    report.uploadedFiles=files.map(([name])=>name);completedStages.push("Upload");
    await expect(page.getByText("演示控制 · 测试故障恢复")).toHaveCount(0);
    await page.getByRole("button",{name:"开始整理"}).click();await expect(page.getByRole("heading",{name:"整理建议"})).toBeVisible({timeout:300000});
    const before=await (await context.request.get(`/api/workspaces/${workspace}`)).json();expect(before.documents).toHaveLength(files.length);expect(before.run.engine).toBe(live?"llm":"mock");
    if(live){expect(before.run.result.simulation).toBe(false);expect(before.run.usage.totalTokens).toBeGreaterThan(0);report.plannerMetrics=before.run.plannerMetrics;report.plannerFallback=before.run.fallback??null;report.imageCount=before.documents.filter((d:{type:string})=>d.type==="image").length;expect(before.run.fallback).toBeFalsy();expect(before.run.plannerMetrics.llm_success).toBe(1);expect(before.run.plannerMetrics.fallback_count).toBe(0);}
    completedStages.push("Agent","Review");
    await page.getByRole("button",{name:"应用方案"}).click();await expect(page.getByRole("heading",{name:"工作区已整理"})).toBeVisible();
    report.agentThroughApplyMs=performance.now()-start;
    completedStages.push("Apply");
    if(live){
      // Apply schedules indexing. This simultaneous explicit rebuild must also
      // succeed, including the image preparation workspace revision updates.
      const indexed=await context.request.post("/api/index",{headers,data:{workspaceId:workspace}}),indexResult=await indexed.json();report.indexResponse={status:indexed.status(),data:indexResult};expect(indexed.ok()).toBe(true);expect(indexResult.results.every((r:{status:string})=>r.status==="ready")).toBe(true);
      await page.addInitScript(()=>{const original=window.fetch.bind(window);window.fetch=async(...args:Parameters<typeof fetch>)=>{const r=await original(...args);if(String(args[0]).endsWith("/api/search")&&args[1]?.method==="POST")(window as unknown as {demoStream:Promise<string>}).demoStream=r.clone().text();return r;};});
      await page.goto("/search");await page.getByRole("button",{name:"查找资料",exact:true}).click();await page.getByLabel("向资料提问",{exact:true}).fill("Query Key Value");await page.getByRole("button",{name:"搜索",exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!(window as unknown as {demoStream?:Promise<string>}).demoStream)).toBe(true);
      const findEvents=(await page.evaluate(()=>(window as unknown as {demoStream:Promise<string>}).demoStream)).split("\n\n").filter(e=>e.startsWith("data: ")).map(e=>JSON.parse(e.slice(6))),find=findEvents.find(e=>e.type==="result").data;expect(find.mode).toBe("find");expect(find.mock).toBe(false);expect(find.semanticUnavailable).toBe(false);expect(find.sources.length).toBeGreaterThan(0);report.findResponse=find;completedStages.push("Search");
      await page.evaluate(()=>{delete (window as unknown as {demoStream?:Promise<string>}).demoStream;});await page.getByRole("button",{name:"问答",exact:true}).click();await page.getByLabel("向资料提问",{exact:true}).fill("哪些资料讲过 Query Key Value？简短解释三者作用，引用资料。");await page.getByRole("button",{name:"搜索",exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!(window as unknown as {demoStream?:Promise<string>}).demoStream)).toBe(true);
      const events=(await page.evaluate(()=>(window as unknown as {demoStream:Promise<string>}).demoStream)).split("\n\n").filter(e=>e.startsWith("data: ")).map(e=>JSON.parse(e.slice(6))),result=events.find(e=>e.type==="result").data;
      report.ragResponse=result;await expect(page.getByRole("button",{name:"引用 1",exact:true}).first()).toBeVisible({timeout:10000});
      expect(result.verification.status).toBe("verified");expect(result.mock).toBe(false);expect(result.sources.some((s:{fileType:string})=>s.fileType==="pdf")).toBe(true);expect(result.sources.some((s:{fileType:string})=>s.fileType==="image")).toBe(true);
      report.pdfAndImageSources=true;report.verifiedAnswer=true;
      completedStages.push("RAG");
      const pdfCitation=result.answer.citations.find((c:{sourceId:string})=>result.sources.some((s:{sourceId:string;fileType:string})=>s.sourceId===c.sourceId&&s.fileType==="pdf"));expect(pdfCitation).toBeTruthy();
      await page.getByRole("button",{name:`引用 ${pdfCitation.sourceId.slice(1)}`,exact:true}).first().click();await expect(page.getByRole("dialog").locator("mark")).toBeVisible();const originalLink=page.getByRole("link",{name:"打开原文件"});expect((await context.request.get((await originalLink.getAttribute("href"))!)).ok()).toBe(true);await page.getByRole("button",{name:"关闭",exact:true}).click();report.pdfCitation=true;completedStages.push("Citation");
      await page.evaluate(()=>{delete (window as unknown as {demoStream?:Promise<string>}).demoStream;});await page.getByLabel("向资料提问",{exact:true}).fill("解释 Transformer 图片中的 Query、Key、Value 与注意力权重关系，引用图片。");await page.getByRole("button",{name:"搜索",exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!(window as unknown as {demoStream?:Promise<string>}).demoStream)).toBe(true);
      const imageEvents=(await page.evaluate(()=>(window as unknown as {demoStream:Promise<string>}).demoStream)).split("\n\n").filter(e=>e.startsWith("data: ")).map(e=>JSON.parse(e.slice(6))),imageResult=imageEvents.find(e=>e.type==="result").data;report.imageRagResponse=imageResult;expect(imageResult.mock).toBe(false);expect(imageResult.verification.status).toBe("verified");
      const imageCitation=imageResult.answer.citations.find((c:{sourceId:string})=>imageResult.sources.some((s:{sourceId:string;fileType:string})=>s.sourceId===c.sourceId&&s.fileType==="image"));expect(imageCitation).toBeTruthy();await page.getByRole("button",{name:`引用 ${imageCitation.sourceId.slice(1)}`,exact:true}).first().click();await expect(page.getByRole("dialog").getByRole("img",{name:/原图：/})).toBeVisible();await expect(page.getByRole("dialog").locator("mark")).toBeVisible();await expect.poll(()=>page.getByRole("dialog").getByRole("img").evaluate((img:HTMLImageElement)=>img.complete&&img.naturalWidth>0)).toBe(true);await page.getByRole("button",{name:"关闭",exact:true}).click();report.imageCitation=true;completedStages.push("Image Citation");
      await page.evaluate(()=>{delete (window as unknown as {demoStream?:Promise<string>}).demoStream;});
      await page.getByLabel("向资料提问",{exact:true}).fill("Aurora Demo 的 temporary audit records 保留多久？解释新旧文档差异，并引用双方。");await page.getByRole("button",{name:"搜索",exact:true}).click();await expect.poll(()=>page.evaluate(()=>!!(window as unknown as {demoStream?:Promise<string>}).demoStream)).toBe(true);
      const conflictEvents=(await page.evaluate(()=>(window as unknown as {demoStream:Promise<string>}).demoStream)).split("\n\n").filter(e=>e.startsWith("data: ")).map(e=>JSON.parse(e.slice(6))),conflict=conflictEvents.find(e=>e.type==="result").data;report.conflictResponse=conflict;
      expect(conflict.verification.status).toBe("conflict");expect(conflict.answer.insufficientEvidence).toBe(false);const cited=conflict.answer.citations.map((c:{chunkId:string})=>conflict.sources.find((s:{id:string})=>s.id===c.chunkId)?.documentName);expect(cited).toContain("demo-audit-policy-v1.txt");expect(cited).toContain("demo-audit-policy-v2.txt");report.conflictDemo=true;
      await page.goto("/graph");await expect(page.getByText("Service is temporarily unavailable.",{exact:true})).toHaveCount(0);await expect(page.getByRole("group",{name:/本地规则知识图谱/})).toBeVisible();await expect(page.getByRole("button",{name:/^文件：/})).toHaveCount(8);await page.getByRole("button",{name:/^文件：/}).first().click();report.graphDocumentCount=8;completedStages.push("Graph");
      await page.goto("/cleanup");await expect(page.getByRole("button",{name:/当前会话 · 8 份文件/})).toHaveAttribute("aria-pressed","true");await expect(page.getByRole("heading",{name:"待审阅的示例建议"})).toHaveCount(0);const candidates=before.run.result.duplicates.filter((d:{decision:string})=>d.decision!=="ignored");if(candidates.length)await expect(page.getByRole("heading",{name:"工作区重复候选"})).toBeVisible();else await expect(page.getByRole("heading",{name:"暂时没有整理建议"})).toBeVisible();report.cleanup={candidateCount:candidates.length,realWorkspace:true,originalsPreserved:(await (await context.request.get(`/api/workspaces/${workspace}`)).json()).documents.length===8};expect((report.cleanup as {originalsPreserved:boolean}).originalsPreserved).toBe(true);completedStages.push("Cleanup");
    }
    await page.goto("/settings");await page.getByRole("button",{name:"重置演示资料",exact:true}).click();
    await mkdir("artifacts/phase8-qa",{recursive:true});
    for(const width of [1440,390]){await page.setViewportSize({width,height:900});await page.evaluate(async()=>{await document.fonts.ready;window.scrollTo({top:0,behavior:"instant"});});await page.screenshot({path:`artifacts/phase8-qa/demo-confirm-${live}-${width}.png`,fullPage:true,animations:"disabled"});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
    await page.getByRole("button",{name:"取消",exact:true}).click();expect((await (await context.request.get(`/api/workspaces/${workspace}`)).json()).documents.length).toBe(files.length);
    await page.getByRole("button",{name:"重置演示资料",exact:true}).click();await page.getByRole("button",{name:"确认重置演示资料"}).click();await expect(page).toHaveURL(/workspace\?workspace=/);await expect(page.getByLabel("选择本地文件")).toBeAttached();expect((await (await context.request.get(`/api/workspaces/${workspace}`)).json()).documents).toHaveLength(0);
    await context.clearCookies();await context.addCookies(originalCookies);expect((await (await context.request.get(`/api/workspaces/${normal.id}`)).json()).name).toBe(normal.name);expect((await context.request.post("/api/demo",{headers,data:{action:"reset",workspaceId:workspace,confirm:"RESET_DEMO_WORKSPACE"}})).status()).toBe(404);
    expect(errors).toEqual([]);report.passed=true;report.scopedReset=true;report.confirmation=true;report.elapsedMs=performance.now()-start;
  }finally{await writeFile(process.env.FILEMIND_DEMO_REPORT||`docs/evaluation/phase8-demo-${live?"live":"mock"}.json`,JSON.stringify(report,null,2)+"\n");}
});
