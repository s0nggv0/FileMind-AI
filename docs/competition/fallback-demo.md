# Plan A / Plan B

**Plan A**：真实在线 AI。当前 schema 抽验无效、主 Demo 未复验，新环境 preflight 7/12，尚未就绪。需新的明确调用授权，取得当前构建 12/12 READY 和完整彩排。Phase 9 六次上限已用满。

**Plan B**：使用已保存、已索引的真实资料展示本地能力，流程和材料已准备。明确说明 **Cloud AI provider unavailable.** 旧答案注明历史生成；Competition Mode 不提供 Mock 冒充路径。

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

备用顺序：Library -> Find QKV -> 原文／原图 -> Local OCR -> Graph -> Backup Validate -> Recovery 说明。真实 key 不露屏；ZIP 默认无加密。Reset 前确认专用身份并停止活动索引，取消不改变资料。

已验证的本地基线为新环境数据库、OCR、Recovery、Backup 完整性和五次 scoped reset；云故障浏览器响应是注入验收，与第三方服务实际故障、真实问答质量属于不同证据。
