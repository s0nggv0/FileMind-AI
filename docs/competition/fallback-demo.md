# 在线演示与故障备用流程

正常演示使用在线 AI。2026-10-04 的验收通过了扁平 schema、Conflict、Ambiguity、主 Demo 全流程和 12/12 检查，Agent 没有 Planner 回退，详见 [验收记录](release-freeze.md)。Phase 9 最初六次失败调用另有记录。

云服务故障时，继续展示已保存、已索引资料的本地功能，并说明 Cloud AI provider unavailable。展示旧答案时注明生成时间。Competition Mode 不切换到 Mock。

| 故障 | 继续展示 | 说明 |
| --- | --- | --- |
| Kimi timeout / schema | Library、Find、来源与原文 | 本次答案未通过发布验证。 |
| DashScope | lexical Find、原件 | 语义检索不可用。 |
| Vision unavailable / OCR 成功 | 原图、本地 OCR 和状态 | 仅文字提取，不声称理解图形。 |
| OCR unavailable / 已有 Vision | 已有解释和原图 | interpretation 不是准确转录。 |
| 两图像路径失败 | 原图、无可索引内容 | 不制造图像知识。 |
| PostgreSQL | 清楚错误、静态 fixtures 与报告 | Save、Apply、Import 未成功。 |
| 原文件缺失 | Original file unavailable、保留文字、Maintenance | 原文链接不可用。 |
| Agent 失败 | 实际诊断、此前保存 Workspace | fallback 不等于 LLM 计划成功。 |
| 索引中断 | 仍有效的已发布索引与重试 | 新资料不冒用旧索引。 |

备用顺序为 Library、Find QKV、原文或原图、Local OCR、Graph、Backup Validate，最后说明 Recovery。隐藏真实 key；备份 ZIP 没有加密。Reset 前确认专用身份并停止活动索引，取消操作会保留资料。

本地验收覆盖了新环境数据库、OCR、Recovery、Backup 完整性和五次 scoped reset。浏览器中的云故障测试使用注入响应，证明界面能处理指定错误；第三方实际故障和问答质量需分别验证。
