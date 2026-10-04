# 比赛评分项与 FileMind 证据映射

下列评分项来自用户提供的比赛准备要求；没有添加权重或自评分。评测结果、验收报告和演示分别提供不同证据，不能将演示成功外推为整体正确率。

| 评分项 | FileMind 对应功能 | 证据 | Demo 场景 |
| --- | --- | --- | --- |
| LLM | 真实 Kimi 结构化资料分析、问答和支持检查 | [答案门](../architecture/answer-verification.md)、[真实 Demo](../evaluation/phase8-demo-live.json) | Agent 分类建议与 QKV 回答 |
| Agent | 有界计划/工具/超时，Planner 原因记录，Review 后 Apply | [人工确认 ADR](../adr/ADR-003-human-in-the-loop.md)、[Planner 实测](../evaluation/phase8-performance.json) | 编辑或拒绝一项建议，再 Apply |
| RAG | 持久化 chunks、Embedding、Adaptive Retrieval、原文 citation | [检索 ADR](../adr/ADR-001-adaptive-retrieval.md)、[最终评测](../evaluation/final-evaluation-summary.md) | 从 PDF/图片回答同一问题，打开原文 |
| Multimodal | 原图、OCR 和 Vision 分别标记、失败独立记录 | [多模态 ADR](../adr/ADR-007-multimodal-source-distinction.md)、[失败矩阵](../evaluation/phase8-provider-failure-matrix.md) | Transformer 图片来源抽屉 |
| AI Safety | 不可信资料边界、同源/租户检查、事实门、冲突与拒答 | [安全验收](../evaluation/phase8-security-http.json)、[冻结评测](../evaluation/final-evaluation-summary.md) | Aurora 新旧记录并存，拒绝无依据结论 |
| Tool Calling | 注册表、参数 schema、未知工具拒绝、次数边界 | [人工确认 ADR](../adr/ADR-003-human-in-the-loop.md)、[Agent 测试](../../tests/agent-runner.test.ts) | 查看真实工具步骤与产出的提案 |
| Innovation | 将人工审阅、查询自适应、事实门、恢复日志连接成个人资料闭环 | [完整架构](../architecture/system-overview.md)、[恢复验收](../evaluation/phase8-crash-results.json) | 原文 → Review → 可核对回答 |
| Frontend | Workspace/Review/Search/Graph/Settings 一致界面与响应式布局 | [真实浏览器验收](../evaluation/phase8-demo-live.json)、[Maintenance 390px](../evaluation/phase8-maintenance-390.json) | 桌面演示与窄屏截图 |
| Practicality | 本地私有存储、备份、身份恢复、目录迁移与真实容量测量 | [迁移验收](../evaluation/phase8-portable-copy.json)、[性能](../evaluation/phase8-performance.md) | 预先准备的备份预览与迁移报告 |
| UX | 有来源进度、人工确认、Retry、缺失原文件提示、Demo 二次确认 | [维护架构](../architecture/storage-maintenance.md)、[Demo 设计](../architecture/demo-workspace.md) | 保留来源后重试，取消 Reset |
| Social / Commercial Value | 减少个人资料整理和原文核对成本，保留用户控制 | [产品说明](README.md)、[演示稿](demo-script.md) | 学习资料场景；无收费或市场规模承诺 |

合成语料和同模型 judge 的局限、未加密备份、扫描 PDF、线性向量扫描均在交付说明中保留。没有付费用户、收入或社会影响实验，Social / Commercial Value 仅描述用途。
