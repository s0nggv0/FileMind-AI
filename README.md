# FileMind AI

面向高校学习、研究与项目资料的 AI 文件管理产品。本仓库当前完成 **Phase 3：本地 AI Workspace 与 Agent Workflow Simulation**。支持真实本地文件选择和解析、可见的 Agent 演示执行、Organization Review 和 Human-in-the-loop 确认，应用后的结果可在 Library 和 Graph 查看。首页与 Dashboard 继续保留 Phase 2 演示。尚未连接真实 LLM、Embedding、RAG、Remote Storage 或数据库。

## 本地启动

需要 Node.js **22.13.0 或以上**（PDF.js 要求），以及 npm。依赖安装在当前项目的 `node_modules`，不会全局安装 Next.js 或 UI 库。

```powershell
npm install
npm run dev
```

开发服务启动后，访问终端输出的地址；默认地址为 `http://localhost:3000`。项目不需要配置 AI 或数据库环境变量。

```powershell
npm run typecheck
npm run lint
npm run build
npm run start
npm run test
npm run test:e2e
```

`typecheck` 检查严格 TypeScript 类型，`lint` 执行 ESLint，`build` 生成生产构建；`start` 需要先完成 `build`。已有锁文件的环境可使用 `npm ci` 重现依赖版本。

`predev` / `prebuild` 自动准备同源 PDF Worker、CMaps、字体和 Wasm，不使用第三方 CDN。`test` 验证 Workspace 领域状态与恢复；`test:e2e` 在 build 后自动启动/复用 3073 端口生产服务。Windows 使用已安装的 Edge；其他环境可先 `npx playwright install chromium`，也可设置 `PLAYWRIGHT_BROWSER_EXECUTABLE`。

项目 `.npmrc` 将 npm 缓存设为本目录的 `.npm-cache`，使用 `registry.npmmirror.com`，并保存精确依赖版本。缓存目录与 `node_modules` 均不应提交到 Git。

## 技术与设计基础

| 项目 | 当前配置 |
| --- | --- |
| 应用框架 | Next.js 16.3.8，App Router |
| 组件运行时 | React / React DOM 19.3.0 |
| 类型检查 | TypeScript strict |
| 样式 | Tailwind CSS 4.3.3，PostCSS，CSS 设计变量 |
| 基础组件 | shadcn/ui `new-york` 风格，本地拥有源码 |
| 交互基础 | Radix UI、cmdk、class-variance-authority |
| 图标与动效 | Lucide Icons、Framer Motion |
| UI 与业务状态 | Zustand，命令面板/导航偏好、Workspace Run、Review 和 Session 结果 |
| 本地解析 | Mammoth 1.13.0 / PDF.js 6.3.289 / 浏览器 File 与 ImageBitmap API |
| 主题与反馈 | next-themes、Sonner |

shadcn/ui 已通过 `components.json` 配置别名、样式和 Lucide 图标；基础组件以手工安装方式放在 `src/components/ui`，可以直接审阅和修改。它不是需要在页面运行时加载的独立 UI 服务。

设计系统采用克制的中性色、单一主题强调色、明确的排版层级和边界。颜色、背景、边框与焦点样式集中在 `src/app/globals.css`；按钮、输入、徽章、弹窗、命令面板、提示和骨架共用基础组件。界面提供浅色、深色与系统主题，并尊重系统的减少动态效果偏好。

## 页面路由

| 路由 | 页面 | 当前范围 |
| --- | --- | --- |
| `/` | Landing | 独立 Marketing Layout、九个产品介绍与演示模块 |
| `/dashboard` | Overview | 知识概览、AI Insight、最近资料、活动时间线、主题与三个快捷入口 |
| `/workspace` | Workspace | 真实本地选择/解析、七工具演示、Review、Apply 和错误恢复 |
| `/library` | Library | 已应用 Session 文档与示例切换、关键词与分类筛选 |
| `/search` | AI Search | 提问框、建议问题及来源卡片布局 |
| `/graph` | Knowledge Graph | 已应用 Run 的规则关系与示例图谱切换 |
| `/cleanup` | Smart Cleanup | 整理建议与差异预览 |
| `/settings` | Settings | 主题偏好和基础状态展示 |

所有业务示例均来自独立数据层。Dashboard 的文件数、主题数、关系数与待审阅数由数组计算，页面组件不直接保存业务 Mock 数据。首页的 12 文件样例与 Dashboard 的 6 份资料是独立演示数据集；两处均明确标注演示范围。

## 目录职责

```text
src/
  app/                  App Router 页面、Layout、全局样式及路由级状态
  components/
    ui/                 本地 shadcn/ui 基础组件
    shell/              Sidebar、Topbar、品牌与主题 Provider
    command-palette/    全局命令面板
    common/             页标题和演示说明等共用内容
    feedback/           Loading、Empty、Error、Skeleton
    motion/             动效边界
  features/             按产品功能拆分的页面内容与交互
  hooks/                键盘快捷键等浏览器交互
  lib/                  导航配置与通用工具
  mocks/                开发阶段的独立演示数据
  services/             数据访问边界，当前读取 mocks
  store/                最小化全局 UI 状态
  types/                严格 TypeScript 数据契约
docs/
  superpowers/specs/    已确认的产品与技术设计
  phase-checklists/     阶段验收记录和文件索引
```

页面与基础 Layout 优先使用 Server Components；命令面板、主题、移动导航、文件选择、筛选和图谱交互在局部 Client Components 中实现。示例数据从 `services/demo-repository.ts` 读取后传给功能组件，使将来的数据库接入可以保持清晰的数据边界。错误边界按 Next.js 要求使用 Client Component。

完整基础文件索引见 [Phase 1 文件清单](docs/phase-checklists/phase1-files.md)。历史验收记录见 [Phase 1 检查表](docs/phase-checklists/phase-1.md) 和 [Phase 2 检查表](docs/phase-checklists/phase2.md)。当前状态机、AgentEngine 接口、解析限制、人工审阅语义、测试和提交见 [Phase 3 检查表](docs/phase-checklists/phase3.md)。

当前已通过 `npm run build`、`npm run typecheck`、`npm run lint`，8 项领域测试和 8 项生产浏览器测试通过。Phase 3 的 Workspace 在 1440、1280、768 和 390px 宽度验收，混合文件解析、人工修改、Apply、Library/Graph、取消/重试/跳过、深色主题与减少动态效果通过，浏览器控制台零错误。既有阶段验收记录仍保留。Phase 3 本机生产预览使用 `http://127.0.0.1:3073`。

## 基础交互

- `Cmd + K` 或 `Ctrl + K` 打开和关闭 Command Palette。
- 命令面板支持键盘搜索、方向键选择和 Enter 跳转；按 Esc 关闭。
- Sidebar 显示当前路由；移动端通过 Topbar 按钮打开导航。
- Library 对示例文档提供本地关键词和分类筛选。
- Workspace 支持选择、拖放、移除和清空，校验格式、MIME、20 MB 与 30 文件上限；TXT/MD/PDF/DOCX 提取纯文本，PNG/JPG/JPEG 读取尺寸。
- Organize with FileMind 驱动 Planner、实时 Tools / Activity / 文件状态，失败可 Retry/Skip/Restart，执行中可 Cancel。
- Review 可以移动分类、增删标签、接受/忽略/撤销建议；Apply 只改变本浏览器 Session 数据，原文件不变，结果可在 Library / Graph 查看。
- Landing Agent 使用预设样例自动播放一次，支持暂停、继续与重播；系统减少动态效果时显示完整静态结果。
- Landing 提供命名建议、预设语义结果、知识节点与清理差异的局部交互，状态刷新后重置。
- Dashboard 最近资料、活动与主题使用已有 Library 详情预览；没有尚未实现的详情路由。
- Loading、Empty、Error 和 Skeleton 为可复用组件；路由级 loading/error 已预留。

## 当前实现边界

No file is uploaded to a remote server in this phase. 真实文件只在浏览器解析，不执行 HTML/JavaScript/宏；File 与提取正文留在服务层，不放入 Zustand 或 LocalStorage。Reset 释放当前文件与提取正文，已应用的元数据/短摘要快照保留至刷新。

Agent Workflow Simulation 的 `read_document` 执行真实解析，其余分析使用文件名与前 500 字关键词规则；摘要为提取片段。重复候选只依据名称归一化，接受不删除任何文件。图片命名只用日期/ID，没有 OCR 或 Vision。PDF 最多提取 200 页 / 250,000 字符，扫描 PDF 无文字识别、加密 PDF 没有密码输入。人工修改标签/分类不会自动重算原始关系建议，仍需审阅关联。

当前不包含真实 LLM、Embedding、RAG、Remote Storage、Supabase、pgvector、认证、语义相似度或本机文件操作。AI Search 和 Cleanup 仍为原有演示，Graph 复用 SVG 预览，没有 React Flow 或后台数据库。浏览器 DOCX 解压可能占用主线程，尚未完成大型文件压力验证。

**Phase 3 已完成，当前停止于此阶段。** Phase 4 等待用户明确启动；优先设计文档/Run/审阅状态持久化与恢复，再通过可替换 AgentEngine 接入真实能力，不自动开展。

## Git 提交约定

比赛要求保留完整 Git 提交历史。后续开发按可独立审阅和验收的改动持续提交，修复与调整单独记录；每次提交前执行对应验证，阶段结束时完成整体检查。已验证的任务提交通过普通 Push 同步到 GitHub 的对应分支。保留既有提交，未经明确要求不重写历史。具体规则见 [AGENTS.md](AGENTS.md)。
