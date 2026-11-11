# FileMind AI 运行与代码说明

FileMind AI 支持导入 PDF、DOCX、TXT、Markdown、PNG 和 JPEG。程序提取内容并生成分类、标签与命名建议，确认后保存工作区。智能搜索可返回正文片段或带引用的回答，资料库保留原文件和提取内容。

## 本地运行

源码依赖 Node.js 22.13 或更高版本。在仓库根目录运行：

```powershell
npm ci
npm run dev
```

在终端显示的网址打开页面。默认使用本地规则；没有配置数据库时，工作区只存在于当前浏览器会话。已有 Windows 便携环境可运行 `start-filemind.bat` 和 `stop-filemind.bat`；这两个入口需要提前准备 Node、PostgreSQL 和 standalone 运行文件。

## 保存工作区与配置模型

1. 为项目准备独立的 PostgreSQL 数据库和普通应用用户。首次配置时复制 [环境模板](.env.example) 为本地的 `.env.local`。
2. 填写 `DATABASE_URL`，并设置长期保留的 `WORKSPACE_SESSION_SECRET`。可用 `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"` 生成密钥。
3. 在仓库根目录执行 `npm run db:migrate`，然后启动应用。保持 `AI_ENGINE=mock` 可先核对上传、审阅、保存和刷新。
4. 启用真实模型时按模板设置 `AI_ENGINE=llm`、Kimi 模型和 `KIMI_API_KEY`。语义搜索还需要配置 Embedding 服务。图片可使用本地 OCR；配置 Vision 后会区分图片文字与模型解读。

部署时将数据库与原文件目录放在可持久写入的存储中。原件默认保存在 `.filemind/storage`，可用 `FILE_STORAGE_ROOT` 修改。备份时同时保存数据库和原文件；身份恢复密钥用于找回同一数据库里的身份。环境文件、凭据和用户数据留在本机。

## 代码结构

| 目录 | 作用 |
| --- | --- |
| [src/app](src/app/) | Next.js 页面、布局和 API 路由 |
| [src/features](src/features/) | 整理、资料库、搜索、图谱和设置等界面 |
| [src/components](src/components/) | 共用 UI 和引用阅读组件 |
| [src/lib/workspace](src/lib/workspace/) | 工作区规则、应用方案、存取与授权 |
| [src/lib/retrieval](src/lib/retrieval/) | 索引、检索、问答及来源验证 |
| [src/lib/server](src/lib/server/) | 仅服务端的身份、配置和服务组装 |
| [database/migrations](database/migrations/) | 按序执行的 PostgreSQL 迁移 |
| [scripts](scripts/README.md) | 构建、运行与检查入口 |
| [tests](tests/) | 自动化测试和合成测试样本 |

原件保存和数据库更新通过操作日志协调；访问资料时先验证身份，必要时恢复未完成的操作。整理方案由用户确认后应用。问答根据当前范围检索资料，通过来源和事实检查后展示回答。

## 开发检查

```powershell
npm run typecheck
npm run lint
npm run check:imports
npm run check:renderers
npm test
```

这些检查使用合成数据，通常不需要模型密钥。`npm run build` 生成生产构建并准备运行资源；浏览器检查及其他环境要求见 [开发脚本说明](scripts/README.md)。独立的评测或验收记录生成在本地，不是运行或默认测试的输入。
