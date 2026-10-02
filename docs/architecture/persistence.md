# Phase 4 Persistent Workspace

迁移：`supabase/migrations/202610020001_phase4_workspace.sql`，从空 Supabase PostgreSQL 创建 profiles、workspaces、documents、agent_runs、agent_steps、organization_proposals、document_tags、document_relations 和私有 documents bucket。无 pgvector。迁移依赖 Supabase 自带 auth/storage schema 与标准角色。

## 身份和隔离

不开发 OAuth。服务器为每个浏览器签发不同 UUID Demo 用户，用 HMAC 签名的 HttpOnly / SameSite Strict Cookie 识别；生产持久化要求 `WORKSPACE_SESSION_SECRET`，HTTPS 默认 Secure。开发没有 secret 时使用进程内随机 secret，因此开发服务重启会失去旧身份；需要跨重启恢复时配置固定随机 secret。清除 Cookie、换浏览器或丢失 secret 不会恢复同一身份。本阶段没有账号找回与跨设备同步。

Service Role 仅在 `server-only` 模块创建。所有仓库查询同时筛选 user_id 与 workspace_id，Agent Tool 的 documentId 必须存在于已授权快照。Apply 重新校验用户、版本、review 状态、文档集及建议引用，不能增加、删除文档或篡改原始元数据。各表含 user_id，复合外键防止跨租户关联；RLS 使用 auth.uid() 为未来 Auth 提供基础，当前 Demo 通过服务器权限边界访问。RPC 仅授予 service_role，anon/authenticated 不能调用。

## 原文件、文本与 JSON

上传流程是 Browser → 有界同源安全上传 Route → Supabase Storage。文件最大 20 MB，bucket 私有，无公开对象策略。Key 是 `userId/workspaceId/documentId/original.ext`，不使用原文件名做唯一 Key；服务器验证工作空间归属、扩展名、MIME、大小与 SHA-256，禁止覆盖已有对象。用户上传原文件永不被 Agent 修改或删除。

沿用浏览器 PDF/DOCX/TXT/MD Parser，图片只读取尺寸。正文最大 250,000 字符，暂存 documents.text_content；metadata、parse_status、文件/归一化文本哈希和 storage_path 也持久化。截断正文不用于 Text duplicate 判断，空正文不算文本重复。Phase 5 应拆 document_chunks，并把正文主存储转为分块引用；目前正文不会无限增长，snapshot 不复制正文。

workspaces.status 仅 draft/processing/review/completed。`snapshot` 是有界领域恢复快照，保存当前 Run 与 Proposal；documents、agent_runs、agent_steps、organization_proposals、tags 与 relations 同时规范化到对应表。数据库 JSON 全部由 Zod 校验后读取；不用 `as OrganizationPlan`。`save_workspace` 在同一事务锁 Workspace，检查 expected revision，并原子写入快照和规范化表。多标签页冲突返回 409，不最后写入覆盖。旧 Run 记录保留；Phase 4 没有复杂版本历史 UI。

## 恢复、审核和 Apply

保持 `/workspace` 新建流程，通过 `/workspace?workspace=<UUID>` 恢复。Dashboard Recent Workspaces 链接可再次进入。GET 从当前用户服务器快照和 documents 正文重建 parser content references。

- waiting_for_review：恢复 Proposal，包括分类、标签和各项接受/忽略状态。
- completed：恢复已应用文档和有效关系，Library / Graph 可直接读取保存结果。
- planning/running/applying：恢复为 failed + interrupted 显示 **Run interrupted**；不宣称后台仍在执行。**Resume analysis** 在同一 Workspace 新建 Run，重用已保存正文。成功 AI 分析可通过缓存复用，Planner 会重新运行。

Review 用 500 ms debounce 自动保存，并显示 Saving / Saved / Save failed。Mock 持久化等待最终 Run 保存后才开放 Review。Apply 使用服务器 PATCH 再次验证，事务更新元数据、标签、有效关系、Proposal 与 Run；不改动 Storage 原文件，不执行重复删除。Apply 携带当前编辑后的完整 Proposal，因此即使 debounce 尚未触发也不会丢失最后修改。

Local-only Demo 不上传、不持久化；刷新清空 Session。Supabase 模式准确提示 **Files are securely stored in your workspace for processing.**；AI 模式会向 Provider 发送有界提取文本。原文件进入私有 Storage，不直接发送给模型。无云配置时 Dashboard 真实统计为 0；示例与 Demo Insights 显式展开。Library 的预置示例可切换。

## 测试与限制

PGlite 运行实际 PostgreSQL 迁移，模拟 Supabase auth/storage 前置环境，验证空库建表、事务保存、版本冲突、租户拒绝与私有 bucket 设置。生产 Playwright 使用持久化接口 fixture 验证上传、自动保存、刷新 Review/Completed、Interrupted Resume 和错误提示。这不能替代真实 Supabase Storage/RLS 云端联调，用户尚无项目配置，该项待配置验收。

当前最多展示最近 50 个 Workspaces / 1500 份资料；没有分页 UI、完整 Auth、跨设备账号、后台队列、原文件下载界面或上传孤儿对象清理任务。刷新仍处于客户端解析或尚未保存的阶段，未保存的内容无法恢复。断线后的保存以最后成功事务为准；看到 Saved 后刷新可恢复。Supabase 超时 45 秒，失败不会伪装成功。
