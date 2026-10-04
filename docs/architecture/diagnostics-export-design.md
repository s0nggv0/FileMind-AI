# 诊断导出设计边界

Phase 8 已实现受限结构化日志、Maintenance 的 owner-scoped 操作概要和 Demo preflight 本地 receipt；没有新增 Export Diagnostics 按钮或打包 API。本项在用户允许的范围内仅记录设计，避免扩大冻结后的产品实现。

若后续实现，可用固定 schema 导出构建版本、配置是否就绪的布尔值、Provider 名称、公开错误码、最近操作类型/状态/时间和已执行测试的状态。配置项不能导出值、路径或 URL query；操作 ID/workspace ID 应默认省略或重新匿名编号。不能包含原文件、提取正文、问题/答案、OCR/Vision 解释、向量、API Key、Recovery Key、Cookie、签名 secret、数据库连接串或完整日志文件。

导出必须取当前签名身份、继承 FORCE RLS、限定条数与字节大小，并在下载前给用户可读预览。测试状态需包含实际执行时间和环境类别，不能把别的机器的 receipt 当成当前健康。导出清单与 schema 校验可审阅后，再单独安排实现；本次没有启用或发布该功能。
