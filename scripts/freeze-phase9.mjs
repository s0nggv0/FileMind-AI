import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
const baseline=JSON.parse(await readFile('docs/evaluation/phase8-algorithm-freeze.json','utf8'));
const git=(...args)=>execFileSync('git',args,{windowsHide:true,maxBuffer:100*1024*1024});
const digest=text=>createHash('sha256').update(text).digest('hex');
const files={};
for(const name of ['config','chunker','retrieval-router','query-analyzer','ranking','lexical-tokens','engine','portable-vector-store','vector-store','evidence-sufficiency','dashscope-provider','indexing']){
 const path=`src/lib/retrieval/${name}.ts`,bytes=await readFile(path),hash=createHash('sha256').update(bytes).digest('hex');
 const normalized=bytes.toString('utf8').replaceAll('\r\n','\n'),original=git('show',`${baseline.commit}:${path}`).toString('utf8').replaceAll('\r\n','\n');
 assert.equal(digest(normalized),digest(original),`Frozen retrieval changed: ${path}`);
 files[path]={sha256:hash,normalizedSha256:createHash('sha256').update(normalized).digest('hex'),phase8RecordedRawSha256:baseline.files[path],unchangedIgnoringLineEndings:true};
}
const blind={};for(const path of ['docs/evaluation/rag-blind-run1-results.json','docs/evaluation/rag-blind-run1.jsonl','docs/evaluation/rag-blind-run1-inputs.json','docs/evaluation/blind-protocol.md']){const bytes=await readFile(path);assert.equal(digest(bytes.toString('utf8').replaceAll('\r\n','\n')),digest(git('show',`9741755^:${path}`).toString('utf8').replaceAll('\r\n','\n')),`Blind Run #1 changed: ${path}`);blind[path]=createHash('sha256').update(bytes).digest('hex');}
const report={version:'phase9-candidate-freeze-v1',frozenAt:new Date().toISOString(),commit:git('rev-parse','HEAD').toString().trim(),policy:'Retrieval and UI freeze; subsequent bug/copy/responsive/accessibility fixes require separate reviewed commits. NOT READY does not certify online quality.',models:baseline.models,unchangedRetrievalFiles:files,immutableRun1Files:blind,uiStyle:'Existing FileMind visual system retained',realProviderAcceptance:'Failed or unrun gates retained; no further Kimi calls authorized'};
await writeFile('docs/evaluation/phase9-retrieval-freeze.json',JSON.stringify(report,null,2)+'\n');console.log('Twelve frozen retrieval files match Phase 8 baseline.');
