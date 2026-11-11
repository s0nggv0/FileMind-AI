# Phase 2：Landing Page 与个人知识 Dashboard

完成日期：2026-10-02。范围仅为首页、Dashboard 与必要的共用呈现组件。没有进入 Phase 3。

## 完成内容

- [x] `/` 使用独立 Marketing Layout，删除根路径的 Workspace 重定向，不显示产品 Sidebar。
- [x] Navigation：品牌、三个段落锚点、真实仓库 GitHub 链接、Open App；滚动后轻微模糊与边框，移动端使用可关闭的导航弹窗。
- [x] Hero：居中英文主标题、中文价值说明、辅助文案、两项 CTA 与五种文件格式。
- [x] Agent Demo：七步本地流程；自动播放一次，支持暂停、继续、重播，离开视口暂停；完成后显示 12 Files / 4 Categories / 3 Connections / 2 Similar Files。
- [x] 四项能力：命名前后切换、预设问题搜索结果、可选择的轻量图谱、可审阅与忽略的清理建议。
- [x] Workflow：Drop → Understand → Organize → Connect → Explore；桌面横向，移动纵向，连接线有克制动效。
- [x] Graph Showcase：六个桌面节点，移动端四个核心节点；连续 SVG 连线、聚焦与悬停高亮、点击选择、关联数量反馈。
- [x] Cleanup Showcase：96% 相似、+326 words、+4 references；Review 差异弹窗、Ignore、确认保留 v2 和 Reset。只改变本地演示状态，不删除文件。
- [x] Final CTA 与 Footer：进入 Workspace，保留 Overview 与仓库入口。
- [x] Dashboard：问候、知识概览、AI Insight、Recent Files、Knowledge Activity、Knowledge Topics、三个 Quick Actions。
- [x] 模拟内容集中在 `src/mocks`，通过呈现数据适配器传入 UI；Dashboard 优先使用 Server Components。
- [x] 三种 Surface 层级、中文字体回退、浅色与深色主题、键盘焦点与减少动态效果。
- [x] Dashboard 列表复用 EmptyState，继续继承产品路由的 Loading / Skeleton / Error 状态。
- [x] README 更新当前进度，完成分批 Commit 与普通 Push。

## 组件与目录结构

```text
app/(marketing)/layout → LandingNavbar + 页面内容 + Footer
app/(marketing)/page   → HeroSection
                        AgentDemo
                        CapabilitiesSection
                          OrganizeDemo / SemanticDemo
                          RelationshipDemo / CleanupDemo
                        WorkflowSection + WorkflowLine
                        GraphShowcase + RelationshipDemo
                        CleanupShowcase + CleanupDemo
                        FinalCTA

app/(product)/dashboard/page → DashboardHeader + Overview
                              KnowledgeOverview
                              AIInsights
                              RecentFiles
                              ActivityTimeline
                              KnowledgeTopics
                              QuickActions

services/presentation-repository → mocks/landing + mocks/dashboard
                                  现有 demo-repository
hooks/use-motion-preference     → SSR 一致的系统动画偏好
components/knowledge            → 可复用知识关联演示
components/common               → 可复用文件类型图标
```

Marketing 与产品页面共享根 Layout 的字体和主题 Provider，产品 Sidebar / Topbar / Command Palette 继续属于 `(product)`。静态文案与结构在 Server Components 中渲染；播放、局部状态、节点操作和导航弹窗才使用 Client Components。

## 新增文件

```text
src/app/(marketing)/layout.tsx
src/app/(marketing)/page.tsx
src/components/common/document-type-icon.tsx
src/components/knowledge/relationship-demo.tsx
src/features/landing/landing-navbar.tsx
src/features/landing/hero-section.tsx
src/features/landing/agent-demo.tsx
src/features/landing/capabilities-section.tsx
src/features/landing/organize-demo.tsx
src/features/landing/semantic-demo.tsx
src/features/landing/cleanup-demo.tsx
src/features/landing/workflow-section.tsx
src/features/landing/workflow-line.tsx
src/features/landing/graph-showcase.tsx
src/features/landing/cleanup-showcase.tsx
src/features/landing/final-cta.tsx
src/features/landing/footer.tsx
src/features/dashboard/dashboard-header.tsx
src/features/dashboard/knowledge-overview.tsx
src/features/dashboard/ai-insights.tsx
src/features/dashboard/recent-files.tsx
src/features/dashboard/activity-timeline.tsx
src/features/dashboard/knowledge-topics.tsx
src/features/dashboard/quick-actions.tsx
src/hooks/use-motion-preference.ts
src/mocks/landing.ts
src/mocks/dashboard.ts
src/services/presentation-repository.ts
src/types/presentation.ts
docs/phase-checklists/phase2.md
```

修改：`src/app/(product)/dashboard/page.tsx`、`src/features/dashboard/overview.tsx`、`src/app/globals.css`、`src/components/shell/sidebar.tsx`、`DESIGN.md`、`README.md`。

删除：`src/app/page.tsx`；其根路由由 `(marketing)/page.tsx` 正式承接。

## 数据与安全路由

首页使用独立的 12 文件样例，不代表用户导入的文件。Dashboard 使用既有 Library 的 6 份资料、5 个选定知识主题、Graph 的 13 条关联与 Cleanup 的 3 项建议。分类与主题是不同维度，一份资料可以属于多个主题。指标不采用提示词中的大数值示例，以保持各页面数据一致。

Dashboard 活动明确标为 2026.09.30 的示例快照；Today / Yesterday 是快照内的分组，不代表实时后台日志。最近资料沿用现有 `updatedAt` 并显示“更新于”，没有捏造上传时间。

最近资料、主题与活动链接到 `/library?document=<已有示例 ID>`，复用现有详情弹窗。没有新增未实现的 `/library/[id]`。Insight Review 与三个 Quick Actions 进入已存在的 Library / Cleanup / Workspace / Search / Graph 页面。

## 验证结果

- `npm run build`：通过；包含 `/`、`/dashboard` 与既有产品路由。
- `npm run typecheck`：通过，TypeScript strict 无错误。
- `npm run lint`：通过；`git diff --check` 通过。
- Edge / Chromium 浏览器验收：1440×900、1280×720、768×1024、390×844；两个页面均返回 200，无横向溢出。
- 浅色与深色主题：两个页面均检查；桌面保留 Sidebar，移动端导航抽屉可达 Settings。
- 13 个内部链接地址全部返回 200，三个主要首页 CTA 实际点击进入 Workspace；最近文件打开正确的详情预览。
- Explore demo 锚点、命名切换与还原、搜索结果展开与收起、节点键盘选择、清理 Review / Escape / 焦点返回 / Ignore / Reset / 确认均通过。
- 常规动态效果：Agent 自动播放、暂停、继续、完成、重播均通过。
- 减少动态效果：Agent 完整静态预览，无自动播放；图谱的屏幕外连线也直接完整显示，移动端简化为四个节点。
- 最终浏览器控制台与运行时错误：0；本地路由与静态资源失败：0。
- Impeccable 设计检测：无规则发现；删除的旧根页面不参与检测。
- 中文字体实际渲染核对：Microsoft YaHei；英文 Geist 字体继续由项目包自托管。
- 已核对 Git 跟踪文件：没有 `node_modules`、`.npm-cache`、`.next`、`.env`、`.env.local`、截图或临时验收脚本。

浏览器检查脚本、截图与 JSON 报告保存在已忽略的 `artifacts/phase2-qa`，不提交比赛源码。验收中发现并修复了 reduced-motion 首次渲染的 hydration 不一致，以及 SVG 缩放后描线变断续的问题；修复独立保留提交。

## 已知边界与下一阶段

本阶段没有阻塞交付的已知问题。演示状态仅在组件本地保存，刷新后重置。搜索只展开预设问题的结果，清理确认只更新示例状态，知识关系不是模型实时推断。

真实文件上传、解析、AI API、数据库、RAG、Agent、登录、文件修改与恢复均未接入。下一阶段等待用户明确启动 Phase 3，再按其需求实现真实 AI Workspace；当前停止于 Phase 2。

## 提交记录

- `0b9307c` — `feat: define phase 2 presentation data and surface tokens`
- `49fb3f7` — `feat: build interactive FileMind marketing landing page`
- `5d30148` — `feat: build personal knowledge dashboard`
- `f63452f` — `fix: stabilize reduced-motion previews and graph rendering`
- 阶段文档：`docs: record phase 2 completion and acceptance`

所有阶段提交通过普通 Push 同步到 `origin/main`，完整哈希与最终文档提交可通过 `git log --oneline` 查阅；不重写既有历史。
