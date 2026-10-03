# FileMind AI

面向高校学习、研究与项目资料的 AI 文件管理产品。Phase 4 已实现 Persistent Workspace 和 Real LLM Agent Foundation，并按用户要求切换为 **普通 PostgreSQL + 服务端私有文件目录 + Kimi API**。代码与离线验收完成；真实数据库连接和收费模型端到端验收仍待用户配置，不能视为完全达到 Phase 4 完成标准。

保留 Next.js 16.3.8 / React 19.3.0 / TypeScript strict、Tailwind、shadcn/ui、Framer Motion、Zustand 与既有本地 PDF/DOCX/TXT/MD Parser。真实 Agent 基于 AI SDK 7、Kimi 兼容适配和 Zod，数据库通过 pg 连接池访问。没有 Embedding、pgvector、RAG、OCR、Vision、完整 OAuth 或后台 Job。

## Development / Mock Mode

需要 Node.js 22.13.0+。

```powershell
npm ci
npm run dev
```

没有 `.env.local` 时直接运行 Local-only Demo：不上传文件，规则分析与人工审核可用，刷新清空 Session。默认 AI_ENGINE=mock。配置 PostgreSQL 并执行迁移后，Mock Engine 也支持原文件、正文、Run、Proposal 持久化与恢复。

## Environment Variables

复制 `.env.example` 为 `.env.local`，不要提交 `.env.local` 或真实凭据。

| 变量 | 填写内容 | 需要场景 |
| --- | --- | --- |
| DATABASE_URL | postgresql://用户:编码后的密码@地址:端口/filemind_ai | 持久化，仅服务器 |
| FILE_STORAGE_ROOT | 私有文件目录，默认 .filemind/storage | 原文件保存；部署需持久磁盘 |
| WORKSPACE_SESSION_SECRET | 至少 32 字节随机密钥，长期保留 | 持久化身份跨重启恢复；生产必需 |
| AI_ENGINE | mock 或 llm | 默认 mock；真实 AI 填 llm |
| AI_PROVIDER | kimi | 当前使用 Kimi |
| AI_MODEL | kimi-k2.6 | Planner 与计划，已适配非思考模式 |
| AI_SMALL_MODEL | 可留空，复用 AI_MODEL | 文档分析 |
| KIMI_API_KEY | Kimi 开放平台 API Key | 真实 AI，仅服务器 |
| KIMI_BASE_URL | https://api.moonshot.cn/v1 | Kimi API 服务地址 |
| WORKSPACE_COOKIE_SECURE | true | HTTPS；本地 HTTP 生产预览可设 false |
| GEMINI_API_KEY / DEEPSEEK_API_KEY | 留空 | 未来 adapter 预留 |

生成 WORKSPACE_SESSION_SECRET：`node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`。把结果写入本地环境文件，不发送到聊天。数据库密码和模型 Key 都不使用 NEXT_PUBLIC 前缀，不进入客户端 bundle。

## PostgreSQL Setup / Database Migration

1. 在现有 PostgreSQL 服务中为本项目创建独立 filemind_ai 数据库和普通应用用户，填写 DATABASE_URL。支持 PostgreSQL 14+，无需每个项目安装一套服务。
2. 执行 `npm run db:migrate`。迁移文件是 `database/migrations/202610020001_workspace.sql`，无需 Supabase 的 auth/storage schemas 或角色。
3. 迁移在 filemind schema 创建 8 张业务表、FORCE RLS 与事务保存函数，记录迁移校验和；可重复运行。私有原文件保存在 FILE_STORAGE_ROOT，默认 .filemind/storage，该目录已忽略 Git。
4. 配置固定 WORKSPACE_SESSION_SECRET，重启服务。每个浏览器拥有独立服务器签发的 Demo 用户；没有 OAuth。清 Cookie 或换浏览器会产生不同身份。
5. 先用 AI_ENGINE=mock 检查上传、保存和刷新，确认持久化后再启用 LLM。

原文件由同源安全上传 API 写入服务端私有目录。路径是 userId/workspaceId/documentId/original.ext，禁止覆盖既有原文件。PDF/DOCX 仍在浏览器解析；正文进入 PostgreSQL，真实 AI 将有界提取文本发送给 Kimi。UI 区分 Local-only Demo 和 Persistent workspace。

完整操作说明：[PostgreSQL + Kimi 配置](docs/setup/postgresql-kimi.md)。部署需要可持久写入的磁盘 / Volume，并同时备份数据库和文件目录；临时文件系统的部署需另行接入对象存储。

## AI Provider Setup / LLM Mode

填入 KIMI_API_KEY、AI_ENGINE=llm、AI_PROVIDER=kimi、AI_MODEL=kimi-k2.6，重启 `npm run dev`。AI_SMALL_MODEL 留空复用主模型。当前适配只支持 kimi-k2.6 的非思考模式；其他型号需要匹配各自的参数，未经适配会明确报配置错误。至少需要已迁移的 PostgreSQL 数据库。

上传 → 本地解析 → 私有持久化 → 真实 Planner Tool Calling → 合并文档分析 → 确定性重复/关系检查 → 严格计划校验 → Review → 自动保存 → Apply → 刷新恢复。Provider 错误会明确降级为 basic local organization，所有原文件保留。模型不会自动 Apply 或删除资料。

## Validation

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

领域测试包含普通 PostgreSQL WASM 迁移、真实仓库与 FORCE RLS、事务与跨用户拒绝、私有文件落盘、Kimi 请求格式 / 流式输出 fixture，以及 Schema / Injection Boundary / 重试 / 降级。生产浏览器测试使用独立 3074 端口，每次启动当前构建，不复用旧服务器；测试接口 fixture 不请求收费 Provider。

配置云端服务后可运行 **真实验收**：

```powershell
npm run test:live
```

此命令在 3075 启动开发服务，上传四份专用合成 Fixtures：Transformer Notes.pdf、NLP Lecture.md、final2.docx、research.txt，执行真实 Kimi、修改审核、刷新、Apply、Library 与无权限访问检查。**会调用收费模型并留下测试 Workspace，只有明确运行时才执行。** 当前尚未运行真实服务联调。Windows 默认使用已安装 Edge；其他系统安装 Playwright Chromium，或配置 PLAYWRIGHT_BROWSER_EXECUTABLE。

`predev` / `prebuild` 准备同源 PDF Worker/CMaps/字体/Wasm，避免第三方 CDN。生产启动使用 `npm run build` 后 `npm run start`。已有 lockfile 的环境用 npm ci。

## 页面与实现边界

| 路由 | 当前行为 |
| --- | --- |
| / | 既有产品演示 |
| /dashboard | 真实保存统计、Recent Workspaces、公开活动；空数据展示 Empty State；示例和 Demo Insights 显式展开 |
| /workspace | 新 Workspace 或现有本地演示 |
| /workspace?workspace=UUID | 按当前 Demo 用户从服务器恢复；Interrupted 明确提示 Resume |
| /library | 已保存基础详情与当前 Session，预置示例可切换 |
| /graph | 保存的规则关系与显式示例，无语义相似度 |
| /search /cleanup | 原有演示，不是 RAG 或真实语义检索 |
| /settings | 主题和界面状态预览 |

最大 30 文件，每个 20 MB；PDF 200 页 / 250,000 字符。长文 AI 抽样最多 18,000 字符，最多并发 3 次分析，Agent 最多 15 次工具调用、240 秒。不显示隐藏 reasoning。Review 500 ms 自动保存；Apply 原子保存元数据与有效关系，原文件不修改、不删除。

生产持久化要求稳定 Secret 和浏览器 Cookie。无完整账号、跨设备身份或后台任务；刷新正在执行的 Run 会显示 Interrupted，Resume 重跑 Planner 并复用缓存。未保存的客户端解析数据无法恢复。当前无 Storage 下载 UI、自动清理孤儿对象或分页 UI。

架构：[AI Provider](docs/architecture/ai-provider.md)、[Persistence](docs/architecture/persistence.md)。验收：[Phase 4](docs/phase-checklists/phase4.md)。既有 [Phase 1](docs/phase-checklists/phase-1.md)、[Phase 2](docs/phase-checklists/phase2.md)、[Phase 3](docs/phase-checklists/phase3.md) 历史保留。Phase 4 后停止，不自动进入 Phase 5。

## Git 提交约定

按照 [AGENTS.md](AGENTS.md)，将可独立验收的任务改动持续 Commit，验证后普通 Push；保留已有历史，不 amend/squash/rebase，不提交凭据、依赖或临时验收文件。网络不可达时如实记录本地提交与远端同步差异。

## Phase 5：个人知识检索与引用

已实现结构化分段、独立 DashScope Embedding、便携向量存储、中英文 Hybrid 检索、确定性重排、Kimi 流式回答与数据库原文引用。Ask 回答、Find 查资料；Apply 后索引，Library 查看状态和重试，Search 可更新索引、追问并刷新恢复。

- [检索配置](docs/setup/knowledge-retrieval.md)：Kimi 与 Embedding 分开配置，本机模型为 qwen3.7-text-embedding-flash / 1024 维。
- [检索架构](docs/architecture/retrieval.md)：Chunk、RLS、缓存、RRF、RAG、引用验证、退回与限制。
- [Phase 5 验收](docs/phase-checklists/phase5.md)：真实模型、25 个检索问题、无答案、浏览器与便携复制结果。

真实 Gate 0、Embedding、RAG 与引用点击已通过。专用 PostgreSQL 无 pgvector，使用持久化 real[] 的 PortableVectorStore。便携复制包含 Chunk、向量与检索历史；Key 和私人数据不进入 Git。Phase 5 完成后停止，不自动进入 Phase 6。

## Phase 6：多模态资料与困难检索评测

PNG/JPG/JPEG、学习截图、板书和扫描图片现可通过真实 Kimi Vision 与独立中英文离线 OCR 进入整理、人工审核、知识索引、跨模态检索和 Citation RAG。原图、OCR 提取文字、AI 解释与引用证据分别展示。图片引用打开私有原图，不编造页码或行号；故障可重试。扫描 PDF 当前只检测低文本并提示，尚未自动渲染页面做 OCR。

- [多模态架构](docs/architecture/multimodal.md)：验证、队列、独立缓存、来源与故障行为。
- [困难评测](docs/evaluation/rag-hard-evaluation.md)：72 份合成资料（含 12 张图）、144 个查询，真实 Kimi / DashScope 的结果与失败案例。
- [Phase 6 验收](docs/phase-checklists/phase6.md)：浏览器、原图、隔离、缓存、移动端和整文件夹复制。
- [备份与身份恢复设计](docs/architecture/backup-recovery.md)：仅设计，未实现完整导出/导入与账号恢复。

最终 Vector / Lexical / Hybrid + Rerank 的 Hit@5 为 0.992 / 0.700 / 0.975；本样本 Vector 更强。图片 Hit@5 为 1.00，12/12 图片回答返回有效来源，无答案准确率为 22/24。引用身份有效不等于每条模型陈述都正确。保留 800 estimated tokens / 100 overlap 与 RRF 60。

```powershell
npm run test:vision
# 先启动 FileMind 专用服务到 3082，再执行真实浏览器验收：
npm run test:multimodal-live
npm run evaluate:hard
# 停止当前 FileMind 后，执行真实整文件夹迁移验收：
npm run test:portable:copy
```

上述命令会调用收费模型，使用自建合成资料；原文件、Key、数据库、离线语言缓存和便携运行时不进入 Git。OCR Worker、WASM、语言数据与 Sharp Windows DLL 随 standalone 打包，无需全局 OCR。已验证中文/空格目录中的原图、分析、向量、检索及引用恢复。当前浏览器 Cookie 身份仍不支持跨设备找回。Phase 6 完成后停止，不自动进入 Phase 7。
