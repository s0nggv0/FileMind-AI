# 可重复执行的检索与问答回归协议 v1

本入口用于开发回归和评测器校准。旧的 Phase 6/7/8 冻结语料、协议及历史结果保持原样。复用 `blind-protocol.ts` 的文档排序指标与近邻秩分位数、`isolatedKnowledge` 的 PGlite/RLS 隔离设施、生产分块、索引、SQL 词法查询、向量存储及 `RetrievalEngine`。不连接用户业务数据库，不读写用户资料库。

默认仅运行新的公开合成样本。**没有收到真实资料用于本评测的授权；真实资料评测、真实模型评测和人工事实核对尚未执行。** 旧报告中的真实服务运行不能作为本协议已完成真实评测的证据。

## 运行

在仓库根目录使用 Node 22.13+ 和已安装的项目依赖：

```powershell
npm run evaluate:regression
npm run evaluate:calibration
npm run test:evaluation
```

第一条运行真实的隔离检索链路，Embedding 使用显式标记的 token-hash mock，回答使用单独编写的脚本替身。第二条故意注入漏召回、缺引用、错误拒答、验证拒绝、服务故障和未披露冲突，验证判定器能够发现问题。它们均无收费请求，不能用于证明语义模型或生成模型的质量。

每次输出到独立的 `artifacts/retrieval-qa-regression/<UTC时间>-<UUID>/`。运行会打印实际 `report.json` 路径。下文 `旧报告路径` 等参数应替换为这个路径。

```powershell
npm run evaluate:regression -- --compare "旧报告路径"
npm run evaluate:calibration -- --retry-run "故障注入报告路径" --question missing-fact
```

对比和重试在索引或请求前检查协议与指纹，语料、金标、题目范围、Embedding、回答适配器、模型、端点路径、预算和注入模式须一致；代码提交可以不同。配置不一致会终止，不输出跨配置总分。对比同时列出前后版本的首次与最终指标。

重试必须显式指定单道题和父报告。新目录记录父报告哈希并继承既有尝试，增加该题的 attempt 编号；不修改原目录，不自动重试整个题集。校准模式只在 attempt 1 注入故障。仅修复其中一题后，其他失败仍保留，重试命令退出码仍为 1。

普通运行存在确定失败或需要人工判断的表述时退出 1。校准命令在要求的故障都被发现时退出 0；这表示评测器校准通过，并不表示被测结果通过。

## 金标与样本

`tests/fixtures/rag-regression/dataset.ts` 保存独立编写的原文和金标；`responses.ts` 保存另行编写的离线回答替身。金标不从系统回答中生成，检索和真实模型生成不会读取金标。真实模型只收到原文检索结果和问题。

目前有 6 篇合成资料、7 道题，包含长文末尾事实、同主题双资料比较、两个版本的数值冲突与显式替换、跨文档共享句、图片文字转录、相关资料缺少所问事实及完全无答案问题。图片文字是**手写的合成 OCR 转录**，没有运行图片解析、OCR 或 Vision。这里不声称检验了原始图片、PDF、DOCX 的提取质量。

每道题记录：

- 稳定题目 ID、问题、分类和允许查询的文档 ID。
- 全部预期相关文档、关键证据 ID、原文及字符区间。
- 可回答范围、必须比较的来源、预期拒答条件。
- 可接受的精确事实表述、各事实对应的证据、必要冲突披露语句。

载入时校验所有 ID、范围、字符区间与原文字节对应的文本。共享句必须匹配指定文档，不能用另一篇的相同句代替。证据覆盖还必须匹配文档内容哈希和位置。修改样本后会得到不同指纹，不能直接与旧结果比较；需要新增语料版本。冻结的旧盲测不可作为本开发回归反复调参的数据。

## 指标与分母

每项比率都包含 `samples / numerator / denominator / value / rule`。分母为零时 value 为 null。`first` 每题取首次尝试，`final` 每题取最大 attempt，`allAttempts` 保留全部尝试；不能只公布最终成功率。没有单一加权总分。

| 指标 | 样本与分母 | 判定 |
| --- | --- | --- |
| documentRecall | 有相关文档金标的题；分母为金标文档数之和 | 返回的生产 evidence 中，按题去重后命中相关文档数；候选列表不等于可供回答使用的 evidence |
| evidenceRecall | 有证据金标的题；分母为证据区间数之和 | 同一文档内容哈希、位置覆盖且片段包含完整金标原文 |
| comparisonSourceCompleteness | 有必要比较来源的题数 | 必要来源全部召回才计 1 |
| comparisonCitationCompleteness | 同上，包括拒答及故障 | 最终答案有效引用所有必要比较来源才计 1 |
| citationValidity | 已发布答案；分母为返回的引用记录数 | sourceId/chunkId/documentId 对应、在该题范围内、资料哈希有效。缺引用时本指标为 null，不能据此判通过 |
| claimCitationSupport | 已发布答案；分母为事实语句数 | 精确金标事实的句内来源对应有效引用且覆盖支撑证据；因此缺引用会在这里失败 |
| factualSupportEstablished | 已发布答案；分母为事实语句数 | 与独立金标允许的表述精确匹配，且支撑证据被召回；仅为规则已确立的支持比例 |
| requestedFactCoverage | 可回答/冲突题；分母为要求的事实数之和 | 最终答案出现对应金标表述；拒答、验证拒绝和故障不从分母移除 |
| correctRefusal | 全部无答案题数 | 无服务故障的显式拒答；服务不可用、停止、验证拒绝不能算正确拒答 |
| falseRefusal | 全部可回答/冲突题数 | 无服务故障时显式拒答；故障和验证拒绝单独统计 |
| conflictDisclosure | 全部冲突题数 | 明确披露分歧、包含双方事实且引用必要来源；运行时 conflict 标志本身不算通过 |

规则匹配只规范空白、末尾标点及引用标签，不使用“出现关键词即事实正确”的判定。不匹配的改写或新增表述记入 `unassessedClaims / reviewRequiredSamples`，需要人工核对，既不自动放行，也不凭规则推断为事实错误。精确规则可能漏识正确同义改写，所以不能把该支持比例称为普适事实准确率。确定缺引用、缺已知事实、对无答案题作答和缺失冲突披露等才列为 generation-error。

每题保留原始的 Hit@1/5、MRR、Recall@10、nDCG@10，用于排序诊断。它们复用旧盲测函数，以不同文档去重；主指标优先观察“全部相关资料和关键证据是否进入最终检索 evidence”。

失败分类允许同题多项：`retrieval-omission / generation-error / false-refusal / verification-rejection / service-failure`。检索漏资料不直接等同于模型生成错误。Embedding 故障后词法降级仍得到成功答案时，保留答案和片段，另记 serviceFaults；不把这个服务故障抹掉，也不把它计成正确拒答。

查询耗时包含失败，以最近秩 P50/P95、样本数分别报告全部和失败查询；索引耗时独立写入事件。每个 HTTP 请求在发送前落盘，随后记录成功/失败、耗时、状态码和可取得的 token 用量。总请求数包含索引、查询向量、问题范围检查、生成、验证、内部修复和失败请求；每题请求数不含事前索引。`transport` 是全运行口径，不能只相加每题值当作总成本。离线 Embedding 函数调用数另列，不算 HTTP 请求。缺失 token 用量或组成部分保留 null，报告只累加可获得数值并给出覆盖请求数；不能把它当作完整账单。此处没有真实服务耗时、token 或费用结论。

## 自动判断与人工核对

独立规则判定保存于 `automatedRuleJudgment`。生产 RAG 的模型验证状态、版本和各次通过/拒绝另存 `runtimeVerification` 及事件，这属于被测系统自身的门槛，不用作独立金标。没有额外模型裁判，`modelJudgment.performed=false`；没有把同一个模型自证的结果包装成独立人工结论。

每次生成 `human-review-template.json`。核对人员逐题阅读问题、原文证据、完整已发布语句和失败原因，复制模板到本地另一文件，填写 reviewer，以及 factualSupport、citationSupport、refusalCorrect、conflictDisclosed 的 true/false；未核对或不适用保留 null。然后：

```powershell
npm run evaluate:review -- "报告路径" "已填写的核对文件路径"
```

工具校验报告内容哈希、指纹、题号和 attempt，写到新的 `artifacts/retrieval-qa-regression-human/` 目录，不改机器报告。每项人工指标只以非 null 项为分母，并单独列出未核对/不适用数量，不能把 pending 算通过。当前没有实际人工核对，测试中的模拟 reviewer 只验证导入逻辑。

## 真实服务及真实语料

以下命令是**尚未执行的显式收费入口**，须由操作者主动运行，并事先配置项目已有的 Kimi/DashScope 环境变量：

```powershell
npm run evaluate:regression -- --live --max-requests 40 --timeout-ms 30000 --run-timeout-ms 180000
```

`--live` 不会自动出现在默认命令中；缺少显式请求上限会拒绝启动。最大允许 100 请求、单请求最多 60 秒、运行请求窗口最多 10 分钟；默认单请求 30 秒、窗口 3 分钟，连续两次传输/HTTP 服务故障停止，401/403/429 立即停止。到达预算或截止时间后其余题记 stopped 并留在分母内；没有自动恢复或续费行为。生产 RAG 原有最多一次共享修复及索引有限重试会保留，每次 HTTP 调用都消耗总预算。评测不降低事实验证门槛，不记录未发布草稿、内部堆栈、响应正文或鉴权头；只允许官方 Moonshot/DashScope HTTPS 端点并禁止重定向。

收到真实脱敏资料的**明确评测授权后**，由操作者准备符合 `DatasetSchema` 的 JSON 到忽略目录 `.filemind/evaluation-input/`。JSON 需记录 kind=`authorized-real`、真实授权记录引用、deidentified=true、evaluationAllowed=true；goldMethod 必须为 independently-authored，金标应由资料所有者或核对人员根据原文独立编写，不能复制系统答案。原始文件应另行留在授权的私有存储中，评测输入只接收已授权的提取文本，不自动抓取用户资料。示例入口：

```powershell
npm run evaluate:regression -- --live --max-requests 40 --dataset ".filemind/evaluation-input/authorized.json" --authorization-id "实际授权记录引用"
```

授权参数必须与清单引用一致；这个技术开关不代替资料所有者授权。外部语料不支持脚本回答替身。接入前应按既有真实提取设施核对长文、同主题多文档、版本、共享段落和图片文字的提取结果及哈希，再由人工编写题目和证据位置。未执行部分仍应标 pending。

## 结果保留与隐私

每次保留代码提交、未提交状态、相关源码哈希、依赖锁哈希、Node/平台、模型配置、语料逐文档哈希、金标哈希、开始/结束时间。每条尝试另存 origin（所属运行、提交、源码哈希、配置指纹和开始时间）；重试继承的旧尝试保留原 origin，不能全部归为重试时的新代码。当前工作区包含用户原有文档修改，dirty=true 本身不表示评测代码未提交；相关源码哈希可进一步核对。

manifest、逐次 attempt、report、comparison、人工模板及人工报告都使用排他创建；事件逐条追加并 sync。进程中断时保留已经发出的请求和已完成尝试，即便没有最终报告也不能删除首次失败后假装首跑成功。重试读取已完成 report；中断且没有 report 的目录需保留并另开新运行，本版本不提供自动断点续跑。

私有文本、完整回答、人工备注及本地 receipts 留在已有 Git 忽略目录中。评测不会自动把任何结果复制到 docs；只有经过公开审查的合成汇总可以手动提交。`git diff` 应确认旧冻结数据和历史报告没有变化。
