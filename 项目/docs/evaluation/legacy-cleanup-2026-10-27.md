# 遗留代码清理与未使用项检查

日期：2026-10-27。起点：`9547b02`，分支 `main`。目标是保持业务行为不变，不增加依赖、不调整检索算法、不更改界面。

## 重新核实的清理依据

| 候选 | 最新代码中的证据 | 本次处理 |
| --- | --- | --- |
| `src/features/search/search-preview.tsx` / `SearchPreview` | 在生产代码、静态/动态导入、脚本和测试中无调用入口。搜索路由实际导入 `KnowledgeSearch`；引用与全文阅读使用 `CitationReading`。旧组件仅提供禁用搜索按钮和静态示例布局，且不属于 App Router 文件约定入口。唯一活动文件路径依赖是安全脚本读取旧源码的断言。 | 删除整个 31 行组件；保留现有问题输入、建议问题、搜索、来源和引用预览实现。 |
| `src/lib/retrieval/ranking.ts` / `RerankSchema` | 只有 `tests/retrieval.test.ts` 导入并自行检查一个无效样本。生产检索、服务和评测脚本实际使用 `rankFusion`、`Reranker`、`DeterministicReranker`；没有读取该 Schema 的模型响应或其他协议。 | 删除 Schema 及仅为它使用的 Zod 导入；删除自测式断言和对应导入，保留 RRF 及全部实际检索/重排回归。 |
| `WorkspaceAgentEngine.continueMock` 的 `id` 参数 | 开启未使用项预检后产生唯一的 `TS6133`。私有方法体从未读取 `id`；两个调用点的闭包仍将真正的运行 ID 传给 `mock.retryStep` / `mock.skipStep`。 | 直接删除私有参数和两个调用点的多余实参。公共 `AgentEngine` 方法签名、闭包、监听及持久化逻辑保持不变。 |

复核使用了对 `src`、`scripts`、`tests` 的符号及模块路径搜索，进一步检查动态导入、目录遍历/构建脚本和评测脚本。修改前阅读本地 Next.js 的页面/路由约定、懒加载及 TypeScript 指南。清理后，以上活动目录中的 `SearchPreview`、`search-preview`、`RerankSchema` 均为零匹配。

`verify-phase8-security.mjs` 中原有的 React 文本渲染安全检查继续保留，读取对象改为当前实际使用的搜索、引用阅读、文档全文与图片来源组件；不再读取已删除的组件。没有新增虚假生产引用或自测式引用来保留死代码。

## 防止未使用项回流

- 在根 `tsconfig.json` 启用 `noUnusedLocals` 和 `noUnusedParameters`。原有包含范围不变，继续覆盖应用、TypeScript 脚本、测试及 Next.js 类型。
- 现有 `npm run typecheck` 与生产构建直接继承这些设置；增加 `npm run check:unused` 作为显式检查入口，复用已有 TypeScript。
- 使用真实 TypeScript Compiler API 读取项目配置，在内存中加入独立负例。未使用参数和未使用局部变量均产生 `TS6133`，两项均被拦截。没有将负例写入生产源码或加入业务测试。
- 没有关闭规则、添加忽略标记、把可删参数改成下划线，或增加无意义表达式来压制诊断。

此检查针对 TypeScript 未使用局部变量和参数，不等同于完整的导出可达性分析。未被调用的导出、动态入口及框架契约仍需结合实际入口复核，不能据此批量删除通用组件或类型。JavaScript 脚本继续由现有 ESLint 检查覆盖。

## 保留的特殊情况

- Next.js 文件约定入口，包括页面、布局、路由、错误页和 instrumentation；没有按“无显式调用”删除。
- `GET(_request, context)`、`fetch` 适配器的 `(_url, init)`、租户查询适配器的前置用户参数等位置约定。这里需要保留前面的参数位置以读取后面的参数，沿用既有命名，没有新增例外。
- `Reranker` 接口及实际 RRF/确定性重排实现、现有有效业务断言和全部测试用例。移除的只有未进入业务路径的 Schema 自测式断言，单测用例数仍为 146。
- 通用 UI 组件、公共类型及现有示例数据没有因暂时找不到调用而批量删除。
- 阶段文件清单、算法冻结哈希和历史评测 JSON/JSONL 中的旧路径继续保留。它们记录当时状态，不是当前运行入口；不重写历史证据或冒充新评测结果。

## 最终验证

| 检查 | 结果 |
| --- | --- |
| `npx tsx --test --test-concurrency=1 tests/*.test.ts` | 146/146 通过 |
| `npm run typecheck` | 通过，继承两项未使用检查 |
| `npm run check:unused` | 通过 |
| TypeScript 实际编译器负例 | 未使用局部变量、参数均被拒绝 |
| `npm run lint` | 通过 |
| `npm run build -- --webpack` | 通过，包括开启新检查后的类型检查及 standalone 打包 |
| `npm run test:e2e` | 17/17 通过，包含持久化重试后立即应用、解析失败后重试/跳过等既有回归 |
| `node scripts/verification/verify-priority-optimizations.mjs` | 22/22 通过，一次性原生 PostgreSQL 与生产服务器 |
| `verify-phase8-security.mjs` 实际隔离 HTTP 验收 | 12/12 通过，包括更新后的当前渲染组件检查 |
| 最终差异检查 | 无业务逻辑、算法阈值、公共引擎契约或无关格式调整；无有效测试用例丢失 |

负例和本次安全验收结果位于忽略目录 `artifacts/legacy-cleanup/`。安全脚本默认写出的历史报告已按原字节恢复，不提交临时验收材料。首次安全验收在打包期间运行，初始化阶段失败且未完成检查；等待生产打包完成后重跑的 12 项检查全部通过，未删断言或把失败结果计作通过。

本机沿用既有的官方 webpack 构建路径，不在本任务修复先前的 Turbopack 环境问题。没有执行真实云模型评测，也没有据此更新历史算法质量结论。原有五份未提交文档已逐一核对 SHA-256，内容与任务开始时一致，未进入本次提交。

实现提交：`2229906`（有依据的删除与安全断言迁移）、`064504c`（检查门槛）。
