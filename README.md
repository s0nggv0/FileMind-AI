# FileMind AI

面向高校学习、研究与项目资料的 AI 文件管理产品。Phase 4 已实现 Persistent Workspace 和 Real LLM Agent Foundation 的代码与离线验收。**当前用户尚未配置 Supabase / OpenAI，真实云端端到端验收仍待配置，不能视为完全达到 Phase 4 完成标准。**

保留 Next.js 16.3.8 / React 19.3.0 / TypeScript strict、Tailwind、shadcn/ui、Framer Motion、Zustand 与既有本地 PDF/DOCX/TXT/MD Parser。真实 Agent 基于 AI SDK 7、OpenAI adapter、Zod 和 Supabase。没有 Embedding、pgvector、RAG、OCR、Vision、完整 OAuth 或后台 Job。

## Development / Mock Mode

需要 Node.js 22.13.0+。

```powershell
npm ci
npm run dev
```

没有 `.env.local` 时直接运行 Local-only Demo：不上传文件，规则分析与人工审核可用，刷新清空 Session。默认 AI_ENGINE=mock。配置 Supabase 后，Mock Engine 也支持原文件、正文、Run、Proposal 持久化与恢复。

## Environment Variables

复制 `.env.example` 为 `.env.local`，不要提交 `.env.local` 或真实凭据。

| 变量 | 填写内容 | 需要场景 |
| --- | --- | --- |
| NEXT_PUBLIC_SUPABASE_URL | Supabase 项目的 HTTPS URL | 持久化 |
| SUPABASE_SERVICE_ROLE_KEY | 项目 API 设置中的服务器 service_role / secret key | 持久化，仅服务器 |
| WORKSPACE_SESSION_SECRET | 至少 32 字节随机密钥，长期保留 | 持久化身份跨重启恢复；生产必需 |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | anon / publishable key | 本阶段服务器方案不需要，可留空 |
| AI_ENGINE | mock 或 llm | 默认 mock；真实 AI 填 llm |
| AI_PROVIDER | openai | 本阶段仅实现 OpenAI |
| AI_MODEL | gpt-4.1-mini 或可用的结构输出/工具调用模型 | Planner 与计划 |
| AI_SMALL_MODEL | 可留空，复用 AI_MODEL | 文档分析 |
| OPENAI_API_KEY | OpenAI 项目 API Key | 真实 AI，仅服务器 |
| WORKSPACE_COOKIE_SECURE | true | HTTPS；本地 HTTP 生产预览可设 false |
| GEMINI_API_KEY / DEEPSEEK_API_KEY | 留空 | 未来 adapter 预留 |

生成 WORKSPACE_SESSION_SECRET：`node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`。把结果写入本地环境文件，不发送到聊天。没有 NEXT_PUBLIC 的模型密钥变量。Service Role 不进入客户端 bundle。

## Supabase Setup / Database Migration

1. 创建 Supabase 项目，在 API 设置取得项目 URL 和服务器密钥，写入 `.env.local`。
2. 执行版本管理的 SQL：`supabase/migrations/202610020001_phase4_workspace.sql`。可以把完整 SQL 放入 Supabase SQL Editor 执行；已有 Supabase CLI 的环境也可 link 项目后 `supabase db push`。不手工单独建表。
3. 迁移创建 profiles、workspaces、documents、agent_runs、agent_steps、organization_proposals、document_tags、document_relations，并创建私有 documents bucket。不要把 bucket 改为 Public。
4. 配置固定 WORKSPACE_SESSION_SECRET，重启服务。每个浏览器拥有独立服务器签发的 Demo 用户；没有 OAuth。清 Cookie 或换浏览器会产生不同身份。
5. 先用 AI_ENGINE=mock 检查上传、保存和刷新，确认持久化后再启用 LLM。

原文件由同源安全上传 API 写入私有 Storage。路径是 userId/workspaceId/documentId/original.ext。PDF/DOCX 不直接发送给模型，仍在浏览器解析。云端模式会存储原文件与提取正文；真实 AI 会将有界提取文本发送给 Provider。UI 准确区分 Local-only Demo 和 Persistent workspace。

## AI Provider Setup / LLM Mode

填入 OPENAI_API_KEY、AI_ENGINE=llm、AI_PROVIDER=openai、AI_MODEL=gpt-4.1-mini，重启 `npm run dev`。AI_SMALL_MODEL 可留空或选择相应可用小模型。至少需要已迁移的 Supabase 项目。

上传 → 本地解析 → 私有持久化 → 真实 Planner Tool Calling → 合并文档分析 → 确定性重复/关系检查 → 严格计划校验 → Review → 自动保存 → Apply → 刷新恢复。Provider 错误会明确降级为 basic local organization，所有原文件保留。模型不会自动 Apply 或删除资料。

## Validation

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

领域测试包含实际 PostgreSQL WASM 迁移与事务测试、OpenAI 请求格式 fixture、Schema / Injection Boundary / 重试 / 降级 / 身份检查。生产浏览器测试使用独立 3074 端口，每次启动当前构建，不复用旧服务器；测试接口 fixture 不请求收费 Provider。

配置云端服务后可运行 **真实验收**：

```powershell
npm run test:live
```

此命令在 3075 启动开发服务，上传四份专用合成 Fixtures：Transformer Notes.pdf、NLP Lecture.md、final2.docx、research.txt，执行真实 LLM、修改审核、刷新、Apply、Library 与无权限访问检查。**会调用收费模型并留下测试 Workspace，只有在你主动运行时才执行。** 当前尚未运行该云端测试。Windows 默认使用已安装 Edge；其他系统安装 Playwright Chromium，或配置 PLAYWRIGHT_BROWSER_EXECUTABLE。

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
