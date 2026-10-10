# FileMind AI

FileMind AI 用来整理学习和研究资料。导入 PDF、Word、笔记和图片后，Agent 提出分类、标签与命名建议，用户审阅后再保存。查资料时可以搜索正文、提问，并通过引用打开原文或原图。

项目使用 Next.js 16.3.8、React 19.3.0、TypeScript strict、Tailwind、shadcn/ui、Framer Motion 和 Zustand。服务端通过 AI SDK 7、Kimi 适配器和 Zod 处理模型调用；PostgreSQL 保存工作区和索引，私有文件目录保存原件。图片由 Kimi Vision 和本地 OCR 分别处理，DashScope 提供独立 Embedding。

2026-10-04 的真实验收通过了 Conflict、Ambiguity、扁平 schema 和八份资料的完整 Demo，`demo:check` 为 12/12。构建、类型检查、lint、106 个单元测试及浏览器检查也已通过。完整结果见 [发布验收记录](docs/competition/release-freeze.md)，项目介绍和演示材料见 [比赛说明](docs/competition/README.md)。这些记录反映验收当天的结果，演示前仍需检查服务状态；旧 ZIP 尚未重新打包。

## 已准备好的本地文件夹：直接运行

已准备的便携文件夹包含 Windows x64 Node.js、独立 PostgreSQL 和 standalone 生产构建。在已有 `.env.local` 填写 `KIMI_API_KEY` 后，双击 `启动 FileMind.bat`，访问窗口显示的本机地址。普通模式下，Key 留空使用 Mock，填写后重启使用 Kimi。比赛模式另需配置 Embedding、Vision 验证标记和真实服务，具体见 [运行说明](docs/competition/release-guide.md)。

复制前运行 `停止 FileMind.bat`，再复制整个文件夹，保留 `.filemind`、`.next` 和 `.env.local`。副本使用自己的数据库和原文件，端口冲突时自动避让，不操作其他目录的数据库。历史搬移测试覆盖了中文和空格目录；当前候选版的安装验收范围是 Windows x64 的 ASCII 路径，无需全局安装 Node.js / PostgreSQL。

详细步骤见 [使用说明](使用说明.md)。Git 仓库只提供源码，不包含本地运行程序、构建、数据库和密钥。源码安装按下面的流程准备环境。换浏览器或电脑时，可通过同一数据库中的恢复密钥找回身份；搬运资料也可使用备份导出和导入。

## 本地开发

需要 Node.js 22.13.0+。

```powershell
npm ci
npm run dev
```

没有 `.env.local` 时直接运行 Local-only Demo：不上传文件，规则分析与人工审核可用，刷新清空 Session。默认 AI_ENGINE=mock。配置 PostgreSQL 并执行迁移后，Mock Engine 也支持原文件、正文、Run、Proposal 持久化与恢复。

## 环境配置

源码环境从 `.env.example` 复制出 `.env.local`，再填写下列配置。便携文件夹已经生成数据库和身份凭据，配置模型时保留这些值。真实凭据不提交到仓库。

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
| DASHSCOPE_API_KEY | DashScope API Key | 独立 Embedding，仅服务器；详细参数见检索配置 |
| COMPETITION_MODE / DEMO_MODE | true | 比赛模式和专用 Demo；比赛模式要求真实服务 |
| WORKSPACE_COOKIE_SECURE | true | HTTPS；本地 HTTP 生产预览可设 false |
| GEMINI_API_KEY / DEEPSEEK_API_KEY | 留空 | 未来 adapter 预留 |

生成 WORKSPACE_SESSION_SECRET：`node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`。将结果保存在本地环境文件。数据库密码和模型 Key 不使用 NEXT_PUBLIC 前缀，也不进入客户端 bundle。

## 外部 PostgreSQL 与迁移

便携启动程序已为当前本地文件夹初始化独立实例、filemind_ai 数据库、非超级用户、固定身份密钥和迁移；下列步骤仅用于自行部署外部 PostgreSQL。

1. 在现有 PostgreSQL 服务中为本项目创建独立 filemind_ai 数据库和普通应用用户，填写 DATABASE_URL。支持 PostgreSQL 14+，无需每个项目安装一套服务。
2. 执行 `npm run db:migrate`，按顺序应用 database/migrations 中的迁移。基础迁移是 `database/migrations/202610020001_workspace.sql`，无需 Supabase 的 auth/storage schemas 或角色。
3. 基础迁移在 filemind schema 创建 8 张业务表、FORCE RLS 与事务保存函数，后续迁移补充知识索引、恢复和维护等结构。迁移记录校验和，可重复运行。私有原文件保存在 FILE_STORAGE_ROOT，默认 .filemind/storage，该目录已忽略 Git。
4. 配置固定 WORKSPACE_SESSION_SECRET，重启服务。每个浏览器使用服务器签发的独立身份；清 Cookie 或换浏览器后，需要恢复密钥才能找回原身份。当前没有 OAuth。
5. 先用 AI_ENGINE=mock 检查上传、保存和刷新，确认持久化后再启用 LLM。

原文件由同源安全上传 API 写入服务端私有目录。路径是 userId/workspaceId/documentId/original.ext，禁止覆盖既有原文件。PDF/DOCX 仍在浏览器解析；正文进入 PostgreSQL，真实 AI 将有界提取文本发送给 Kimi。UI 区分 Local-only Demo 和 Persistent workspace。

完整操作说明：[PostgreSQL + Kimi 配置](docs/setup/postgresql-kimi.md)。部署需要可持久写入的磁盘 / Volume，并同时备份数据库和文件目录；临时文件系统的部署需另行接入对象存储。

## 启用真实模型

填入 KIMI_API_KEY、AI_ENGINE=llm、AI_PROVIDER=kimi、AI_MODEL=kimi-k2.6，重启 `npm run dev`。AI_SMALL_MODEL 留空复用主模型。当前适配只支持 kimi-k2.6 的非思考模式；其他型号需要匹配各自的参数，未经适配会明确报配置错误。至少需要已迁移的 PostgreSQL 数据库。

上传后，系统先在本地解析并保存原件，再通过 Planner 和限定工具分析资料，生成组织方案。Review 支持修改、拒绝建议和自动保存，确认 Apply 后写入工作区。普通模式下，模型故障可退回 basic local organization；比赛模式显示服务不可用。两种情况下都保留原件，模型不能自行 Apply 或删除资料。

## 检查与验收

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

领域测试包含普通 PostgreSQL WASM 迁移、真实仓库与 FORCE RLS、事务与跨用户拒绝、私有文件落盘、Kimi 请求格式 / 流式输出 fixture，以及 Schema / Injection Boundary / 重试 / 降级。生产浏览器测试使用独立 3074 端口，每次启动当前构建，不复用旧服务器；测试接口 fixture 不请求收费 Provider。

准备好本地便携运行环境后，还可运行不收费的实际数据库验收：

```powershell
npm run test:portable
npm run test:portable:copy
```

前者使用真实本机 PostgreSQL 和四种文件检查审核、保存、刷新、Apply、Library、原文件哈希与跨用户隔离；后者在项目 artifacts 内复制到中文/空格目录，验证重定位、数据恢复、两份同时运行及数据库隔离。两者使用合成资料与 Mock，完成后清理自己的测试记录并停止服务。运行前先停止当前 FileMind。

配置 Kimi Key 后，可运行收费模型验收：

```powershell
npm run test:live
```

此命令在 3075 启动开发服务，上传四份合成 Fixtures：Transformer Notes.pdf、NLP Lecture.md、final2.docx、research.txt，执行真实 Kimi、修改审核、刷新、Apply、Library 与无权限访问检查。它会调用收费模型并留下测试 Workspace。运行前先启动数据库，并在开发服务配置 AI_ENGINE=llm；便携启动自动选引擎的逻辑不适用于 npm run dev。当前八份资料主 Demo 的验收另见发布记录。Windows 默认使用已安装 Edge；其他系统安装 Playwright Chromium，或配置 PLAYWRIGHT_BROWSER_EXECUTABLE。

`predev` / `prebuild` 准备同源 PDF Worker/CMaps/字体/Wasm，避免第三方 CDN。`npm run build` 输出 standalone，postbuild 复制 public/static 并将依赖符号链接转换成真实文件，支持搬移目录。当前本地生产运行用便携启动程序；外部部署使用 `.next/standalone/server.js` 并设置运行时环境。已有 lockfile 的开发环境用 npm ci。

## 页面与实现边界

| 路由 | 当前行为 |
| --- | --- |
| / | 产品介绍与交互演示 |
| /dashboard | 真实保存统计、Recent Workspaces、公开活动；空数据展示 Empty State；示例和 Demo Insights 显式展开 |
| /workspace | 新 Workspace 或现有本地演示 |
| /workspace?workspace=UUID | 按当前 Demo 用户从服务器恢复；Interrupted 明确提示 Resume |
| /library | 已保存基础详情与当前 Session，预置示例可切换 |
| /graph | 已保存文档关系与共享概念 |
| /search | Find 检索资料；Ask 生成经过来源与事实校验的回答 |
| /cleanup | 已应用工作区的重复候选，或明确标注的示例 |
| /settings | 主题、存储维护、身份恢复、备份与专用 Demo 管理 |

最大 30 文件，每个 20 MB；PDF 200 页 / 250,000 字符。长文 AI 抽样最多 18,000 字符，最多并发 3 次分析，Agent 最多 15 次工具调用、240 秒。不显示隐藏 reasoning。Review 500 ms 自动保存；Apply 原子保存元数据与有效关系，原文件不修改、不删除。

生产持久化要求稳定 Secret 和浏览器 Cookie。当前没有完整账号系统或后台任务；恢复密钥可以在同一数据库中找回身份。刷新正在执行的 Run 会显示 Interrupted，Resume 重跑 Planner 并复用缓存。未保存的客户端解析数据无法恢复。引用可打开授权原件，维护工具可检查存储问题；大规模分页界面仍未实现。

基础架构：[AI Provider](docs/architecture/ai-provider.md)、[Persistence](docs/architecture/persistence.md)。历史验收：[Phase 1](docs/phase-checklists/phase-1.md)、[Phase 2](docs/phase-checklists/phase2.md)、[Phase 3](docs/phase-checklists/phase3.md)、[Phase 4](docs/phase-checklists/phase4.md)。阶段文档记录当时的功能和限制，当前状态以发布验收记录为准。

## AI 辅助开发说明

本项目使用 OpenAI Codex 辅助方案讨论、代码实现与修复、测试脚本，以及文档整理和改写。部分实现和修改由 AI 执行；Git 提交记录反映实际变更，不代表全部代码由项目负责人独立手写。

项目负责人提出需求并确定开发范围。自动化测试、真实模型验收和人工检查按各自记录说明，不能将自动化检查等同于逐行人工审阅。后续个人发现的问题、亲自完成的修改和独立验证，应按实际完成情况记录，不补造开发过程。

应用运行时的 Kimi、Kimi Vision 和 DashScope Embedding 与开发辅助工具分别说明。评测中的合成语料、同一 Agent 编制语料和共享模型判定限制保留在评测文档中。

## Git 提交约定

按 [AGENTS.md](AGENTS.md) 保留可独立审阅的提交，验证后普通 Push；不 amend/squash/rebase，不提交凭据、依赖或临时验收文件。网络不可达时记录本地与远端的同步差异。

## 检索与引用

资料经分段、Embedding 和索引后，支持中英文语义检索与词法查找。Ask 回答问题，Find 返回资料片段；Library 可以查看索引状态并重试，Search 支持更新索引、追问和恢复历史。Phase 5 实现了 Hybrid 检索，后续改为根据查询选择策略的 Adaptive Retrieval。当前回答完成引用与事实检查后再发布。

- [检索配置](docs/setup/knowledge-retrieval.md)：Kimi 与 Embedding 分开配置，本机模型为 qwen3.7-text-embedding-flash / 1024 维。
- [检索架构](docs/architecture/retrieval.md)：Chunk、RLS、缓存、RRF、RAG、引用验证、退回与限制。
- [Phase 5 验收](docs/phase-checklists/phase5.md)：真实模型、25 个检索问题、无答案、浏览器与便携复制结果。

真实 Gate 0、Embedding、RAG 与引用点击已通过。专用 PostgreSQL 无 pgvector，PortableVectorStore 使用 real[] 持久化向量并线性扫描。便携复制包含 Chunk、向量与检索历史；Key 和私人数据不进入 Git。

## 图片资料与评测

PNG/JPG/JPEG、学习截图、板书和扫描图片现可通过真实 Kimi Vision 与独立中英文离线 OCR 进入整理、人工审核、知识索引、跨模态检索和 Citation RAG。原图、OCR 提取文字、AI 解释与引用证据分别展示。图片引用打开私有原图，不编造页码或行号；故障可重试。扫描 PDF 当前只检测低文本并提示，尚未自动渲染页面做 OCR。

- [多模态架构](docs/architecture/multimodal.md)：验证、队列、独立缓存、来源与故障行为。
- [困难评测](docs/evaluation/rag-hard-evaluation.md)：72 份合成资料（含 12 张图）、144 个查询，真实 Kimi / DashScope 的结果与失败案例。
- [Phase 6 验收](docs/phase-checklists/phase6.md)：浏览器、原图、隔离、缓存、移动端和整文件夹复制。
- [备份与身份恢复设计](docs/architecture/backup-recovery.md)：恢复密钥、导出、校验与导入的设计和限制；实现验收见 Phase 7 记录。

Phase 6 的 Vector / Lexical / Hybrid + Rerank Hit@5 为 0.992 / 0.700 / 0.975，该样本中 Vector 更强。图片 Hit@5 为 1.00，12/12 图片回答返回有效来源，无答案准确率为 22/24。引用有效只能说明来源可核对，不能单独证明陈述正确。检索参数保留 800 estimated tokens / 100 overlap 与 RRF 60。Phase 7/8 的独立语料、首次结果和失败案例见 [评测汇总](docs/evaluation/final-evaluation-summary.md)。

```powershell
npm run test:vision
# 先启动 FileMind 专用服务到 3082，再执行真实浏览器验收：
npm run test:multimodal-live
npm run evaluate:hard
# 停止当前 FileMind 后，执行真实整文件夹迁移验收：
npm run test:portable:copy
```

上述命令使用自建合成资料，其中真实模型检查会产生 API 费用。Key、数据库、用户原件、离线语言缓存和便携运行时不进入 Git。OCR Worker、WASM、语言数据与 Sharp Windows DLL 随 standalone 打包，无需全局 OCR。历史测试验证了中文/空格目录中的原图、分析、向量、检索及引用恢复；当前候选版仍按 ASCII 安装路径验收。浏览器身份可用恢复密钥找回，备份 ZIP 有完整性校验但没有加密。
