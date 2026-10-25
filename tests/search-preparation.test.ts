import { test } from "node:test";
import assert from "node:assert/strict";
import { prepareSearch } from "../src/lib/retrieval/prepare-search";
import { readiness, type ReadinessDocument } from "../src/lib/retrieval/readiness";

const doc = (id: string, extra: Partial<ReadinessDocument> = {}): ReadinessDocument => ({ id, workspaceId: "batch", name: id, status: "failed", chunks: 1, ...extra });

test("preparation intersects document and batch scope, skips ready and running files, and refreshes before retry", async () => {
  const documents = [doc("pending"),doc("ready",{status:"ready"}),doc("running",{buildStatus:"embedding"}),doc("unselected"),doc("other-batch",{workspaceId:"elsewhere"})];
  const posted: unknown[] = []; let reads = 0;
  const transport: typeof fetch = async (_input,init) => {
    if (init?.method !== "POST") { reads++; return Response.json({documents}); }
    const body = JSON.parse(String(init.body)); posted.push(body);
    documents[0].status = "ready";
    return Response.json({results:[{documentId:body.documentId,status:"ready",chunks:1}]});
  };
  const scope = {workspaceId:"batch",documentIds:["pending","ready","running"]};
  assert.deepEqual(await prepareSearch(scope,transport),{results:[{documentId:"pending",status:"ready",chunks:1}],processing:1,documents:documents.slice(0,3),summary:readiness(documents.slice(0,3))});
  assert.deepEqual(posted,[{documentId:"pending",unfinishedOnly:true,workspaceId:"batch"}]);
  assert.deepEqual(await prepareSearch(scope,transport),{results:[],processing:1,documents:documents.slice(0,3),summary:readiness(documents.slice(0,3))});
  assert.equal(reads,4); assert.equal(posted.length,1);
  await assert.rejects(prepareSearch({...scope,documentIds:["other-batch"]},transport),/无法确认/);
  assert.equal(posted.length,1);
});

test("multi-document selection without a batch never falls back to an empty or whole-library POST", async () => {
  const posted: unknown[] = [];
  const transport: typeof fetch = async (_input,init) => {
    if (init?.method !== "POST") return Response.json({documents:[doc("a"),doc("b"),doc("outside")]});
    const body = JSON.parse(String(init.body)); posted.push(body);
    return Response.json({results:[{documentId:body.documentId,status:"ready",chunks:1}]});
  };
  assert.equal((await prepareSearch({documentIds:["a","b"]},transport)).results.length,2);
  assert.deepEqual(posted,[{documentId:"a",unfinishedOnly:true},{documentId:"b",unfinishedOnly:true}]);
  await assert.rejects(prepareSearch({documentIds:[]},transport),/未选择/);
  await assert.rejects(prepareSearch({documentIds:["unknown"]},transport),/无法确认/);
  assert.equal(posted.length,2);
});

test("batch and library preparation target only unfinished files, including failed replacements", async () => {
  const documents = [doc("ready",{status:"ready"}),doc("replacement",{status:"ready",buildStatus:"failed"}),doc("waiting",{buildStatus:"chunking"}),doc("other",{workspaceId:"elsewhere"})];
  const posted: string[] = [];
  const transport: typeof fetch = async (_input,init) => {
    if (init?.method !== "POST") return Response.json({documents});
    const {documentId} = JSON.parse(String(init.body)); posted.push(documentId);
    return Response.json({results:[{documentId,status:"failed",chunks:0}]});
  };
  const result = await prepareSearch({workspaceId:"batch"},transport);
  assert.deepEqual(posted,["replacement"]); assert.equal(result.results[0].status,"failed");
  posted.length=0;
  await prepareSearch({},transport);
  assert.deepEqual(posted,["replacement","other"]);
});

test("unavailable status, denied updates and missing results stop preparation without widening scope", async () => {
  let posts=0;
  await assert.rejects(prepareSearch({},async()=>new Response(null,{status:503})),/无法确认/);
  for (const response of [new Response(null,{status:404}),Response.json({results:[]})]) {
    const transport: typeof fetch = async (_input,init) => {
      if (init?.method !== "POST") return Response.json({documents:[doc("a"),doc("b")]});
      posts++;return response;
    };
    await assert.rejects(prepareSearch({documentIds:["a","b"]},transport),/未|无法/);
  }
  assert.equal(posts,2);
});

test("simultaneous preparation entries join work and re-read partial success", async () => {
  const documents = [doc("image", {status:"ready",fileType:"image",ocrStatus:"ready",visionStatus:"failed"}),doc("old",{status:"ready",buildStatus:"interrupted"}),doc("empty",{status:"ready",chunks:0}),doc("done",{status:"ready"})];
  let posts=0, release!:()=>void;
  const gate = new Promise<void>(resolve=>{release=resolve;});
  const transport: typeof fetch = async (_input,init) => {
    if(init?.method!=="POST")return Response.json({documents});
    posts++;await gate;
    return Response.json({results:[{documentId:JSON.parse(String(init.body)).documentId,status:"ready",chunks:1}]});
  };
  const a=prepareSearch({},transport),b=prepareSearch({},transport);
  await new Promise(resolve=>setTimeout(resolve,20));release();
  const results=await Promise.all([a,b]);
  assert.equal(posts,3); // only image, interrupted replacement and zero chunks
  for(const result of results) {
    assert.equal(result.documents[0].visionStatus,"failed");
    assert.equal(result.documents[1].buildStatus,"interrupted");
    assert.equal(result.documents[2].chunks,0); // never replace true state with POST metadata
  }
});
