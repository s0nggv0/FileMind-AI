import { test, expect } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
test("Phase 9 route matrix at mobile, 1280, 1440 and 1920",async({page})=>{
  const rows=[];await mkdir("artifacts/phase9-qa",{recursive:true});
  for(const width of [390,1280,1440,1920])for(const route of ["/","/dashboard","/workspace","/library","/search","/graph","/cleanup","/settings"]){
    await page.setViewportSize({width,height:900});await page.goto(route);await page.evaluate(()=>document.fonts.ready);await expect(page.locator("main")).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${route} at ${width}`).toBe(true);
    await expect(page.getByText(/TODO|Lorem ipsum|test123|Development only/,{exact:false})).toHaveCount(0);
    if(route==="/settings"){await expect(page.getByRole("heading",{name:"About FileMind AI"})).toBeVisible();await expect(page.getByRole("heading",{name:"界面状态预览"})).toHaveCount(0);}
    await page.screenshot({path:`artifacts/phase9-qa/${route.slice(1)||"landing"}-${width}.png`,fullPage:true,animations:"disabled"});rows.push({route,width,overflow:false,passed:true});
  }
  await writeFile(process.env.FILEMIND_BROWSER_MATRIX_REPORT||"docs/evaluation/phase9-browser-matrix.json",JSON.stringify({checkedAt:new Date().toISOString(),mode:"Competition Mode, no cloud credentials, injected Search transport only",rows},null,2)+"\n");
});
for(const width of [390,1440])test(`Phase 9 clarification choice, conflict citations and saved states ${width}`,async({page})=>{
  await page.setViewportSize({width,height:900});
  const sources=["AI Competition deadline is June 10.","Database Course Project deadline is June 15."].map((content,i)=>({id:randomUUID(),documentId:randomUUID(),workspaceId:randomUUID(),userId:randomUUID(),sourceId:`S${i+1}`,location:"L1",chunkIndex:0,content,contentHash:"fixture",chunkVersion:"chunk-v1",tokenEstimate:20,pageStart:null,pageEnd:null,lineStart:1,lineEnd:1,paragraphStart:null,paragraphEnd:null,headingPath:[],charStart:0,charEnd:content.length,documentName:`plan-${i+1}.txt`,fileType:"txt",summary:"",tags:[],score:0.9}));
  let previous="",saved:unknown=null;
  const base={query:"那个项目什么时候截止？",rewrittenQuery:"deadline",mode:"ask",sources,nearest:[],semanticUnavailable:false,answerUnavailable:false,mock:true,evidenceCount:2,candidateCount:2};
  await page.route("**/api/search*",async route=>{
    const url=new URL(route.request().url());
    if(route.request().method()==="GET")return route.fulfill({json:url.searchParams.has("chunkId")?sources.find(s=>s.id===url.searchParams.get("chunkId")):url.searchParams.has("runId")?saved:{recent:[]}});
    const input=route.request().postDataJSON();let data;
    if(input.clarificationOption!==undefined){expect(input.previousRunId).toBe(previous);expect(input.clarificationOption).toBe(0);data={...base,id:randomUUID(),answerState:"answered",sources:[sources[0]],answer:{answer:`${sources[0].content} [S1]`,citations:[{sourceId:"S1",chunkId:sources[0].id,documentId:sources[0].documentId}],insufficientEvidence:false,confidence:"high",conflict:{detected:false,claims:[]},clarification:{required:false}},verification:{status:"verified",version:"fixture"}};}
    else if(input.query==="Conflicting dates?"){data={...base,id:randomUUID(),answerState:"conflicting",answer:{answer:"One plan reports June 10 [S1].\nAnother reports June 15 [S2].",citations:sources.map(s=>({sourceId:s.sourceId,chunkId:s.id,documentId:s.documentId})),insufficientEvidence:false,confidence:"medium",conflict:{detected:true,claims:[{topic:"Deadline",sourceIds:["S1","S2"],values:["June 10","June 15"]}]},clarification:{required:false}},verification:{status:"conflict",version:"fixture"}};}
    else{data={...base,id:randomUUID(),answerState:"needs_clarification",answer:{answer:"请选择项目。",citations:[],insufficientEvidence:false,confidence:"low",conflict:{detected:false,claims:[]},clarification:{required:true,question:"请选择项目。",options:[{label:"AI Competition",documentIds:[sources[0].documentId]},{label:"Database Course Project",documentIds:[sources[1].documentId]}]}},verification:{status:"needs_clarification",version:"fixture"}};previous=data.id;}
    saved=data;return route.fulfill({contentType:"text/event-stream",body:`data: ${JSON.stringify({type:"result",data})}\n\n`});
  });
  await page.goto("/search");await page.getByLabel("Ask your knowledge",{exact:true}).fill(base.query);await page.getByRole("button",{name:"搜索",exact:true}).click();await expect(page.getByRole("heading",{name:"Which one do you mean?"})).toBeVisible();await page.screenshot({path:`artifacts/phase9-qa/clarification-${width}.png`,fullPage:true});
  await page.getByRole("button",{name:"AI Competition",exact:true}).click();await expect(page.getByRole("button",{name:"Citation 1",exact:true})).toBeVisible();await expect(page.getByRole("heading",{name:"Which one do you mean?"})).toHaveCount(0);
  await page.getByLabel("Ask your knowledge",{exact:true}).fill("Conflicting dates?");await page.getByRole("button",{name:"搜索",exact:true}).click();await expect(page.getByRole("heading",{name:"Conflicting information found"})).toBeVisible();await page.screenshot({path:`artifacts/phase9-qa/conflict-${width}.png`,fullPage:true});
  await page.getByRole("button",{name:"plan-2.txt: June 15",exact:true}).click();await expect(page.getByRole("dialog").locator("mark")).toHaveText(sources[1].content);await page.keyboard.press("Escape");await page.reload();await expect(page.getByRole("heading",{name:"Conflicting information found"})).toBeVisible();expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
