# 检索契约与导入边界

## 公共数据

- `answer-contract.ts`：对外回答 schema、回答及来源类型、公开验证摘要。运行时仅依赖 Zod，来源类型仅依赖 `types.ts`。
- `search-contract.ts`：请求 schema、搜索问题枚举、结果与诊断数据类型，包括查询画像、策略、证据评估和覆盖情况。运行时仅依赖 Zod；回答数据为 type-only 依赖。
- 既有 `citation-contract.ts` 和 `types.ts` 继续承担引用、来源及片段的共享契约，不再拆文件。

schema 字段、限制、默认行为不变。旧实现路径保留兼容导出，浏览器搜索模块直接从契约导入。提供给模型的草稿、上下文、事实核查 schema 仍留在各自核心中；它们不是 HTTP 公共数据。

## 实现关系

整理前 `rag → answer-verifier / answer-context → rag` 的反向边是 type-only；`search-contract ↔ search-outcome` 也由类型引用构成环。这些边不代表运行时循环故障。

整理后：

```text
浏览器搜索模块 → search-outcome → search-contract → Zod
浏览器搜索模块 --type--> answer-contract / search-contract
search-contract --type--> answer-contract --type--> types
rag → answer-verifier / answer-context
rag / answer-verifier / answer-context --type--> answer-contract
answer-verifier --type--> answer-context
server/search → SearchService → rag
```

`search-outcome` 保留文案和回答展示判定；`hasVerifiedAnswer` 未改变，仍要求存在回答、证据足够且状态为 `verified` 或 `conflict`。服务端生成、引用重验、事实检查及修复预算保持原样；旧历史不会获得新的验证状态。

## 边界执行

`src/lib/server/*` 已有 `server-only`，Provider 工厂也保留该标记。可注入的 RAG、上下文、验证器、搜索服务核心不新增标记，普通 Node 测试仍可运行。

`npm run check:imports` 与 ESLint 的 `boundaries/browser-imports` 使用同一规则。从 `use client` 入口及浏览器目录（features、components、hooks、store）遍历本地运行时导入；识别 `@/`、相对路径、重导出、字面量动态导入和 require。遇到服务端入口、指定服务端核心或 Provider、Node 内置模块和已知 Node 包即报完整路径。非字面量加载及未解析的本地代码依赖报错。既有 `mammoth/mammoth.browser` 是明确的浏览器构建，允许导入。

type-only 边单独计数，不参与浏览器运行时可达性判定。契约检查则同时检查两种依赖：只允许 Zod 和上述少量检索契约，防止契约反向依赖 React、数据库、文件系统或具体 Provider。

检查针对项目源码及其本地脚本依赖，不扫描第三方依赖包内部，也不代替 Next.js 的构建期检查。新增 Node 专用第三方包应补充规则。`npm run test:imports` 用合成源码验证违规路径及 ESLint 集成，不加载环境文件或启动业务服务。
