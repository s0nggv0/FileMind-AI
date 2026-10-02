# Phase 3：本地 AI Workspace 与 Agent Workflow Simulation

完成日期：2026-10-02。本阶段完成真实浏览器文件选择、解析，以及可审阅的 Mock Agent 整理闭环。没有接入真实 LLM、数据库、认证、Embedding 或 RAG；没有进入 Phase 4。

## 实现内容

- [x] `/workspace` 按 Upload、Agent Execution、Review & Apply 三阶段切换；首次只突出上传。
- [x] 真实拖拽、多选、队列、移除与 Clear all；扩展名、非空 MIME、20 MB / 30 文件校验。
- [x] 上传限制集中在 `src/config/upload.ts`；同名文件保留并标记 Possible duplicate。
- [x] TXT、MD、DOCX、PDF 真实文本提取；PNG/JPG/JPEG 读取实际尺寸及元数据。
- [x] 明确 ParsedDocument、AgentRun、AgentStep、OrganizationPlan 和 AgentEngine 契约。
- [x] 渐进 Planner、七种 Tool、实时 Pending → Running → Completed、Duration、整体进度和 Activity。
- [x] 执行阶段显示逐文件 Ready / Processing / Completed / Failed / Skipped，锁定文件集合。
- [x] 文件名及文本规则生成分类、标签、提取摘要、名称建议、重复候选和知识关联。
- [x] Review 可展开分类、移动文档、增删标签、接受/忽略/撤销重命名、重复与关联建议。
- [x] Apply 只改变应用内数据；完成后可在 Library 和 Graph 查看结果，并开启下一批 Workspace。
- [x] Cancel、Restart、失败步骤 Retry 和 Skip document；真实解析错误和三种可注入 Demo 故障。
- [x] 单个文件失败不丢失其他文档；跳过后继续，明确统计 processed / skipped。
- [x] 响应式、浅色/深色、减少动态效果和阶段切换焦点；延续 Phase 2 设计系统。
- [x] 本地服务资源释放、生产构建、单元测试、浏览器验收、持续 Commit 与普通 Push。

## Workspace 状态机

```text
run = null (idle)
  → files selected (documents 非空，parseStatus=ready)
  → planning (生成工具计划)
  → running (read_document 完成真实解析，然后执行规则工具)
  → waiting_for_review
  → applying (锁定 Review，模拟应用)
  → completed

planning / running / applying → cancelled
cancelled / failed → Restart → planning

running 中单步骤失败：step=failed，run 仍为 running，执行暂停
  → Retry → pending → running → completed → 继续
  → Skip document → skipped → 继续

Agent Error / 全部文档被跳过 → failed
Reset / Discard → run=null，并释放当前文件和提取内容
```

`useWorkspaceStore` 是业务状态的唯一 UI 来源，组件局部状态只负责拖拽反馈、标签输入和视图选择。Engine 通过 `RunListener` 发布不可变快照；Store 只接受当前 Run ID，防止旧任务的异步回调覆盖新任务。重复点击 Start / Apply 有状态与执行锁保护。

AbortController 管理取消、延时、PDF task 销毁与重置。DOCX 解压不能强制中断底层同步工作，但取消后不发布结果、不写入内容缓存。跳过不执行后续处理该文档。零成功文档不能提交空方案，显示可重新开始的错误。

## AgentEngine 接口与 Mock 工作方式

契约位于 `src/types/workspace.ts`：

```ts
createRun(documents, fault?): AgentRun
executeRun(runId, onUpdate): Promise<void>
cancelRun(runId): void
retryStep(runId, stepId, onUpdate): Promise<void>
skipStep(runId, stepId, onUpdate): Promise<void>
applyPlan(runId, plan, onUpdate): Promise<void>
disposeRun(runId): void
```

`MockAgentEngine implements AgentEngine` 在独立服务层调度，React 组件中没有执行流程定时器。Store 工厂接受 AgentEngine，因此后续替换 Engine 不必改 UI。Mock 运行与结果始终包含 `simulation: true`；界面显示 Agent Demo、规则依据和本地数据边界。

| Tool | 当前行为 |
| --- | --- |
| `read_document()` | 每文件一个步骤；调用真实浏览器解析服务 |
| `summarize_document()` | 将提取文本前 360 字整理为 excerpt；非 LLM 摘要 |
| `classify_document()` | 文件名与前 500 字关键词匹配 AI / Study / Projects / Research / Images / Uncategorized |
| `generate_tags()` | Transformer、Attention、Research、Notes、Project 等规则标签 |
| `detect_duplicates()` | 小写、去扩展名、去版本/final/copy 后的名称分组；无内容相似度 |
| `build_relationships()` | 共享非通用标签或分类的文档配对；输出具体规则依据 |
| `generate_organization_plan()` | 整理成功解析文档和所有建议，等待人工确认 |

工具呈现是真实时序变化；规则“推理”和延时是演示。模拟故障从 Upload 的 Demo controls 选择，单次注入 Parse / Tool / Agent Error，不通过特殊文件名暗中触发。

## 文件解析与安全边界

`src/features/workspace/services/file-parser.ts` 统一管理原生 File 和提取文本的 Map。Store 不保存 File、ArrayBuffer、Base64 或完整正文，只保存元数据、状态、字符数、页数与 contentRef。

| 格式 | 解析实现 | 限制 |
| --- | --- | --- |
| TXT / MD | `File.text()`，内容视为纯文本 | UTF-8；不执行 Markdown HTML 或脚本 |
| DOCX | 懒加载 `mammoth/mammoth.browser` 的 `extractRawText()` | 提取段落文本，不保留版式、不运行宏；损坏文件可以失败 |
| PDF | 懒加载 PDF.js，独立浏览器 Worker、逐页 `getTextContent()` | 最多提取前 200 页 / 250,000 字符；页数记录原 PDF 总页数 |
| PNG / JPG / JPEG | `createImageBitmap()`，读取宽高后 `close()` | 只读元数据，无 OCR/Vision/图片理解 |

文本最多保留 250,000 字符，达到限制在 Review 明示。PDF 扫描页没有可提取文字时只用名称给出建议，不假装识别图片。加密 PDF 没有密码输入流程，会作为解析失败处理。文件 size 与 name 验证不证明文件内部结构，真正的损坏内容由解析器检测。

`predev` / `prebuild` 从安装依赖复制 PDF Worker、CMaps、标准字体和 Wasm 到同源 `public/`。这些生成资源在 Git 与 lint 中忽略；部署生产产物时需保留这些静态资源，不依赖第三方 CDN。运行环境最低 Node.js 22.13.0，符合当前 PDF.js 的要求。

没有上传 API；用户文件和元数据不发送远端。所有提取内容以 React 文本渲染，没有 `dangerouslySetInnerHTML`、脚本执行或文档宏执行。没有建立预览 object URL，因此无需 revoke；解码图像立即关闭，PDF task 在成功/失败/取消时销毁，延时的 Abort listener 清理。

Apply 后释放原生 File；Reset/清空/移除释放当前内容缓存与原文件引用，disposeRun 移除 Engine 上下文。已应用计划只保留短摘要、文档元数据与建议快照。跨应用内路由保留 Session，刷新则全部丢失；不使用 localStorage 保存文档。

## Review 与结果的语义

- 分类移动只修改方案，标签输入去掉空白、去重并限制 40 字。
- 重命名必须明确 Accept 才生效；Ignore 或 pending 保留原名称。图片建议使用日期与 ID，不猜图像内容。
- 接受重复候选表示标记一个名称相似的组。所有文档都保留，不合并、不删除，Library 可查看已接受组。
- 知识关系可接受、忽略或撤销；Apply 包含未忽略的原始关系建议。人工编辑分类或标签不会自动重新计算原始关系，因此仍应审阅/忽略不合适的关系。
- Library 展示已应用的多个 Session 快照，可按分类/名称/摘要/标签筛选；保留独立 Example workspace 切换。
- Graph 展示某一已应用 Run 的全部文档节点与保留的关系；可切换 Run，点击或键盘选择节点。零关联时显示独立节点说明。
- 完成后的 Start another workspace 清空当前工作台，已应用 Library/Graph 元数据快照继续留在此会话中。

## 目录与责任

```text
src/config/upload.ts                         集中限制与大小格式化
src/types/workspace.ts                       领域类型、AgentEngine 接口
src/features/workspace/
  workspace.tsx                             三阶段呈现与焦点切换
  components/
    upload-dropzone.tsx                     真实拖拽、多选
    file-queue.tsx                          队列、校验反馈、Demo controls
    agent-execution.tsx                     Planner / Tool Steps / Progress / Activity / 状态
    organization-review.tsx                 分类、标签与建议人工审阅
    completion-state.tsx                    完成与结果路由入口
    session-results.tsx                     Library / Graph 的 Session 视图桥接
  services/
    file-parser.ts                          File / 正文资源与实际解析
    organization-rules.ts                   透明分类与关系规则
    mock-agent.ts                           可替换执行器、故障与恢复
    session-presentation.ts                 已应用数据的 Library / Graph 适配
  store/workspace-store.ts                  唯一 Workspace 业务状态
scripts/prepare-pdf-worker.mjs                同源 PDF 静态解析资源准备
tests/workspace.test.ts                      状态机与资源生命周期测试
tests/e2e/                                  原创合成文件及真实浏览器验收
```

## 验证结果

- `npm run build`：成功，包含 Workspace、Library 和 Graph。
- `npm run typecheck`：零错误；`npm run lint`：零错误、零警告；`git diff --check`：通过。
- `npm run test`：8 项全部通过。检查格式/MIME/大小/数量、真实 TXT 提取和资源释放、名称归一化、七工具执行、Parse/Tool/Agent 故障、Retry/Skip/Cancel、锁定、编辑、重复 Apply 防护与 Reset。
- `npm run test:e2e`：8 项全部通过。真实 PDF、DOCX、TXT、MD、PNG、JPG、JPEG 的混合九文件流程；移除、分类修改、增删标签、忽略命名、接受重复候选、Apply、Library/Graph 访问和 Reset。
- 浏览器还验证空队列、单文件真实 DragEvent、不支持 HTML、20 MB 超限、31 文件截断、真实损坏 DOCX 重试再跳过、三种模拟故障和取消重启。
- Edge / Chromium 生产预览：1440、1280、768、390px，截图宽度溢出断言通过；深色使用 Settings 实际主题控件，系统减少动态效果开启后验收 Review / Apply / 完成。
- 最终混合文件场景额外断言实际逐文件 Processing → Completed；截图固定文档顶部，确保平滑滚动和主题切换不会污染验收证据。
- 浏览器 pageerror、console error：0；未出现 hydration、key warning 或未处理 Promise 异常。请求断言：只有本机同源 GET，没有第三方请求或文件 POST。
- Impeccable detector：`[]`；独立 finish reviewer 对最终九张截图和源代码复核结论：**Ship**，无剩余重大问题。
- 独立 documenter 对照 Phase 2 确认全局 tokens、字体、基础组件和 DESIGN.md 无视觉系统变更，不迁移设计文档。既有 DESIGN.md 旧格式、缺少 sidecar 和控制圆角描述漂移保留在本阶段范围之外。
- Git 未跟踪 node_modules、.next、环境变量、PDF 生成资源、截图、临时上传文件或测试输出。

验收截图保存在忽略目录 `artifacts/phase3-qa`。测试文件使用代码生成的原创小型 PDF/DOCX 和浏览器合成图片，不含用户资料或版权文件。测试脚本可提交，生成的二进制样例与结果不提交。

复现：

```powershell
npm ci
npm run test
npm run typecheck
npm run lint
npm run build
npm run test:e2e
```

E2E 自动启动/复用 `127.0.0.1:3073` 的生产服务。Windows 存在 Edge 时使用本机 Edge；其他环境使用 Playwright Chromium，先运行 `npx playwright install chromium` 或设置 `PLAYWRIGHT_BROWSER_EXECUTABLE`。

## 尚未实现、技术限制与 Phase 4 优先级

尚未实现真实 LLM、语义 Embedding/相似度、RAG、Supabase、pgvector、认证、远程文件存储、OCR、Vision、原文件重命名/移动/删除和持久化。当前规则不是语义理解；摘要是片段，图谱是共享标签/分类配对，图像只提供尺寸，名称重复不能证明内容重复。

浏览器内 DOCX 解压仍可能在大/复杂文档上占用主线程；文本/PDF 有公开提取上限；刷新丢失会话；Graph 复用 SVG 预览，较密关系不具备大型图谱布局能力。本次测试使用小型代表性文件，未声称覆盖所有 PDF 字体、编码、损坏文档或压力负载。

下一阶段优先确定持久化的文档/Run/审阅决策模型、恢复机制和权限边界，再在已保留的 AgentEngine 接口后接入真实模型与可验证的分类/摘要。关系随人工编辑更新、复杂文档后台解析与性能基准可以随后推进。RAG/Embedding/认证/存储是否进入 Phase 4 由用户明确决定，本次未启动。

## 新增提交

- `520d4c3` — `feat: add local document parsing and mock agent state engine`
- `10d798f` — `feat: build workspace execution review and session results`
- `1944496` — `fix: complete local PDF assets and verify workspace recovery`
- 阶段文档提交：`docs: record phase 3 workspace completion and acceptance`

均通过普通 Push 同步至 `origin/main`，保留既有历史。文档自身提交哈希见最终回复及 `git log --oneline`。
