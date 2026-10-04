import {test} from "node:test";
import assert from "node:assert/strict";
import {AnswerVerifier,AnswerVerificationError,numericEvidenceSupported,answerUnits} from "../src/lib/retrieval/answer-verifier";
import {buildRAGContext,generateGroundedAnswer,RAGAnswerSchema,RAGDraftSchema,composeRAGDraft,NO_ANSWER,type RAGSource} from "../src/lib/retrieval/rag";
import type {AIProvider} from "../src/lib/ai/provider";
import {verifierFixtureResponse,draftFixture} from "./helpers/verifier-fixture";
const userId=crypto.randomUUID(),workspaceId=crypto.randomUUID();
function source(content="Retention is 360 minutes.",number=1):RAGSource {return {sourceId:`S${number}`,location:"L1",id:crypto.randomUUID(),documentId:crypto.randomUUID(),userId,workspaceId,chunkIndex:0,content,contentHash:"fixture",chunkVersion:"chunk-v1",tokenEstimate:10,pageStart:null,pageEnd:null,lineStart:1,lineEnd:1,paragraphStart:null,paragraphEnd:null,headingPath:[],charStart:0,charEnd:content.length,documentName:`fixture-${number}.txt`,fileType:"txt",summary:"",tags:[],score:0.9};}
function answer(text:string,sources:RAGSource[]) {return RAGAnswerSchema.parse({answer:text,citations:sources.map(s=>({sourceId:s.sourceId,documentId:s.documentId,chunkId:s.id})),confidence:"high",insufficientEvidence:false});}
function provider(transform?:(task:string,result:unknown)=>unknown) {
  return {name:"judge-fixture",models:{main:"fixture",small:"fixture"},generateObject:async(input:{prompt:string})=> {const result=verifierFixtureResponse(input.prompt);return {object:transform?transform(JSON.parse(input.prompt).task,result):result,usage:{promptTokens:0,completionTokens:0,totalTokens:0}};}} as unknown as AIProvider;
}
test("statement provenance composes matching citations without trusting model UUIDs or inline marker placement",()=>{
  const sources=[source("Retention is 6 hours."),source("Retention is 12 hours.",2)];
  const draft=RAGDraftSchema.parse({statements:[{text:"Old retention is 6 hours.\nThe old policy remains visible.",sourceIds:["S1"]},{text:"New retention is 12 hours.",sourceIds:["S2"]}],confidence:"high",insufficientEvidence:false,evidenceDecision:{supported:true,missingInformation:[]}});
  const composed=composeRAGDraft(draft,sources);
  assert.deepEqual(answerUnits(composed.answer).map(u=>u.citedSourceIds),[["S1"],["S1"],["S2"]]);
  assert.equal(composed.citations[1].chunkId,sources[1].id);
  assert.throws(()=>composeRAGDraft({...draft,statements:[{text:"Foreign fact",sourceIds:["S99"]}]},sources),/OUTSIDE_CONTEXT/);
  assert.equal(RAGDraftSchema.safeParse({...draft,statements:[{text:"Injected [S1]",sourceIds:["S2"]}]}).success,false);
});
test("semantic verification requires full cited support and numerical equivalence; a judge cannot approve invented quantities",async()=> {
  const s=source(),verify=new AnswerVerifier(provider());
  assert.equal(numericEvidenceSupported("6 hours [S1]",[s.content]),true);
  assert.equal(numericEvidenceSupported("6 小時 [S1]",[s.content]),true);
  assert.equal(numericEvidenceSupported("72 小時 [S1]",[s.content]),false);
  assert.equal(numericEvidenceSupported("0.18 mm",["Slit width 0.00018 m"]),true);
  assert.equal(numericEvidenceSupported("3. Retention is 6 hours.",["The prior 6-hour statement remains visible."]),true);
  assert.equal(numericEvidenceSupported("2. Retention is 72 hours.",["The prior 6-hour statement remains visible."]),false);
  assert.equal(numericEvidenceSupported("72 hours [S1]",[s.content]),false);
  assert.deepEqual(answerUnits("保留 6 小时。[S1]\n来源已经核对。[S2]").map(u=>u.citedSourceIds),[["S1"],["S2"]]);
  assert.equal(answerUnits("**相关资料：**\nRetention is 6 hours [S1].").length,1);
  const quoted=answerUnits('Query 的含义是“我找什么？”[S1]，Key 的含义是"What can I match?"。[S2]');
  assert.equal(quoted.length,1);assert.deepEqual(quoted[0].citedSourceIds,["S1","S2"]);
  const supported=await verify.verify("Retention?",answer("Retention is 6 hours [S1].",[s]),[s],new AbortController().signal);
  assert.equal(supported.accepted,true);assert.equal(supported.completeness,1);assert.equal(supported.faithfulness,1);
  const fabricated=await verify.verify("Retention?",answer("Retention is 72 hours [S1].",[s]),[s],new AbortController().signal);
  assert.equal(fabricated.accepted,false);assert.equal(fabricated.reason,"UNSUPPORTED_CLAIM");
  const uncited=await verify.verify("Retention?",answer("Retention is 6 hours.",[s]),[s],new AbortController().signal);
  assert.equal(uncited.accepted,false);assert.equal(uncited.reason,"UNCITED_CLAIM");
});
test("claim coverage, schema, context bounds, long answers and omitted facts fail closed",async()=> {
  const s=source(),a=answer("Retention is 6 hours [S1].\nRetention applies to temporary records [S1].",[s]);
  const omitted=provider((task,result)=>task==="extract_atomic_claims"?{claims:[{unitId:"U1",text:"Retention is 6 hours"}]}:result);
  await assert.rejects(new AnswerVerifier(omitted).verify("Retention?",a,[s],new AbortController().signal),error=>error instanceof AnswerVerificationError && error.code==="INCOMPLETE_CLAIM_COVERAGE");
  const incomplete=provider((task,result)=>{if(task!=="check_evidence_support")return result;const r=result as {unitCoverage:{allFactsCovered:boolean;missingFacts:string[]}[]};r.unitCoverage[0].allFactsCovered=false;r.unitCoverage[0].missingFacts=["A qualifier was omitted"];return r;});
  const report=await new AnswerVerifier(incomplete).verify("Retention?",a,[s],new AbortController().signal);assert.equal(report.accepted,false);assert.equal(report.reason,"OMITTED_CLAIMS");assert.equal(report.completeness,null);
  const outside=provider((task,result)=>{if(task!=="check_evidence_support")return result;const r=result as {claims:{supportingSourceIds:string[]}[]};r.claims[0].supportingSourceIds=["S99"];return r;});
  await assert.rejects(new AnswerVerifier(outside).verify("Retention?",a,[s],new AbortController().signal),/OUTSIDE_VERIFIER_CONTEXT/);
  assert.throws(()=>answerUnits("Fact [S1].\n".repeat(81)),/CLAIM_LIMIT/);
});
test("conflict checks inspect uncited sources and require both citations and an explicit disclosure",async()=> {
  const sources=[source("Retention is 6 hours."),source("Retention is 12 hours.",2)];let sawAll=false;
  const p={name:"judge-fixture",models:{main:"fixture",small:"fixture"},generateObject:async(input:{prompt:string})=>{
    const data=JSON.parse(input.prompt),base=verifierFixtureResponse(input.prompt);
    if(data.task!=="check_evidence_support")return {object:base,usage:{promptTokens:0,completionTokens:0,totalTokens:0}};
    sawAll=data.untrustedSources.length===2;
    return {object:{...base as object,claims:data.atomicClaims.map((c:{claimId:string;text:string})=>({claimId:c.claimId,status:"supported",supportingSourceIds:[c.text.includes("12")?"S2":"S1"],contradictingSourceIds:[]})),conflicts:[{topic:"Retention versions disagree",sourceIds:["S1","S2"],disclosed:data.untrustedAnswer.includes("conflict"),versionRelationship:"unresolved"}]},usage:{promptTokens:0,completionTokens:0,totalTokens:0}};
  }} as unknown as AIProvider;
  const unilateral=await new AnswerVerifier(p).verify("Retention?",answer("Retention is 6 hours [S1].",[sources[0]]),sources,new AbortController().signal);assert.equal(sawAll,true);assert.equal(unilateral.accepted,false);assert.equal(unilateral.reason,"UNDISCLOSED_CONFLICT");
  const disclosed=await new AnswerVerifier(p).verify("Retention?",answer("The sources conflict: one reports 6 hours [S1], the other 12 hours [S2].",sources),sources,new AbortController().signal);
  assert.equal(disclosed.accepted,false,"All quantities in a compound unit must be supported by its claimed sources");
  const separate=await new AnswerVerifier(p).verify("Retention?",answer("The sources conflict: one reports 6 hours [S1].\nThe other reports 12 hours [S2].",sources),sources,new AbortController().signal);assert.equal(separate.accepted,true);
});
test("fact and citation repairs share one budget; judge outage is unavailable and no streaming draft escapes",async()=> {
  const s=source(),context=buildRAGContext([s]);let answers=0,streams=0;
  const p={...provider(),generateObject:async(input:{prompt:string})=> {const v=verifierFixtureResponse(input.prompt);if(v)return {object:v,usage:{promptTokens:0,completionTokens:0,totalTokens:0}};answers++;if(answers===2){const feedback=JSON.parse(input.prompt).untrustedRepairFeedback;assert.match(feedback.priorAnswer,/72 hours/);assert.equal(feedback.failedClaims[0].numericSupport,false);}return {object:draftFixture(answer(`Retention is ${answers===1?72:6} hours [S1].`,context.sources)),usage:{promptTokens:0,completionTokens:0,totalTokens:0}};},generateObjectStream:async()=>{streams++;throw new Error("Raw draft escaped");}} as unknown as AIProvider;
  const phases:string[]=[];
  const result=await generateGroundedAnswer("Retention?",[s],{userId},p,async()=>s,new AbortController().signal,t=>phases.push(t));
  assert.equal(answers,2);assert.equal(streams,0);assert.equal(result.unavailable,false);assert.equal(result.verification?.accepted,true);assert.equal(result.verificationAttempts?.length,2);
  assert.ok(phases.includes("Checking claims and conflicting sources"));
  answers=0;const bad={...p,generateObject:async(input:{prompt:string})=>{const v=verifierFixtureResponse(input.prompt);if(v)return {object:v,usage:{promptTokens:0,completionTokens:0,totalTokens:0}};answers++;return {object:draftFixture(answer("Retention is 72 hours [S1].",context.sources)),usage:{promptTokens:0,completionTokens:0,totalTokens:0}};}} as AIProvider;
  const refused=await generateGroundedAnswer("Retention?",[s],{userId},bad,async()=>s,new AbortController().signal);assert.equal(answers,2);assert.equal(refused.answer?.answer,NO_ANSWER);assert.equal(refused.unavailable,false);
  answers=0;const mixed={...p,generateObject:async(input:{prompt:string})=>{const v=verifierFixtureResponse(input.prompt);if(v)return {object:v,usage:{promptTokens:0,completionTokens:0,totalTokens:0}};answers++;return {object:draftFixture(answer(answers===1?"Retention is 6 hours.":"Retention is 72 hours [S1].",context.sources)),usage:{promptTokens:0,completionTokens:0,totalTokens:0}};}} as AIProvider;
  const shared=await generateGroundedAnswer("Retention?",[s],{userId},mixed,async()=>s,new AbortController().signal);assert.equal(answers,2,"A citation repair must consume the same single regeneration budget as a fact repair");assert.equal(shared.answer?.answer,NO_ANSWER);
  const outage={...p,generateObject:async(input:{prompt:string})=>{if(JSON.parse(input.prompt).task)throw new Error("Judge network unavailable");return {object:draftFixture(answer("Retention is 6 hours [S1].",context.sources)),usage:{promptTokens:0,completionTokens:0,totalTokens:0}};}} as AIProvider;
  const unavailable=await generateGroundedAnswer("Retention?",[s],{userId},outage,async()=>s,new AbortController().signal);assert.equal(unavailable.unavailable,true);assert.equal(unavailable.answer,null);assert.equal(unavailable.sources.length,1);
});
