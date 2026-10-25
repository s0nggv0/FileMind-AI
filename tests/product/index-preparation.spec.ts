// UI transport fixtures: no database or paid provider is contacted.
import { test, expect } from "@playwright/test";

for (const width of [390,1440]) test(`search preparation stays within the selected unfinished documents at ${width}px`,async({page})=>{
  await page.setViewportSize({width,height:900});
  await page.emulateMedia({reducedMotion:"reduce"});
  const batch=crypto.randomUUID(),otherBatch=crypto.randomUUID();
  const [pending,ready,running,outside,replacement]=Array.from({length:5},()=>crypto.randomUUID());
  const documents=[
    {id:pending,workspaceId:batch,name:"本次待准备.txt",status:"failed",chunks:1},
    {id:ready,workspaceId:batch,name:"本次已就绪.txt",status:"failed",chunks:1},
    {id:running,workspaceId:batch,name:"正在处理.txt",status:"not_indexed",buildStatus:"embedding",chunks:0},
    {id:outside,workspaceId:otherBatch,name:"其他批次.txt",status:"failed",chunks:1},
    {id:replacement,workspaceId:batch,name:"同批未选中.txt",status:"failed",chunks:1},
  ];
  const posted: {documentId:string;workspaceId?:string}[]=[];let reads=0;
  await page.route("**/api/**",async route=>{
    if(new URL(route.request().url()).pathname!=="/api/index")return route.fulfill({json:{recent:[]}});
    if(route.request().method()!=="POST") {
      reads++;if(reads>1)documents[1].status="ready";
      return route.fulfill({json:{documents,mock:true}});
    }
    const body=route.request().postDataJSON();posted.push(body);
    const document=documents.find(d=>d.id===body.documentId)!;document.status="ready";document.chunks=1;
    return route.fulfill({json:{results:[{documentId:document.id,status:"ready",chunks:1}]}});
  });
  await page.goto(`/search?documents=${[pending,ready,running].join(",")}`);
  await expect(page.getByText(/已保存 3 份/)).toBeVisible();
  await page.getByRole("button",{name:"准备搜索",exact:true}).click();
  await expect(page.getByText(/本次已准备 1 份资料/)).toBeVisible();
  expect(posted).toEqual([{documentId:pending,unfinishedOnly:true}]);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  await page.screenshot({path:`artifacts/product-optimization-audit/fixed-index-scope-${width}.png`,fullPage:true});
  documents[2].status="ready";documents[2].buildStatus="ready";documents[2].chunks=1;
  await page.getByRole("button",{name:"准备搜索",exact:true}).click();
  await expect(page.getByText("当前范围内暂无需要准备的资料。")).toBeVisible();
  expect(posted).toHaveLength(1);
  await page.goto(`/search?workspace=${batch}`);
  await expect(page.getByText(/已保存 4 份/)).toBeVisible();
  await page.getByRole("button",{name:"准备或重试未完成资料",exact:true}).click();
  await expect.poll(()=>posted.length).toBe(2);
  expect(posted[1]).toEqual({documentId:replacement,unfinishedOnly:true,workspaceId:batch});
});
