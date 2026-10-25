import { test, expect } from "@playwright/test";
import { isolatedNativeDatabase as database } from "../helpers/native-database";

test("native scoped API and full-library preparation reach older files beyond 1500 without crossing identities",async({page,context,browser})=>{
  const root=process.env.FILEMIND_TEST_ROOT;if(!root)throw new Error("Run scripts/verification/verify-priority-optimizations.mjs for an isolated native database.");
  const origin=process.env.FILEMIND_TEST_ORIGIN!,headers={origin};
  const workspace=await(await context.request.post("/api/workspaces",{headers,data:{name:"Synthetic 1507 index scope"}})).json();
  const other=await(await context.request.post("/api/workspaces",{headers,data:{name:"Outside selected workspace"}})).json();
  const ids=await database(root,async client=>{
    const owner=(await client.query("select user_id from filemind.workspaces where id=$1",[workspace.id])).rows[0].user_id;
    const rows=await client.query(`insert into filemind.documents(id,user_id,workspace_id,original_name,display_name,mime_type,file_type,file_size,parse_status,metadata,text_content,index_status,index_build_status,embedding_provider,embedding_model,chunk_version)
      select gen_random_uuid(),$1,$2,'synthetic.txt','synthetic.txt','text/plain','txt',17,'completed','{}','Synthetic fixture','ready','ready','mock','token-hash-fixture-v1','chunk-v1' from generate_series(1,1507) returning id`,[owner,workspace.id]);
    const ids=rows.rows.map((r:{id:string})=>r.id);
    await client.query("update filemind.documents set created_at='2000-01-01' where id=$1",[ids[0]]);
    await client.query("update filemind.documents set index_build_status='interrupted' where id=$1",[ids[1]]);
    await client.query(`insert into filemind.document_chunks(id,user_id,workspace_id,document_id,chunk_index,content,content_hash,char_start,char_end,token_estimate,chunk_version)
      select gen_random_uuid(),user_id,workspace_id,id,0,'Synthetic fixture','fixture',0,17,4,'chunk-v1' from filemind.documents where workspace_id=$1 and id<>$2`,[workspace.id,ids[0]]);
    return ids;
  });
  const single=await(await context.request.get(`/api/index?documentId=${ids[0]}`)).json();expect(single.documents.map((d:{id:string})=>d.id)).toEqual([ids[0]]);expect(single.summary).toMatchObject({total:1,searchable:0,retryable:1});
  const intersect=await(await context.request.get(`/api/index?workspaceId=${other.id}&documentIds=${ids[0]}`)).json();expect(intersect.summary.total).toBe(0);
  expect((await(await context.request.get("/api/index?documentIds=")).json()).summary.total).toBe(0);
  const foreign=await browser.newContext();try{
    expect((await(await foreign.request.get(`${origin}/api/index?documentId=${ids[0]}`)).json()).documents).toEqual([]);
    expect((await foreign.request.post(`${origin}/api/index`,{headers,data:{documentId:ids[0],unfinishedOnly:true}})).status()).toBe(404);
  }finally{await foreign.close();}
  let cursor:string|undefined;const listed=new Set<string>();let pages=0;
  do {const data=await(await context.request.get(`/api/index?workspaceId=${workspace.id}${cursor?`&cursor=${cursor}`:""}`)).json();expect(data.documents.length).toBeLessThanOrEqual(200);expect(data.summary.total).toBe(1507);for(const doc of data.documents)listed.add(doc.id);cursor=data.nextCursor;pages++;}while(cursor);
  expect(pages).toBe(8);expect(listed.size).toBe(1507);
  const posts:string[]=[];page.on("request",request=>{if(request.method()==="POST"&&new URL(request.url()).pathname==="/api/index")posts.push(request.postDataJSON().documentId);});
  await page.goto("/search");await expect(page.getByText(/已保存 1507 份/)).toBeVisible();
  await page.getByRole("button",{name:"准备搜索",exact:true}).click();
  await expect(page.getByText(/本次已准备 2 份资料/)).toBeVisible({timeout:60000});
  expect(new Set(posts)).toEqual(new Set(ids.slice(0,2)));
  const final=await(await context.request.get(`/api/index?documentIds=${ids.slice(0,2).join(",")}`)).json();expect(final.summary).toMatchObject({total:2,semantic:2,retryable:0});
  const batch=await(await context.request.get(`/api/index?workspaceId=${other.id}`)).json();expect(batch.summary.total).toBe(0);
});
