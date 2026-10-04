# ADR-003: Agent 提案经人工审阅后 Apply

Status: accepted; 既有 Workspace 决策，Phase 8 补记。

模型可能生成错误分类、标签或名称。Agent 通过有界工具和结构化参数提出修改，Review 展示提案并允许修改、拒绝和取消。只有用户确认的 Apply 才提交持久数据；revision 检查拒绝过期快照。Planner fallback 仍进入 Review，不绕过确认。

不选择自动批量改名、删除原文件或无限自主 Agent。代价是需要一次人工审阅；收益是用户能看到具体变化和来源。工具 schema、次数、超时和错误原因受限，活动记录不包含隐藏推理。证据见 [Demo 实测](../evaluation/phase8-demo-live.json) 与 [Planner 数据](../evaluation/phase8-performance.json)。
