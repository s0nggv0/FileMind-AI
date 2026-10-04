# 3–4 分钟真实演示稿

推荐八份自制资料：`ai-attention-notes.pdf`、`project-plan.docx`、`database-notes.txt`、`web-development.md`、两个 Aurora policy TXT、`transformer-slide.png`、`linear-algebra-whiteboard.jpg`。另两份研究笔记只用于可选重复检测。全流程验收见 [真实 Demo receipt](../evaluation/phase8-demo-live.json)，本机 Agent 到 Apply 约 62.58 秒、自动操作全程约 101.47 秒；不是网络延迟保证。

## 上场前

保存普通身份 Recovery Key，备份正式资料；只进入已注册专用 Demo 身份。构建、配置真实 provider、启用 `DEMO_MODE=true`，确认 Vision Gate。对现场环境运行 preflight，准备 fixture ZIP、备用演示资料和已完成的源文件抽屉。Reset 只在专用 Demo 使用，活动索引完成后再确认。

需要现场展示备份预览或恢复时，预先生成备份并做一次恢复彩排；备份生成/导入不塞进核心问答等待时间。开场前确认 Library 索引状态，保留真实模式标记。降级参照 [备用流程](fallback-demo.md)。

| 时间 | 操作 | 讲述重点 |
| --- | --- | --- |
| 0:00–0:20 | 展示空专用 Workspace，上传八份资料，启动 Agent | “这里有文件和图片。系统提出整理建议，最终由我决定。” |
| 0:20–1:25 | 展示实际进度/工具活动；等待 Review | 说明提取文字和图像解释分开；等待是真实处理时间，不展示伪造百分比。 |
| 1:25–1:45 | 修改或拒绝一项建议，再 Apply；Library 查看索引 | “模型的建议不是自动对我的文件生效。” |
| 1:45–2:30 | Search Ask：`What does Query, Key, Value do in attention?` | 回答经过引用和事实检查才显示；点击 PDF 或图片 citation，对照原文/原图。 |
| 2:30–3:10 | Ask：`According to the Aurora demo policies, how long are temporary audit records retained? Explain the change and cite both versions.` | 旧版 6 小时、新版 12 小时；明确 supersedes 来自原文，两个来源都保留。 |
| 3:10–3:35 | 打开 Graph，再展示备份预览或校验结果 | 展示资料关联和可迁移性；备份默认没有加密。 |
| 3:35–4:00 | Settings 中打开 Reset 确认后取消，展示评测证据 | “只允许重置专用 Demo；普通资料保留。”说明合成盲测与已知限制。 |

如果 Agent 在 1:25 仍未结束，切换事先准备的已保存 Demo，并明确告知使用了预先处理资料；不编造现场成功。RAG 等待期间可以展开检索来源说明证据位置。网络故障使用 Find 和原文，不将历史答案或 Mock 标为实时生成。

可选加时：上传 `research-notes.txt` 与 `research-notes-copy.md` 展示 hash/text 重复判断；在非正式资料环境演示 Backup Validate、Import 和恢复报告；打开 Maintenance 展示“原文件缺失但已提取知识保留”。这些不依赖永久删除文件。
