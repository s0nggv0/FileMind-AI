# FileMind AI — 比赛交付说明

FileMind AI 面向拥有学习笔记、课程文件和图片资料的个人用户：先导入资料，让 Agent 提议分类和标签，再由用户审阅确认；之后通过语义或关键词查找，用带原文引用的答案回答问题。项目把可核对的来源、可恢复的本地数据和人工确认放在同一条流程里。

本页单独整理比赛材料，保留根目录 README 和另外四份既有用户文档的未提交修改。Phase 8 的完整验收见 [最终评测](../evaluation/final-evaluation-summary.md)；比赛评分项对应证据见 [评分映射](scoring-map.md)。

## 核心能力与 AI 技术

| 能力 | 当前实现 |
| --- | --- |
| LLM 与 Agent | Kimi 结构化分析；有界工具调用、参数验证、超时与 Planner fallback 记录；Review 后才 Apply。 |
| RAG | 持久化 chunks/Embedding、来源位置、追问重检索；只发布完成引用与事实检查的答案。 |
| Adaptive Retrieval | 根据查询信号选择语义、关键词、文件名或混合检索；Embedding 故障保留关键词来源。 |
| Multimodal | PNG/JPG 原图、独立本地 OCR 与 Kimi Vision；提取文字和 AI 解释分开呈现。 |
| AI Safety | 不可信资料边界、工具 allowlist、租户 FORCE RLS、同源写入检查、事实门、冲突双来源说明。 |
| 本地数据与恢复 | 私有原文件、PostgreSQL real[] 向量、Operation Journal、隔离恢复、原子索引替换。 |
| 迁移 | 同数据库 Recovery Key、校验备份导入、停服后便携目录复制分别解决不同问题。 |
| 界面 | Workspace、Review、Library、Search、Graph、Settings；桌面与手机宽度浏览器验收。 |

[完整架构图](../architecture/system-overview.md) 展示 UI → Agent/Tools → 文档与图像处理 → Chunking/Embedding → Adaptive Retrieval → RAG/Citation/Fact Gate，以及 PostgreSQL 和私有存储的恢复边界。

## Quick Start：源码开发

使用 Windows x64 的 ASCII 安装目录，例如 `E:\FileMind AI`；路径含空格已验证。需要 Node.js ≥22.13、npm 和本项目专用 PostgreSQL 数据库。不要把别的项目数据库配置直接复用为本项目实例。

```powershell
npm ci
Copy-Item .env.example .env.local
```

在 `.env.local` 配置专用 `DATABASE_URL`、至少 32 随机字节的 `WORKSPACE_SESSION_SECRET` 和私有 `FILE_STORAGE_ROOT`，再执行：

```powershell
npm run db:migrate
npm run dev
```

默认 `AI_ENGINE=mock` 明确是本地模拟。真实演示需要设置 `AI_ENGINE=llm`、`KIMI_API_KEY`、`EMBEDDING_API_KEY`，使用 `.env.example` 中对应地域的 HTTPS endpoint 与 Embedding 模型/1024 维配置。两个 Key 独立；Kimi 网页订阅不能替代模型 API。执行 `npm run test:vision` 完成当前模型/endpoint 的 Vision Gate 后才启用真实图像理解；这是自制图片的付费 smoke 请求。OCR 引擎与中英文语言包随构建打包。

本地 HTTP 的 production preview 使用 `WORKSPACE_COOKIE_SECURE=false`；部署到 HTTPS 使用 Secure Cookie。数据库口令、模型 Key、签名 secret 不能提交到 Git 或发送给浏览器。

## 构建与便携目录

```powershell
npm run typecheck
npm run lint -- --max-warnings=0
npm test
npm run build
```

`build` 后自动整理 standalone、静态文件、OCR 资产和 Demo fixtures。开发依赖中的 Node 并不等于便携包已经包含 PostgreSQL：准备发行目录时，需要合法的 Windows x64 PostgreSQL runtime，并使用项目现有准备命令：

```powershell
npm run portable:prepare -- --postgres-runtime C:\Runtimes\pgsql
.\.filemind\runtime\node.exe scripts\portable-start.mjs --port 3000
```

运行时目录包含本地 Node、PostgreSQL 及所需 VC DLL；启动器初始化当前目录自己的数据库、迁移 schema、执行恢复，再启动 Web 服务。现有机器上的已准备目录不需要再次获取 runtime。正式发布压缩包属于下一阶段，应检查授权、版本和资产清单后再交付；本阶段没有发布新发行包。

整体迁移先用 `scripts\portable-start.mjs --stop` 停止原目录服务，再复制完整目录；新目录用内置 Node 启动。物理复制含安装凭据，要保管好整个目录。新浏览器身份不会自动取得旧资料，使用事先保存的同数据库 Recovery Key 或原浏览器 Cookie。资料备份是另一个选项：导入到当前身份，不复制安装凭据。

[实际迁移验收](../evaluation/phase8-portable-copy.json) 在 ASCII、空格、178 字符根路径上验证无全局 Node/根 node_modules 依赖、原文与 chunks/向量/图片分析保留、真实 RAG/citation 和两个独立数据库并行。中文安装路径已由用户取消验证，不能当成已支持。

## Demo

设置 `DEMO_MODE=true` 并重启已构建服务。Settings 中打开专用 Demo 身份，下载八份推荐资料 ZIP，导入 Workspace，等待 Agent，Review 后 Apply。另两份研究笔记用于可选重复演示。Reset 有第二次确认，服务器只允许清空注册的专用 Demo workspace，不清空普通身份资料。

上场前执行 `npm run demo:check`，目标数据库须可连接、预定 Web 端口须空闲；检查会调用真实 Kimi、Embedding、Vision 和 OCR。可用 `npm run test:demo-preflight` 在新建空实例中验证并保留验收报告，不能把这个报告当成现场机器健康状态。详见 [3–4 分钟演示稿](demo-script.md) 与 [网络故障备用流程](fallback-demo.md)。

## Evaluation 与隐私

Phase 5、6、7 的结果以及 Phase 8 首轮 90 份/180 题冻结评测一起报告，不能只展示最佳一轮。所有演示和评测文件都是原创合成资料。Phase 8 在创建新数据前冻结生产代码和评测协议，首轮每题结果 fsync 保存，服务不可用独立计数；语料仍由同一开发代理制作，生成、支持检查和 gold judge 使用同一 Kimi 模型，不能等同于外部人工独立审计。

数据库和原文件在本地，真实 AI 模式仍会把选中文本、图片、问题和证据发往配置的 Kimi/DashScope。日志仅保存受限运行元数据。普通备份包含原文和知识数据，不含模型 Key、Recovery Key 或签名 Cookie，但默认未加密；校验和只能发现损坏，不能防止持有者改写后重新计算。

## 已知限制

- PortableVectorStore 线性扫描，已测到 5,000 chunks，不能宣传为 ANN 或无限资料库。
- 扫描 PDF 尚无自动 OCR fallback；可将页面导出为 PNG/JPG 使用图片流程。
- OCR 手写、公式和小字可能不准确；Vision 与事实 judge 也可能出错，需回看原文。
- 同模型的自动验证可能有相关错误；严格事实门也会误拒答。高引用有效率不等于高答案正确率。
- 备份未加密且有内存/大小配额；同数据库恢复 Key 不能找回丢失的数据库。
- 目标是个人 Windows x64 本地浏览器产品，没有 OAuth、多用户协作、云同步或原生手机 App。
- 中文文件内容可处理；中文安装目录不在本次已验证范围。进程中断测试不等于突然断电测试。

Phase 8 完成后停止；Phase 9 是否开始比赛录屏、发行包和提交材料，由用户决定。
