// Explicit semantic judge fixture for transport-independent unit tests. Real
// provider verification is separately exercised by the live acceptance suite.
export function draftFixture(answer:{answer:string;confidence:string;insufficientEvidence:boolean}) {
  return {statements:[{text:answer.answer.replace(/\[S\d+\]/g,"").trim(),sourceIds:[...new Set([...answer.answer.matchAll(/\[S\d+\]/g)].map(m=>m[0].slice(1,-1)))]}],confidence:answer.confidence,insufficientEvidence:answer.insufficientEvidence,evidenceDecision:{supported:!answer.insufficientEvidence,missingInformation:[]}};
}
export function verifierFixtureResponse(prompt:string):unknown|undefined {
  const input=JSON.parse(prompt);
  if(input.task==="extract_atomic_claims")return {claims:input.untrustedAnswerUnits.map((u:{id:string;text:string})=>({unitId:u.id,text:u.text.replace(/\[S\d+\]/g,"").trim()}))};
  if(input.task==="check_evidence_support")return {unitCoverage:input.untrustedAnswerUnits.map((u:{id:string})=>({unitId:u.id,allFactsCovered:true,missingFacts:[]})),claims:input.atomicClaims.map((c:{claimId:string})=>({claimId:c.claimId,status:"supported",supportingSourceIds:[input.untrustedSources[0].sourceId],contradictingSourceIds:[]})),conflicts:[]};
}
