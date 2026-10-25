import { test } from "node:test";
import assert from "node:assert/strict";
import { isolatedKnowledge } from "./helpers/isolated-knowledge";
import { IndexStatusRepository, parseIndexQuery, indexStatusURL } from "../src/lib/retrieval/index-status";
import { prepareSearch } from "../src/lib/retrieval/prepare-search";
import { prepareDocument } from "../src/lib/retrieval/prepare-document";
import { readiness } from "../src/lib/retrieval/readiness";

test("scoped SQL status precedes paging, includes older documents beyond 1500 and prepares the whole authorized scope", async () => {
  const f=await isolatedKnowledge();
  try {
    const userId=crypto.randomUUID(), foreign=crypto.randomUUID();
    const workspace=await f.workspaces.create(userId,"1507 synthetic files"), other=await f.workspaces.create(userId,"Outside selected batch");
    const foreignWorkspace=await f.workspaces.create(foreign,"Another owner");
    const inserted=await f.db.query<{id:string}>(`insert into filemind.documents(id,user_id,workspace_id,original_name,display_name,mime_type,file_type,file_size,parse_status,metadata,text_content,index_status)
      select gen_random_uuid(),$1,$2,'fixture.txt','fixture.txt','text/plain','txt',1,'completed','{}','Synthetic fixture','ready' from generate_series(1,1507) returning id`,[userId,workspace.id]);
    const ids=inserted.rows.map(r=>r.id),oldest=ids[0],stale=ids[1],replacement=ids[2];
    await f.db.query("update filemind.documents set created_at='2000-01-01' where id=$1",[oldest]);
    await f.db.query("update filemind.documents set index_status='stale' where id=$1",[stale]);
    await f.db.query("update filemind.documents set index_build_status='failed' where id=$1",[replacement]);
    await f.db.query(`insert into filemind.document_chunks(id,user_id,workspace_id,document_id,chunk_index,content,content_hash,char_start,char_end,token_estimate,chunk_version)
      select gen_random_uuid(),user_id,workspace_id,id,0,'Synthetic fixture','fixture',0,17,4,'chunk-v1' from filemind.documents where user_id=$1 and id<>$2`,[userId,oldest]);
    const repo=new IndexStatusRepository(f.tenant),scope={userId,workspaceId:workspace.id};
    const first=await repo.page(scope);assert.equal(first.documents.length,200);assert.equal(first.summary.total,1507);assert.equal(first.summary.retryable,3);
    assert.ok(first.nextCursor);
    const single=await repo.page({...scope,documentIds:[oldest]});assert.equal(single.documents[0].id,oldest);assert.equal(single.summary.searchable,0);
    assert.equal((await repo.page({...scope,documentIds:[]})).summary.total,0);
    assert.equal((await repo.page({userId,workspaceId:other.id,documentIds:[oldest]})).summary.total,0);
    assert.equal((await repo.page({userId:foreign,workspaceId:foreignWorkspace.id,documentIds:[oldest]})).summary.total,0);
    assert.equal((await repo.page({userId:foreign,documentIds:[oldest]})).summary.total,0);
    const all=[];let cursor:string|undefined;
    do {const page=await repo.page(scope,{cursor});all.push(...page.documents);cursor=page.nextCursor??undefined;}while(cursor);
    assert.equal(new Set(all.map(d=>d.id)).size,1507);assert.deepEqual(readiness(all),first.summary);
    const posted:string[]=[];let reads=0;
    const transport:typeof fetch=async(input,init)=>{
      if(init?.method!=="POST") {reads++;const query=parseIndexQuery(new URL(String(input),"http://fixture").href);return Response.json(await repo.page({userId,workspaceId:query.workspaceId,documentIds:query.documentIds},query));}
      const {documentId}=JSON.parse(String(init.body));posted.push(documentId);
      const results=await prepareDocument(f.tenant,scope,documentId,async()=>{
        if(documentId===oldest)await f.db.query(`insert into filemind.document_chunks(id,user_id,workspace_id,document_id,chunk_index,content,content_hash,char_start,char_end,token_estimate,chunk_version) values(gen_random_uuid(),$1,$2,$3,0,'Synthetic fixture','fixture',0,17,4,'chunk-v1')`,[userId,workspace.id,oldest]);
        await f.db.query("update filemind.documents set index_status='ready',index_build_status='ready' where id=$1",[documentId]);
        return [{documentId,status:"ready",chunks:1}];
      });return Response.json({results});
    };
    const prepared=await prepareSearch({workspaceId:workspace.id},transport);
    assert.deepEqual(new Set(posted),new Set([oldest,stale,replacement]));assert.equal(reads,9);
    assert.equal(prepared.summary.total,1507);assert.equal(prepared.summary.semantic,1507);assert.equal(prepared.summary.retryable,0);
    assert.equal((await repo.page({userId,workspaceId:other.id})).summary.total,0);
    await f.db.query("update filemind.document_chunks set chunk_version='obsolete' where document_id=$1",[oldest]);
    assert.equal((await repo.page({...scope,documentIds:[oldest]})).summary.searchable,0);
    await f.db.query("update filemind.document_chunks set chunk_version='chunk-v1',content=E' \\n\\t' where document_id=$1",[oldest]);
    assert.equal((await repo.page({...scope,documentIds:[oldest]})).summary.searchable,0);
  } finally {await f.db.close();}
});
test("status query preserves an explicit empty intersection and validates bounded pagination",()=>{
  const id=crypto.randomUUID();
  assert.deepEqual(parseIndexQuery(`http://fixture${indexStatusURL({workspaceId:id,documentIds:[]})}`),{workspaceId:id,documentIds:[],cursor:undefined,limit:200});
  assert.deepEqual(parseIndexQuery(`http://fixture/api/index?documentId=${id}`).documentIds,[id]);
  assert.throws(()=>parseIndexQuery("http://fixture/api/index?limit=1500"));
  assert.throws(()=>parseIndexQuery("http://fixture/api/index?documentIds=bad"));
});
