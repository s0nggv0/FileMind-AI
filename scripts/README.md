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
| `release/` | 比赛报告、发布打包、安全审计和发布记录 | `node scripts/release/package-phase9-release.mjs` |
| `shared/` | 脚本共用的独立验收环境和数据库连接 | 供其他脚本导入 |

`scripts/portable-start.mjs` 是保留的启动入口，转发到 `runtime/portable-start.mjs`。桌面批处理、已有启动命令和发布包中的启动脚本继续使用它。

发布脚本使用 `release/runtime-assets.mjs` 的固定清单复制启动依赖，并保留分类目录。清单不包含开发脚本、私有配置、数据库数据或用户原文件。

调用真实模型的脚本会使用配置的 API Key，可能产生费用。保留原有 `--live` 要求和独立验收数据库约束；整理目录不会自动运行这些脚本。冻结记录与历次评测报告保留为历史证据，重新验收应使用当前入口。

公共 Playwright 设置位于 `tests/config/playwright.ts`。根目录的 `playwright*.config.ts` 保留为各验收场景的入口，分别指定测试目录、超时和环境。独立验收场景仍要求 `FILEMIND_TEST_ROOT` 和 `FILEMIND_TEST_ORIGIN`，由对应验证脚本准备。


2026-10-21 产品优化的复核入口：

- `npx playwright test --config playwright.product.config.ts`：连接 `FILEMIND_TEST_ORIGIN`（默认本机 3091）的专用模拟服务。完整任务需要已有私有 PostgreSQL、原件存储及 OCR，使用独立浏览器身份，结束后仅清理自身合成资料。不要对用户正在工作的服务直接运行。`FILEMIND_EVIDENCE_DIR` 可指定截图目录。
- `npx tsx scripts/verification/verify-product-questions.ts --live`：原始合成证据上的真实问答样本。持久请求预算最多 14 次，含失败/重试；`--retry-missing` 保留首次记录、只复核无依据项。本轮共使用 12 次，不要为重复演示重置预算。
- 结果与边界见 [产品优化验收](../docs/competition/product-optimization.md)。
