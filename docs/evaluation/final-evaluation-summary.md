# FileMind AI 最终评测汇总：Phase 5–8

Phase 8 首轮完成 180/180 题，90 份原创合成资料，包括 18 张图片、9 份 tricky 资料；136 道可回答/冲突题、36 道无答案题（20%）、8 道歧义题。生产代码及协议 231 个文件在新语料创建前冻结，未按首轮结果调参，也没有第二轮择优。原始 [Run #1](rag-blind-run1-results.json)、[逐题 ledger](rag-blind-run1.jsonl)、[首次解析/OCR/Vision 输入](rag-blind-run1-inputs.json) 和 [事后只读审计](phase8-blind-analysis.json) 全部保留。

## 结果沿革

| 阶段 | 资料 / 问题 | 主要检索结果 Hit@1 / Hit@5 / MRR | 无答案 | 解释 |
| --- | --- | --- | --- | --- |
| Phase 5 | 10 / 25 | Vector/Lexical/Hybrid 均 1 / 1 / 1 | 3/3 | 仅 22 道有来源题；只验证 1 次有答案生成的 citation，样本容易。 |
| Phase 6 | 72 / 144 | Vector .9417 / .9917 / .9641；Hybrid RRF .7333 / .9750 / .8181；加 rerank .7000 / .9750 / .8001 | 22/24 | 36 个排名失败案例保留；图片回答 12/12、返回引用 19/19，均不等于逐句事实审计。 |
| Phase 7 | 50 / 100 | Adaptive .9674 / 1 / .9837；Always Hybrid .9674 / 1 / .9819 | 8/8 | 独立新内容，但仍为短合成资料；每种策略只做 8 图片 + 8 无答案生成。 |
| Phase 8 Run #1 | 90 / 180 | Adaptive 1.0000 / 1.0000 / 1.0000 | 36/36 | 每题运行实际 Adaptive RAG 与事实门；评估不可用 10 题保留。 |

历史文件：[Phase 5](rag-live-results.json)、[Phase 6](rag-hard-results.json)、[Phase 7](rag-holdout-results.json)。Phase 6 发现始终混合词法与标题重排会损害自然语言排序，Phase 7 因此采用确定性 Adaptive 路由并默认关闭 reranker；向量排序在 holdout 被保留，不能宣称差异具有统计显著性。Phase 6 的两个无答案错误 `none-20`、`none-23` 及 [Phase 7 单独回归](phase6-refusal-regression.json) 同时保留。各阶段数据和答案审计范围不同，不能把这些数字当成同一测试集上的进步曲线。

Phase 8 开发期间三次真实 Demo 失败发现图像准备 revision 竞争和模型 citation 放置问题；随后共享存储 lease、采用服务端结构化句子 citation，并在建盲测语料前修复。失败 [1](phase8-demo-live-attempt1.json)、[2](phase8-demo-live-attempt2.json)、[3](phase8-demo-live-attempt3.json) 与 [native 诊断 ledger](phase8-rag-development.jsonl) 全保留。最终 [真实 Demo](phase8-demo-live.json) 通过；它是产品流程验证，不替代盲测质量。

## Phase 8 检索

按不同文档去重，相关资料题分母 136；缺失检索结果记零。Hit@1/5、MRR 使用第一个相关资料，Recall@10 与 nDCG@10 使用所有 gold 相关资料，不能把单资料命中当成全部来源覆盖。

| 策略 | Hit@1 | Hit@5 | MRR | Recall@10 | nDCG@10 |
| --- | ---: | ---: | ---: | ---: | ---: |
| vector | 0.9926 | 1.0000 | 0.9963 | 1.0000 | 0.9973 |
| lexical | 0.9118 | 0.9485 | 0.9311 | 0.9779 | 0.9425 |
| alwaysHybrid | 0.9706 | 0.9853 | 0.9804 | 1.0000 | 0.9851 |
| adaptive | 1.0000 | 1.0000 | 1.0000 | 1.0000 | 1.0000 |

图像专属题 Hit@5 100.00%，分母 37；包含 OCR、纯图形 Vision 及图像指令攻击。实际首次解析错误 0；Vision/OCR 状态 {"ready":18} / {"ready":18}。90 份索引状态 {"ready":90}，126 chunks，126 条实际嵌入；不是模拟向量。

## 回答、拒答与事实检查

| 指标 | 首轮结果 | 分母 / 边界 |
| --- | --- | --- |
| No-answer Accuracy | 100.00% | 全部 36 题；不可用不算正确拒答。 |
| False Refusal Rate | 5.88% | 全部 136 道可回答/冲突题。 |
| Answerable Recall | 83.82% | gold 正确的普通/冲突答案 / 136。 |
| Released-answer Coverage | 93.38% | 实际非拒答、运行时可用答案 / 136；不等于 gold 正确率。 |
| Citation Validity | 100.00% | 169 个返回引用重读当前租户数据库；拒答没有 citation。 |
| Citation Completeness | 100.00% | 发布的 378 个 claim，来自 127 个答案。 |
| Answer Faithfulness | 100.00% | 同一发布后 claim 分母，自动支持 judge 的条件性结果。 |
| Conflict Detection | 2/8 | 必须解释真实分歧/明确替代，引用双方并通过 gold facts。 |
| 非冲突题发布了 conflict | 0 | 仍需解释这些运行时分类；不能算检测优势。 |
| Ambiguous Clarification | 0/8 | 真正要求补充区分条件；不能用拒答冒充澄清。 |
| Unavailable | 10/180 | runtime 1、gold judge 9、外层评估 0；分类可有重叠。 |

ledger 保存 139 个完整 verification reports，其中 12 个被拒绝；10 题使用一次修正。这些已保存报告中的 claim 状态为 {"supported":431,"partially_supported":2,"unsupported":1}，数值 guard 失败 17 次、citation 支持失败 1 次。提取或 schema 直接抛错可能只有 unavailable 错误码，没有完整 claim report，不能将此报告数称为全部模型调用数。拒绝、部分支持和修正记录保留；高发布后完整性/忠实性是门控后的条件性指标，不能抵消误拒答、错误答案或不可用。

| Gold 类别 | 正确回答 | 正确拒答 | 错误回答 | 误拒答 | 正确冲突 | 歧义澄清 | 不可用 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| answerable | 112 | 0 | 0 | 6 | 0 | 0 | 10 |
| no-answer | 0 | 36 | 0 | 0 | 0 | 0 | 0 |
| conflict | 0 | 0 | 4 | 2 | 2 | 0 | 0 |
| ambiguous | 0 | 0 | 0 | 8 | 0 | 0 | 0 |

冲突题 B129、B131、B132、B135 的文字答案、gold facts 和双方引用均通过 gold judge，但 runtime conflicts 数组为空。冻结协议要求文字说明、双方 citation 和运行时冲突检测同时成功，所以仍保留 Incorrect Answer 标签，未事后改成成功。这里的四题失败是状态检测漏记，不能描述为四题文字事实错误；B130、B133 是误拒答。仅 B134、B136 完整通过，歧义八题全部拒答、没有澄清。高发布后 faithfulness 仍不证明冲突状态完整。

## 所有未成功题

| ID | 类型 | 结果 | 保存的失败信息 |
| --- | --- | --- | --- |
| B002 | semantic | Unavailable | gold judge unavailable |
| B019 | semantic | Unavailable | gold judge unavailable |
| B034 | semantic | Unavailable | gold judge unavailable |
| B046 | code | Unavailable | gold judge unavailable |
| B052 | identifier | Unavailable | gold judge unavailable |
| B068 | ocr-dependent | Unavailable | gold judge unavailable |
| B077 | image-only | Unavailable | gold judge unavailable |
| B084 | ocr-dependent | False Refusal | VERIFICATION_REJECTED |
| B088 | vision-dependent | False Refusal | runtime insufficient-evidence decision |
| B090 | vision-dependent | False Refusal | runtime insufficient-evidence decision |
| B091 | vision-dependent | False Refusal | runtime insufficient-evidence decision |
| B094 | vision-dependent | False Refusal | runtime insufficient-evidence decision |
| B096 | vision-dependent | Unavailable | STRUCTURED_OUTPUT |
| B097 | vision-dependent | False Refusal | runtime insufficient-evidence decision |
| B100 | cross-language | Unavailable | gold judge unavailable |
| B126 | hard-negative | Unavailable | gold judge unavailable |
| B129 | conflict | Incorrect Answer | gold correctness / conflict check |
| B130 | conflict | False Refusal | VERIFICATION_REJECTED |
| B131 | conflict | Incorrect Answer | gold correctness / conflict check |
| B132 | conflict | Incorrect Answer | gold correctness / conflict check |
| B133 | conflict | False Refusal | runtime insufficient-evidence decision |
| B135 | conflict | Incorrect Answer | gold correctness / conflict check |
| B137 | ambiguous | False Refusal | runtime insufficient-evidence decision |
| B138 | ambiguous | False Refusal | runtime insufficient-evidence decision |
| B139 | ambiguous | False Refusal | runtime insufficient-evidence decision |
| B140 | ambiguous | False Refusal | runtime insufficient-evidence decision |
| B141 | ambiguous | False Refusal | runtime insufficient-evidence decision |
| B142 | ambiguous | False Refusal | runtime insufficient-evidence decision |
| B143 | ambiguous | False Refusal | runtime insufficient-evidence decision |
| B144 | ambiguous | False Refusal | runtime insufficient-evidence decision |

冻结 gold judge 的异常 catch 没有保存具体 transport/schema/fact-array 数量原因。gold judge unavailable 不能直接归因为真实云故障，也不能把已通过运行时门的答案自动算成 gold 正确。具体查询、回答、来源、首次 image interpretation、被拒 claim 和模型配置留在原始合成 ledger，未保留隐藏推理。

## 延迟与容量

首轮 wall time 使用 nearest-rank P50/P95。Vector 包含实际 query Embedding + SQL 扫描；Adaptive 是另一次真实 production retrieval；RAG 包含生成、引用验证、claim 提取、支持/冲突校验和必要修正，不包含事后 gold judge。超时/失败可能在有计时值的样本内；外层失败缺失计时不计为零毫秒。首轮没有挑选最快样本。

| 流程 | 样本 | P50 ms | P95 ms |
| --- | ---: | ---: | ---: |
| vectorRetrieval | 180 | 299.48 | 423.24 |
| adaptiveRetrieval | 180 | 202.21 | 259.22 |
| ragAnswer | 180 | 5658.74 | 14321.07 |
| imageAnalysis | 18 | 4306.06 | 5499.79 |

[容量与内存报告](phase8-performance.md) 使用真实 SQL、明确合成的 1024 维容量向量，100/500/1,000/2,000/5,000 chunks 每档 20 次查询；5,000 的 P50/P95 为 1,448.43/1,480.33 ms、观测进程最大 RSS 482.13 MiB。整个进程 RSS 含 GC 和其它分配；查询数量由代码推导，未做 SQL tracing。20 次实际 Agent P50/P95 11,946.57/14,965.10 ms，18 次 plan_validation fallback、2 次 LLM 计划成功；真实混合 Demo 单独为 LLM 成功、无 fallback。20 次真实图片分析 4,665.28/5,379.31 ms。历史 Planner 精确原因没有保存，不能逆推。

## 可靠性、安全与产品验收

五个 [实际进程中断窗口](phase8-crash-results.json) 通过：Import 30%/提交前/提交后和 Reindex 30%/发布前。已提交文件在丢响应后保留；未引用文件隔离；不变资料旧索引仍可检索；再次恢复幂等。不是硬断电测试。Maintenance 两种宽度 [1440](phase8-maintenance-1440.json)/[390](phase8-maintenance-390.json) 验证缺失文件与原文 retained text。ASCII/空格/178 字符根目录 [便携迁移](phase8-portable-copy.json) 通过；中文安装目录已按用户要求取消，未修复或宣称通过。

[Provider Matrix](phase8-provider-failure-matrix.md) 12/12 通过，明确区分本地注入 503/timeout/schema/ENOSPC/EACCES、真实 OCR/损坏 DOCX 和实际 PostgreSQL 拒连。未故意造成远端云服务故障。[HTTP 安全](phase8-security-http.json) 12/12 在新实例、两合成身份中通过，使用明确 Mock 提取；unit 覆盖路径/ZIP/配额/MIME/Recovery Key 限流等。盲测另有 3 道真实模型文字/图片指令攻击，gold 正确 3/3；逐题回答见只读审计。RAG/Vision 路线不提供 export/delete/shell 工具；该边界不等于验证任意有危险工具 Agent 的抗攻击能力。

最终 [检查 receipt](phase8-final-checks.json)：生产 build/portable postbuild、TypeScript、ESLint 均通过且零错误/警告；unit/integration 81/81，离线 Browser 17/17；实际多格式 Demo、双来源政策变更、1440/390、普通资料保留和专用 Reset 通过。当前构建 [preflight](phase8-demo-preflight.json) 12/12，10 份 Demo fixtures、8 份推荐文件就绪。所有私人数据库和五份原有用户文档未用于合成验收，也未提交。

## 解释边界与后续

这是一套代码先冻结、数据后新建的合成评测，由同一开发代理设计语料，不是外部人工或统计独立审计。虚构名称和属性重复模板、无答案私有信息模式较集中、资料偏短且相关性由作者标注，得分不能直接外推真实用户库。生成、支持验证和 gold judge 使用同一 Kimi 模型，错误可能相关。正确引用只证明来源关系；数值 guard 不覆盖所有语言数字、日期和数学推理。模糊问题澄清、运行时可用性和误拒答需与命中率一起看。

保留线性向量扫描、扫描 PDF 无自动 OCR、手写/公式识别有限、未加密且有配额的备份、Windows x64 和本地个人身份等限制。没有引入新云数据库、pgvector、OAuth、多人协作或新 Provider。Phase 9 可以由用户批准后准备录屏、发行资产清单、比赛材料和独立人工审阅；本次停止在 Phase 8。
