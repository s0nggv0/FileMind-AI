# ADR-004: 来源绑定与事实门共同控制答案发布

Status: accepted for Phase 8。

真实 citation 并不能单独证明语句被原文支持。选择结构化事实句和来源编号，由服务端从已提供的 chunks 绑定元数据，再校验 owner、workspace、document、内容 hash 与版本。独立的原子事实提取和支持检查覆盖整段答案、限定条件和冲突；发布前重新读取引用，避免模型生成期间资料变化。

所有修正合计最多两次答案生成。第二次仍不受支持则固定拒答；provider、schema 或校验故障明确 unavailable。浏览器只接收最终已验证文本和真实阶段进度。冲突需要相关来源共同引用并说明，文件名和日期不能自行确立权威。配置的同一 Kimi 模型同时生成和检查，仍可能出现相关错误；确定性数值和身份检查只能补充，不能提供绝对事实证明。

详见 [实现与边界](../architecture/answer-verification.md) 和 [冻结评测协议](../evaluation/blind-protocol.md)。
