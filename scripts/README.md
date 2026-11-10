# 开发脚本导航

从项目根目录运行命令。日常操作优先使用 `package.json` 中的 npm 命令，脚本分类后的 npm 命令名称保持不变。

| 目录 | 职责 | 主要入口 |
| --- | --- | --- |
| `build/` | PDF 静态资源、构建元数据、便携构建准备 | `npm run build`、`npm run portable:prepare` |
| `database/` | 数据库迁移和向量能力检查 | `npm run db:migrate` |
| `runtime/` | 便携启动、操作租约、存储与启动恢复 | `npm run portable:start` |
| `evaluation/` | RAG 评测、盲测协议、算法冻结和结果汇总 | `npm run evaluate:hard`、`npm run evaluate:holdout` |
| `fixtures/` | 生成合成文档和图像验收材料 | `npx tsx scripts/fixtures/generate-image-fixtures.ts` |
| `verification/` | 模型、浏览器、备份、恢复、性能和发布验收 | `npm run demo:check`、`npm run test:demo-preflight` |
| `release/` | 发布打包、安全审计和发布记录 | `node scripts/release/package-phase9-release.mjs` |
| `shared/` | 脚本共用的独立验收环境和数据库连接 | 供其他脚本导入 |

`scripts/portable-start.mjs` 是保留的启动入口，转发到 `runtime/portable-start.mjs`。桌面批处理、已有启动命令和发布包中的启动脚本继续使用它。

发布脚本使用 `release/runtime-assets.mjs` 的固定清单复制启动依赖，并保留分类目录。清单不包含开发脚本、私有配置、数据库数据或用户原文件。

调用真实模型的脚本会使用配置的 API Key，可能产生费用。保留原有 `--live` 要求和独立验收数据库约束；整理目录不会自动运行这些脚本。冻结记录与历次评测报告保留为历史证据，重新验收应使用当前入口。

公共 Playwright 设置位于 `tests/config/playwright.ts`。根目录的 `playwright*.config.ts` 保留为各验收场景的入口，分别指定测试目录、超时和环境。独立验收场景仍要求 `FILEMIND_TEST_ROOT` 和 `FILEMIND_TEST_ORIGIN`，由对应验证脚本准备。

## 结构调整后的日常检查

```powershell
npm run typecheck
npm run lint
npm run check:imports
npm run check:renderers
npm test
```

`npm test` 包含根目录的 TypeScript 和 `.mjs` 测试；`npm run test:imports` 可单独复核导入规则。`check:renderers` 扫描 search、library 和 knowledge 目录的全部 TSX（含子目录），禁止 `dangerouslySetInnerHTML`，自动覆盖拆出的结果、来源和历史展示；它只是源码检查，不代替浏览器或 HTTP 安全验收。`verify-phase8-security.mjs` 复用同一检查。

- `node scripts/verification/verify-search-interaction.mjs`：创建临时的纯客户端 Next.js 验收壳，模拟 HTTP/SSE，覆盖取消、旧结果保留、历史范围、澄清、比较及引用回跳；不加载项目环境文件、不连接业务数据库或模型，结束后清理自身目录。
- `node scripts/verification/verify-tenant-access.mjs`：临时工作目录、内存 PGlite 与合成原件，验证身份读取、恢复屏障、租约、备份及演示恢复；不访问用户数据库、原件或项目环境文件。

`verify-release-provider.ts` 后续真实验收的源码哈希包含提取后的 `answer-contract.ts`；它仍要求 `--live` 且有累计请求预算，本轮配套调整不运行它。常规 `evaluate-regression.ts` 已按检索目录收集源码，自动包含新增契约。

`freeze-phase8.mjs`、`freeze-phase9.mjs` 和 `record-phase9-checks.mjs` 是历史阶段入口，分别依赖当时的源码、日志与计数。不能修改旧冻结哈希或固定通过数来证明当前版本；新发布应另建绑定当前应用提交的验收记录。


2026-10-21 产品优化的复核入口：

- `npx playwright test --config playwright.product.config.ts`：连接 `FILEMIND_TEST_ORIGIN`（默认本机 3091）的专用模拟服务。完整任务需要已有私有 PostgreSQL、原件存储及 OCR，使用独立浏览器身份，结束后仅清理自身合成资料。不要对用户正在工作的服务直接运行。`FILEMIND_EVIDENCE_DIR` 可指定截图目录。
- `npx tsx scripts/verification/verify-product-questions.ts --live`：原始合成证据上的真实问答样本。持久请求预算最多 14 次，含失败/重试；`--retry-missing` 保留首次记录、只复核无依据项。本轮共使用 12 次，不要为重复演示重置预算。
