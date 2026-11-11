# 开发脚本说明

从应用目录 `project/` 运行命令。项目锁文件和常用 npm 入口见 [package.json](../package.json)。

| 目录 | 职责与入口 |
| --- | --- |
| `build/` | PDF Worker 资源、构建元数据和 standalone 准备；`npm run build` |
| `database/` | 数据库迁移和向量能力检查；`npm run db:migrate` |
| `runtime/` | Windows 便携启动、操作租约、原件存储与恢复；`npm run portable:start` |
| `evaluation/` | 检索和回答评测工具；`npm run evaluate:regression` |
| `fixtures/` | 生成自动化测试用合成材料 |
| `verification/` | 静态检查、浏览器、备份和恢复验收 |
| `release/` | 按运行文件清单打包；`node scripts/release/package-phase9-release.mjs` |
| `shared/` | 隔离验收环境和数据库连接 |

Windows 启动入口为 `start-filemind.bat`，停止入口为 `stop-filemind.bat`。两者调用 `scripts/portable-start.mjs`，需要已准备的 Windows x64 便携运行文件。

常规代码检查：`npm run typecheck`、`npm run lint`、`npm run check:imports`、`npm run check:renderers`、`npm test`。公共 Playwright 设置位于 [tests/config/playwright.ts](../tests/config/playwright.ts)。运行 `npm run test:e2e` 前需要生成 standalone 构建，并安装 Playwright Chromium 或设置 `PLAYWRIGHT_BROWSER_EXECUTABLE`。

- `node scripts/verification/verify-search-interaction.mjs`：在隔离浏览器中用合成响应验证搜索、澄清、比较及引用。
- `node scripts/verification/verify-tenant-access.mjs`：使用内存数据库和合成原件验证租户访问与恢复。
- 真模型脚本需要单独配置 API 服务，可能产生费用。应使用专用的合成资料与数据库。

高级验收脚本的默认报告目录是本地的 `docs/evaluation/`。按需创建该目录；复跑历史验收还需要对应的本地冻结输入与记录。应用运行及常规检查不依赖这些记录。可运行包的文件清单不会自动复制本地介绍或验收资料。
