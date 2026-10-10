# 中文界面检查记录

检查日期：2026-10-10。范围为页面文案、操作名称、系统提示和对应浏览器断言。本轮修改与检查使用 OpenAI Codex 辅助完成，不能据此认定为个人独立手写实现。

## 统一术语

| 原名称 | 页面显示 |
| --- | --- |
| Workspace | 工作区 |
| Library | 资料库 |
| Knowledge Graph | 知识图谱 |
| Smart Cleanup | 智能清理 |
| Agent | AI 整理助手 |
| Review / Apply | 审阅 / 应用方案 |

已调整导航、首页演示、上传队列、整理动态、方案审阅、搜索与引用、图片来源、资料库、设置和备份恢复的主要文案。资料原文、模型回答、文件名、用户自定义分类和标签保留原内容。系统内置分类只转换显示名称，例如 `Research` 显示为“研究”，保存值仍为 `Research`。

检索算法、Provider schema、数据库结构、分类规则和历史评测回执未修改。README 单独说明 AI 辅助范围；既有 Git 历史保留，新增提交按实际改动形成。

## 验证结果

| 检查 | 结果 |
| --- | --- |
| 生产构建 | 通过 |
| TypeScript | 通过 |
| lint | 通过 |
| 单元测试 | 106 / 106 通过 |
| 浏览器回归 | 17 / 17 通过 |
| 比赛模式界面检查 | 3 / 3 通过 |
| 页面与视口矩阵 | 8 个页面 × 4 个宽度，共 32 项通过，无横向溢出 |
| 最后一次数量提示及工具名称调整 | 重跑混合文件整理、审阅、应用、资料库与图谱流程，通过 |
| 当前改动的密钥检查 | 已配置凭据和常见密钥格式均未命中 |

浏览器回归使用本地模拟助手或注入的接口响应；比赛模式的澄清与冲突检查使用注入的搜索响应。它们验证界面流程，不能替代真实 Provider 验收。本轮未重新调用 Kimi、Vision 或 Embedding 服务，未重新执行 `demo:check`、可迁移副本启动或整套 Release Freeze，因此不据此更新这些项目的完成状态。

截图检查覆盖中文首页、搜索、设置及桌面和手机上的整理审阅状态。检查沿用现有排版，没有新增视觉设计。自动化报告与截图保存在忽略目录 `artifacts/localization-20261010/`、`artifacts/phase3-qa/` 和 `artifacts/phase9-qa/`，不提交到仓库。

## 复查方法

```powershell
npm run build
npm run typecheck
npm run lint
npm test
npm run test:e2e
New-Item -ItemType Directory -Force artifacts/localization-recheck | Out-Null
$env:FILEMIND_BROWSER_MATRIX_REPORT='artifacts/localization-recheck/browser-matrix.json'
npx playwright test --config playwright.phase9.config.ts
```

复查比赛模式界面时应将矩阵输出放到临时目录，保留 `docs/evaluation/` 中已有回执的原始日期和内容。测试命令本身不表示真实云端服务已通过。
