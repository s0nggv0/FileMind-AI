# FileMind AI

FileMind AI 用来整理学习和研究资料。导入 PDF、Word、笔记和图片后，AI 整理助手提出分类、标签与命名建议，用户审阅后再保存。查资料时可以搜索正文、直接提问，并点击引用打开原文或原图。

项目使用 Next.js 16.3.8、React 19.3.0、TypeScript strict、Tailwind、shadcn/ui、Framer Motion 和 Zustand。服务端通过 AI SDK 7、Kimi 适配器和 Zod 处理模型调用；PostgreSQL 保存工作区和索引，私有文件目录保存原件。图片由 Kimi Vision 和本地 OCR 分别处理，DashScope 提供独立 Embedding。

2026-10-04 的真实验收通过了 Conflict、Ambiguity、扁平 schema 和八份资料的完整 Demo，`demo:check` 为 12/12。构建、类型检查、lint、106 个单元测试及浏览器检查也已通过。完整结果见 [发布验收记录](docs/competition/release-freeze.md)，项目介绍和演示材料见 [比赛说明](docs/competition/README.md)。这些记录反映验收当天的结果，演示前仍需检查服务状态；旧 ZIP 尚未重新打包。

2026-10-10 完成主要界面中文化，并整理工作区保存和重试代码。后续检查通过 108 项单元测试和 17 项浏览器回归，未重新调用真实模型。改动与验证范围见[开发整理记录](docs/competition/development-notes.md)。

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

没有 `.env.local` 时，文件仅保留在浏览器中，可使用本地规则整理并审阅方案，刷新后清空当前会话。默认 AI_ENGINE=mock。配置 PostgreSQL 并执行迁移后，模拟引擎也能保存和恢复原文件、正文、执行记录及整理方案。

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

原文件通过同源上传接口写入服务端私有目录，路径是 userId/workspaceId/documentId/original.ext，禁止覆盖已有原件。PDF/DOCX 在浏览器解析，正文保存到 PostgreSQL；真实 AI 模式向 Kimi 发送长度受限的提取文本。页面分别标明仅本地演示和可保存工作区。

完整操作说明：[PostgreSQL + Kimi 配置](docs/setup/postgresql-kimi.md)。部署需要可持久写入的磁盘 / Volume，并同时备份数据库和文件目录；临时文件系统的部署需另行接入对象存储。

## 启用真实模型

填入 KIMI_API_KEY、AI_ENGINE=llm、AI_PROVIDER=kimi、AI_MODEL=kimi-k2.6，重启 `npm run dev`。AI_SMALL_MODEL 留空复用主模型。当前适配只支持 kimi-k2.6 的非思考模式；其他型号需要匹配各自的参数，未经适配会明确报配置错误。至少需要已迁移的 PostgreSQL 数据库。

上传后，系统先解析并保存原件，再由规划器调用限定工具分析资料，生成整理方案。审阅时可以修改或拒绝建议，改动会自动保存；确认应用后才写入工作区。普通模式遇到模型故障时，可选择本地规则继续整理；比赛模式显示服务不可用。原件始终保留，模型不能自行应用方案或删除资料。

## 检查与验收

```powershell
npm run typecheck
npm run lint
npm run test
npm run build
npm run test:e2e
```

单元测试覆盖 PostgreSQL WASM 迁移、仓库与 FORCE RLS、事务和跨用户拒绝、私有文件写入、Kimi 请求格式及流式响应，以及结构校验、不可信资料边界、重试和降级。浏览器测试在独立的 3074 端口启动当前生产构建，使用预设接口响应，不请求收费模型。

准备好本地便携运行环境后，还可运行不收费的实际数据库验收：

```powershell
npm run test:portable
npm run test:portable:copy
```

前者使用真实本机 PostgreSQL 和四种文件，检查审阅、保存、刷新、应用方案、资料库、原件哈希与跨用户隔离；后者在项目 artifacts 内复制到中文和空格目录，检查路径重定位、数据恢复、两份副本同时运行及数据库隔离。两项均使用合成资料和模拟引擎，结束后清理自己的测试记录并停止服务。运行前先停止当前 FileMind。

配置 Kimi Key 后，可运行收费模型验收：

```powershell
npm run test:live
```

此命令在 3075 启动开发服务，上传四份合成资料：Transformer Notes.pdf、NLP Lecture.md、final2.docx、research.txt，调用真实 Kimi，并检查方案修改、刷新、应用、资料库与无权限访问。它会产生模型费用并留下测试工作区。运行前先启动数据库，在开发服务中配置 AI_ENGINE=llm；便携启动自动选择引擎的逻辑不适用于 npm run dev。八份资料主 Demo 的验收见发布记录。Windows 默认使用已安装的 Edge；其他系统安装 Playwright Chromium，或配置 PLAYWRIGHT_BROWSER_EXECUTABLE。

`predev` / `prebuild` 准备同源 PDF Worker/CMaps/字体/Wasm，避免第三方 CDN。`npm run build` 输出 standalone，postbuild 复制 public/static 并将依赖符号链接转换成真实文件，支持搬移目录。当前本地生产运行用便携启动程序；外部部署使用 `.next/standalone/server.js` 并设置运行时环境。已有 lockfile 的开发环境用 npm ci。

## 页面与实现边界

| 路由 | 当前行为 |
| --- | --- |
| / | 产品介绍与交互演示 |
| /dashboard | 已保存资料的统计、最近工作区和活动；无数据时显示空状态，示例需主动展开 |
| /workspace | 新建工作区或本地演示 |
| /workspace?workspace=UUID | 按当前浏览器身份恢复工作区，执行中断时提示继续分析 |
| /library | 已保存资料与当前会话的详情，可切换到预置示例 |
| /graph | 已保存文档关系与共享概念 |
| /search | 查找资料，或生成经过来源与事实校验的回答 |
| /cleanup | 已应用工作区的重复候选，或明确标注的示例 |
| /settings | 主题、存储维护、身份恢复、备份与专用 Demo 管理 |

每次最多 30 份文件，每份 20 MB；PDF 最多 200 页或 250,000 字符。长文 AI 抽样最多 18,000 字符，并发分析最多 3 次，整理助手最多调用 15 次工具、运行 240 秒。页面不显示模型的隐藏推理。审阅修改在 500 ms 后自动保存，应用方案时原子保存元数据与有效关系，原件不修改、不删除。

保存和恢复数据需要固定会话密钥及浏览器 Cookie。当前没有完整账号系统或后台任务，恢复密钥可以在同一数据库中找回身份。刷新正在执行的任务后，页面提示整理已中断；继续分析会重新运行规划器并复用缓存。未保存的浏览器解析数据无法恢复。引用可打开授权原件，维护工具可检查存储问题；大规模分页界面尚未实现。

基础架构：[AI Provider](docs/architecture/ai-provider.md)、[Persistence](docs/architecture/persistence.md)。历史验收：[Phase 1](docs/phase-checklists/phase-1.md)、[Phase 2](docs/phase-checklists/phase2.md)、[Phase 3](docs/phase-checklists/phase3.md)、[Phase 4](docs/phase-checklists/phase4.md)。阶段文档记录当时的功能和限制，当前状态以发布验收记录为准。

## AI 辅助开发说明

本项目使用 OpenAI Codex 辅助方案讨论、代码实现与修复、测试脚本，以及文档整理和改写。部分实现和修改由 AI 执行；Git 提交记录反映实际变更，不代表全部代码由项目负责人独立手写。

项目负责人提出需求并确定开发范围。自动化测试、真实模型验收和人工检查按各自记录说明，不能将自动化检查等同于逐行人工审阅。后续个人发现的问题、亲自完成的修改和独立验证，应按实际完成情况记录，不补造开发过程。

应用运行时的 Kimi、Kimi Vision 和 DashScope Embedding 与开发辅助工具分别说明。评测中的合成语料、同一 Agent 编制语料和共享模型判定限制保留在评测文档中。

## Git 提交约定

按 [AGENTS.md](AGENTS.md) 保留可独立审阅的提交，验证后普通 Push；不 amend/squash/rebase，不提交凭据、依赖或临时验收文件。网络不可达时记录本地与远端的同步差异。

## 检索与引用

资料分段并生成向量、建立索引后，可以按中英文含义或关键词检索。“问答”根据资料回答问题，“查找资料”返回片段。资料库可查看索引状态并重试，智能搜索支持更新索引、追问和恢复历史。Phase 5 使用混合检索，后续改为根据问题选择策略的自适应检索。回答完成引用与事实检查后再发布。

- [检索配置](docs/setup/knowledge-retrieval.md)：Kimi 与 Embedding 分开配置，本机模型为 qwen3.7-text-embedding-flash / 1024 维。
- [检索架构](docs/architecture/retrieval.md)：Chunk、RLS、缓存、RRF、RAG、引用验证、退回与限制。
- [Phase 5 验收](docs/phase-checklists/phase5.md)：真实模型、25 个检索问题、无答案、浏览器与便携复制结果。

真实 Gate 0、Embedding、RAG 与引用点击已通过。专用 PostgreSQL 无 pgvector，PortableVectorStore 使用 real[] 持久化向量并线性扫描。便携复制包含 Chunk、向量与检索历史；Key 和私人数据不进入 Git。

## 图片资料与评测

PNG/JPG/JPEG、学习截图、板书和扫描图片可通过 Kimi Vision 与独立中英文离线 OCR 分析，随后进入审阅、知识索引和带引用的问答。原图、OCR 文字、AI 解读与引用证据分别展示。图片引用打开私有原图，不生成不存在的页码或行号；处理故障可重试。扫描 PDF 当前只检测低文本并提示，尚未自动渲染页面做 OCR。

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
