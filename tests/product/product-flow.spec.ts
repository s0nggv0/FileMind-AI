import { test, expect } from "@playwright/test";
import { mkdir, readFile, rm, appendFile } from "node:fs/promises";
import { resolve, relative, isAbsolute, join } from "node:path";
import { createHash } from "node:crypto";
import { Client } from "pg";
test("synthetic identity completes import, scoped retrieval, reading, correction, history, duplicates and image recovery", async ({page,context,browser}) => {
  const config=await (await context.request.get("/api/workspace-config")).json();
  expect(config).toMatchObject({persistent:true,intelligence:false});
  const evidence=process.env.FILEMIND_EVIDENCE_DIR ?? "artifacts/product-optimization";
  await mkdir(evidence,{recursive:true});
  async function capture(name:string) {
    await page.evaluate(async()=>{await document.fonts.ready;});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    const modal=page.getByRole("dialog");if(await modal.count())await modal.evaluate(el=>{el.scrollTop=0;});
    await page.screenshot({path:join(evidence,`${name}.png`),fullPage:!(await modal.count())});
  }
  const a=Buffer.from("青禾实验方案A：通过线为72分。该方案未声明替代其他方案。"), b=Buffer.from("青禾实验方案B：通过线为68分。该方案未声明替代其他方案。");
  let workspace:string|undefined,user:string|undefined;
  const errors:string[]=[];page.on("pageerror",e=>errors.push(e.message));
  try {
    await page.goto("/dashboard");await expect(page.getByRole("heading",{name:"导入第一批资料"})).toBeVisible();
    await page.setViewportSize({width:390,height:844});await capture("01-empty-mobile");
    await page.goto("/workspace");
    await page.getByLabel("选择本地文件").setInputFiles([
      {name:"青禾实验方案A.txt",mimeType:"text/plain",buffer:a},{name:"青禾实验方案A-copy.txt",mimeType:"text/plain",buffer:a},{name:"青禾实验方案B.txt",mimeType:"text/plain",buffer:b},
      {name:"合成事务笔记.png",mimeType:"image/png",buffer:await readFile("tests/fixtures/rag-hard/images/transaction-notes.png")},
    ]);
    await page.getByRole("button",{name:"开始整理"}).click();
    await expect(page.getByRole("heading",{name:"整理建议"})).toBeVisible({timeout:60000});
    workspace=new URL(page.url()).searchParams.get("workspace")!;
    const snapshot=await (await context.request.get(`/api/workspaces/${workspace}`)).json();
    user=snapshot.documents[0].storagePath.split("/")[0];
    await mkdir("artifacts/product-optimization",{recursive:true});await appendFile("artifacts/product-optimization/test-identities.jsonl",JSON.stringify({workspace,user})+"\n");
    await page.getByLabel("审阅文件筛选").selectOption(snapshot.documents[0].id);
    await page.getByRole("button",{name:"接受筛选内建议"}).click();
    await page.getByLabel("审阅文件筛选").selectOption("all");
    await capture("02-review-mobile");await page.setViewportSize({width:1440,height:900});await capture("03-review-desktop");
    await page.getByRole("button",{name:"应用方案",exact:true}).click();
    await expect(page.getByRole("heading",{name:"工作区已整理"})).toBeVisible();
    await expect(page.getByText(/已保存 4 份 · 可搜索 4 份/)).toBeVisible({timeout:60000});
    await page.setViewportSize({width:390,height:844});await capture("04-completed-mobile");
    await page.getByRole("link",{name:"向这批资料提问"}).click();
    await expect(page.getByText("当前范围：本次导入的资料",{exact:true})).toBeVisible();
    await page.getByRole("button",{name:"查找资料",exact:true}).click();await page.getByLabel("向资料提问",{exact:true}).fill("通过线");
    await page.getByRole("button",{name:"搜索",exact:true}).click();await expect(page.getByRole("heading",{name:"相关资料",exact:true})).toBeVisible();
    const batchRun=new URL(page.url()).searchParams.get("run");
    const batch=await (await context.request.get(`/api/search?runId=${batchRun}`)).json();
    expect(batch.sources).toHaveLength(2);expect(batch.workspaceId).toBe(workspace);expect(batch.answer).toBeNull();
    await capture("05-batch-find-mobile");
    const document=snapshot.documents.find((d:{name:string})=>d.name==="青禾实验方案A.txt");
    await page.goto(`/library?source=workspace&document=${document.id}`);
    const dialog=page.getByRole("dialog");await expect(dialog.getByRole("button",{name:"保存分类与标签"})).toBeVisible();
    await dialog.getByText(/查看已提取全文/).click();await expect(dialog).toContainText(a.toString());
    const original=await context.request.get(`/api/documents/${document.id}/original`);expect(original.status()).toBe(200);expect(createHash("sha256").update(await original.body()).digest("hex")).toBe(createHash("sha256").update(a).digest("hex"));
    await dialog.getByLabel("分类",{exact:true}).fill("研究修正");await dialog.getByLabel(/标签（用逗号/).fill("实验，门槛");await dialog.getByRole("button",{name:"保存分类与标签"}).click();
    await expect(dialog.getByText("分类与标签已保存，资料库与后续搜索将使用这些修改。")).toBeVisible();
    await page.reload();await expect(page.getByRole("dialog").getByLabel("分类",{exact:true})).toHaveValue("研究修正");await expect(page.getByRole("dialog").getByLabel(/标签（用逗号/)).toHaveValue(/实验/);
    await page.getByRole("dialog").getByText(/查看已提取全文/).click();await capture("06-reader-mobile");
    await page.setViewportSize({width:1440,height:900});await capture("07-reader-desktop");
    await page.getByRole("link",{name:"向这份资料提问"}).click();await expect(page.getByText(/当前范围：选定 1 份资料/)).toBeVisible();
    await page.getByRole("button",{name:"查找资料",exact:true}).click();await page.getByLabel("向资料提问",{exact:true}).fill("通过线");await page.getByRole("button",{name:"搜索",exact:true}).click();await expect(page.getByRole("heading",{name:"相关资料",exact:true})).toBeVisible();
    const singleRun=new URL(page.url()).searchParams.get("run");const single=await (await context.request.get(`/api/search?runId=${singleRun}`)).json();expect(single.sources.map((s:{documentId:string})=>s.documentId)).toEqual([document.id]);
    await page.goto("/search");let posts=0;const count=(r:{method():string;url():string})=>{if(r.method()==="POST"&&new URL(r.url()).pathname==="/api/search")posts++;};page.on("request",count);
    await page.getByRole("button",{name:"通过线",exact:true}).first().click();await expect(page.getByRole("heading",{name:"相关资料",exact:true})).toBeVisible();expect(new URL(page.url()).searchParams.get("run")).toBe(singleRun);expect(posts).toBe(0);page.off("request",count);
    await page.keyboard.press("Control+k");await page.getByPlaceholder("查找自己的资料，或前往页面…").fill("研究修正");
    // Category is intentionally not a command search field; name/summary/tags are.
    await page.getByPlaceholder("查找自己的资料，或前往页面…").fill("门槛");await expect(page.getByRole("option").filter({hasText:"青禾实验方案A.txt"})).toBeVisible();await page.keyboard.press("Enter");await expect(page.getByRole("dialog").getByRole("button",{name:"保存分类与标签"})).toBeVisible();
    await page.goto("/cleanup");await expect(page.getByRole("heading",{name:"重复候选",exact:true})).toBeVisible();await page.getByRole("button",{name:"忽略候选",exact:true}).click();await expect(page.getByText("当前决定：忽略",{exact:true})).toBeVisible();await page.reload();await expect(page.getByText("当前决定：忽略",{exact:true})).toBeVisible();await expect(page.getByRole("link",{name:/阅读资料/})).toHaveCount(2);
    await page.setViewportSize({width:390,height:844});await capture("08-duplicates-mobile");
    await page.goto("/graph?source=workspace");await expect(page.getByLabel("相关资料与概念列表")).toBeVisible();await capture("09-graph-mobile");await page.getByRole("link",{name:"阅读这份资料"}).click();await expect(page.getByRole("dialog")).toBeVisible();
    const image=snapshot.documents.find((d:{type:string})=>d.type==="image");await page.goto(`/library?source=workspace&document=${image.id}`);
    await expect(page.getByText("可阅读已提取文字",{exact:true})).toBeVisible();await expect(page.getByText("未启用或配置未通过检查",{exact:true})).toBeVisible();
    const imageBefore=await (await context.request.get(`/api/images/${image.id}`)).json();
    await page.getByRole("button",{name:"重试这张图片未完成的能力"}).click();await expect(page.getByText(/部分能力仍未完成。已提取内容保留/)).toBeVisible({timeout:60000});
    const imageAfter=await (await context.request.get(`/api/images/${image.id}`)).json();expect(imageAfter.analysis.ocr.text).toBe(imageBefore.analysis.ocr.text);await capture("10-image-partial-mobile");
    await page.goto("/settings#help");await expect(page.getByRole("heading",{name:"任务帮助"})).toBeVisible();await capture("11-help-mobile");
    const other=await browser.newContext();try {for(const path of [`/api/documents/${document.id}`,`/api/documents/${document.id}/original`,`/api/workspaces/${workspace}`,`/api/images/${image.id}`])expect((await other.request.get(new URL(path,page.url()).href)).status()).toBe(404);expect((await other.request.patch(new URL(`/api/documents/${document.id}`,page.url()).href,{data:{revision:0,category:"attack",tags:[]},headers:{origin:new URL(page.url()).origin}})).status()).toBe(404);} finally{await other.close();}
    expect(errors).toEqual([]);
  } finally {
    if(workspace&&user&&/^[a-f0-9-]{36}$/.test(user)){
      const metadata=JSON.parse(await readFile(".filemind/postgresql/instance.json","utf8"));const password=(await readFile(".filemind/postgresql/admin.password","utf8")).trim();
      const db=new Client({host:"127.0.0.1",port:metadata.port,database:"filemind_ai",user:"filemind_admin",password});
      try {await db.connect();await db.query("delete from filemind.workspaces where id=$1 and user_id=$2",[workspace,user]);await db.query("delete from filemind.retrieval_runs where user_id=$1",[user]);await db.query("delete from filemind.profiles where id=$1 and not exists(select 1 from filemind.workspaces where user_id=$1)",[user]);}finally{await db.end();}
      const root=resolve(".filemind/storage"),target=resolve(root,user,workspace),inside=relative(root,target);if(!inside||inside.startsWith("..")||isAbsolute(inside))throw new Error("Invalid synthetic cleanup path");await rm(target,{recursive:true,force:true});
    }
  }
});
