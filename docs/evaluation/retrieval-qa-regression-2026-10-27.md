# 检索与问答回归交付验证 · 2026-10-27

协议、命令、指标定义和真实资料接入要求见 [可重复评测协议](retrieval-qa-regression.md)。本报告仅包含新编写的公开合成资料汇总。没有真实资料评测授权，真实资料、真实模型、真实 OCR/Vision 和人工事实核对均未执行。

## 版本与数据

- 核心协议与独立金标提交：`2bec8f7`，先于运行入口和正式回归结果提交。
- 本次离线验收代码：`ca36d7e`，已普通推送 origin/main。报告额外记录相关源码和依赖锁哈希及 Node/平台。
- 追溯补充：`3a04b5d`，每次尝试直接附 origin，避免合并重试记录时混淆代码版本；补充后专项 13/13 通过，且与 `ca36d7e` 的同配置对比通过。
- 语料：`synthetic-development-regression-v1`，6 篇合成资料、7 道题，其中可回答/冲突题 5 道、无答案题 2 道。
- Corpus SHA256：`7d343d6367c70d3fcaffe74f0eca2d93bfa04d2293b6a8995bdcbc712150a458`。
- Gold SHA256：`1b733091ceca4f76b6d4366f27b9c2fd787a2c9cc1d3b327a4630dcd8689f46a`。
- Mock Embedding：`token-hash-fixture-v1`；回答：`scripted-test-double-v1`。这些数值是评测器校准结果，不是模型质量成绩。

验收文件留在忽略目录 `artifacts/retrieval-qa-regression/`，不将完整运行输出纳入 Git：

| 运行 | 独立目录（UTC） |
| --- | --- |
| 基线 | `2026-10-27T07-43-24-774Z-1cd59cee-3f46-412b-ac9d-0d6d70ed15ce` |
| 同配置重复 + compare | `2026-10-27T07-43-29-074Z-48ba8d93-cdb9-4969-ad71-1b7ea6de6e41` |
| 故障注入 | `2026-10-27T07-43-33-205Z-1b2adf89-9bf3-45a8-a3d4-f8f5e352c691` |
| 单题手动重试 | `2026-10-27T07-43-37-028Z-fdb59660-0d1b-448f-9abf-6d71d1cc221b` |
| 追溯补充后跨代码版本 compare | `2026-10-27T07-47-48-140Z-c9ad3dee-183b-45af-9430-4114c55c917e` |

每个目录的 manifest、events、attempt 和 report 均独立保留。`acceptance-ca36d7e.json` 仅是这些运行的本地索引。前两次 `automatedRuleJudgment` 完全相同，compare 成功；注入模式不同的运行会被正式版本对比拒绝，不能把下表的故障校准比较当作同配置模型版本比较。

## 合成结果

“题数”表示该指标适用的题目数；分数后显示分子/分母。文档和证据按题累加，同一资料在不同题中可分别计入。逐项判定规则见协议。

| 指标 | 基线题数 | 基线 | 注入题数 | 故障注入 |
| --- | ---: | ---: | ---: | ---: |
| 相关文档召回 | 6 | 8/8 | 6 | 7/8 |
| 关键证据召回 | 6 | 9/9 | 6 | 8/9 |
| 比较所需来源全部召回 | 2 | 2/2 | 2 | 1/2 |
| 比较所需来源全部引用 | 2 | 2/2 | 2 | 1/2 |
| 引用身份/范围/哈希有效 | 5 | 7/7 | 3 | 3/4 |
| 事实有对应引用支撑 | 5 | 8/8 | 3 | 4/6 |
| 规则确立的事实支持 | 5 | 8/8 | 3 | 5/6 |
| 所要求的事实覆盖 | 5 | 8/8 | 5 | 6/8 |
| 正确拒答 | 2 | 2/2 | 2 | 1/2 |
| 错误拒答 | 5 | 0/5 | 5 | 1/5 |
| 冲突披露 | 1 | 1/1 | 1 | 0/1 |

故障校准在脚本回答适配器的 observation 边界注入，生产检索的原始事件仍保留。评测器发现的逐题问题：

| 题目 | 故意注入 | 发现 |
| --- | --- | --- |
| long-tail | 保留语句和来源位置，去掉引用元数据 | generation-error；缺引用不会因 citationValidity 无分母而被放行 |
| compare | 删除 South 召回片段 | retrieval-omission；来源完整性、证据覆盖和事实引用支持下降 |
| conflict | 移除冲突披露语句，保留模型 conflict 标志 | generation-error；披露 0/1 |
| shared | 有答案却拒答 | false-refusal |
| image-text | 模拟验证拒绝，不保留未发布草稿 | verification-rejection |
| missing-fact | 模拟服务不可用 | service-failure；不会算正确拒答 |

首次分类计数：检索遗漏 1、生成错误 2、错误拒答 1、验证拒绝 1、服务故障 1。部分问题可有多个诊断，不能把分类计数相加当作错误题数。漏证据导致不能确立支持的语句另记待核对，不凭缺证据推断模型一定写错。

手动重试 `missing-fact` 后保留 attempt 1 的 service-failure，新增 attempt 2 的正确拒答。新报告 first.service-failure 仍为 1，final.service-failure 为 0；其他注入失败不消失，原报告内容保持不变。专项测试同时验证了旧报告不能覆盖、错误配置不能对比、跨版本/位置的共享文本不算证据、相同关键词不能自证支持、正确改写不能被武断判错。

基线查询耗时 7 个样本，P50 25.67ms、P95 67.70ms；这是本机隔离 mock 检索和脚本回答耗时，包含逐题操作，不包含事前建索引，不能外推真实服务延迟。四次验收运行均无 HTTP 服务请求，token 用量为 null，真实模型耗时与费用未测。

## 验证

| 检查 | 结果 |
| --- | --- |
| `npm run test:evaluation` | 13/13，通过；包含真实隔离检索的重复、故障注入和手动重试 |
| `npx tsx --test --test-concurrency=1 tests/*.test.ts` | `ca36d7e` 对应版本全量 159/159，通过，无跳过；随后仅补充 origin 字段并重跑专项 13/13 |
| `npm run typecheck` | 通过 |
| `npm run check:unused` | 通过 |
| `npm run lint` | 通过 |
| `npm run build -- --webpack` | 通过，包含 postbuild portable assets 准备 |
| `git diff --check` | 通过 |

构建首次在沙箱内创建 `.next/types` 遭遇 Windows EPERM，使用授权执行环境重跑同一 Webpack 命令后成功。测试全量串行运行以避免 PGlite 内存竞争。完整验证日志保存在 `artifacts/retrieval-qa-regression/{full-tests,evaluation-tests,build}.log`。

仅新增/修改评测代码、合成 fixtures、测试、package 脚本和本任务文档；生产检索、回答和事实验证门槛没有改动。旧盲测/留出/困难集及历史报告没有改动。用户原有 5 份未提交文档逐一核对 SHA256，与任务开始一致，未纳入提交。

## 待完成与限制

真实语料需要资料所有者的明确授权、脱敏资料、独立人工金标及提取核对后才能运行。外部资料只从本地忽略目录读取，不能把原件或敏感输出加入 Git。

本框架提供真实 Kimi + DashScope + 生产 RAG 的显式预算入口，但本次没有调用；其网络故障、超时和停止逻辑仅由离线可控 transport 验证。独立模型裁判未启用。生产运行时模型验证与规则评分分开记录，不能当作人工审核结果。

图片覆盖当前仅为手写合成文字转录，真实图片 OCR/Vision、PDF/DOCX 提取、复杂表格和图片区域定位未纳入本次新回归。语义同义改写采用保守的待人工核对策略；不承诺自动判断任意自然语言的事实正确性。人工核对入口已具备，实际核对数量仍为 0。
