# 发布验收记录 · v1.0.0-rc.1

验收时间：2026/10/4 18:55:48（Asia/Shanghai）。9 项发布检查全部通过，生产构建对应源码 `f43575dc783a0bf90447cc645f82f04c120acc9d`。随后的提交更新了验收工具和记录，应用源码与该构建一致。Release Freeze 表示本次验收后固定应用版本，发布前只处理已确认的缺陷，后续变更另行验证。

| 检查 | 结果 |
| --- | --- |
| build | 生产构建与 standalone 资源准备通过 |
| TypeScript / lint | 通过 |
| unit tests | 106 通过，0 失败 |
| browser tests | 17 基础 + 3 比赛模式 + 1 真实主 Demo；32 组路由/视口检查 |
| demo:check | 真实 Kimi / Embedding / Vision 与本地服务，12/12 READY |
| secret scan | 所有历史与当前文件、33 个浏览器产物；4 个配置密钥值；0 命中 |
| clean-environment startup | 新数据库、新便携目录、无用户数据复制，创建与重启持久化通过 |
| Git status | 实现提交已同步 main；最终证据单独提交。保留原有 5 份未提交文档 |

## 真实 Provider 与完整主 Demo

当前 kimi-k2.6 的 Ambiguity 返回 3 个可选项目；Conflict 保留双方引用与显式版本替换关系，通过数值、引用新鲜度和原子事实校验。扁平 context schema 的真实 HTTP 请求成功并被产品管线解析。定向抽验不包含检索，真实主 Demo 单独覆盖检索。

`上传 8 份资料 → Agent → Review → Apply → Search → RAG → Citation → 图片 Citation → Graph → Cleanup`

全链路耗时约 84 秒。`llm_success=1`、`fallback_count=0`、`tool_validation_failure=0`、`timeout=0`；8 份资料索引全部 ready。PDF 引用能打开原件，图片引用加载真实原图并显示引用内容。Graph 展示 8 个工作区文档；Cleanup 展示 1 个实际重复候选，原文件保留。取消重置与确认重置均验证，普通身份保留。

首次链路包含确定性 Planner 回退，保留在 release-main-demo-attempt1.json；当前通过记录来自修复后的无回退运行。Conflict 的初次校验失败与额度触顶记录也保留。旧 Phase 9 六次预算不重置，本轮定向样本累计 16/24 次（包括失败）；清理临时目录仍从持久 receipt 恢复次数。

## 验收证据

- [冻结机读记录](../evaluation/release-freeze.json)
- [真实 Provider 样本](../evaluation/release-provider.json)
- [完整主 Demo](../evaluation/release-main-demo.json)
- [12/12 preflight](../evaluation/release-demo-preflight.json)
- [页面/视口矩阵](../evaluation/release-browser-matrix.json)
- [全新便携环境](../evaluation/release-clean-environment.json)
- [完整历史扫描](../evaluation/release-secret-scan.json)
- [最终增量及工作区扫描](../evaluation/release-final-secret-scan.json)
- [浏览器产物密钥扫描](../evaluation/release-client-secret-boundary.json)

## 本轮提交

- `6ee4525` fix(rag): require complete provenance for live version comparisons
- `9aaffce` fix(cleanup): display duplicate candidates from applied workspaces
- `fc38568` fix(agent): constrain organization output to owned IDs and allowed categories
- `f43575d` test(release): require real planner and verify every demo stage
- `2608319` test(security): scan client assets for session and database secrets
- `65511c9` fix(test): retain live acceptance budget after artifact cleanup

最终验收记录在以上提交后单独 Commit / Push。2026-10-04 验收时，原有 README 与 4 份架构/配置文档的本地改动保留，未纳入当轮提交。

## 范围与复现

12 个检索实现文件和原始评测数据保持冻结。本次验收覆盖当前源码；额外备用问题、补充 deadline 场景线上 UI、新的 20 问整体评测和旧 ZIP 重新打包不在此次范围内。分发 ZIP 前需核对其构建记录，并重新打包当前版本。

基础检查使用 npm run build / typecheck / lint，npm test 和 npm run test:e2e。比赛模式浏览器配置为 playwright.phase9.config.ts。真实链路使用 node scripts/verify-demo.mjs --live，12 项 preflight 使用 node scripts/verify-demo-preflight.mjs；分别设置 FILEMIND_DEMO_REPORT 和 FILEMIND_PREFLIGHT_REPORT 为本轮 release 记录路径，以保留旧记录。

全新启动使用 node scripts/verify-release-clean.mjs。密钥扫描使用 node scripts/verify-secret-boundary.mjs 与 node scripts/phase9-security-audit.mjs；后者可用 FILEMIND_SECURITY_REPORT / FILEMIND_LICENSE_REPORT 指定独立记录。最终核对 git status --short --branch 与 HEAD...origin/main。

真实脚本和 preflight 会使用当前配置发送服务请求，只提交合成资料。调用预算到顶后脚本停止，不清除历史记录。
