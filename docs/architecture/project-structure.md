# 项目目录与模块边界

FileMind 使用单个 Next.js 应用承载浏览器界面与服务端 API。数据库迁移、开发脚本和验收材料独立存放。

| 位置 | 职责 |
| --- | --- |
| `src/app/` | 路由、布局、请求校验、身份读取和 HTTP/SSE 响应 |
| `src/features/` | 按业务组织的界面、浏览器状态和浏览器适配服务 |
| `src/components/` | 跨业务复用的 UI、导航与反馈组件 |
| `src/lib/workspace/` | 工作区契约、共享整理规则、授权和持久化实现 |
| `src/lib/retrieval/` | 索引、检索、回答验证、搜索应用服务和历史记录仓库 |
| `src/lib/server/` | 仅限服务端的配置读取、实例组装和基础设施连接 |
| `src/lib/demo/`、`src/mocks/` | 明确标记的演示数据访问与示例材料 |
| `src/types/` | 跨层契约和展示模型 |
| `database/migrations/` | 按版本顺序执行的 SQL 迁移 |
| `scripts/` | 按任务分类的构建、运行、评测、验收与发布脚本 |
| `tests/` | 单元测试、数据库集成测试、浏览器测试和合成材料 |

## 依赖约定

界面可以调用共享业务模块；`src/lib` 不导入 `features` 或 `components`。ESLint 检查这一约束。共享整理规则由调用方显式传入文本读取函数：浏览器使用解析器的内容引用，服务端使用当前工作区快照，规则本身不访问浏览器资源。

搜索请求先在路由完成同源检查、结构校验和身份读取，再交给 `SearchService`。`prepare` 在 SSE 建立前完成索引版本检查与追问/澄清校验；`execute` 编排检索、来源过滤、回答验证和结果保存，只返回最终结果。`PostgresSearchHistory` 集中保存 SQL，并始终携带用户与可选工作区范围。`src/lib/server/search.ts` 组装数据库、模型和日志依赖。

`DocumentViewModel`、`GraphNodeViewModel`、`GraphEdgeViewModel` 和 `CleanupIssueViewModel` 同时服务于真实资料和示例界面。示例来源由 `lib/demo`、`mocks` 和界面标识表达，不由展示类型名称推断。只用于演示的活动和流程类型仍保留 `Demo` 名称。

## 当前入口与历史材料

日常开发和验证入口以 `package.json`、[脚本导航](../../scripts/README.md) 及当前架构文档为准。`docs/adr` 保存架构决策；`docs/phase-checklists`、`docs/evaluation` 和 `docs/superpowers/specs` 保存各阶段的验收与设计上下文。历史材料中的旧路径和冻结哈希不随目录重构改写。

本次整理不改变 HTTP 接口、数据库结构、检索参数、答案发布门或便携启动命令。

## 本轮验证（2026-10-15）

- 类型检查、ESLint 和 Turbopack 生产构建通过，构建后便携资源准备完成。
- 115 项单元与数据库集成测试通过，包含搜索编排、租户隔离、来源过滤、取消和发布脚本搬移检查。
- 常规浏览器回归 17 项、交付场景 3 项通过；8 份 Playwright 配置均能发现对应测试。
- 本轮使用离线模型夹具验证调用与答案发布流程；未重新执行真实模型评测或打包新的发布 ZIP。
