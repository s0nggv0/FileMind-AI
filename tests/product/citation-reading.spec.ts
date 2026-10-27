import { test, expect } from "@playwright/test";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { isolatedNativeDatabase as database } from "../helpers/native-database";
import { PrivateFileStorage } from "../../src/lib/workspace/private-file-storage";
import { contentHash } from "../../src/lib/retrieval/chunker";
import { citationAnchor, citationURL, citationLibraryURL } from "../../src/lib/retrieval/citation-contract";
import type { Evidence } from "../../src/lib/retrieval/types";

for (const width of [390, 1440]) test(`native citation context, repeated text, old document IDs and return focus at ${width}px`, async ({ page, context, browser }) => {
  const root = process.env.FILEMIND_TEST_ROOT;
  if (!root) throw new Error("Use the isolated verify-priority-optimizations.mjs runner");
  const origin = process.env.FILEMIND_TEST_ORIGIN!, headers = { origin };
  await page.setViewportSize({ width, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  const workspace = await (await context.request.post("/api/workspaces", { headers, data: { name: "Synthetic citation reading" } })).json();
  const sentence = "重复句子：保留期为 6 小时。";
  const text = `第一次出现之前\n${sentence}\n${"中间的其他段落内容。\n".repeat(100)}第二次出现之前\n${sentence}\n第二次出现之后`;
  const start = text.lastIndexOf(sentence), end = start + sentence.length, documentId = crypto.randomUUID(), chunkId = crypto.randomUUID(), runId = crypto.randomUUID();
  const owner = await database(root, async client => {
    const owner = (await client.query("select user_id from filemind.workspaces where id=$1", [workspace.id])).rows[0].user_id;
    await client.query(`insert into filemind.documents(id,user_id,workspace_id,original_name,display_name,mime_type,file_type,file_size,parse_status,metadata,text_content,content_hash,index_status,chunk_version,created_at)
      values($1,$2,$3,'old-citation.txt','较早的重复文本资料.txt','text/plain','txt',$4,'completed','{}',$5,$6,'ready','chunk-v1','2000-01-01')`, [documentId,owner,workspace.id,Buffer.byteLength(text),text,contentHash(text)]);
    await client.query(`insert into filemind.documents(id,user_id,workspace_id,original_name,display_name,mime_type,file_type,file_size,parse_status,metadata,text_content)
      select gen_random_uuid(),$1,$2,'new.txt','较新的资料.txt','text/plain','txt',1,'completed','{}','x' from generate_series(1,1501)`,[owner,workspace.id]);
    await client.query(`insert into filemind.document_chunks(id,user_id,workspace_id,document_id,chunk_index,content,content_hash,char_start,char_end,token_estimate,chunk_version,line_start,line_end)
      values($1,$2,$3,$4,1,$5,$6,$7,$8,20,'chunk-v1',104,104)`, [chunkId,owner,workspace.id,documentId,sentence,contentHash(sentence),start,end]);
    return owner;
  });
  const storage = new PrivateFileStorage(join(root,".filemind/storage"));
  const storagePath = await storage.putOriginal({userId:owner,workspaceId:workspace.id,documentId,extension:"txt",bytes:Buffer.from(text)});
  await database(root, client => client.query("update filemind.documents set storage_path=$2,storage_status='available' where id=$1",[documentId,storagePath]));
  const source: Evidence = await (await context.request.get(`/api/search?chunkId=${chunkId}`)).json();
  const anchor = citationAnchor(source);
  const preview = await (await context.request.get(citationURL(anchor,"context"))).json();
  expect(preview.citation.before).toContain("第二次出现之前"); expect(preview.citation.after).toContain("第二次出现之后"); expect(preview.citation.text).toBeUndefined();
  const result = { id:runId,query:"保留期是多少？",rewrittenQuery:"保留期是多少？",mode:"ask",workspaceId:workspace.id,selectedDocumentIds:[documentId],sources:[{...source,sourceId:"S1",location:"L104"}],nearest:[],evidenceCount:1,candidateCount:1,mock:true,issues:[],semanticUnavailable:false,answerUnavailable:false,answerState:"answered",verification:{status:"verified",version:"synthetic-fixture"},answer:{answer:"保留期为 6 小时。[S1]",citations:[{sourceId:"S1",chunkId,documentId}],confidence:"medium",insufficientEvidence:false} };
  await database(root,client=>client.query(`insert into filemind.retrieval_runs(id,user_id,workspace_id,query,mode,top_k,retrieved_chunk_ids,evidence_ids,reranker_status,latency,result)
    values($1,$2,$3,$4,'ask',1,$5,$5,'disabled','{}',$6)`,[runId,owner,workspace.id,result.query,[chunkId],result]));
  const pageErrors: string[] = []; page.on("pageerror", error => pageErrors.push(error.message));
  await page.goto(`/search?run=${runId}`);
  const citation = page.getByRole("button",{name:"引用 1",exact:true});
  await citation.focus(); await page.keyboard.press("Enter");
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("引用前文")).toContainText("第二次出现之前");
  await expect(dialog.getByLabel("引用后文")).toContainText("第二次出现之后");
  await dialog.getByRole("button",{name:"打开全文并定位",exact:true}).click();
  const highlight=dialog.getByLabel("引用对应的原文",{exact:true});
  await expect(highlight).toBeFocused(); await expect(highlight).toHaveText(sentence);
  expect(await highlight.evaluate(mark=>mark.previousSibling?.textContent?.length)).toBe(start);
  const original = dialog.getByRole("link",{name:"打开原文件",exact:true});
  expect((await context.request.get((await original.getAttribute("href"))!)).status()).toBe(200);
  expect((await context.request.get(`/api/documents/${documentId}/original?version=${"0".repeat(64)}`)).status()).toBe(409);
  await page.keyboard.press("Escape"); await expect(citation).toBeFocused();
  await citation.click(); await page.getByRole("dialog").getByRole("link",{name:"打开资料",exact:true}).click();
  await expect(page).toHaveURL(/\/library\?/);
  expect(page.url()).not.toContain(encodeURIComponent(sentence)); expect(page.url()).not.toContain(sentence);
  dialog=page.getByRole("dialog");
  await expect(dialog.getByRole("heading",{name:source.documentName,exact:true})).toBeVisible();
  await expect(dialog.getByLabel("引用对应的原文",{exact:true})).toHaveText(sentence);
  await expect(dialog.getByLabel("引用对应的原文",{exact:true})).toBeInViewport();
  await expect(dialog.getByRole("heading",{name:source.documentName,exact:true})).toBeInViewport();
  await expect(dialog.getByRole("link",{name:"返回原搜索结果",exact:true})).toBeInViewport();
  expect(await dialog.getByLabel("引用对应的原文",{exact:true}).evaluate(mark=>mark.previousSibling?.textContent?.length)).toBe(start);
  await mkdir("artifacts/citation-reading",{recursive:true});
  await page.screenshot({path:`artifacts/citation-reading/full-${width}.png`,fullPage:false});
  await dialog.getByRole("link",{name:"返回原搜索结果",exact:true}).click();
  await expect(page).toHaveURL(new RegExp(`/search\\?run=${runId}&focusChunk=${chunkId}`));
  await expect(citation).toBeFocused();
  await citation.click(); await page.getByRole("dialog").getByRole("button",{name:"返回搜索结果",exact:true}).click();
  await expect(citation).toBeFocused();
  await database(root,client=>client.query("update filemind.documents set storage_status='missing' where id=$1",[documentId]));
  await citation.click(); dialog=page.getByRole("dialog");
  await expect(dialog.getByText("原文件不可用 · 仍可核对提取正文",{exact:true})).toBeVisible();
  await expect(dialog.locator("mark")).toHaveText(sentence); await page.keyboard.press("Escape");
  const foreign=await browser.newContext(); try {
    for(const path of [citationURL(anchor,"full"),`/api/documents/${documentId}`,`/api/documents/${documentId}/original?version=${source.documentHash}`]) expect((await foreign.request.get(`${origin}${path}`)).status()).toBe(404);
  } finally {await foreign.close();}
  await database(root,client=>client.query("update filemind.documents set text_content='更新后已经没有原来的引用。' where id=$1",[documentId]));
  const stale=await context.request.get(citationURL(anchor,"full")); expect(stale.status()).toBe(404); expect(await stale.json()).toEqual({reason:"SOURCES_CHANGED"});
  await citation.click(); dialog=page.getByRole("dialog");
  await expect(dialog.getByRole("alert")).toContainText("来源已经变化或失效"); await expect(dialog.getByRole("button",{name:"打开全文并定位",exact:true})).toBeDisabled(); await expect(dialog.getByText(sentence,{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true); expect(pageErrors).toEqual([]);
});

test("native PDF navigation uses saved extraction pages and legacy or missing positions never invent a page",async({context,browser})=>{
  const root=process.env.FILEMIND_TEST_ROOT!; const origin=process.env.FILEMIND_TEST_ORIGIN!;
  const workspace=await(await context.request.post("/api/workspaces",{headers:{origin},data:{name:"Synthetic PDF locations"}})).json();
  const text="前文\n真实第七页的引用\n后文",start=3,end=text.length-3;
  for(const pages of [[{page:7,charStart:0,charEnd:text.length}],undefined]){
    const id=crypto.randomUUID(),chunkId=crypto.randomUUID();
    await database(root,async client=>{
      const owner=(await client.query("select user_id from filemind.workspaces where id=$1",[workspace.id])).rows[0].user_id;
      await client.query(`insert into filemind.documents(id,user_id,workspace_id,original_name,display_name,file_type,mime_type,file_size,parse_status,metadata,text_content,content_hash,index_status)
        values($1,$2,$3,'pages.pdf','页码资料.pdf','pdf','application/pdf',20,'completed',$4,$5,$6,'ready')`,[id,owner,workspace.id,{structure:{pages}},text,contentHash(text)]);
      await client.query(`insert into filemind.document_chunks(id,user_id,workspace_id,document_id,chunk_index,content,content_hash,char_start,char_end,token_estimate,chunk_version,page_start,page_end)
        values($1,$2,$3,$4,0,$5,$6,$7,$8,12,'chunk-v1',7,7)`,[chunkId,owner,workspace.id,id,text.slice(start,end),contentHash(text.slice(start,end)),start,end]);
    });
    const source=await(await context.request.get(`/api/search?chunkId=${chunkId}`)).json(),anchor=citationAnchor(source);
    const data=await(await context.request.get(citationURL(anchor,"full"))).json();expect(data.citation.pdfPage).toBe(pages?7:null);if(!pages)expect(data.citation.label).toContain("缺少可靠页码");
    const page=await context.newPage();try{
      await page.goto(citationLibraryURL(anchor));await expect(page.getByRole("dialog").getByLabel("引用对应的原文",{exact:true})).toHaveText(source.content);
      if(!pages)await expect(page.getByRole("dialog").getByText("缺少可靠页码 · 仅核对提取文字",{exact:true})).toBeVisible();
    }finally{await page.close();}
    const foreign=await browser.newContext();try{expect((await foreign.request.get(`${origin}${citationURL(anchor,"full")}`)).status()).toBe(404);}finally{await foreign.close();}
  }
});

for (const width of [390,1440]) test(`citation PDF page links and OCR/AI provenance remain explicit at ${width}px`, async ({page}) => {
  // Explicit transport fixtures supplement the native permission/location tests.
  await page.setViewportSize({width,height:900});
  const documentId=crypto.randomUUID(),chunkId=crypto.randomUUID(),runId=crypto.randomUUID();
  let kind:"pdf"|"pdf_without_page"|"ocr"|"vision_summary"="pdf", release:(()=>void)|undefined, fullPending=false;
  const sentence="合成引用片段。",text=`前文。\n${sentence}\n后文。`;
  const source=()=>({id:chunkId,documentId,sourceId:"S1",documentName:"合成定位资料",fileType:kind.startsWith("pdf")?"pdf":"image",chunkSource:kind==="ocr"?"ocr":kind==="vision_summary"?"vision_summary":"text",content:sentence,contentHash:contentHash(sentence),documentHash:contentHash("original bytes"),chunkVersion:"chunk-v1",charStart:4,charEnd:4+sentence.length,location:"saved position",tags:[],summary:"",storageStatus:"available"});
  let posts=0;
  await page.route("**/api/index*",route=>route.fulfill({json:{documents:[],mock:true}}));
  await page.route("**/api/search*",async route=>{
    if(route.request().method()!=="GET"){posts++;return route.abort();}
    const params=new URL(route.request().url()).searchParams;
    if(params.has("chunkId")){
      const full=params.get("view")==="full";
      if(full&&fullPending)await new Promise<void>(resolve=>{release=resolve;});
      return route.fulfill({json:{...source(),citation:{status:"located",label:kind==="pdf"?"第 7 页":kind==="pdf_without_page"?"缺少可靠页码 · 仅核对提取文字":kind==="ocr"?"图片 · OCR 文字":"图片 · AI 解读",range:{start:4,end:4+sentence.length},before:"前文。\n",after:"\n后文。",pdfPage:kind==="pdf"?7:null,textVersion:contentHash(text),...(full?{text}:{})}}});
    }
    return route.fulfill({json:params.has("runId")?{id:runId,query:"合成问题",mode:"ask",sources:[source()],nearest:[],issues:[],verification:{status:"verified",version:"fixture"},answer:{answer:"合成引用片段。[S1]",insufficientEvidence:false,citations:[],confidence:"low"}}:{recent:[]}});
  });
  const png=await readFile("tests/fixtures/rag-hard/images/transaction-notes.png");
  await page.route("**/api/images/*",route=>route.fulfill(new URL(route.request().url()).searchParams.has("original")?{contentType:"image/png",body:png}:{json:{filename:"合成图片.png",width:800,height:600,storageStatus:"available",related:[],analysis:{imageType:"document",ocr:{text:"合成提取文字",confidence:0.9,blocks:[{text:"合成提取文字",confidence:0.9,box:{x:10,y:10,width:100,height:30}}]},vision:{summary:"合成 AI 解读",topics:[],visibleConcepts:[],tags:[]},ocrStatus:"ready",visionStatus:"ready",provider:"mock",model:"fixture",ocrEngine:"fixture"}}}));
  for(const current of ["pdf","pdf_without_page","ocr","vision_summary"] as const){
    kind=current;await page.goto(`/search?run=${runId}`);await page.getByRole("button",{name:"引用 1",exact:true}).click();
    const dialog=page.getByRole("dialog");await expect(dialog.locator("mark")).toHaveText(sentence);
    if(current.startsWith("pdf")){
      const link=dialog.getByRole("link",{name:/打开原文件/});
      expect(await link.getAttribute("href")).toContain(`version=${contentHash("original bytes")}`);
      if(current==="pdf")expect(await link.getAttribute("href")).toMatch(/#page=7$/);
      else{expect(await link.getAttribute("href")).not.toContain("#page=");await expect(dialog.getByText("缺少可靠页码 · 仅核对提取文字",{exact:true})).toBeVisible();}
    }else{
      await expect(dialog.getByText(current==="ocr"?/此引用来自 OCR 文字/:/此引用来自 AI 解读/)).toBeVisible();
      await expect(dialog.getByRole("heading",{name:"提取文字 · OCR",exact:true})).toBeVisible();
      await expect(dialog.getByRole("heading",{name:"AI 解读",exact:true})).toBeVisible();
      await expect(dialog.getByText(/不绘制图片区域高亮/)).toBeVisible();
      await expect(dialog.locator("svg rect")).toHaveCount(0);
    }
    fullPending=true;await dialog.getByRole("button",{name:"打开全文并定位",exact:true}).click();
    await expect(dialog.getByText("正在核对版本并定位全文…",{exact:true})).toBeVisible();
    await expect(dialog.getByRole("button",{name:"返回引用片段",exact:true})).toBeDisabled();
    await expect.poll(()=>!!release).toBe(true);fullPending=false;release!();release=undefined;
    await expect(dialog.getByLabel("引用对应的原文",{exact:true})).toBeFocused();
    await dialog.getByRole("button",{name:"返回引用片段",exact:true}).click();
    await expect(dialog.getByRole("button",{name:"打开全文并定位",exact:true})).toBeFocused();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
  }
  expect(posts).toBe(0);
});
