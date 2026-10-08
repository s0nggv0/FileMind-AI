# 比赛答辩提纲

共 12 页，建议讲解 6 分钟。产品操作另按视频脚本录制。目前提供逐页内容和讲述要点，尚未制作 PPTX。

| 页 | 标题 / 核心句 | 视觉证据 | 讲述要点 |
| --- | --- | --- | --- |
| 1 | Problem：记得知识，忘记文件 | 原创混合资料与一个具体 QKV 问题 | 文件名搜索难以贯穿格式和图像 |
| 2 | FileMind AI：Turn scattered files into connected knowledge. | Landing 截图 | 个人知识空间，用户掌握决策 |
| 3 | Core Experience：Import → Agent → Review → Ask → Citation | 单一主 Demo 的连续真实操作 | 展示工作路径，说明等待与错误 |
| 4 | Agent Architecture：限定工具中的可见执行 | Agent / Tool Registry / Human Review 流程 | 结构化规划、白名单、工具校验、有限重试 |
| 5 | RAG：回答能回到原文 | Search、PDF 引用抽屉 | 所有权、位置、版本、事实验证 |
| 6 | Multimodal：从图片中查找资料 | 原图、OCR、AI interpretation 并排 | 分别说明提取结果、模型解释和失败状态 |
| 7 | Safety：AI proposes. You decide. | Review、冲突面板、澄清选项 | 注入防护、拒答、用户选择、备份校验 |
| 8 | Evaluation：检索和回答分别评测 | Phase 6/7/8 表格，保留 5.88%、2/8、0/8 | 说明合成语料、同模型评委和条件分母；区分首次 schema 失败与后续样本通过 |
| 9 | Design：四项实现与依据 | 四项设计与实际证据 | Agent 组织、多模态索引、自适应检索、带引用检查和人工确认的回答流程 |
| 10 | Engineering：能保存、能恢复、能迁移 | Journal、Reset 五次、干净目录验收 | 原子发布、FORCE RLS、便携 Windows 运行时 |
| 11 | Use cases：学习和研究资料 | 学生／研究者的使用场景 | 说明个人规模的使用范围；尚无商业用户或收入数据 |
| 12 | Delivery：验收结果与待办 | v1.0.0-rc.1 候选和发布记录 | 主 Demo 与 12/12 已通过；录制前复验，补齐成片、团队信息和新 ZIP |

可另备原始评测协议、慢查询与容量实验、安全测试、测试范围和失败回执，不计入上述 12 页。架构用一页说明模块关系，class/API/table 留作问答资料。截图若来自注入状态测试，应标明来源；真实模型结果使用对应验收记录。
