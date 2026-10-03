# Phase 8 — Reliability Hardening, Blind Evaluation & Competition Readiness

状态：用户已确认本设计，Phase 8 开始实施，尚未完成。依据用户于 2026-10-03 提供的完整要求，阶段范围限于可靠性、独立盲评和比赛准备。完成后停止，不进入 Phase 9。

范围更新（2026-10-03）：用户随后明确“中文路径不用弄，以后的文件夹不会是中文路径”。因此停止中文安装路径修复和矩阵，撤下未提交的运行时 manifest 配置代码；保留下方既有复现作为历史证据，中文安装目录列为已知限制。后续安装、Portable Copy 与比赛验收使用 ASCII 路径；这一项是用户取消，不记为测试通过。其余设计与正式 Blind Set 隔离要求继续适用。

## 已确认的基线与问题

- 开始时 `main` 与本地记录的 `origin/main` 为 0 ahead / 0 behind，HEAD 为 `47b4653`。后续推送后重新核对远端状态。
- 原有五个文件修改保留且不暂存：`README.md`、`docs/architecture/ai-provider.md`、`docs/architecture/persistence.md`、`docs/phase-checklists/phase4.md`、`docs/setup/postgresql-kimi.md`。共 81 additions / 29 deletions；字节哈希见复现报告。
- 现有 `npm test` 为 69/69 通过；TypeScript 无报错；ESLint 无错误和警告。这些是实施前基线，不是 Phase 8 验收。测试首次被沙箱 `spawn EPERM` 阻止，在授权的执行重试后通过。
- `IndexingPipeline` 在生成新 embeddings 前更改 `documents.index_status`，`prepareChunks` 直接删除或写入在线 chunks；向量查询只读取 `ready`，关键词查询允许 `embedding`。这既不能保证重建时旧索引可用，也可能暴露未完成的新 chunks。
- `generateGroundedAnswer` 已校验来源 ID、所有权、位置关联和源内容版本，但没有逐个事实的蕴含检查。Search SSE 的 `draft` 在引用验证前显示，不能满足“Unsupported Claim 不直接展示”。
- `BackupService` 已有数据库单事务和异常清理；进程被强杀时 `catch/finally` 无法执行，文件暂存与发布没有持久操作日志。
- 原文件写入使用临时文件与原子 hard-link 发布，拒绝覆盖，但没有显式 fsync；Phase 8 需落实并验证用户要求的写入、sync、close、rename 流程与并发无覆盖约束。
- Agent organization-plan 内层 `catch` 丢弃异常，外层只保留公开通用错误。现有 Phase 7 报告不足以追溯那次 fallback 的具体原因；不得事后编造。
- Product Error Boundary 文案仍声称“演示不涉及真实文件”，且只有 Retry。安装的 Next.js 16.3.8 文档示例已使用 `retry`，现有组件仍使用 `reset`；实施前按实际文件规范核对接口。

## 实施策略与取舍

推荐在现有服务边界加固：写前日志、文件暂存、事务发布，以及事实验证后的回答发布。索引采用“私有构建、事务替换在线索引”的轻量方案，保留现有 VectorStore 和在线表契约。

替代方案之一是让所有 chunks、embeddings 和备份关系都直接携带 generation，并改为 active-generation 指针；它能长期保留多个索引，但会扩大主键、引用、缓存和备份格式改动。本阶段不默认采用。另一方案是整套事件溯源与自动重放，实施与恢复风险更高，超出当前范围。

## 1. 中文路径：先诊断，再修复

复现使用 Node `spawn(executable, argumentArray)`、`windowsHide:true`、Windows x64 自带 PostgreSQL 17.11。全部目标为项目内被忽略的隔离临时目录，没有访问或启动现有数据库，未依赖固定 C 盘。

| executable/runtime | data directory | share directory | 观察结果 |
| --- | --- | --- | --- |
| ASCII | ASCII | 默认 ASCII | initdb 成功 |
| ASCII | 含空格 | 默认 ASCII | initdb 成功 |
| ASCII | 中文 | 默认 ASCII | initdb 成功 |
| ASCII | 中文 + 空格 | 默认 ASCII | initdb 成功 |
| ASCII | 长路径，测试长度内 | 默认 ASCII | initdb 成功 |
| 中文 + 空格 | ASCII | 默认中文 + 空格 | post-bootstrap UTF8 错误 |
| 中文 + 空格 | 中文 + 空格 | 默认中文 + 空格 | post-bootstrap UTF8 错误 |
| 中文 + 空格 | ASCII | `-L` 指定原有 ASCII share | initdb 成功 |
| ASCII | ASCII | `-L` 指定中文 share | post-bootstrap UTF8 错误 |

因果对照将触发因素定位到 share 路径在 post-bootstrap 初始化中的使用；尚未证明具体源代码转换点。仅更改 data directory 不是解决当前问题。`-L` 指向另一个安装位置只用于对照，不作为可移植修复交付。

下一步核对 PostgreSQL 官方 Windows 路径、编码与初始化实现，比较受支持的 Unicode 配置。先尝试保留项目内全部数据和资源的正确路径处理；不依赖 8.3 短文件名、固定盘符、系统代码页变更或未经验证的别名。只有确定 bundled PostgreSQL 的限制无法可靠解决，才设计最小内部 runtime 目录，并明示对整文件夹复制能力的影响。

修复验收需包括五种路径下的新安装、启动、SQL 写入、退出；之后中文路径 A 创建资料、正常退出、复制到中文路径 B，验证 Search、真实 RAG 和 Citation。当前结果仅证明初始化，不证明这些最终场景通过。

## 2. 写前 Operation Journal 与恢复

新增租户受保护的 `filemind.operation_journal`，使用现有 FORCE RLS 与复合所有权约束。字段包括 `id/user_id/operation_type/resource_id/status/stage/payload/started_at/updated_at/completed_at/error_code`，补充执行所有者与租约信息，防止多请求或多个服务器实例误判。

- 状态：pending → running → committed，失败为 rolled_back；失去执行所有者的未终结操作为 interrupted。恢复操作须幂等；重复启动不能重复发布或错误清除已提交数据。
- Journal payload 为严格类型白名单，只含操作/资源 UUID、受控相对路径、文件哈希、预期 revision、构建参数与提交标记；不存原文、Key、向量或任意执行指令。错误使用稳定公开错误码，不持久化任意异常正文。
- 在首个文件或数据库副作用前持久化 pending/running；发布路径需先写入意图，再实际发布。数据库效果与 committed 标记在同一事务内生效，消除“DB 已提交、日志仍 running”窗口。
- 长事务之外的日志进度更新通过独立连接提交；业务事务失败不会抹掉操作存在的证据。执行中使用操作级数据库锁及租约。恢复取得同一操作锁后才处理，不能只因时间过期或 PID 检查失败就接管活跃操作。
- 便携启动器在 migrations 后、Web 接收请求前执行全局恢复：只由启动器已经持有的本地 admin 连接枚举未完成操作的 owner UUID，具体修复通过 application role 与逐 owner 的租户事务执行；admin credential 不传给 Web、API 或日志。Next instrumentation `register()` 在 Node runtime 检查恢复完成与数据库就绪；普通 dev/server 启动没有 admin 权限时，在已认证用户首次操作前执行该用户的恢复。Maintenance 也只处理当前租户。不能为了全局扫描而开放公开跨租户 API 或授予 Web role BYPASSRLS。

| 操作 | 提交边界与默认恢复 |
| --- | --- |
| Document Upload | 日志记录后写私有暂存，校验并发布；Document 保存与日志提交同事务。中断且无 Document 引用的字节隔离；有已提交引用的文件保留。客户端可重试，哈希与资源 ID 决定幂等性。 |
| Workspace Apply | 现有 revision 校验、proposal 状态与日志提交同事务；只恢复记录状态或重新展示 Review，不在启动时替用户自动 Apply。 |
| Backup Import | 预验证后按操作 ID 建 staging，记录新目标；所有导入关系与 committed 在原有单事务内。强杀后数据库自动回滚，恢复隔离该操作的暂存及未被引用的发布文件；重新导入作为新的日志操作。 |
| Reindex | 记录待构建信息，旧在线索引不修改；新索引完整后在一个事务里替换并提交日志。中断则丢弃/隔离未发布构建并保留旧索引，显式重试。 |
| Internal File Delete | 没有新增删除 UI。数据库引用变化与提交标记原子化；原字节先进入 quarantine，日志提供 repair/rollback。仅恢复未完成操作，不能未经授权还原用户已完成的删除。 |

本阶段提供的是可验证的进程崩溃恢复；fsync 与事务降低断电风险，但不能把进程强杀测试称为真实硬断电验证。

## 3. 文件写入与 Storage Reconciliation

共享原子写入帮助器使用同目录、唯一临时文件、`open('wx')`、写入、`FileHandle.sync()`、close、rename。发布在资源级锁和受控目标检查下进行；原文件不可覆盖，重试只能接受同哈希内容。实测 Windows 已有目标、文件占用、权限失败、并发发布、中文目录和 rename 中断；目录 sync 的平台限制需记录。

对比数据库 storage references、活动日志和 storage 实际文件，分类 Referenced / Orphan / Missing。全程校验根目录、UUID 层级、symlink/junction 与实际路径，避免跟随逃逸路径。

- 当前活跃操作的暂存和发布意图不视为孤立文件。新上传和巡检使用一致锁，隔离前重新确认数据库引用与活动操作，避免扫描竞态。
- Orphan 不自动删除；移动到 `.filemind/quarantine/<operation-id>/`，记录原相对路径、SHA-256、原因和时间。隔离写入本身具有 journal 意图；中断后可再次恢复。
- Missing 将 `documents.storage_status` 设为 missing，并在 Library 与 Source Preview 显示 `Original file unavailable`。不存在 storage_path 的元数据资料不能一概标成 missing。原文件重新可用且通过哈希验证后恢复状态。
- Download/Preview 返回明确可恢复错误；数据库 extracted text、chunks 与索引继续可检索。Index build status 与 active index status 分开显示，重建失败不误称已有索引消失。
- Settings 增加简短 Maintenance 状态与安全修复动作，不做复杂后台，也不向普通用户展示其他租户文件信息。

## 4. 保持旧索引可用的私有构建

先从 Document 内容、结构、模型和 chunk version 生成稳定指纹。chunks 与 embeddings 在私有构建区域完成，构建中的内容不进入 Vector、Lexical、Filename 或 Citation 的在线查询。Embedding cache 可以读取旧索引的同配置同哈希向量，但不能原地覆盖。

全部向量生成、维度与数量校验完成后，在数据库事务中锁定 Document，复核指纹/模型/revision 未变化，删除旧在线 chunks 后写入完整新 chunks/vectors，设置 ready 并提交 Journal。其他数据库事务看到的是完整旧版或完整新版，不看到 delete 与 insert 中间状态。提交前还需验证所有 staging 文件或数据齐全。

旧索引更新与文档内容修改要区分：显式重建且文档未改变时旧索引继续有效；原文确实改变时，现有安全失效规则仍使旧索引 stale，不能把过时原文伪装成新证据。被替换的历史引用继续执行现有 source hash/version 校验，失效时提示重新搜索。

强杀测试分别在构建 30% 和事务切换前执行；重启后旧查询仍有相同可用来源，新构建标 interrupted，重试成功后才切换。记录数据库查询和 API/Browser 结果，不能仅检查状态字段。

## 5. AnswerVerifier：事实支持、冲突与最终发布

保留现有 Citation Validation，然后执行 Atomic Claim Extraction 和 Evidence Support Check。验证器不会重新回答问题，不具备工具；使用严格 schema 返回 `claim/status/supportingSourceIds`。内部支持状态为 Supported / Partially Supported / Unsupported / Conflicting，额外保存模型、prompt version 与校验版本，不保存隐藏思考过程。

推荐两层验证：确定性校验负责引用所有权、source IDs、原文版本，以及可直接核对的数值/日期/标识符约束；现有 Kimi 负责拆分复合陈述及语义支持判断。确定性数值检查须考虑格式、单位和等价表达，不能把字符串相等称为语义证明。未通过 schema、source bounds 或覆盖检查的判断不能用于放行。

- 资料型重要陈述须有支持；UI 文案与拒答提示排除。拆分上限与超长回答均采取显式失败状态，禁止只验证前半篇。
- 证据检查同时覆盖全部提供的 context，而非只检查生成答案已经选择的引用，避免遗漏相反来源。
- 可检索证据的文档时间/显式版本可作为排序说明；不从文件名或日期自行推断内容真伪。明确 superseded 的资料说明新旧版本；未能判定优先关系时展示冲突及双方 Citation，不替用户选择。
- Conflicting 是需要特殊呈现的状态。最终回答须明确冲突并引用双方；只陈述其中一方时拒绝放行并进入一次修正。
- Citation 修正与 Unsupported 修正共用最多一次再生成预算，避免叠加无限重试。修正后从引用验证开始重走流水线；仍存在 Unsupported / 未充分支持的重要 claim 则使用可靠的证据不足回复。Provider/Judge 不可用时保留 Retrieval Sources，明确回答暂不可验证，不冒充正确拒答。
- 移除未验证 draft 的用户可见内容。SSE 仍推送检索和验证进度，只有经过全部验证的 final answer 才发送/持久化；取消请求不产生晚到答案。
- 普通 UI 只展示回答、冲突/不足提示和来源；Completeness 百分比仅用于 Evaluation。

该语义支持判断属于 automated evaluation/runtime verification，不是绝对事实或独立人工审计。相同 Provider 的生成与验证可能存在相关错误，报告必须保留这一限制。

## 6. 真正独立的 Blind Evaluation 流程

在最终所有检索、拒答、路由、Follow-up、冲突、Verifier 代码和开发回归通过后冻结实现。记录 Git commit、完整相关源码 SHA-256、模型/配置、评测 harness 和 judge prompt 哈希。此前不创建、不读取 Blind corpus 或金标准；开发回归只用既有开发样例与新的独立小型开发样例。

然后从头编写自建合成数据于 `tests/fixtures/rag-blind/`：目标 90 documents / 180 queries。建议文件比例为 63 普通文本、18 图片、9 mixed/tricky；实际格式覆盖 PDF/DOCX/MD/TXT/PNG/JPG，包含中文、英文、中英混合、冲突与版本更新，facts、表达与结构均重新设计，不复制 Phase 6/7。

180 个场景中至少 36 为 No-answer（20%），规划 128 普通可回答、8 conflicting、8 ambiguous/clarification 场景。主题标签可重叠，覆盖 semantic/exact/identifier/filename/code/paraphrase/cross-language/hard-negative/multi-document/image-only/OCR-dependent/Vision-dependent/follow-up。Follow-up 带显式历史顺序，不从 gold labels 生成生产查询。

每条保存相关文档、关键事实、允许的改写、预期行为和冲突配对；图片专有事实不得被文本文件重复泄露。资料中的指令攻击属于文档内容，不能授权工具执行。冻住文件清单与原始字节哈希；二进制与换行规则使 checkout 不改变字节。

本阶段的独立性由先冻结生产实现、再从头创作数据和拒绝结果驱动调参实现；数据仍是自建合成集，不声称第三方作者、外部审计或真实用户分布。

- 正式 Run #1 每条结果追加保留，不能覆盖。进程基础设施中断保留 attempt 记录；只有相同源码/数据/配置继续未完成的查询才算续跑，已完成查询不得重采样择优。
- Run #1 失败也交付完整结果。如之后必须修 Bug，首先保存原始结果和 Bug 解释，再单独 Commit；Run #2 为新的有理由的评测文件，不能重命名或覆盖 Run #1。读取失败案例后的新结果不再声称完全未见测试集。
- 实际 OCR、Kimi Vision、DashScope Embedding 和 Kimi RAG/Verifier，缓存须有来源与模型哈希；使用缓存的阶段耗时单独注明，不能伪装为实时 Provider 延迟。
- Vector/Adaptive 对比、judge 与完整结果写入 `docs/evaluation/`；Harness 默认拒绝覆盖已完成的正式运行。

## 7. 指标定义与统计口径

Ranking 使用同一可检索金标准的不同 document IDs，报告 Hit@1、Hit@5、MRR、Recall@10、nDCG@10 与 Multimodal Hit@5。No-answer 与 Ambiguous 无相关 document 的场景不进入排名分母；冲突场景需要召回双方，另报告 pair recall。

| 指标 | 口径 |
| --- | --- |
| No-answer Accuracy | 正确拒答 / 全部 gold no-answer；Provider 不可用不是正确拒答。 |
| False Refusal Rate | 有依据却明确拒答 / 全部可回答场景；Unavailable 单独报告，不隐去失败。 |
| Answerable Recall | 给出符合金标准的回答或正确冲突回答 / 全部可回答场景；不只是“非拒答”的比例。 |
| Citation Validity | 通过 ownership/context/content-version 检查的实际返回引用 / 实际返回引用；同时报告无引用与被拒绝答案的数量。 |
| Citation Completeness | 重要 atomic claims 中有有效引用且充分支持的数量 / 重要 atomic claims 总数；无资料型 claims 为 N/A，不能记为 100%。 |
| Answer Faithfulness | 与 citation evidence 一致的重要 claim 数 / 被评估的重要 claim 数；自动规则 + 有版本 Kimi Judge，gold correctness 另列。 |
| Conflict Detection | gold conflict 中识别冲突、未武断选边且引用双方的数量 / gold conflicts；普通问题误报冲突另列。 |

保存语义 task 矩阵：gold ordinary-answer/conflict/ambiguous/no-answer × 实际正确回答/正确拒答/错误回答/错误拒答/正确冲突/澄清，并附 Unavailable 等工程失败栏。不强行把服务错误归成质量成功。

P50/P95 分别记录 Vector Retrieval、Adaptive Retrieval、完整 RAG（包括验证/修正）、Image Analysis、Workspace Agent。说明样本数、冷启动/缓存、并发、硬件和真实 Provider；每组目标至少 20 次完成样本，不足时仍记录原始值并明确小样本限制，不能声称具有稳定统计意义。

PortableVectorStore 在 100/500/1000/2000，可行时 5000 个真实持久化合成 chunks 和 1024 维向量下测量检索时间、RSS、heap 和数据库扫描页数。确定性构造向量的规模测试明确不评估语义质量。清楚保留线性扫描边界，不迁移 pgvector。

## 8. Provider Failure Matrix 与 Planner Metrics

新增稳定 `planner_runs/llm_success/fallback_count/fallback_reason/tool_validation_failure/timeout` 记录。分别记录工具规划、文档分析和组织方案阶段；错误归类为 timeout、provider/network/auth/rate-limit、schema、工具输入/引用/类别校验、step limit 与用户取消。只保存计数与安全公开字段。

现有 Phase 7 fallback 无完整异常记录时，结论必须是“历史具体原因无法证实”。新代码加观测后用自建 demo 实际重现，明确新的 live run 与历史那次不同。保留 deterministic fallback 及 UI 的真实说明。

| 故障 | 验收行为和故障真实性 |
| --- | --- |
| Kimi unavailable / timeout / invalid response | 对真实 adapter 使用隔离断连地址、受控超时或错误响应端点，标记为 transport/response fault injection；Sources 保留，答案明确不可用。另做正常 live smoke。 |
| DashScope unavailable / timeout | 同类受控 transport injection，Vector 错误触发真实生产 Lexical fallback。 |
| Vision unavailable | production pipeline 中 Vision 失败，真实本地 OCR 仍可索引。 |
| OCR worker failure | worker 初始化/执行故障注入，Vision 仍可索引；两者失败原图保留、内容不可检索。 |
| PostgreSQL unavailable | 对隔离测试实例实际停止/无监听地址测试，503/明确不可用，禁止假保存。 |
| Storage read-only | Windows ACL 或隔离目录真实权限限制；不能依赖 Windows `chmod` 假装只读。若环境无法设置权限，用明确标注的 EACCES injection。 |
| Disk full | dependency injection 抛 ENOSPC，明确 Simulated failure，不填满真实用户磁盘。 |
| Corrupt document | 真实损坏 PDF/DOCX/PNG/MIME 字节触发 parser，失败可重试，其他资料保留。 |

真实 Provider 服务被人为停机不可控，不能把 mock HTTP 503 称为真实 Kimi 机房故障。报告分别标注 live smoke、真实本地故障、transport injection、dependency injection。

## 9. Demo、日志与 UI 稳定性

- `DEMO_MODE=true` 仅固定推荐流程、隐藏 Debug、关闭危险实验入口和启用专用 Demo Reset；不替换 AI、不伪造来源或掩盖 fallback。
- 自建 10 个 Demo fixtures，与 Blind Set 完全隔离，包含全部要求的文本和图片类型。8 个以内为 3–4 分钟主演示上传集，其他用于冲突和故障演示；纯合成、无私人文件或第三方论文全文。
- Demo identity/workspace 由服务端明确标记，Reset 必须运行于 Demo Mode 且由当前 Demo identity 发起，使用确认流程与日志事务；普通 profile 即使知道 UUID 也不能重置。真实用户和 Blind workspaces 排除在重置范围外。
- `npm run demo:check` 检查 PostgreSQL、storage 原子写入、Key 配置状态、实际 Kimi/Embedding/Vision smoke、OCR worker、fixtures 哈希、剩余磁盘、端口与构建 Git version。只能输出 OK/FAIL、公开错误码和状态，不打印 secrets。整体未通过必须非零退出。
- 现场断网备选演示展示真实已保存资料、离线 OCR、Lexical Search、已有 Graph、Workspace 与 Backup/Recovery；AI 不可用明确说明。
- Structured Log 为 timestamp/level/event/request_id/workspace_id/operation_id/provider/error_code/duration 的严格白名单，并记录 build version。禁用任意对象、请求 body、查询全文、filename、正文、向量、Cookie 和 secrets；本地有容量与保留期上限。
- 检查 global/product/workspace/search/library/settings Error Boundary，按 Next 16.3.8 安装文档使用真实 retry API，并提供 Retry / Back / Dashboard。事件回调和 async transport 错误仍需明确 catch，不依赖 render boundary。
- UI 状态覆盖 Loading/Error/Empty/Provider failure/Interrupted/Missing/Stale/Vision failed/OCR failed/Backup failed/Recovery failed，禁止 blank screen 或 stack trace。Desktop 与 Mobile 做浏览器验收，维持现有视觉系统。
- Diagnostics 本阶段只设计白名单导出格式，不新增导出界面。

## 10. 安全、稳定性与比赛证据

新增回归覆盖文本/图片 Prompt Injection、Path Traversal、Zip Slip、IDOR、Cross-user Search、Recovery brute force、恶意文件名、HTML/Markdown Injection、超限上传和 Invalid MIME。故障与强杀脚本只操作隔离数据库/测试进程与受限临时目录，必须验证实际目标，不能任意杀用户进程。

Backup Import 在约 30% 发布前后设观测屏障，由独立测试进程强制终止执行服务，再启动真实恢复；至少覆盖 DB commit 前和 commit 后未清 staging 两个窗口。断言原始用户不变、导入零部分可见、无 dangling 关系、日志 interrupted/committed 归类正确、未引用字节隔离且重复修复幂等。

最后依序运行 `build`、TypeScript、lint、全部 unit/integration、offline Browser、portable Browser、真实 Provider Browser、fresh path matrix、Portable Copy、Blind Evaluation 与 Demo Preflight；每项保留具体命令、时间、样本数和结果，区分失败与未执行。新改动或失败才重复相应检查。

整理：`docs/architecture/system-overview.md`、`docs/evaluation/final-evaluation-summary.md`、`docs/competition/scoring-map.md`、Demo script/fallback plan 和 Phase 8 checklist。保留 Phase 5/6/7 全部评测，不只放最好结果。ADR 先检查已有 `ADR-001-adaptive-retrieval.md`，新增其余真实决策，避免重复。

因根 README 属于用户明确禁止自动提交的五个文件之一，比赛版完整 README 放在新的 `docs/competition/README.md`，包含项目/核心问题/架构/AI/Agent/RAG/多模态/安全/检索/评测/便携/启动/Demo/隐私/限制。未另获授权前，不修改或提交原五个文档。

限制必须写明：PortableVectorStore 线性扫描、扫描 PDF 无自动 OCR fallback、手写与公式 OCR 不稳定、Backup 未加密、Blind 为自建合成集、LLM verifier 非绝对证明，以及最终未能解决的 Windows/Provider 问题。不新增云数据库、OAuth、协作、支付、MCP、桌面/手机/扩展、PDF OCR fallback、新 Provider 或 UI 重写。

## 11. 交付顺序与 Git

每个独立单元先检查差异和相关验证，再普通 Commit 与 Push；修复单独提交，不 amend/squash/rebase，不纳入原有五个修改。建议顺序：

1. 本设计与中文路径复现证据。
2. 中文路径生产修复及完整路径矩阵。
3. 原子文件写入、Journal 与启动恢复基础。
4. Upload/Apply/Import/Delete 日志集成与 Reconciliation。
5. Reindex 私有构建、事务发布与强杀验证。
6. AnswerVerifier、冲突/版本说明、验证后显示与回归。
7. Planner 观测、故障矩阵、日志与 UI 边界。
8. Demo fixtures、Reset、Preflight 与独立开发稳定性验证。
9. 冻结生产与评测 harness；此后才创作并冻结 Blind Set。
10. 完整正式 Run #1、性能/安全/Portable 验收；必要修复另存 Run #2。
11. 比赛文档、架构/ADR/证据汇总、最终全部检查与分支同步。

最终按用户要求的 30 项报告真实数量、指标、实现、故障/崩溃结果、中文路径、fallback 原因、Preflight、延迟/规模、安全/构建/测试、fixtures、限制与 Git 同步状态；未达标不得称 Phase 8 完成。Phase 9 只给是否适合交付的建议，不启动工作。
