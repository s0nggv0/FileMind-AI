// UI transport fixtures only. Backend scope and factual checks have separate tests.
import {test,expect} from "@playwright/test";
test("clarification selection, compare all and stale history expose their actual scope",async({page})=>{
  const a=crypto.randomUUID(),b=crypto.randomUUID(),run=crypto.randomUUID();
  const source=(id:string,name:string,n:number)=>({id:crypto.randomUUID(),documentId:id,sourceId:`S${n}`,documentName:name,content:`保留期 ${n} 小时`,location:"L1",fileType:"txt",summary:"",tags:[]});
  const sources=[source(a,"甲方案.txt",1),source(b,"乙方案.txt",2)];
  const base={id:run,query:"这个实验保留多久？",rewrittenQuery:"这个实验保留多久？",mode:"ask",sources,nearest:[],mock:true,evidenceCount:2,candidateCount:2,semanticUnavailable:false,answerUnavailable:false,answerState:"needs_clarification",verification:{status:"needs_clarification",version:"fixture"},answer:{answer:"请选择对象",citations:[],confidence:"low",insufficientEvidence:false,clarification:{required:true,question:"请选择对象",options:[{label:"甲方案",documentIds:[a]},{label:"乙方案",documentIds:[b]}]}}};
  const requests:Record<string,unknown>[]=[];
  await page.route("**/api/index",route=>route.fulfill({json:{documents:[{id:a,name:"甲方案.txt",status:"ready",chunks:1},{id:b,name:"乙方案.txt",status:"ready",chunks:1}],mock:true}}));
  await page.route("**/api/search*",async route=>{
    if(route.request().method()==="GET")return route.fulfill({json:new URL(route.request().url()).searchParams.has("runId")?{...base,historyWarning:"部分历史来源已变更或不可用，请重新搜索。"}:{recent:[]}});
    const body=route.request().postDataJSON();requests.push(body);
    const selected=body.compareAll?[a,b]:body.clarificationOption===0?[a]:undefined;
    const result=selected?{...base,id:crypto.randomUUID(),selectedDocumentIds:selected,answerState:"answered",sources:sources.filter(s=>selected.includes(s.documentId)),verification:{status:"verified",version:"fixture"},answer:{answer:"按选定来源回答 [S1]",citations:[],confidence:"low",insufficientEvidence:false,clarification:{required:false}}}:base;
    await route.fulfill({contentType:"text/event-stream",body:`data: ${JSON.stringify({type:"result",data:result})}\n\n`});
  });
  await page.goto("/search");await page.getByLabel("向资料提问",{exact:true}).fill(base.query);await page.getByRole("button",{name:"搜索",exact:true}).click();
  await page.getByRole("button",{name:"甲方案",exact:true}).click();await expect(page.getByText(/当前范围：选定 1 份资料/)).toBeVisible();expect(requests.at(-1)).toMatchObject({previousRunId:run,clarificationOption:0});
  await page.goto(`/search?run=${run}`);await expect(page.getByText(/部分历史来源已变更或不可用/)).toBeVisible();
  await page.getByRole("button",{name:"比较全部",exact:true}).click();await expect(page.getByText(/当前范围：选定 2 份资料/)).toBeVisible();expect(requests.at(-1)).toMatchObject({previousRunId:run,compareAll:true});
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
});
