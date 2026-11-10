# 工作区更新应用服务

`src/lib/workspace/workspace-updates.ts` 提供四个小型业务转换函数。输入是已解析、已按租户读取的快照；输出是新的快照，不修改输入，也不自行读取身份、数据库、模型、原件或日志。服务不递增 revision；持久化层仍以数据库中的当前 revision 作最终并发裁决。

## 前置条件与状态变化

| HTTP／服务函数 | 前置条件 | 输出及保存路径 |
| --- | --- | --- |
| PUT／`prepareMockWorkspaceSave` | 工作区 ID 与 revision 必须一致；当前和提交的 run 都不能是 `engine=llm`；已完成的同一 run ID 禁止修改；已保存资料的 ID 集合、名称、类型、大小、MIME 不可修改；客户端不能指定新的存储路径 | 克隆客户端 mock 快照，保留已有进度保存语义。提交状态是 completed 且带方案时，只保留 accepted 关系，并复制方案到 `run.result`。completed 走原有 `WorkspaceOperations.apply`，其他情况走 repository.save |
| PATCH resume／`resumeWorkspace` | revision 一致；必须有 run，状态为 running、planning、failed 或 cancelled | 清空 run 和 proposal，保留资料、提取文本及其他快照字段，走 repository.save。适用于 mock 和 LLM 的现有重启流程 |
| PATCH review／`reviewWorkspace` | revision 一致；提交方案必须存在；当前 run 为 waiting_for_review 且有已保存方案；通过 `validateReview` | 替换 proposal，不修改 run 及原 `run.result`，走 repository.save |
| PATCH apply／`applyWorkspacePlan` | 与 review 相同，先校验完整的最新提交方案 | 以请求里的最新方案为准；accepted 改名使用 `sanitizeFilename`，其余恢复原名；关系仅保留 accepted；重复候选保留全部审阅决定；run 变为 completed，设置 completedAt，深拷贝最终方案到 result；走 `WorkspaceOperations.apply` |

审阅继续使用现有 `validateReview`：不增删资料，不改 originalName、suggestedName、单份资料 summary 或嵌套原件对象；关系与重复候选仅允许修改 decision，不能改引用或依据；分类、标签和审阅决定保持原有可编辑行为。对显示名称的客户端输入沿用原兼容规则，apply 时最终由原名／经过清理的建议名称确定。

这是对现有规则的提取，没有新增更窄的 mock 进度状态矩阵：PUT 仍允许客户端提交已有的 mock 进度快照、初次资料快照及替代 run ID；禁止修改已完成的同一 run ID。浏览器不能通过 PUT 覆盖或伪造 LLM run，但可通过已校验的 review／apply 修改允许的审阅字段。既有快照和请求的 Zod 限制保持不变，PATCH 请求解析 schema 命名为 `WorkspaceUpdateSchema`。

## 职责边界

- Route Handler：同源检查、身份验证、租户恢复屏障、按租户读取、请求体解析、选择转换函数及原保存路径、成功后索引调度、HTTP 响应和错误映射。
- authorization：revision／ID 校验、mock 保存约束、已有的审阅不可变检查。租户所有权仍由带 userId 的 repository 查询和 RLS 保证；不把不含 owner 的快照误当作授权凭据。
- workspace-updates：仅负责业务转换，不包含事务、数据库调用、恢复记录或副作用。
- repository／数据库 `save_workspace`：在原子保存中锁定工作区并检查 revision，更新快照及关联表；未修改 schema、SQL 函数或存储格式。
- `WorkspaceOperations.apply`：保留先恢复、记录操作、保存业务快照并在同一事务提交日志的现有实现；该层不会重新选择或重建方案。转换服务不绕过这个事务入口，也不创建第二份日志。

不新增状态机依赖、事件总线、通用基类或新的 HTTP 端点。GET 的恢复视图逻辑保持原样。

## 兼容性与验证

保留原错误的 code、message 和状态：请求解析失败 400／VALIDATION，缺方案或不可变字段修改 400／INVALID_STATE，客户端 LLM 保存 403／INVALID_STATE，跨租户／匿名拒绝 404／NOT_FOUND，revision 或非法当前状态 409，存储故障 503。请求中版本不匹配仍优先于其他业务检查；数据库提交时的竞态仍返回既有的冲突错误。

`tests/workspace-updates.test.ts` 使用合成且冻结的快照验证四类转换及输入不变性；使用独立内存 PGlite、统一租户入口和 RLS 执行真实 Route、repository、RecoveryService 及 WorkspaceOperations。身份与索引调度采用替身，应用日志被替换，恢复服务仅使用本次创建的系统临时目录，不接触本地私有存储、真实数据库或模型。

关键验收包括：

- mock 原件字段／存储位置保护、LLM 服务端权威、完成态保护、非法 resume／review／apply 拒绝。
- 跨租户、匿名、同源、请求解析、陈旧 revision 的 HTTP 状态及响应体兼容。
- 已自动保存的审阅方案之后，apply 请求携带的新分类、标签、改名和关系决定全部进入最终结果及数据库。
- 通过真实 `PersistenceClient` 将 autosave 和 apply 连续排队，确认 apply 使用前一次保存返回的新 revision 和最后编辑的方案。
- 在 Route 读快照之后注入另一份保存，确认最终数据库 revision 检查仍能拒绝 apply。
- 在业务保存之后、日志提交处注入故障，确认快照 revision／状态、标签等全部回滚，操作日志标为 rolled_back，失败不调度索引。

验证命令：

```powershell
npm run typecheck
npx eslint 'src/app/api/workspaces/[id]/route.ts' src/lib/workspace/authorization.ts src/lib/workspace/schemas.ts src/lib/workspace/workspace-updates.ts src/lib/reliability/workspace-operations.ts tests/workspace-updates.test.ts
npx tsx --test --test-concurrency=1 tests/workspace-updates.test.ts tests/persistence.test.ts tests/persistence-client.test.ts tests/postgres-repository.test.ts tests/tenant-access.test.ts tests/workspace.test.ts
```

类型检查、上述改动文件 ESLint 及 67 项针对性测试全部通过。

不运行加载本地环境配置的 Next 构建、真实服务 E2E 或收费模型；本步不修改事务与恢复算法，保持已有索引调度时机。
