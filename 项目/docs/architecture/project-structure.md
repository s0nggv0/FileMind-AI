# 项目目录与模块边界

FileMind 使用单个 Next.js 应用承载浏览器界面与服务端 API。数据库迁移、开发脚本和验收材料独立存放。

下表路径以应用目录 `项目/` 为起点；开发、构建与验收命令在这里执行。对外文档、比赛脚本与可上传样本见 [项目介绍](../../../项目介绍/README.md)。Git 仓库在应用目录的上一层。

| 位置 | 职责 |
| --- | --- |
| `src/app/` | 路由、布局、请求校验、身份读取和 HTTP/SSE 响应 |
| `src/features/` | 按业务组织的界面、浏览器状态和浏览器适配服务 |
| `src/components/` | 跨业务复用的 UI、导航与反馈组件 |
| `src/lib/workspace/` | 工作区契约、整理与状态转换规则、授权、页面读模型和持久化实现 |
| `src/lib/retrieval/` | 索引、检索、回答验证、搜索应用服务和历史记录仓库 |
| `src/lib/server/` | 仅限服务端的配置读取、实例组装和基础设施连接 |
| `src/lib/demo/`、`src/mocks/` | 明确标记的演示数据访问与示例材料 |
| `src/types/` | 跨层契约和展示模型 |
| `database/migrations/` | 按版本顺序执行的 SQL 迁移 |
| `scripts/` | 按任务分类的构建、运行、评测、验收与发布脚本 |
| `tests/` | 单元测试、数据库集成测试、浏览器测试和合成材料 |

## 依赖约定

界面可以调用共享业务模块；`src/lib` 不导入 `features` 或 `components`。ESLint 检查这一约束。共享整理规则由调用方显式传入文本读取函数：浏览器使用解析器的内容引用，服务端使用当前工作区快照，规则本身不访问浏览器资源。

`components/ui`、`components/common` 和 `components/knowledge` 不依赖具体 feature 实现；复用的 `KnowledgeIndex` 位于 `components/knowledge`。浏览器运行时的传递导入边界由 ESLint 和 `npm run check:imports` 检查，公共类型引用与运行时引用分开处理，详见 [检索契约](retrieval-contracts.md)。

搜索请求先在路由完成同源检查、结构校验和身份读取，再交给 `SearchService`。`prepare` 在 SSE 建立前完成索引版本检查与追问/澄清校验；`execute` 编排检索、来源过滤、回答验证和结果保存，只返回最终结果。`PostgresSearchHistory` 集中保存 SQL，并始终携带用户与可选工作区范围。`src/lib/server/search.ts` 组装数据库、模型和日志依赖。

搜索浏览器侧由 `search-client` 负责 HTTP/SSE，`use-knowledge-search` 管理请求生命周期和历史，`knowledge-search` 组合输入、结果及引用视图。回答和搜索的共享 schema/type 位于少量契约模块，模型生成与事实校验仍在服务端核心。

`getUserId()` 只验证 Cookie；租户数据入口显式等待 `recoverTenantBeforeAccess()`，再访问数据库或原件，详见 [恢复边界](tenant-recovery-boundary.md)。概览、资料库和已应用方案使用 [独立的页面读模型](workspace-presentation.md)；工作区更新路由把状态转换交给 [工作区转换服务](workspace-updates.md)，事务、revision 裁决和恢复日志仍由持久化层负责。

`DocumentViewModel`、`GraphNodeViewModel`、`GraphEdgeViewModel` 和 `CleanupIssueViewModel` 同时服务于真实资料和示例界面。示例来源由 `lib/demo`、`mocks` 和界面标识表达，不由展示类型名称推断。只用于演示的活动和流程类型仍保留 `Demo` 名称。

## 当前入口与历史材料

日常开发和验证入口以 `package.json`、[脚本导航](../../scripts/README.md) 及当前架构文档为准。`docs/adr` 保存架构决策；`docs/phase-checklists`、`docs/evaluation` 和 `docs/superpowers/specs` 保存各阶段的验收与设计上下文。历史材料中的旧路径和冻结哈希不随目录重构改写。

本次整理不改变 HTTP 接口、数据库结构、检索参数、答案发布门或便携启动命令。

日常检查使用 `npm run typecheck`、`npm run lint`、`npm run check:imports`、`npm run check:renderers` 和 `npm test`。`npm test` 同时发现根目录的 `.test.ts` 与 `.test.mjs`，包括导入规则测试；浏览器搜索和租户恢复还有 [独立隔离验证入口](../../scripts/README.md)。

## 历史验证（2026-10-15）

- 类型检查、ESLint 和 Turbopack 生产构建通过，构建后便携资源准备完成。
- 115 项单元与数据库集成测试通过，包含搜索编排、租户隔离、来源过滤、取消和发布脚本搬移检查。
- 常规浏览器回归 17 项、交付场景 3 项通过；8 份 Playwright 配置均能发现对应测试。
- 本轮使用离线模型夹具验证调用与答案发布流程；未重新执行真实模型评测或打包新的发布 ZIP。
