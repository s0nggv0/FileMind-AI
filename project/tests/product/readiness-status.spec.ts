import { test, expect } from "@playwright/test";
import { readiness, type ReadinessDocument } from "../../src/lib/retrieval/readiness";

for(const width of [390,1440])test(`replacement retries and bounded visible polling reflect real status at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});await page.clock.install();
  const documents:ReadinessDocument[]=Array.from({length:6},(_,i)=>({id:crypto.randomUUID(),name:`合成资料${i}.txt`,status:"ready",chunks:2}));
  documents[0].buildStatus="failed";documents[1].buildStatus="interrupted";documents[2].chunks=0;
  documents[3].status="stale";documents[4].buildStatus="embedding";
  Object.assign(documents[5],{fileType:"image",ocrStatus:"ready",visionStatus:"failed"});
  const posts:string[]=[];let reads=0;
  await page.route("**/api/**",async route=>{
    if(new URL(route.request().url()).pathname!=="/api/index")return route.fulfill({json:{recent:[]}});
    if(route.request().method()==="POST"){
      const {documentId,unfinishedOnly}=route.request().postDataJSON();expect(unfinishedOnly).toBe(true);posts.push(documentId);
      const doc=documents.find(d=>d.id===documentId)!;doc.status="ready";doc.chunks=2;doc.buildStatus="ready";
      return route.fulfill({json:{results:[{documentId,status:"ready",chunks:2}]}});
    }
    reads++;
    const scope=new URL(route.request().url()).searchParams.get("documentIds");expect(scope?.split(",").sort()).toEqual(documents.map(d=>d.id).sort());
    return route.fulfill({json:{documents,summary:readiness(documents),nextCursor:null,mock:true}});
  });
  await page.goto(`/search?documents=${documents.map(d=>d.id).join(",")}`);
  await expect(page.getByText(/2 份替换索引失败或中断/)).toBeVisible();
  await expect(page.getByRole("button",{name:"准备搜索",exact:true})).toBeEnabled();
  await page.getByRole("button",{name:"准备搜索",exact:true}).click();
  await expect.poll(()=>posts.length).toBe(5);
  await expect(page.getByText(/已保存 6 份 · 可搜索 6 份/)).toBeVisible();
  await expect(page.getByRole("button",{name:"准备搜索",exact:true})).toBeEnabled(); // image remains partial despite successful POST
  expect(posts).not.toContain(documents[4].id);
  documents[4].buildStatus="ready";
  await page.clock.runFor(4100);await expect(page.getByText(/正在准备 1 份资料/)).toHaveCount(0);
  const stable=reads;await page.clock.runFor(20000);expect(reads).toBe(stable);
  await page.evaluate(()=>{Object.defineProperty(document,"visibilityState",{configurable:true,value:"hidden"});document.dispatchEvent(new Event("visibilitychange"));});
  await page.clock.runFor(20000);expect(reads).toBe(stable);
  await page.evaluate(()=>{Object.defineProperty(document,"visibilityState",{configurable:true,value:"visible"});document.dispatchEvent(new Event("visibilitychange"));});
  await expect.poll(()=>reads).toBe(stable+1);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});

test("a late status response from an earlier selection cannot replace the current scope",async({page})=>{
  const a=crypto.randomUUID(),b=crypto.randomUUID(),run=crypto.randomUUID();let release!:()=>void;
  const delayed=new Promise<void>(resolve=>{release=resolve;});
  await page.route("**/api/index*",async route=>{
    const id=new URL(route.request().url()).searchParams.get("documentIds");
    if(id===a)await delayed;
    await route.fulfill({json:{documents:[{id,name:id===a?"旧选择.txt":"当前选择.txt",status:"ready",chunks:1}],mock:true}}).catch(()=>{});
  });
  await page.route("**/api/search*",route=>route.fulfill({json:new URL(route.request().url()).searchParams.has("runId")?{id:run,query:"合成查询",mode:"find",sources:[],nearest:[],selectedDocumentIds:[b],evidenceCount:0,candidateCount:0}:{recent:[]}}));
  await page.goto(`/search?documents=${a}&run=${run}`);
  await expect(page.getByText(/当前范围：选定 1 份资料 · 当前选择.txt/)).toBeVisible();release();
  await expect(page.getByText(/当前范围：选定 1 份资料 · 当前选择.txt/)).toBeVisible();
  await expect(page.getByText(/旧选择.txt/)).toHaveCount(0);
});
