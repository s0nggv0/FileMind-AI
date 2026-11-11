import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtemp,readFile,rm,writeFile} from "node:fs/promises";
import {join,relative,isAbsolute} from "node:path";
import {tmpdir} from "node:os";
import {ApplicationLogSchema,applicationLog} from "../src/lib/reliability/application-log";
test("structured logs accept metadata only, rotate bounded files and tolerate storage failure",async()=>{
  const root=await mkdtemp(join(tmpdir(),"filemind-safe-log-"));
  try{
    const input={level:"warn" as const,event:"planner_completed" as const,request_id:crypto.randomUUID(),workspace_id:crypto.randomUUID(),operation_id:null,provider:"kimi" as const,error_code:"TIMEOUT" as const,duration:120};
    assert.equal(ApplicationLogSchema.safeParse({...input,timestamp:new Date().toISOString(),content:"PRIVATE BODY",apiKey:"SECRET"}).success,false);
    assert.equal(await applicationLog(input,root),true);
    const line=JSON.parse((await readFile(join(root,"application.jsonl"),"utf8")).trim());assert.equal(line.error_code,"TIMEOUT");assert.deepEqual(Object.keys(line).sort(),["duration","error_code","event","level","operation_id","provider","request_id","timestamp","workspace_id"].sort());
    await writeFile(join(root,"application.jsonl"),"x".repeat(1024*1024));assert.equal(await applicationLog(input,root),true);assert.equal((await readFile(join(root,"application.1.jsonl"))).length,1024*1024);
    const blocker=join(root,"blocker");await writeFile(blocker,"not a directory");assert.equal(await applicationLog(input,join(blocker,"logs")),false);
  }finally{const rel=relative(tmpdir(),root);assert.ok(rel&&!rel.startsWith("..")&&!isAbsolute(rel));await rm(root,{recursive:true,force:true});}
});
