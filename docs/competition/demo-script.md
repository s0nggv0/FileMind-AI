# 主 Demo 演示流程（3-4 分钟）

2026-10-04，构建 `f43575d` 完成了推荐八份资料的在线彩排，耗时约 84 秒，`llm_success=1`、`fallback_count=0`，preflight 为 12/12 READY。检查覆盖 RAG、PDF/图片 Citation、Aurora 版本差异、Graph、工作区 Cleanup 和隔离重置，结果见 [验收记录](release-freeze.md) 与 `docs/evaluation/release-main-demo.json`。Phase 8/9 的历史结果和原六次调用记录另行保留。录制时计入实际处理等待。

使用原 10 份资料中的推荐 8 份：PDF、DOCX、TXT、Markdown、2 份 Aurora policy TXT、Transformer slide PNG、linear algebra whiteboard JPG。保留原 manifest 和文件；另两份研究笔记用于补充重复检测演示。

| 顺序 / 时间 | 操作 | 讲述与验收点 |
| --- | --- | --- |
| 1-3 / 0:00-0:20 | 进入专用 Demo，上传八份资料，启动 FileMind Agent | 展示运行模式和上传内容。 |
| 4 / 0:20-0:50 | 查看 parsing、OCR、Vision、工具活动与进度 | 保留等待；超时可打开预先处理的资料，并说明处理时间。 |
| 5-6 / 0:50-1:10 | Review 修改或拒绝一项，再 Apply | 展示修改前后，以及保存完成的状态。 |
| 7 / 1:10-1:25 | Library 查看索引 ready | 未 ready 则等待，不把加载动画当成功。 |
| 8-9 / 1:25-2:00 | Ask：哪些资料讲过 Query Key Value？简短解释三者作用，引用资料。点击来源 | 核对 PDF 原文与句子 citation。 |
| 10 / 2:00-2:15 | 追问：那它和 BERT 有什么关系？ | 原八份没有 BERT，应说明资料不足。需有答案的连续问答时另问“这些资料怎样通过注意力权重组合 Value”。 |
| 11 / 2:15-2:30 | Ask：解释 Transformer 图片中的注意力关系，引用图片。 | 回到原图，区分 OCR 与 AI interpretation。 |
| 12 / 2:30-2:45 | Ask：这些资料怎样解释量子纠缠？ | 明确 no_answer；云错误不等同正确拒答。 |
| 13 / 2:45-3:00 | Graph 查看实际文档／概念关系 | 展示已有能力。 |
| 14 / 3:00-3:15 | Cleanup 查看真实候选 | 主八份不保证重复项；无候选显示空状态，另两份重复笔记在主流程后展示。 |
| 15 / 3:15-3:40 | Settings 展示 Recovery、Backup 校验、版本和 Reset 确认后取消 | 密钥不露屏；只重置专用 Demo。 |

## 单独的冲突与澄清备用场景

主流程后，可导入 tests/fixtures/phase9-demo 的三个原创补充 TXT。询问 Orion prototype deadline 时，应列出 June 10 / June 15 并引用双方。问“截止日期是什么？”时，应先区分 Orion prototype 与 Lyra course；选择 Lyra 后，回答 July 20，来源限定为 Lyra。事实与预期见补充目录 README。真实样本已验证 Orion policy 版本替换和三个项目的澄清选项，但这组 deadline 文件的完整线上 UI 流程尚未复验，需要单独检查。

## 五个备用问题

| 问题 | 原始资料 / 预期 | 当前真实验收 |
| --- | --- | --- |
| 简短说明 Self-Attention 的 Q、K、V 并引用。 | attention PDF / slide；Q 查询、K 匹配、V 内容 | 当前主 Demo 的 QKV 和图片问答通过 |
| 数据库笔记怎样描述事务边界？ | database-notes.txt；事务与原子 journal | 未复验；不改问原资料没有的索引优化 |
| 白板中特征值与特征向量有什么关系？ | whiteboard JPG，回到原图 | 未复验 |
| Aurora temporary audit records 保留多久？解释新旧版本。 | v1 6 小时、v2 12 小时，明确 supersedes | 当前主 Demo 真模型答案及双方引用通过 |
| 这些资料能解释量子纠缠吗？ | 资料无此主题，应 no_answer | 未复验；unavailable 不计正确拒答 |

## 上场前

保存普通身份的 Recovery Key 和备份，进入专用 Demo，并等待活动索引结束。已有记录证明当前 build 的主流程和 12/12 检查在验收当天通过；上场前重新运行 preflight，录制额外问题前也需逐项复验。原 Phase 9 预算记录继续保留。服务故障时按 fallback-demo.md 展示本地功能。
