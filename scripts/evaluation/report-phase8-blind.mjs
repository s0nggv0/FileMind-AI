// Post-run reporting only. No provider calls, gold rewrites or release tuning.
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const directory="docs/evaluation/",read=async name=>JSON.parse(await readFile(directory+name,"utf8"));
const hash=bytes=>createHash("sha256").update(bytes).digest("hex"),countBy=values=>Object.fromEntries([...new Set(values)].map(value=>[value,values.filter(v=>v===value).length]));
const report=await read("rag-blind-run1-results.json");
assert.equal(report.completed,true);assert.equal(report.completedQueries,180);
const ledgerBytes=await readFile(directory+"rag-blind-run1.jsonl"),ledger=ledgerBytes.toString().trim().split("\n").map(JSON.parse);
const rows=ledger.filter(r=>r.type==="query"),inputs=ledger.filter(r=>r.type==="document_input");
const queries=JSON.parse(await readFile("tests/fixtures/rag-blind/queries.json","utf8"));
assert.equal(ledger.filter(r=>r.type==="start").length,1);assert.equal(ledger.filter(r=>r.type==="finish").length,1);
assert.equal(rows.length,180);assert.equal(inputs.length,90);
const {type:finishType,...finish}=ledger.at(-1);assert.equal(finishType,"finish");assert.deepEqual(finish,report);
for(let i=0;i<queries.length;i++)for(const key of Object.keys(queries[i]))assert.deepEqual(rows[i][key],queries[i][key],`${rows[i].id} ${key}`);
assert.deepEqual(inputs.map(row=>{const input={...row};delete input.type;return input;}),await read("rag-blind-run1-inputs.json"));
const freeze=await read("phase8-algorithm-freeze.json");
for(const [path,digest] of Object.entries(freeze.files))assert.equal(hash((await readFile(path,"utf8")).replace(/\r\n/g,"\n")),digest,path);
const relevant=rows.filter(r=>r.expected.length),imageRows=rows.filter(r=>r.imageOnly),answerable=rows.filter(r=>r.answerability==="answerable"||r.answerability==="conflict"),noAnswer=rows.filter(r=>r.answerability==="no-answer");
assert.equal(answerable.length,136);assert.equal(noAnswer.length,36);assert.equal(imageRows.length,37);
for(const mode of ["vector","lexical","alwaysHybrid","adaptive"])for(const metric of ["hitAt1","hitAt5","mrr","recallAt10","ndcgAt10"]){
 const recomputed=relevant.reduce((sum,r)=>sum+(r.metrics?.[mode]?.[metric]??0),0)/relevant.length;
 assert.ok(Math.abs(recomputed-report.metrics.retrieval[mode][metric])<1e-12,`${mode}/${metric}`);
}
const citeNames=r=>[...new Set((r.grounded?.answer?.citations??[]).map(c=>r.grounded.sources.find(s=>s.id===c.chunkId)?.documentName).filter(Boolean))];
const detail=r=>({id:r.id,kind:r.kind,answerability:r.answerability,outcome:r.outcome,expected:r.expected,runtimeUnavailable:r.grounded?.unavailable??null,runtimeErrorCode:r.grounded?.errorCode??r.errorCode??null,goldJudgeUnavailable:r.goldJudgeUnavailable??false,repaired:r.grounded?.repaired??false,runtimeAccepted:r.grounded?.verification?.accepted??null,expectedSourcesCited:r.sourceSetCovered??false,citedDocuments:citeNames(r),runtimeConflictCount:r.grounded?.verification?.conflicts.length??0,assessment:r.grounded?.assessment??null});
const attempts=rows.flatMap(r=>(r.grounded?.verificationAttempts??[]).map(attempt=>({queryId:r.id,...attempt}))),claims=attempts.flatMap(a=>a.claims);
const attacks=rows.filter(r=>r.kind==="prompt-injection"||r.kind==="image-injection");
const images=inputs.filter(i=>i.imageAnalysis);
const analysis={version:"phase8-post-run-audit-v1",checkedAt:new Date().toISOString(),source:"immutable formal Run #1",noProviderCalls:true,denominators:{allQueries:180,retrievalRelevance:relevant.length,answerableAndConflict:answerable.length,noAnswer:noAnswer.length,multimodal:imageRows.length,ambiguous:8,conflict:8},outcomes:countBy(rows.map(r=>r.outcome)),routes:countBy(rows.map(r=>r.route?.strategy??"unavailable")),queryKinds:countBy(rows.map(r=>r.kind)),documentInputs:{total:inputs.length,parseFailures:inputs.filter(i=>i.parseError).map(i=>i.name),images:images.length,visionStates:countBy(images.map(i=>i.imageAnalysis.visionStatus)),ocrStates:countBy(images.map(i=>i.imageAnalysis.ocrStatus))},indexing:{documents:report.indexing.length,states:countBy(report.indexing.map(i=>i.status)),chunks:report.indexing.reduce((sum,i)=>sum+i.chunks,0),embedded:report.indexing.reduce((sum,i)=>sum+i.embedded,0),cached:report.indexing.reduce((sum,i)=>sum+i.cached,0)},verification:{attempts:attempts.length,rejectedAttempts:attempts.filter(a=>!a.accepted).length,rejectionReasons:countBy(attempts.filter(a=>!a.accepted).map(a=>a.reason??"unspecified")),allAttemptClaims:claims.length,allAttemptClaimStates:countBy(claims.map(c=>c.status)),numericGuardFailures:claims.filter(c=>!c.numericSupport).length,uncitedClaimFailures:claims.filter(c=>!c.cited).length,repairedQueries:rows.filter(r=>r.grounded?.repaired).length,postGateReleasedAnswers:report.metrics.releasedAnswers,postGateReleasedClaims:report.metrics.releasedClaims},unavailable:{total:report.metrics.unavailable,runtime:rows.filter(r=>r.grounded?.unavailable).length,goldJudge:rows.filter(r=>r.goldJudgeUnavailable).length,outerEvaluation:rows.filter(r=>r.errorCode).length,details:rows.filter(r=>r.outcome==="Unavailable").map(detail),limitation:"The frozen gold-judge catch does not persist a specific transport/schema/fact-count cause; do not attribute these rows to an actual provider outage."},nonSuccessful:rows.filter(r=>!["Correct Answer","Correct Refusal","Conflicting Evidence Correctly Detected","Ambiguous Query Clarification"].includes(r.outcome)).map(detail),conflicts:rows.filter(r=>r.answerability==="conflict").map(detail),ambiguous:rows.filter(r=>r.answerability==="ambiguous").map(detail),injection:{queries:attacks.length,correct:attacks.filter(r=>r.outcome==="Correct Answer").length,details:attacks.map(r=>({...detail(r),answer:r.grounded?.answer?.answer??null})),toolBoundary:"RAG and Vision are read-only provider calls with no export/delete/shell tools. These three synthetic tests do not prove arbitrary-agent resistance."},hashes:{ledger:hash(ledgerBytes),results:hash(await readFile(directory+"rag-blind-run1-results.json")),inputs:hash(await readFile(directory+"rag-blind-run1-inputs.json")),algorithmFreezeNormalizedLF:hash((await readFile(directory+"phase8-algorithm-freeze.json","utf8")).replace(/\r\n/g,"\n")),corpusFreeze:hash(await readFile("tests/fixtures/rag-blind/freeze.json"))}};
// Never emit or publish actual environment values. Verify configured secrets are
// absent from the synthetic public ledgers before reporting them.
const env=await readFile(".env.local","utf8"),publicBytes=(await Promise.all(["rag-blind-run1.jsonl","rag-blind-run1-results.json","rag-blind-run1-inputs.json"].map(name=>readFile(directory+name,"utf8")))).join("\n");
for(const line of env.split(/\r?\n/))if(/^(KIMI_API_KEY|EMBEDDING_API_KEY|DASHSCOPE_API_KEY|WORKSPACE_SESSION_SECRET)=/.test(line)){
 const value=line.slice(line.indexOf("=")+1).replace(/^['"]|['"]$/g,"").trim();if(value.length>=12)assert.equal(publicBytes.includes(value),false,"Public report must not contain a configured secret");
}
const m=report.metrics,pct=n=>n===null?"不可用":`${(100*n).toFixed(2)}%`,decimal=n=>n.toFixed(4);
const retrievalTable=Object.entries(m.retrieval).map(([mode,v])=>`| ${mode} | ${decimal(v.hitAt1)} | ${decimal(v.hitAt5)} | ${decimal(v.mrr)} | ${decimal(v.recallAt10)} | ${decimal(v.ndcgAt10)} |`).join("\n");
const labels=["Correct Answer","Correct Refusal","Incorrect Answer","False Refusal","Conflicting Evidence Correctly Detected","Ambiguous Query Clarification","Unavailable"];
const matrix=Object.entries(report.matrix).map(([expected,value])=>`| ${expected} | ${labels.map(label=>value[label]).join(" | ")} |`).join("\n");
const latencies=Object.entries(report.latency).map(([name,v])=>`| ${name} | ${v.samples} | ${v.p50===null?"不可用":v.p50.toFixed(2)} | ${v.p95===null?"不可用":v.p95.toFixed(2)} |`).join("\n");
const failureInfo=r=>r.runtimeErrorCode??(r.goldJudgeUnavailable?"gold judge unavailable":r.outcome==="False Refusal"?"runtime insufficient-evidence decision":"gold correctness / conflict check");
const failureTable=analysis.nonSuccessful.map(r=>`| ${r.id} | ${r.kind} | ${r.outcome} | ${failureInfo(r)} |`).join("\n")||"| 无 | — | — | — |";
const text=`# FileMind AI 最终评测汇总：Phase 5–8

Phase 8 首轮完成 ${report.completedQueries}/180 题，90 份原创合成资料，包括 18 张图片、9 份 tricky 资料；136 道可回答/冲突题、36 道无答案题（20%）、8 道歧义题。生产代码及协议 231 个文件在新语料创建前冻结，未按首轮结果调参，也没有第二轮择优。原始 [Run #1](rag-blind-run1-results.json)、[逐题 ledger](rag-blind-run1.jsonl)、[首次解析/OCR/Vision 输入](rag-blind-run1-inputs.json) 和 [事后只读审计](phase8-blind-analysis.json) 全部保留。

## 结果沿革

| 阶段 | 资料 / 问题 | 主要检索结果 Hit@1 / Hit@5 / MRR | 无答案 | 解释 |
| --- | --- | --- | --- | --- |
| Phase 5 | 10 / 25 | Vector/Lexical/Hybrid 均 1 / 1 / 1 | 3/3 | 仅 22 道有来源题；只验证 1 次有答案生成的 citation，样本容易。 |
| Phase 6 | 72 / 144 | Vector .9417 / .9917 / .9641；Hybrid RRF .7333 / .9750 / .8181；加 rerank .7000 / .9750 / .8001 | 22/24 | 36 个排名失败案例保留；图片回答 12/12、返回引用 19/19，均不等于逐句事实审计。 |
| Phase 7 | 50 / 100 | Adaptive .9674 / 1 / .9837；Always Hybrid .9674 / 1 / .9819 | 8/8 | 独立新内容，但仍为短合成资料；每种策略只做 8 图片 + 8 无答案生成。 |
| Phase 8 Run #1 | 90 / 180 | Adaptive ${decimal(m.retrieval.adaptive.hitAt1)} / ${decimal(m.retrieval.adaptive.hitAt5)} / ${decimal(m.retrieval.adaptive.mrr)} | ${report.matrix["no-answer"]["Correct Refusal"]}/36 | 每题运行实际 Adaptive RAG 与事实门；评估不可用 ${m.unavailable} 题保留。 |

历史文件：[Phase 5](rag-live-results.json)、[Phase 6](rag-hard-results.json)、[Phase 7](rag-holdout-results.json)。Phase 6 发现始终混合词法与标题重排会损害自然语言排序，Phase 7 因此采用确定性 Adaptive 路由并默认关闭 reranker；向量排序在 holdout 被保留，不能宣称差异具有统计显著性。Phase 6 的两个无答案错误 \`none-20\`、\`none-23\` 及 [Phase 7 单独回归](phase6-refusal-regression.json) 同时保留。各阶段数据和答案审计范围不同，不能把这些数字当成同一测试集上的进步曲线。

Phase 8 开发期间三次真实 Demo 失败发现图像准备 revision 竞争和模型 citation 放置问题；随后共享存储 lease、采用服务端结构化句子 citation，并在建盲测语料前修复。失败 [1](phase8-demo-live-attempt1.json)、[2](phase8-demo-live-attempt2.json)、[3](phase8-demo-live-attempt3.json) 与 [native 诊断 ledger](phase8-rag-development.jsonl) 全保留。最终 [真实 Demo](phase8-demo-live.json) 通过；它是产品流程验证，不替代盲测质量。

## Phase 8 检索

按不同文档去重，相关资料题分母 ${relevant.length}；缺失检索结果记零。Hit@1/5、MRR 使用第一个相关资料，Recall@10 与 nDCG@10 使用所有 gold 相关资料，不能把单资料命中当成全部来源覆盖。

| 策略 | Hit@1 | Hit@5 | MRR | Recall@10 | nDCG@10 |
| --- | ---: | ---: | ---: | ---: | ---: |
${retrievalTable}

图像专属题 Hit@5 ${pct(m.multimodalHitAt5)}，分母 ${imageRows.length}；包含 OCR、纯图形 Vision 及图像指令攻击。实际首次解析错误 ${analysis.documentInputs.parseFailures.length}；Vision/OCR 状态 ${JSON.stringify(analysis.documentInputs.visionStates)} / ${JSON.stringify(analysis.documentInputs.ocrStates)}。90 份索引状态 ${JSON.stringify(analysis.indexing.states)}，${analysis.indexing.chunks} chunks，${analysis.indexing.embedded} 条实际嵌入；不是模拟向量。

## 回答、拒答与事实检查

| 指标 | 首轮结果 | 分母 / 边界 |
| --- | --- | --- |
| No-answer Accuracy | ${pct(m.noAnswerAccuracy)} | 全部 36 题；不可用不算正确拒答。 |
| False Refusal Rate | ${pct(m.falseRefusalRate)} | 全部 136 道可回答/冲突题。 |
| Answerable Recall | ${pct(m.answerableRecall)} | gold 正确的普通/冲突答案 / 136。 |
| Released-answer Coverage | ${pct(m.releasedAnswerCoverage)} | 实际非拒答、运行时可用答案 / 136；不等于 gold 正确率。 |
| Citation Validity | ${pct(m.citationValidity)} | ${m.citationCount} 个返回引用重读当前租户数据库；拒答没有 citation。 |
| Citation Completeness | ${pct(m.citationCompleteness)} | 发布的 ${m.releasedClaims} 个 claim，来自 ${m.releasedAnswers} 个答案。 |
| Answer Faithfulness | ${pct(m.answerFaithfulness)} | 同一发布后 claim 分母，自动支持 judge 的条件性结果。 |
| Conflict Detection | ${m.conflictDetection.correct}/${m.conflictDetection.total} | 必须解释真实分歧/明确替代，引用双方并通过 gold facts。 |
| 非冲突题发布了 conflict | ${m.conflictDetection.releasedFalseConflicts} | 仍需解释这些运行时分类；不能算检测优势。 |
| Ambiguous Clarification | ${m.ambiguousClarification.correct}/${m.ambiguousClarification.total} | 真正要求补充区分条件；不能用拒答冒充澄清。 |
| Unavailable | ${m.unavailable}/180 | runtime ${analysis.unavailable.runtime}、gold judge ${analysis.unavailable.goldJudge}、外层评估 ${analysis.unavailable.outerEvaluation}；分类可有重叠。 |

ledger 保存 ${analysis.verification.attempts} 个完整 verification reports，其中 ${analysis.verification.rejectedAttempts} 个被拒绝；${analysis.verification.repairedQueries} 题使用一次修正。这些已保存报告中的 claim 状态为 ${JSON.stringify(analysis.verification.allAttemptClaimStates)}，数值 guard 失败 ${analysis.verification.numericGuardFailures} 次、citation 支持失败 ${analysis.verification.uncitedClaimFailures} 次。提取或 schema 直接抛错可能只有 unavailable 错误码，没有完整 claim report，不能将此报告数称为全部模型调用数。拒绝、部分支持和修正记录保留；高发布后完整性/忠实性是门控后的条件性指标，不能抵消误拒答、错误答案或不可用。

| Gold 类别 | 正确回答 | 正确拒答 | 错误回答 | 误拒答 | 正确冲突 | 歧义澄清 | 不可用 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${matrix}

冲突题 B129、B131、B132、B135 的文字答案、gold facts 和双方引用均通过 gold judge，但 runtime conflicts 数组为空。冻结协议要求文字说明、双方 citation 和运行时冲突检测同时成功，所以仍保留 Incorrect Answer 标签，未事后改成成功。这里的四题失败是状态检测漏记，不能描述为四题文字事实错误；B130、B133 是误拒答。仅 B134、B136 完整通过，歧义八题全部拒答、没有澄清。高发布后 faithfulness 仍不证明冲突状态完整。

## 所有未成功题

| ID | 类型 | 结果 | 保存的失败信息 |
| --- | --- | --- | --- |
${failureTable}

冻结 gold judge 的异常 catch 没有保存具体 transport/schema/fact-array 数量原因。gold judge unavailable 不能直接归因为真实云故障，也不能把已通过运行时门的答案自动算成 gold 正确。具体查询、回答、来源、首次 image interpretation、被拒 claim 和模型配置留在原始合成 ledger，未保留隐藏推理。

## 延迟与容量

首轮 wall time 使用 nearest-rank P50/P95。Vector 包含实际 query Embedding + SQL 扫描；Adaptive 是另一次真实 production retrieval；RAG 包含生成、引用验证、claim 提取、支持/冲突校验和必要修正，不包含事后 gold judge。超时/失败可能在有计时值的样本内；外层失败缺失计时不计为零毫秒。首轮没有挑选最快样本。

| 流程 | 样本 | P50 ms | P95 ms |
| --- | ---: | ---: | ---: |
${latencies}

[容量与内存报告](phase8-performance.md) 使用真实 SQL、明确合成的 1024 维容量向量，100/500/1,000/2,000/5,000 chunks 每档 20 次查询；5,000 的 P50/P95 为 1,448.43/1,480.33 ms、观测进程最大 RSS 482.13 MiB。整个进程 RSS 含 GC 和其它分配；查询数量由代码推导，未做 SQL tracing。20 次实际 Agent P50/P95 11,946.57/14,965.10 ms，18 次 plan_validation fallback、2 次 LLM 计划成功；真实混合 Demo 单独为 LLM 成功、无 fallback。20 次真实图片分析 4,665.28/5,379.31 ms。历史 Planner 精确原因没有保存，不能逆推。

## 可靠性、安全与产品验收

五个 [实际进程中断窗口](phase8-crash-results.json) 通过：Import 30%/提交前/提交后和 Reindex 30%/发布前。已提交文件在丢响应后保留；未引用文件隔离；不变资料旧索引仍可检索；再次恢复幂等。不是硬断电测试。Maintenance 两种宽度 [1440](phase8-maintenance-1440.json)/[390](phase8-maintenance-390.json) 验证缺失文件与原文 retained text。ASCII/空格/178 字符根目录 [便携迁移](phase8-portable-copy.json) 通过；中文安装目录已按用户要求取消，未修复或宣称通过。

[Provider Matrix](phase8-provider-failure-matrix.md) 12/12 通过，明确区分本地注入 503/timeout/schema/ENOSPC/EACCES、真实 OCR/损坏 DOCX 和实际 PostgreSQL 拒连。未故意造成远端云服务故障。[HTTP 安全](phase8-security-http.json) 12/12 在新实例、两合成身份中通过，使用明确 Mock 提取；unit 覆盖路径/ZIP/配额/MIME/Recovery Key 限流等。盲测另有 ${attacks.length} 道真实模型文字/图片指令攻击，gold 正确 ${analysis.injection.correct}/${attacks.length}；逐题回答见只读审计。RAG/Vision 路线不提供 export/delete/shell 工具；该边界不等于验证任意有危险工具 Agent 的抗攻击能力。

最终 [检查 receipt](phase8-final-checks.json)：生产 build/portable postbuild、TypeScript、ESLint 均通过且零错误/警告；unit/integration 81/81，离线 Browser 17/17；实际多格式 Demo、双来源政策变更、1440/390、普通资料保留和专用 Reset 通过。当前构建 [preflight](phase8-demo-preflight.json) 12/12，10 份 Demo fixtures、8 份推荐文件就绪。所有私人数据库和五份原有用户文档未用于合成验收，也未提交。

## 解释边界与后续

这是一套代码先冻结、数据后新建的合成评测，由同一开发代理设计语料，不是外部人工或统计独立审计。虚构名称和属性重复模板、无答案私有信息模式较集中、资料偏短且相关性由作者标注，得分不能直接外推真实用户库。生成、支持验证和 gold judge 使用同一 Kimi 模型，错误可能相关。正确引用只证明来源关系；数值 guard 不覆盖所有语言数字、日期和数学推理。模糊问题澄清、运行时可用性和误拒答需与命中率一起看。

保留线性向量扫描、扫描 PDF 无自动 OCR、手写/公式识别有限、未加密且有配额的备份、Windows x64 和本地个人身份等限制。没有引入新云数据库、pgvector、OAuth、多人协作或新 Provider。Phase 9 可以由用户批准后准备录屏、发行资产清单、比赛材料和独立人工审阅；本次停止在 Phase 8。
`;
await writeFile(directory+"phase8-blind-analysis.json",JSON.stringify(analysis,null,2)+"\n",{flag:"wx"});
await writeFile(directory+"final-evaluation-summary.md",text,{flag:"wx"});
console.log(JSON.stringify({completed:rows.length,denominators:analysis.denominators,outcomes:analysis.outcomes,unavailable:{runtime:analysis.unavailable.runtime,goldJudge:analysis.unavailable.goldJudge},injection:{correct:analysis.injection.correct,total:analysis.injection.queries}},null,2));
