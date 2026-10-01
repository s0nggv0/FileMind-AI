<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Git 提交历史：比赛要求

用户明确要求持续 Commit，保留完整 Git 提交历史。此约定适用于后续所有开发阶段。

- 将可独立审阅、验收的改动作为一个提交单元，例如基础配置、共用组件、页面功能、测试与文档更新；不要等整个 Phase 完成才集中提交。
- 每个提交前检查对应差异，并完成与改动相适应的验证。阶段结束时再完成该阶段要求的整体检查。
- 后续修复、调整与验收反馈单独提交，让历史能反映实现和修正过程。提交信息准确描述实际改动。
- 保留既有提交；未经用户明确要求，不使用 amend、squash、rebase 或其他重写历史的操作。
- 只提交当前任务相关文件；不提交密钥、本地依赖、下载缓存、构建产物或临时验收文件，也不制造空提交。
- 交付时报告新增提交记录和验证结果；阶段边界仍由用户控制，持续 Commit 不表示自动进入下一阶段。
