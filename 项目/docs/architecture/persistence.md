# Phase 4 Persistent Workspace — PostgreSQL

当前使用普通 PostgreSQL、pg 连接池和服务端私有文件目录。Supabase SDK、配置和依赖其 auth/storage schema 的迁移已从当前实现移除，历史提交保留。迁移为 `database/migrations/202610020001_workspace.sql`；`npm run db:migrate` 建立 filemind schema、8 张业务表和迁移记录，不需要额外扩展。

## 身份和权限

服务器为每个浏览器签发 UUID Demo 用户，以 HMAC 签名的 HttpOnly / SameSite Strict Cookie 识别。生产持久化要求固定 WORKSPACE_SESSION_SECRET，至少 32 字节；HTTPS 使用 Secure Cookie。开发未配置 Secret 时使用进程内随机值，重启后旧身份失效。清除 Cookie、换浏览器或丢失 Secret 不会恢复同一身份。没有 OAuth、账号找回或跨设备同步。

数据库连接串只在 server-only 模块读取。使用专用、非超级用户的数据库所有者或已授权应用角色。每个查询在同一连接上开启事务，用参数化 set_config 设置事务级 filemind.user_id，随后执行查询并提交；异常回滚，清理失败时丢弃连接，避免向下一个请求泄露身份上下文。连接池最大 5、连接超时 10 秒、SQL 超时 45 秒。

8 张业务表启用 ENABLE / FORCE ROW LEVEL SECURITY，按事务身份匹配 profiles.id 或 user_id。FORCE 也约束普通表所有者；PostgreSQL 超级用户和 BYPASSRLS 角色仍能绕过，故不能把管理员连接当作常规应用连接。数据库凭据只掌握在可信服务器或管理员手中，浏览器不能设置数据库上下文。

仓库查询显式筛选 user_id / workspace_id，Agent Tool 的 documentId 只识别已授权快照。复合外键阻止跨用户或工作空间引用；save_workspace 还验证参数用户等于事务身份。函数取消 PUBLIC 执行权限，应用数据库所有者保留调用能力；使用另一个运行角色时须显式授予 schema、表和函数权限。

## 原文件、正文和快照

上传流程是 Browser → 有界同源上传 Route → 私有文件目录。FILE_STORAGE_ROOT 默认 .filemind/storage，不在 public 目录内，不受网页静态服务暴露。存储 Key 是 userId/workspaceId/documentId/original.ext，不把原文件名用于路径。服务器验证归属、扩展名、MIME、20 MB 上限、大小与 SHA-256。

文件先写入同目录随机临时文件，再以拒绝覆盖的硬链接原子发布。相同路径重复上传须匹配大小和哈希，其他内容返回冲突；临时文件在发布后清理。逐层拒绝符号链接与非法目录，文件权限请求 0600 / 目录 0700；Windows 实际权限继承部署环境的 ACL。Agent 不修改或删除原文件。

PDF/DOCX/TXT/MD 在浏览器解析，图片只读取尺寸。正文最多 250,000 字符，写入 documents.text_content；metadata、parse_status、哈希和 storage_path 同时保存。截断正文不用于 Text duplicate 判断，空正文不算重复。真实 Kimi 只接收有界提取文本，不接收这些原始二进制文件。

workspaces.status 为 draft/processing/review/completed。snapshot 保存恢复用的 Run / Proposal，正文不在快照中重复保存；documents、agent_runs、agent_steps、organization_proposals、tags 与 relations 同时规范化到对应表。数据库 JSON 用 Zod 校验，pg 返回的 Date 转为 UTC ISO 格式。

save_workspace 在同一事务锁定工作空间，检查 expected revision，并原子保存快照和各表。多标签页冲突返回 409，失败全部回滚，旧 Run 保留。原文件落盘和数据库事务是两个操作；上传后保存失败可用同一路径、相同内容重试。上传孤儿对象自动清理尚未实现。

## 恢复、审核和展示

通过 `/workspace?workspace=<UUID>` 恢复，Dashboard Recent Workspaces 提供入口。GET 从当前用户数据库结果重建快照与正文引用。

- waiting_for_review：恢复分类、标签、接受/忽略状态及整理建议。
- completed：恢复已应用文件信息和有效关系，Library / Graph 读取保存结果。
- planning/running/applying：恢复为 failed + interrupted，显示 Run interrupted；Resume 在同一 Workspace 新建 Run，重用保存的正文与成功分析缓存。

Review 以 500 ms debounce 自动保存，显示 Saving / Saved / Save failed。Apply 验证版本、review 状态、完整文档集及引用，仅允许审核范围内的变化；在事务中更新元数据、标签、关系、Proposal 和 Run。Apply 携带最新完整 Proposal，避免遗漏尚未触发自动保存的最后修改。原文件持续保留。

Dashboard 统计使用当前用户数据库 COUNT，展示最近 50 个 Workspaces；Library 查询最多 1500 份资料和标签，Graph 展示规则关系。Local-only Demo 不上传、不持久化，刷新清空 Session；Persistent workspace 的保存与失败提示反映实际状态。

## 迁移和部署

迁移命令读取 .env.local，在单个事务和 advisory lock 内按文件顺序应用 SQL。schema_migrations 记录名称和 SHA-256，Windows/Linux 换行归一化；重复运行跳过已应用版本，已应用内容被修改则拒绝执行。程序不创建数据库，不删除其他项目数据；连接前由使用者选择专用 FileMind 数据库。

复用现有 PostgreSQL 服务时，新增独立数据库即可；数据库、角色和 schema 的层级不同，不需要每个项目重新安装服务。详情见 [配置说明](../setup/postgresql-kimi.md)。

私有文件目录需要持久磁盘并与数据库一起备份。适合本机或持久磁盘的 Node.js 主机；无服务器临时文件系统或多实例没有共享磁盘时，应另外接入对象存储。当前未实现 OSS/COS/S3 adapter、原文件下载 UI 或文件自动清理。

## 验证边界

PGlite 在无 Supabase 前置条件下运行实际 PostgreSQL 迁移和真实仓库逻辑，使用非超级用户、表所有者身份验证 FORCE RLS、跨用户读取/伪造保存/文档与 Step ID 拒绝、事务回滚、版本冲突和恢复。迁移重跑、换行和校验和保护也经验证；文件测试使用真实私有临时目录检查原子写入、重试、拒绝覆盖和路径约束。

生产 Playwright 使用持久化接口 fixture 验证审核、Apply、刷新、Resume、错误提示与本地 Parser。这些测试不等同于真实 PostgreSQL 服务 TCP/TLS、部署磁盘和 Kimi 收费接口联调；真实验收需要用户填写 DATABASE_URL 和 KIMI_API_KEY 后显式运行 test:live。停止于 Phase 4。
