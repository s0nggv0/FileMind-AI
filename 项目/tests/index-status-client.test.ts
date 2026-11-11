import { test } from "node:test";
import assert from "node:assert/strict";
import { IndexStatusClient, type StatusRuntime } from "../src/lib/retrieval/index-status-client";
import { readiness } from "../src/lib/retrieval/readiness";
const doc={id:"one",name:"one",status:"ready",chunks:1};
const page=(processing=false)=>{const documents=[{...doc,...(processing?{buildStatus:"embedding"}:{})}];return {documents,summary:readiness(documents),nextCursor:null};};
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
function runtime(){
  let visible=true,sequence=0;
  const timers=new Map<number,()=>void>(),events=new Set<()=>void>(),delays:number[]=[];
  const environment:StatusRuntime={visible:()=>visible,listen:fn=>{events.add(fn);return()=>{events.delete(fn);};},schedule:(fn,delay)=>{delays.push(delay);timers.set(++sequence,fn);return sequence as unknown as ReturnType<typeof setTimeout>;},cancel:id=>{timers.delete(id as unknown as number);}};
  return {environment,timers,delays,visibility:(next:boolean)=>{visible=next;for(const event of events)event();},poll:()=>{for(const [id,fn]of timers){timers.delete(id);fn();}}};
}
test("same scope shares reads, active work alone polls, hidden pages pause, and visibility refreshes stable status",async()=>{
  const r=runtime();let reads=0,processing=true,notifications=0;
  const client=new IndexStatusClient(async()=>{reads++;return Response.json(page(processing));},r.environment);
  const a=client.entry({documentIds:["one","two"]}),b=client.entry({documentIds:["two","one"]});assert.equal(a,b);
  const stopA=a.subscribe(()=>{notifications++;}),stopB=b.subscribe(()=>{notifications++;});
  await tick();assert.equal(reads,1);assert.equal(r.timers.size,1);
  r.visibility(false);assert.equal(r.timers.size,0);r.poll();await tick();assert.equal(reads,1);
  r.visibility(true);await tick();assert.equal(reads,2);
  processing=false;r.poll();await tick();assert.equal(reads,3);assert.equal(r.timers.size,0);
  r.visibility(false);r.visibility(true);await tick();assert.equal(reads,4);assert.equal(r.timers.size,0);
  assert.ok(notifications>=6);stopA();stopB();assert.equal(r.timers.size,0);
});
test("out of order, aborted and unmounted reads cannot overwrite a new snapshot; errors back off and recover",async()=>{
  const r=runtime();const responses:((response:Response)=>void)[]=[];
  const client=new IndexStatusClient(async()=>new Promise(resolve=>responses.push(resolve)),r.environment);
  const entry=client.entry({});let changes=0;const stop=entry.subscribe(()=>{changes++;});
  const old=entry.refresh();r.visibility(false);r.visibility(true);
  responses[1](Response.json(page(false)));await tick();assert.equal(entry.getSnapshot().data?.summary.processing,0);
  responses[0](Response.json(page(true)));await assert.rejects(old,{name:"AbortError"});assert.equal(entry.getSnapshot().data?.summary.processing,0);
  const failed=entry.refresh();responses[2](new Response(null,{status:503}));await assert.rejects(failed);assert.equal(r.delays.at(-1),8000);
  r.poll();responses[3](Response.json(page(false)));await tick();assert.equal(entry.getSnapshot().error,"");assert.equal(r.timers.size,0);
  const pending=entry.refresh();const before=changes;stop();responses[4](Response.json(page(true)));await assert.rejects(pending,{name:"AbortError"});assert.equal(changes,before);assert.equal(entry.getSnapshot().data,null);
});
