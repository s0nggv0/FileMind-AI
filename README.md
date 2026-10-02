# FileMind AI

面向高校学习、研究与项目资料的 AI 文件管理产品。本仓库当前完成 **Phase 2：Landing Page 与个人知识 Dashboard**。首页提供可暂停与重播的 Agent 演示、四项能力交互、知识关联与清理审阅；Dashboard 展示示例知识空间的资料状态、Insights、最近资料、活动与主题。尚未连接 AI API 或数据库。

## 本地启动

需要 Node.js **20.9.0 或以上**，以及 npm。依赖安装在当前项目的 `node_modules`，不会全局安装 Next.js 或 UI 库。

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
```

`typecheck` 检查严格 TypeScript 类型，`lint` 执行 ESLint，`build` 生成生产构建；`start` 需要先完成 `build`。已有锁文件的环境可使用 `npm ci` 重现依赖版本。

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
| UI 状态 | Zustand，仅管理命令面板和移动导航开关 |
| 主题与反馈 | next-themes、Sonner |

shadcn/ui 已通过 `components.json` 配置别名、样式和 Lucide 图标；基础组件以手工安装方式放在 `src/components/ui`，可以直接审阅和修改。它不是需要在页面运行时加载的独立 UI 服务。

设计系统采用克制的中性色、单一主题强调色、明确的排版层级和边界。颜色、背景、边框与焦点样式集中在 `src/app/globals.css`；按钮、输入、徽章、弹窗、命令面板、提示和骨架共用基础组件。界面提供浅色、深色与系统主题，并尊重系统的减少动态效果偏好。

## 页面路由

| 路由 | 页面 | 当前范围 |
| --- | --- | --- |
| `/` | Landing | 独立 Marketing Layout、九个产品介绍与演示模块 |
| `/dashboard` | Overview | 知识概览、AI Insight、最近资料、活动时间线、主题与三个快捷入口 |
| `/workspace` | Workspace | 本地文件选择与信息预览、Agent 流程骨架 |
| `/library` | Library | 示例文件列表、关键词与分类筛选 |
| `/search` | AI Search | 提问框、建议问题及来源卡片布局 |
| `/graph` | Knowledge Graph | 示例文档与概念关系布局 |
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

完整基础文件索引见 [Phase 1 文件清单](docs/phase-checklists/phase1-files.md)。历史验收记录见 [Phase 1 检查表](docs/phase-checklists/phase-1.md)，本阶段的新增与修改文件、组件结构、验收结果和实现边界见 [Phase 2 检查表](docs/phase-checklists/phase2.md)。

当前已通过 `npm run build`、`npm run typecheck` 和 `npm run lint`。Phase 2 的 Landing 与 Dashboard 已在 1440、1280、768 和 390px 宽度验收，13 个内部链接均返回 200，Agent 播放控制、清理审阅、图谱键盘选择、深色主题、减少动态效果与移动导航均通过，浏览器控制台零错误。Phase 1 的七个产品页面及基础交互验收记录仍保留。当前本机生产预览使用 `http://127.0.0.1:3071`。

## 基础交互

- `Cmd + K` 或 `Ctrl + K` 打开和关闭 Command Palette。
- 命令面板支持键盘搜索、方向键选择和 Enter 跳转；按 Esc 关闭。
- Sidebar 显示当前路由；移动端通过 Topbar 按钮打开导航。
- Library 对示例文档提供本地关键词和分类筛选。
- Workspace 可以选择、拖放和移除本地文件，校验格式及大小，并预览文件信息。
- Landing Agent 使用预设样例自动播放一次，支持暂停、继续与重播；系统减少动态效果时显示完整静态结果。
- Landing 提供命名建议、预设语义结果、知识节点与清理差异的局部交互，状态刷新后重置。
- Dashboard 最近资料、活动与主题使用已有 Library 详情预览；没有尚未实现的详情路由。
- Loading、Empty、Error 和 Skeleton 为可复用组件；路由级 loading/error 已预留。

## 当前实现边界

本地文件选择不会上传或保存文件，也不会解析文件正文。Workspace 的分析入口、AI Search 的检索入口和 Cleanup 的执行入口尚未接入实际任务；界面中的说明、流程、来源和差异均为演示内容。

当前不包含真实 AI 调用、数据库、认证、文件存储、Embedding、语义检索、Agent 工具执行或清理恢复。知识图谱使用独立示例数据和 SVG/浏览器布局，尚未集成 React Flow。示例图谱关系和活动不代表真实模型推断或后台执行结果。

后续阶段将在用户明确请求后开展。**Phase 2 已完成，当前停止于此阶段**；Phase 3 的真实 AI Workspace 尚未开始，不自动接入 AI、数据库或进入下一阶段。

## Git 提交约定

比赛要求保留完整 Git 提交历史。后续开发按可独立审阅和验收的改动持续提交，修复与调整单独记录；每次提交前执行对应验证，阶段结束时完成整体检查。已验证的任务提交通过普通 Push 同步到 GitHub 的对应分支。保留既有提交，未经明确要求不重写历史。具体规则见 [AGENTS.md](AGENTS.md)。
