# Phase 4 验收记录 — 2026-10-02

**状态：已按用户要求切换为普通 PostgreSQL + 私有文件目录 + Kimi，代码与离线验收完成；真实 PostgreSQL 服务 / Kimi 端到端验收待用户配置。当前不能宣布已完全满足 Phase 4 的全部完成标准。停止于 Phase 4，不进入 Phase 5。**

用户确认当前没有配置凭据，随后选择复用现有 PostgreSQL 服务、使用 Kimi API。没有连接其他项目数据库、没有创建真实账号、没有获取 Key 或调用收费模型。配置清单见 README、`.env.example` 和 `docs/setup/postgresql-kimi.md`。

## 已实现

- [x] 保留 AgentEngine，支持 MockAgentEngine / LLMAgentEngine；组件不 import Provider SDK。
- [x] server-only Provider 工厂；AI SDK 7 兼容适配 Kimi；默认 kimi-k2.6 非思考模式，集中 main/small 配置。
- [x] generateText / generateObject / streamText / callTools 统一接口。
- [x] 一次文档结构化调用输出真实摘要、分类、标签、保守命名；四个公开逻辑步骤复用结果。
- [x] ToolRegistry 每个定义含 name/description/inputSchema/execute；执行前校验 Zod。
- [x] 真实 Planner Tool Call → 白名单执行 → Tool Results → 下一步 → Proposal。
- [x] 组织计划 Schema、ID/分类检查、重试一次与确定性降级。
- [x] 模型错误统一、安全 UI 信息和明确本地 fallback。
- [x] Prompt 版本化、不可信数据边界、标签闭合转义、未知工具/外部 ID 拒绝。
- [x] 普通 PostgreSQL 迁移建立 filemind schema、8 张业务表、FORCE RLS、复合外键与保存函数，移除 Supabase 依赖。
- [x] pg 连接池和同连接事务级用户上下文；回滚失败丢弃连接，连接与 SQL 有超时。
- [x] 私有文件目录原子保存、相同内容重试、拒绝覆盖、路径/符号链接校验。
- [x] db:migrate 支持原子初始化、重复执行、校验和与 Windows/Linux 换行兼容。
- [x] 服务器签名 Demo 身份，user_id + workspace_id 查询，Apply 再验证。
- [x] 原文件安全上传、UUID 路径、大小/MIME/扩展名/文件哈希检查、不覆盖原文件。
- [x] 正文长度上限、文件/完整归一化文本哈希、分层重复检测。
- [x] 关系标记 rule-based，无 Semantic / Embedding 声称。
- [x] 原子快照与规范化表保存、revision 并发冲突保护。
- [x] PostgreSQL 带偏移时间戳统一为领域 UTC 格式，恢复可校验。
- [x] Review 500 ms debounce 自动保存、Saved/Saving/Error 状态、Apply 保留最终修改。
- [x] GET 恢复 Review / Completed；运行中刷新显示 Interrupted，Resume 在原 Workspace 重跑并复用正文/缓存。
- [x] `/workspace?workspace=UUID`、Recent Workspaces、真实 Dashboard 统计/活动、Library 基础详情、保存关系恢复。
- [x] UI 区分 Local-only Demo 与持久化，准确告知原文件存储和文本发送。
- [x] API 成本边界：30 文档、并发 3、18,000 字输入、15 Planner 调用、一次重试、45 秒 Provider / 240 秒 Agent。
- [x] 记录成功调用 token usage；缓存限定同用户、hash/model/prompt/name/category strategy。
- [x] 无 Key 也可 npm run dev；本地 Demo 不上传、不持久化。
- [x] 可显式运行 `npm run test:live` 的四合成文件云端验收。
- [x] README、AI Provider / Persistence 架构文档和配置说明。

## 验证结果

| 检查 | 结果 | 验证范围 |
| --- | --- | --- |
| npm run build | 通过 | Next.js 16.3.8 生产构建；Dashboard 为动态数据页面 |
| npm run typecheck | 0 errors | 严格 TypeScript，包括测试与 Live 配置 |
| npm run lint | 0 errors / warnings | 项目 ESLint |
| npm run test | 33/33 通过 | Kimi 地址/认证/严格 JSON/非思考工具/流式 fixture、Agent、领域边界、实际 PostgreSQL 仓库/FORCE RLS/迁移、文件落盘与拒绝覆盖 |
| npm run test:e2e | 13/13 通过 | 生产 3074 服务；本地真实 PDF/DOCX/TXT/MD/图片解析、审核、Apply、Library/Graph、深色、错误恢复、持久化接口 fixture、LLM Transport fallback、持久化 Retry 后立即 Apply 与刷新 |
| 补充实际服务器未授权 GET | 通过 | 伪造 Demo Cookie 返回 404；在同一 browser test 单独复验 |
| 空 PostgreSQL 迁移 | 通过 | PGlite 实际 PostgreSQL，无 auth/storage 前置 schema；真实仓库查询与表所有者 FORCE RLS |
| 事务与跨用户 Step ID | 通过 | 错误事务回滚；revision 不变；保存函数执行权限边界 |
| 客户端秘密边界 | 通过 | `.next/static` 没有 KIMI_API_KEY / DATABASE_URL 配置引用；无客户端模型请求 |
| 正常浏览器 Console | 0 errors | 混合文件、审核、Apply 与恢复正常路径；服务失败测试为主动注入 HTTP 503 |
| 原 Phase 4 视觉验收 | 通过 | 1440 / 1280 / 768 / 390px；深色与 reduced motion；无水平溢出；人工检查桌面/手机截图；本次后端替换沿用界面 |
| 原 Phase 4 Impeccable 机械检查 | 无发现 | Workspace、Review、Agent、History 目标；本次未重新进行视觉设计 |
| 真实 PostgreSQL 服务及部署磁盘 | 待配置 | TCP/TLS 连接与持久磁盘未联调；WASM 和临时目录测试不能替代部署验收 |
| 真实 Kimi 端到端 | 待配置 | 当前没有 Key；SDK 与 HTTP 格式 fixture 已通过，未调用收费模型 |

## 必需配置与真实验收

1. 复制 `.env.example` 到 `.env.local`。
2. 在现有 PostgreSQL 服务创建专用数据库/普通用户，填 DATABASE_URL、FILE_STORAGE_ROOT 和 WORKSPACE_SESSION_SECRET。
3. 执行 `npm run db:migrate`，初始化 filemind schema；部署原文件目录必须有持久磁盘。
4. 先用 AI_ENGINE=mock 检查服务器保存和刷新。
5. 填 KIMI_API_KEY，设置 AI_ENGINE=llm、AI_PROVIDER=kimi、AI_MODEL=kimi-k2.6；AI_SMALL_MODEL 留空复用主模型。
6. 重启服务，主动运行 `npm run test:live`。测试使用 Transformer Notes.pdf / NLP Lecture.md / final2.docx / research.txt 合成数据，会请求收费模型并留下测试 Workspace。
7. 确认运行 engine=llm、result.simulation=false、没有 fallback、usage>0，原文件有 storagePath，Review/Apply 刷新恢复，另一个浏览器身份不能访问。云端结果通过后再完成 Phase 4 全量验收。

Gemini/DeepSeek Key 为预留且无需配置。模型 Key 和数据库连接串不得添加 NEXT_PUBLIC 前缀。旧 Supabase / OpenAI 环境变量已从当前实现移除。

## 已知限制

- 没有真实服务配置，Kimi 可用性、PostgreSQL TCP/TLS 和部署磁盘联调未验收。
- 当前原文件存储适合有持久磁盘的主机，多实例或临时文件系统部署需要另行接入对象存储并配置备份。
- Demo 身份依赖浏览器 Cookie 与稳定 session secret；无跨设备登录、账号恢复或 OAuth。开发随机 secret 在进程重启后失效。
- 无后台任务；刷新以最后成功事务为准，尚未保存的浏览器解析内容不能恢复。
- 长文使用抽样，摘要不能保证覆盖全部内容；扫描 PDF / 图片没有 OCR 或 Vision。
- Resume 重新执行 Planner，成功分析通过缓存复用；没有持久化 Job 或实时多标签页协调。
- 当前最近 50 个 Workspaces / 1500 份 Library 文档，无分页 UI；Dashboard 文档与 Workspace 总数使用数据库 exact count。
- 无原文件下载 UI、上传孤儿对象自动清理、完整版本历史或复杂知识洞察。
- Provider 失败请求仍可能计费，usage 只聚合成功返回的调用；不估算美元费用。

## Git 历史

所有实现与修正均保留既有历史，普通 Push 到 origin/main，不修改全局 Git 配置。旧 Supabase / OpenAI 实现可从既有提交查看。

| Commit | 内容 |
| --- | --- |
| 4286f20 | Persistent workspace storage / tenant boundaries |
| c17862a | AI Provider abstraction / structured analysis / input guard |
| b41dc73 | Bounded LLM execution / deterministic tools / migration tests |
| 4fd60c8 | Recovery / autosave / explicit fallbacks / Dashboard / Library / live acceptance command |
| eb666eb | Tool execution validation / PostgreSQL timestamp normalization |
| 9d3c85a | Persistent Retry/Skip 保存顺序与可恢复错误状态 |
| 48d5ba7 | Kimi 非思考 Provider、配置及协议测试 |
| 0315a3d | 普通 PostgreSQL、FORCE RLS、事务迁移与私有文件存储 |

本检查表与架构文档另作交付文档提交。没有提交 .env.local、Key、数据库密码、原始隐私文件、node_modules、构建产物或验收截图。

## Phase 5 建议起点（未实施）

先完成 Phase 4 云端验收，再建立 document_chunks 与可复用分块策略，设计模型/版本明确的 Embedding 和检索评估。以此为基础再加入 pgvector / semantic_search 与带引用的 RAG，不提前声称规则关系为语义关系。
