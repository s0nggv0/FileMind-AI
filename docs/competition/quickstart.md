# FileMind AI 评审快速复现

版本：1.0.0-rc.2。应用源码提交与构建时间见同目录 `current-release.json`，包内设置页与 `release-manifest.json` 应显示相同提交。

## Windows x64 便携包

前提：Windows x64、可写的 ASCII 路径（如 `C:\FileMind`）、现代浏览器。真实 AI 需要事先取得有效的 Kimi 与 DashScope Key，并能访问对应服务。下载与申请 Key 的时间单独记录，不能假定包含在十分钟内。

1. 解压最终 ZIP 到新目录，不覆盖已有工作区。核对旁边 `.sha256`：`Get-FileHash .\FileMind-AI-*.zip -Algorithm SHA256`。
2. 在解压目录执行 `powershell -ExecutionPolicy Bypass -File .\start.ps1`。首次启动自动创建独立 PostgreSQL、数据库角色和身份密钥；打开终端输出的本机地址。
3. 执行 `powershell -ExecutionPolicy Bypass -File .\stop.ps1`。编辑新生成的 `.env.local`，只填写 `KIMI_API_KEY`、`DASHSCOPE_API_KEY` 及模板要求的模型设置，保留自动生成的数据库和会话值。不要共享这个文件。
4. 再次启动，让本地数据库保持运行，然后执行 `powershell -ExecutionPolicy Bypass -File .\preflight.ps1`，真实 Vision 检查成功后自动生成本机验证记录；12/12 通过后刷新页面。预检脚本使用独立随机端口做绑定检查，不占用应用端口。设置页检查版本、提交和服务状态。比赛模式缺少服务时会明确提示，不能用 Mock 成功代替真实演示。
5. 在“比赛演示工作区”下载原创演示资料并进入专用工作区，上传推荐八份资料。审阅一项建议，再点击“应用方案”。
6. 点击“向这批资料提问”，等待准备完成，问“哪些资料讲过 Query Key Value？简短解释三者作用，引用资料。”点击回答中的引用，核对上下文并打开原文件。
7. 演示前保持服务运行，再运行 `powershell -ExecutionPolicy Bypass -File .\preflight.ps1`。该检查会调用真实模型，产生费用；12/12 才表示当次检查全部通过。

**成功判据**：版本匹配、八份资料保存、返回带引用的真实回答、原文可打开。无密钥启动只证明本地功能正常，不算真实 AI 复现完成。便携包不携带私人验证记录；本机预检会在真实 Vision 调用成功后创建记录，失败时清除过期记录。

## 源码复现

需要 Node.js >=22.13、专用 PostgreSQL 14+ 和当前锁文件。使用 `current-release.json` 的应用提交检出可复现版本；提交材料可能由后续仅文档提交补充。

```powershell
npm ci
Copy-Item .env.example .env.local
# 填写专用 DATABASE_URL、固定 WORKSPACE_SESSION_SECRET 和模型凭据。
npm run db:migrate
npm run build
# 图片功能首次使用前：npm run test:vision（真实收费调用）
npm start
```

默认构建固定为已验证的 Webpack 路径。完整源码安装和构建耗时受网络与机器影响，尚不承诺所有环境十分钟完成。便携包用于减少现场环境准备。

```powershell
npm run typecheck
npm run check:unused
npm run lint
npm test
npm run test:competition
```

这些检查默认不调用收费模型。真实彩排使用 `node scripts/verification/verify-current-live.mjs preflight` 和 `node scripts/verification/verify-current-live.mjs demo`；两者共享 `artifacts/competition-release/live-budget` 的累计 60 次请求上限，失败也计入。不要删除计数记录来绕过上限。

## 故障定位

- 无法启动：确认解压目录可写、端口未占用，查看该目录 `.filemind/logs`，不要删除数据库解决问题。
- 服务未就绪：检查 Key、额度及网络，使用保存的原文演示本地功能并明确说明当前无法生成回答。
- 资料已保存但搜不到：在当前范围点击唯一的“准备搜索”，失败时保留已有资料并查看具体原因。
- 换浏览器后资料消失：使用原身份的恢复密钥；恢复密钥与资料备份是不同操作。
- 搬运：先停止服务，再复制完整目录；原件与数据库需要一起保留。

当天真实演示、实际 ZIP 解压启动及计时记录见 `release-freeze.md`。录屏素材和界面示例分别标明真实服务、模拟传输或预设交互，不能混作同一准确率成绩。
