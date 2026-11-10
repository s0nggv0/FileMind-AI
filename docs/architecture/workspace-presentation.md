# 工作区页面读取边界

本步仅拆分页面读取，不修改数据库结构、HTTP 接口、工作区快照或方案存储格式。

## 调用关系与实际需求

原先四个页面均调用 `getWorkspacePresentation()`：`workspaceRepository.list()` 读取最近 50 个完整快照，随后读取全局计数和最近导入的 1500 份资料。概览在组件内丢弃第 5 份之后的资料；图谱、重复候选页丢弃全部资料和计数。资料库仅使用快照中的已完成方案计算关联数。

现在每个页面先验证请求身份，等待 `recoverTenantBeforeAccess()`，再通过统一 `database.query(userId, sql, values)` 执行用途明确的读取。没有跨请求缓存，没有直接连接池或绕过租户入口的查询。恢复失败时不执行后续业务读取。

| 页面／入口 | 实际使用的字段 | 条数与排序 |
| --- | --- | --- |
| dashboard／`getWorkspaceOverview` | 全局资料数、全局工作区数、最近范围内待审阅工作区数；历史的 `id/name/documentCount/status/updatedAt`；动态的 `id/workspaceId/at/message`；最近资料的 `id/name/type/category/updatedAt/relations`；`persistent` | 历史最多 50 个，按 `updated_at DESC, id DESC`；每个历史工作区取追加顺序最后 3 条动态，再按 `at DESC` 取全局最近 10 条；最近资料按 `created_at DESC, id DESC` 仅取 4 份 |
| library／`getLibraryDocuments` | 资料的 `id/name/type/size/indexStatus/storageStatus/summary/category/tags/updatedAt/relations`；全局资料数用于范围提示；`persistent` | 最近导入的 1500 份，按 `created_at DESC, id DESC`；标签按名称升序；客户端仍在当前资料范围内筛选，无服务端分页 |
| graph／`getAppliedPlans` | 方案 `documents`（节点、摘要、分类、大小及阅读链接）、非 ignored 的 `relationships`（边）、`simulation`；`persistent`；工作区总数用于范围提示 | 先按 `updated_at DESC, id DESC` 取最近 50 个工作区，再保留其 `run.status=completed` 且有 `result` 的方案；保持方案内资料及关系顺序、现有整理记录选择器与默认选择行为 |
| cleanup／`getAppliedPlans` | 方案资料的 `id/name` 用于候选标题及阅读链接，`documents` 用于来源文件数；`duplicates` 的 `id/documentIds/reason/decision/kind`；`workspaceId/revision` 用于现有审阅写入；`persistent`；工作区总数用于范围提示 | 与图谱使用相同的已应用方案读取及范围；保留 accepted、pending 和 ignored 候选与原顺序 |

图谱和重复候选共享方案契约，因此返回完整已应用方案，不再返回完整工作区、运行步骤、活动或独立资料列表。关联数在数据库中按方案边的两个端点分组计数，仍包含 pending、accepted，排除 ignored；其方案范围与原实现相同。总资料数、总工作区数、最近范围待审阅数和历史资料数均由数据库聚合，前端不再解析完整快照来统计。

相同时间的工作区／资料新增 ID 降序作为稳定次序。动态时间相同时按工作区更新时间、ID 降序及原追加顺序稳定排序。单个工作区的历史动态仍先按追加位置取最后 3 条，不能替换成该工作区按事件时间最大的 3 条。

## 上限和分页决策

本步选择**保留现有读取限制并显示范围提示**，不增加分页，不扩大查询范围，也不引入新的数据保留／删除限制。

- `WORKSPACE_HISTORY_LIMIT=50`：只控制概览历史、最近待审阅统计和动态。全局资料数及工作区数仍覆盖整个租户；超出时提示范围及通过原工作区链接打开较早记录。
- `APPLIED_PLAN_WORKSPACE_LIMIT=50`：独立命名的方案业务范围，当前数值与历史上限相同。图谱、重复候选始终说明“最近更新的 50 个工作区中已应用的方案”，并显示工作区总数。**不是最近 50 个已完成方案**，不在方案状态过滤后补足 50 个。当前会话与预置示例仍按原逻辑另行合并／切换。
- `LIBRARY_DOCUMENT_LIMIT=1500`：保留资料库当前列表及客户端筛选范围。超出时明确提示最近导入范围、总数、暂不分页，以及通过搜索结果或资料链接访问较早资料。现有按 ID 加载原文、引用定位和修正分类标签的 HTTP 接口不变。
- `RECENT_DOCUMENT_LIMIT=4`：概览仅取所展示的 4 份资料，不再加载 1500 份后截断。不获取摘要、标签、大小和存储状态等该列表未使用的字段。
- `/api/workspaces` 的完整快照列表和 `/api/documents` 的既有 50／1500 上限及响应格式保持不变；这些 HTTP 接口不改成页面投影契约。

没有上一页／下一页入口或游标契约，因此本步不声称完成分页功能。边界验收检查恰好达到上限时不误报、超出时不扩大结果，并确认范围外工作区仍能按 ID 读取。分页作为后续独立产品步骤，不能通过移除 LIMIT 静默实现。

## 合成验证和测量

`tests/workspace-presentation.test.ts` 使用迁移创建的独立内存 PGlite，通过统一租户查询入口及 RLS 角色读取，使用固定合成资料，不读取环境文件、原件、私有目录、真实数据库或模型。

覆盖空租户、匿名及未配置持久化、普通资料、草稿工作区、50／51 个工作区、1500／1530 份资料、同时间排序、修改时间与导入时间区别、不同审阅决定、旧方案范围、两租户隔离；四个真实页面及客户端组件在隔离的导航／会话替身下执行服务端静态渲染，验证空状态、普通内容及超限提示。Radix 弹窗在 hydration 后挂载，因此资料直达链接在此检查页面向组件的 ID／引用错误标记传递；不把它称为浏览器交互验收。

使用同一个 51 工作区／1530 资料样本与提交 `4cf4589` 的原查询投影对比，每工作区 30 份资料、5 条活动、3 条关系、2 组候选；最近 50 个中有 38 个已完成方案。测试同时验证方案、资料集合、动态、关联数和待审阅数与改前一致。

| 读取 | 业务查询次数 | 查询返回行数 | 返回 JSON 字节数 | 主要逻辑数据量 |
| --- | ---: | ---: | ---: | --- |
| 改前每个页面 | 3 | 1551 | 2,486,784 | 50 完整快照 + 1 统计行 + 1500 资料 |
| dashboard | 2 | 5 | 10,309 | 1 聚合行内含 50 历史摘要／10 动态 + 4 最近资料 |
| library | 1 | 1 | 480,790 | 1 聚合行内含总数及 1500 资料 |
| graph（每页） | 1 | 1 | 508,612 | 1 聚合行内含工作区总数及 38 方案 |
| cleanup（每页） | 1 | 1 | 508,612 | 同图谱 |

字节数为 `Buffer.byteLength(JSON.stringify(result.rows))` 的合计，不是 PostgreSQL 线协议或浏览器传输字节。聚合 JSON 的一行不代表一份资料。次数不含保持不变的身份验证、恢复检查和租户事务控制语句。没有测量真实 PostgreSQL 延迟、执行计划、并发吞吐或线上端到端耗时，不据此宣称性能提升百分比；数据库内部仍需处理范围内的方案及计数。

验证命令：

```powershell
npm run typecheck
npm run lint
npx tsx --test --test-concurrency=1 tests/workspace-presentation.test.ts tests/tenant-access.test.ts tests/postgres-repository.test.ts
```

以上检查通过，针对性测试共 44 项通过；最终代码另完成改动文件范围的 ESLint 复核。

未运行连接真实服务的端到端测试、模型评测或根目录 Next 构建（会加载本地环境配置）。本次没有 schema migration、安装依赖或全项目格式化。
