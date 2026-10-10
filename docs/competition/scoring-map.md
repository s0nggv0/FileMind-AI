# 比赛评分项与 FileMind 证据映射

下表按比赛准备要求列出功能与证据，不设置权重或自评分。演示记录说明流程是否完成，问答正确率则由独立的评测结果说明。

| 评分项 | FileMind 对应功能 | 证据 | Demo 场景 |
| --- | --- | --- | --- |
| LLM | 真实 Kimi 结构化资料分析、问答和支持检查 | [答案门](../architecture/answer-verification.md)、[真实 Demo](../evaluation/phase8-demo-live.json) | Agent 分类建议与 QKV 回答 |
| Agent | 有界计划/工具/超时，Planner 原因记录，Review 后 Apply | [人工确认 ADR](../adr/ADR-003-human-in-the-loop.md)、[Planner 实测](../evaluation/phase8-performance.json) | 编辑或拒绝一项建议，再 Apply |
| RAG | 持久化 chunks、Embedding、Adaptive Retrieval、原文 citation | [检索 ADR](../adr/ADR-001-adaptive-retrieval.md)、[最终评测](../evaluation/final-evaluation-summary.md) | 从 PDF/图片回答同一问题，打开原文 |
| Multimodal | 原图、OCR 和 Vision 分别标记、失败独立记录 | [多模态 ADR](../adr/ADR-007-multimodal-source-distinction.md)、[失败矩阵](../evaluation/phase8-provider-failure-matrix.md) | Transformer 图片来源抽屉 |
| AI Safety | 不可信资料边界、同源/租户检查、事实门、冲突与拒答 | [安全验收](../evaluation/phase8-security-http.json)、[冻结评测](../evaluation/final-evaluation-summary.md) | Aurora 新旧记录并存，拒绝无依据结论 |
| Tool Calling | 注册表、参数 schema、未知工具拒绝、次数边界 | [人工确认 ADR](../adr/ADR-003-human-in-the-loop.md)、[Agent 测试](../../tests/agent-runner.test.ts) | 查看真实工具步骤与产出的提案 |
| Innovation | 整理建议经人工审阅，检索按问题选择策略，回答核对事实，保存操作记录恢复日志 | [完整架构](../architecture/system-overview.md)、[恢复验收](../evaluation/phase8-crash-results.json) | 导入原文、审阅方案，再提问并核对来源 |
| Frontend | Workspace/Review/Search/Graph/Settings 一致界面与响应式布局 | [真实浏览器验收](../evaluation/phase8-demo-live.json)、[Maintenance 390px](../evaluation/phase8-maintenance-390.json) | 桌面演示与窄屏截图 |
| Practicality | 本地私有存储、备份、身份恢复、目录迁移与真实容量测量 | [迁移验收](../evaluation/phase8-portable-copy.json)、[性能](../evaluation/phase8-performance.md) | 预先准备的备份预览与迁移报告 |
| UX | 有来源进度、人工确认、Retry、缺失原文件提示、Demo 二次确认 | [维护架构](../architecture/storage-maintenance.md)、[Demo 设计](../architecture/demo-workspace.md) | 保留来源后重试，取消 Reset |
| Social / Commercial Value | 减少个人资料整理和原文核对成本，保留用户控制 | [产品说明](README.md)、[演示稿](demo-script.md) | 学习资料场景；无收费或市场规模承诺 |

交付说明保留了合成语料、同模型判定、未加密备份、扫描 PDF 和线性向量扫描的限制。项目尚无付费用户、收入或社会影响实验，Social / Commercial Value 一项只说明用途。开发辅助范围见根 README 的 AI 使用声明，个人实现记录按实际工作说明。
