# 身份与租户恢复入口

## 职责

- `src/lib/server/identity.ts` 的 `getUserId()` 只读取请求 Cookie、验证 UUID 和 HMAC，返回身份或 `null`。不导入数据库或恢复服务，不签发 Cookie。
- `getOrCreateUserId()` 明确表达创建身份的意图；已有有效身份则直接返回，否则调用 `issueIdentityCookie()`。签发只允许在可写 Cookie 的 Route Handler / Server Function 中调用。Cookie 格式、签名和安全选项不变。
- `src/lib/server/reliability.ts` 的 `recoverTenantBeforeAccess(userId)` 是租户数据入口的显式恢复屏障。有身份且配置了持久化时，必须等待恢复完成再访问数据；恢复错误原样向上传播，由入口现有错误映射处理。无身份或未配置持久化时不执行恢复 IO。

普通入口顺序为：原有 Origin / 输入前置校验 → 身份读取或签发 → 显式恢复 → 原有授权、租户数据读写。各入口原有前置校验顺序保留。

不做恢复去重。每次入口调用都重新执行恢复，不使用全局 TTL、React cache、长期 Promise 或“已经恢复”标记。`WorkspaceOperations`、备份、索引及维护服务中原有的操作前恢复、提交后清理仍独立执行，不能被入口屏障替代。

## 入口审计

| 入口 | 恢复位置 |
| --- | --- |
| `/api/documents` GET；`/api/documents/[id]` GET/PATCH；原文件 GET | 获取 Cookie 身份后，文档查询和原件读取前；详情共用入口辅助函数 |
| `/api/images/[id]` GET；`/api/multimodal` POST；`/api/ai/agent` POST | 身份读取后，资料查询、图片处理及流式操作开始前 |
| `/api/workspaces` GET/POST；`/api/workspaces/[id]` GET/PUT/PATCH；上传 POST | 身份读取或显式创建后，工作区查询和写操作前；详情共用 `owned` |
| `/api/duplicates` PATCH | 身份读取后，重复候选写入前 |
| `/api/search` GET/POST；`/api/index` GET/POST | 身份读取后，历史、引用、检索准备及索引状态访问前；搜索流启动前已完成屏障 |
| `/api/backup/export`、`import`、`validate` POST | 身份读取或创建后，租户导出、导入、重复检测前；导入仍先验证归档再签发身份和访问租户数据 |
| `/api/identity` GET；POST create/rotate | 身份读取或显式创建后，凭证状态读取或创建/轮换前 |
| `/api/identity` POST recover | 保留恢复密钥验证与限流后签发 Cookie 的流程，不在签发函数中执行存储恢复；后续数据入口自行恢复 |
| `/api/maintenance` GET/POST；`/api/demo` GET 状态、POST reset | Cookie 身份读取后；维护与 reset 操作内部原有恢复、租约和提交后处理保留 |
| `/api/demo` POST open | 无 Cookie 身份可用；`DemoWorkspaceService.open()` 验证服务端演示身份文件后，在租户表查询/注册前恢复该身份。固定演示素材下载不访问租户数据 |
| dashboard / library / graph / cleanup Server Components | 共用 `getWorkspacePresentation()`：读取请求身份后恢复，再查询工作区和文档 |
| search / settings Server Components | 只读身份以保留请求时渲染，不访问租户数据，因此不恢复；浏览器后续 API 请求各自经过屏障 |
| `/api/workspace-config`、产品布局、营销页 | 只读配置或组合 UI，不访问租户数据，无恢复调用 |

没有 Server Action 数据入口。`src/instrumentation.ts` 的数据库就绪探测不是租户数据请求；启动器仍通过 `scripts/runtime/startup-recovery.mjs` 在接收 Web 请求前执行启动恢复。

## 保留的协议与验证边界

`RecoveryService.recover()`、`recoverTenantOperations()`、数据库迁移、原件处理和操作租约实现均未修改。Web 恢复仍跳过活跃应用排队中的准备任务；活动物理租约不能被恢复流程抢占。租约丢失导致恢复失败时，入口不继续读取数据；后续请求重新尝试。提交后的清理与未提交操作回滚仍由现有协议决定。

运行 `node scripts/verification/verify-tenant-access.mjs`。脚本使用临时工作目录、内存 PGlite、合成原件及日志，仅复制迁移源码和指定合成图片，不加载项目环境文件或私有运行目录。

本次 44 项针对性验证覆盖：纯身份函数无恢复数据库/租约 IO、无效身份、恢复错误的 503/409 语义、28 种 Route Handler 分支、Server Component 入口、并发请求独立等待、恢复完成前阻止读取、租户作用域，以及活动租约、租约中断后的再次恢复。既有隔离用例覆盖已提交原件保护、提交响应丢失、备份导入中断、排队任务、回滚与 FORCE RLS。演示重新打开也验证了提交响应丢失后的恢复。

Cookie 与数据库连接由替身提供；租约中断由合成信号注入。未运行真实 Next HTTP 服务器、原生 PostgreSQL 多进程物理 advisory lock / 连接断开验证、启动器崩溃恢复或完整生产构建。这些验证不能由内存数据库和替身替代，仍需后续独立隔离环境确认；此处不作全面集成通过的声明。
