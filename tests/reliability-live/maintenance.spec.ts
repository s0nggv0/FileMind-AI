import {test,expect} from "@playwright/test";
import {randomUUID,createHash} from "node:crypto";
import {mkdir,rm,writeFile} from "node:fs/promises";
import {resolve,join,relative,isAbsolute} from "node:path";
import {Client} from "pg";
import {readFile} from "node:fs/promises";
for(const width of [1440,390])test(`missing original, quarantine and interrupted replacement preserve knowledge at ${width}px`,async({page,context})=>{
  const root=resolve(process.env.FILEMIND_TEST_ROOT!),origin=process.env.FILEMIND_TEST_ORIGIN!,headers={origin};
  expect(relative(resolve("artifacts"),root)).toMatch(/^phase8-fresh-[\w-]+$/);
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  async function screenshot(path:string) {
    await page.evaluate(async()=>{await window.document.fonts.ready;if(window.document.activeElement instanceof HTMLElement)window.document.activeElement.blur();window.scrollTo({top:0,behavior:"instant"});});
    await page.screenshot({path,fullPage:true,animations:"disabled"});
  }
  const snapshot=await (await context.request.post("/api/workspaces",{headers,data:{name:"Synthetic maintenance acceptance"}})).json();
  const id=randomUUID(),bytes=Buffer.from("Synthetic fixture: audit retention is 6 hours. Retention describes how long temporary audit records remain available.");
  const document={id,name:"maintenance-retention.txt",type:"txt",mimeType:"text/plain",size:bytes.length,contentHash:createHash("sha256").update(bytes).digest("hex"),parseStatus:"completed",metadata:{addedAt:new Date().toISOString()}};
  expect((await context.request.put(`/api/workspaces/${snapshot.id}`,{headers,data:{...snapshot,documents:[document],texts:{[id]:bytes.toString()}}})).ok()).toBe(true);
  const uploaded=await (await context.request.post(`/api/workspaces/${snapshot.id}/files`,{headers,multipart:{documentId:id,file:{name:document.name,mimeType:document.mimeType,buffer:bytes}}})).json();
  const owner=uploaded.documents[0].storagePath.split("/")[0];
  const original=resolve(root,".filemind/storage",uploaded.documents[0].storagePath),rel=relative(resolve(root,".filemind/storage"),original);expect(rel.startsWith("..")).toBe(false);expect(isAbsolute(rel)).toBe(false);
  await rm(original);
  const orphan=join(root,".filemind/storage",owner,snapshot.id,randomUUID());await mkdir(orphan,{recursive:true});await writeFile(join(orphan,"original.txt"),"Synthetic unreferenced file");
  await page.setViewportSize({width,height:900});await page.goto("/settings");
  await page.getByRole("button",{name:"检查私有存储",exact:true}).click();await expect(page.getByText(/检查完成：0 份原文件可用，1 份原文件缺失/)).toBeVisible();await expect(page.getByText(/1 个孤立文件已隔离/)).toBeVisible();
  await mkdir("artifacts/phase8-qa",{recursive:true});await screenshot(`artifacts/phase8-qa/maintenance-${width}.png`);
  expect((await context.request.get(`/api/documents/${id}/original`)).status()).toBe(404);
  const index=await context.request.post("/api/index",{headers,data:{documentId:id}});expect(index.ok()).toBe(true);expect((await index.json()).results[0].chunks).toBeGreaterThan(0);
  // Explicit simulated state for the view check: no semantic quality claim.
  const instance=JSON.parse(await readFile(join(root,".filemind/postgresql/instance.json"),"utf8")),password=(await readFile(join(root,".filemind/postgresql/admin.password"),"utf8")).trim();
  const client=new Client({host:"127.0.0.1",port:instance.port,database:"filemind_ai",user:"filemind_admin",password});
  try{await client.connect();await client.query("update filemind.documents set index_build_status='interrupted' where id=$1 and user_id=$2",[id,owner]);}finally{await client.end();}
  await page.goto("/library?source=workspace");await page.getByRole("button",{name:/maintenance-retention.txt/}).click();await expect(page.getByRole("dialog")).toContainText("Original file unavailable");await expect(page.getByRole("dialog")).toContainText("新索引已中断，可以重试。");await screenshot(`artifacts/phase8-qa/missing-library-${width}.png`);
  await page.goto("/search");await page.getByLabel("Ask your knowledge",{exact:true}).fill("retention");await page.getByRole("button",{name:"Find",exact:true}).click();await page.getByRole("button",{name:"搜索",exact:true}).click();await expect(page.getByRole("button",{name:/maintenance-retention.txt/}).first()).toBeVisible();await page.getByRole("button",{name:/maintenance-retention.txt/}).first().click();await expect(page.getByRole("dialog").locator("mark")).toContainText("retention is 6 hours");await expect(page.getByRole("dialog")).toContainText("Original file unavailable");expect(await page.getByRole("link",{name:"Open original file"}).count()).toBe(0);
  expect(await page.evaluate(()=>window.document.documentElement.scrollWidth<=innerWidth)).toBe(true);expect(errors).toEqual([]);
  const foreign=await context.browser()!.newContext();expect((await foreign.request.get(origin+`/api/documents/${id}/original`)).status()).toBe(404);const state=await (await foreign.request.get(origin+"/api/maintenance")).json();expect(state.operations).toEqual([]);await foreign.close();
  await writeFile(`docs/evaluation/phase8-maintenance-${width}.json`,JSON.stringify({passed:true,width,fixtureMode:"isolated PostgreSQL and synthetic bytes; interrupted UI state injected",missingOriginal404:true,orphanQuarantined:true,missingTextSearchable:true,citationTextAvailable:true,foreignOwnerDenied:true,noPageErrors:true,checkedAt:new Date().toISOString()},null,2)+"\n");
});
