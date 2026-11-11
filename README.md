# FileMind AI

FileMind AI 用来整理学习与研究资料。导入 PDF、Word、笔记和图片，审阅整理建议后保存；查找资料或提问时，点击引用可以回到原文和原图核对。

需要 Node.js 22.13 或更高版本。从仓库根目录运行：

```powershell
cd project
npm ci
npm run dev
```

打开终端输出的本机网址。无需模型密钥或数据库即可体验本地规则整理。需要保存工作区、配置 PostgreSQL 或启用真实模型时，查看 [运行与代码说明](project/README.md)。

源码、运行脚本、数据库迁移和自动化测试都在 `project/`。可选的本地资料和检查记录由使用者单独保存，不属于仓库内容。
