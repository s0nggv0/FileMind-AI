import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { generateGroundedAnswer, buildRAGContext } from "../src/lib/retrieval/rag";
import { validateAnswerContext, emptyAnswerContext, type AnswerContext } from "../src/lib/retrieval/answer-context";
import { numericEvidenceSupported } from "../src/lib/retrieval/answer-verifier";
import type { AIProvider } from "../src/lib/ai/provider";
import type { Evidence } from "../src/lib/retrieval/types";
const userId=randomUUID(), workspaceId=randomUUID();
function evidence(content:string, i:number):Evidence { return { id:randomUUID(),documentId:randomUUID(),userId,workspaceId,chunkIndex:0,content,contentHash:content,chunkVersion:"chunk-v1",tokenEstimate:20,pageStart:null,pageEnd:null,lineStart:1,lineEnd:1,paragraphStart:null,paragraphEnd:null,headingPath:[],charStart:0,charEnd:content.length,documentName:`source-${i}.txt`,fileType:"txt",summary:"",tags:[],score:0.9,semanticScore:0.9 }; }
const usage={promptTokens:0,completionTokens:0,totalTokens:0};
function scripted(context:AnswerContext, firstRefusal=false):AIProvider {
  let generations=0;
  return {name:"scripted-semantic-laboratory",models:{main:"fixture",small:"fixture"},async generateObject(input:{prompt:string}) {
    const p=JSON.parse(input.prompt);
    if(p.task==="verify_answer_context")return {object:context,usage};
    if(p.task==="extract_atomic_claims")return {object:{claims:p.untrustedAnswerUnits.map((u:{id:string;text:string})=>({unitId:u.id,text:u.text.replace(/\[S\d+\]/g,"").trim()}))},usage};
    if(p.task==="check_evidence_support")return {object:{unitCoverage:p.untrustedAnswerUnits.map((u:{id:string})=>({unitId:u.id,allFactsCovered:true,missingFacts:[]})),claims:p.atomicClaims.map((c:{claimId:string;text:string})=>({claimId:c.claimId,status:"supported",supportingSourceIds:p.untrustedSources.filter((s:{content:string})=>s.content.includes(c.text)).map((s:{sourceId:string})=>s.sourceId),contradictingSourceIds:[]})),conflicts:context.conflicts.map(c=>({topic:c.topic,sourceIds:c.values.map(v=>v.sourceId),versionRelationship:c.versionRelationship,disclosed:true}))},usage};
    generations++;
    if(firstRefusal&&generations===1)return {object:{statements:[],confidence:"low",insufficientEvidence:true,evidenceDecision:{supported:false,missingInformation:["Which value is correct?"]}},usage};
    return {object:{statements:p.evidence.untrustedSources.map((s:{content:string;sourceId:string})=>({text:s.content,sourceIds:[s.sourceId]})),confidence:"high",insufficientEvidence:false,evidenceDecision:{supported:true,missingInformation:[]}},usage};
  }} as unknown as AIProvider;
}
export const conflictCases=[
  ["项目截止日期是什么？","Orion deadline is June 10.","Orion deadline is June 15.","June 10","June 15"],
  ["When is the Orion deadline?","Orion deadline is June 10.","Orion deadline is June 15.","June 10","June 15"],
  ["比较政策的保留期。","Policy edition 2028-01 specifies retention is 3 hours.","Policy edition 2028-03 specifies retention is 8 hours.","3 hours","8 hours"],
  ["Compare policy versions.","Retention is 3 hours.","Retention is 8 hours. This clause explicitly replaces the prior retention clause.","3 hours","8 hours"],
  ["传感器偏移量是多少？","Sensor offset is 0.21 mm.","Sensor offset is 0.34 mm.","0.21 mm","0.34 mm"],
  ["What sensor offset do the reports give?","Sensor offset is 0.21 mm.","Sensor offset is 0.34 mm.","0.21 mm","0.34 mm"],
  ["课程学分是多少？","Course credit requirement is 3 credits.","Course credit requirement is 4 credits.","3 credits","4 credits"],
  ["How many credits are required?","Course credit requirement is 3 credits.","Course credit requirement is 4 credits.","3 credits","4 credits"],
  ["项目预算多少？","Project budget is 2000 yuan.","Project budget is 2400 yuan.","2000 yuan","2400 yuan"],
  ["What is the retry limit?","Retry limit is 2 attempts.","Retry limit is 5 attempts.","2 attempts","5 attempts"],
];
export const ambiguousQueries=["那个项目什么时候截止？","When is that project due?","那门课需要多少学分？","How many credits does that course require?","那个实验偏移量多少？","What is the offset in that experiment?","这个项目预算多少？","What is the budget for the project?","那个政策保留多久？","How long does that policy retain records?"];
for(const [i,c] of conflictCases.entries())test(`Phase 9 conflict ${i+1}: ${c[0]}`,async()=>{
  const sources=[evidence(c[1],1),evidence(c[2],2)];
  const context:AnswerContext={clarification:emptyAnswerContext.clarification,conflicts:[{topic:"Reported values",versionRelationship:i===3?"explicit_superseded":"unresolved",values:[{sourceId:"S1",value:c[3],quote:c[1]},{sourceId:"S2",value:c[4],quote:c[2]}]}]};
  const result=await generateGroundedAnswer(c[0],sources,{userId},scripted(context,i===0),async(_scope,id)=>sources.find(s=>s.id===id)??null,AbortSignal.timeout(1000));
  assert.equal(result.unavailable,false);assert.equal(result.answer?.answerState,"conflicting");assert.equal(result.answer?.insufficientEvidence,false);assert.equal(result.answer?.conflict?.detected,true);assert.equal(result.answer?.citations.length,2);assert.deepEqual(result.answer?.conflict?.claims[0].values,[c[3],c[4]]);assert.equal(result.verification?.accepted,true);
});
for(const [i,query] of ambiguousQueries.entries())test(`Phase 9 ambiguity ${i+1}: ${query}`,async()=>{
  const sources=[evidence("AI Competition deadline is June 10.",1),evidence("Database Course Project deadline is June 15.",2),evidence("Research Proposal deadline is June 20.",3)];
  const context:AnswerContext={clarification:{required:true,question:"Which project do you mean?",options:sources.map((s,j)=>({label:s.content.split(" deadline")[0],sourceIds:[`S${j+1}`]}))},conflicts:[]};
  const result=await generateGroundedAnswer(query,sources,{userId},scripted(context),async(_scope,id)=>sources.find(s=>s.id===id)??null,AbortSignal.timeout(1000));
  assert.equal(result.answer?.answerState,"needs_clarification");assert.equal(result.answer?.insufficientEvidence,false);assert.equal(result.answer?.clarification?.options?.length,3);assert.equal(result.answer?.citations.length,0);assert.deepEqual(result.answer?.clarification?.options?.[0].documentIds,[sources[0].documentId]);
  const resolved=await generateGroundedAnswer(`${query} Selected subject: AI Competition`,[sources[0]],{userId},scripted(emptyAnswerContext),async()=>sources[0],AbortSignal.timeout(1000));assert.equal(resolved.answer?.answerState,"answered");assert.equal(resolved.answer?.citations.length,1);
});
test("untrusted metadata, foreign options and stale clarification sources fail closed",async()=>{
  const sources=buildRAGContext([evidence("Deadline June 10.",1),evidence("Deadline June 15.",2)]).sources;
  assert.throws(()=>validateAnswerContext({clarification:{required:true,question:"Which?",options:[{label:"A",sourceIds:["S1"]},{label:"B",sourceIds:["S99"]}]},conflicts:[]},sources),/INVALID_CLARIFICATION/);
  assert.throws(()=>validateAnswerContext({clarification:emptyAnswerContext.clarification,conflicts:[{topic:"Date",versionRelationship:"unresolved",values:[{sourceId:"S1",value:"June 11",quote:"Deadline June 11."},{sourceId:"S2",value:"June 15",quote:"Deadline June 15."}]}]},sources),/INVALID_CONFLICT/);
  const context:AnswerContext={clarification:{required:true,question:"Which?",options:[{label:"A",sourceIds:["S1"]},{label:"B",sourceIds:["S2"]}]},conflicts:[]};
  const r=await generateGroundedAnswer("Which deadline?",sources,{userId},scripted(context),async()=>null,AbortSignal.timeout(1000));assert.equal(r.unavailable,true);assert.equal(r.answer,null);
});
test("date followed by English words cannot be parsed as an s/h/m unit",()=>{
  assert.equal(numericEvidenceSupported("Edition 2028-01 specifies retention is 3 hours.",["Edition 2028-01. Records last 3 hours."]),true);
  assert.equal(numericEvidenceSupported("Edition 2028-01 remains available.",["Edition 2028-01 is archived."]),true);
  assert.equal(numericEvidenceSupported("Retention is 72 hours.",["Retention is 3 hours."]),false);
});
test("specific short queries and complementary sources stay answered in a non-ambiguous context",async()=>{
  const sources=[evidence("Query represents the current token.",1),evidence("Key represents matching information.",2)];
  const r=await generateGroundedAnswer("Query?",sources,{userId},scripted(emptyAnswerContext),async(_s,id)=>sources.find(s=>s.id===id)??null,AbortSignal.timeout(1000));assert.equal(r.answer?.answerState,"answered");assert.equal(r.answer?.clarification?.required,false);
});
