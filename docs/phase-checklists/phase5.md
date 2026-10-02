# Phase 5：Personal Knowledge Retrieval & Citation RAG

## 已验证

- Gate 0 真实 Kimi：文本、严格结构结果、允许工具调用全部 HTTP 200；`kimi-live-verification.md` 中 REAL_KIMI_VERIFIED=true。
- 独立真实 Embedding：DashScope / qwen3.7-text-embedding-flash / 1024 维；`embedding-live-verification.json` 为 true。批响应重复 index 已加入逐条重试保护。
- 只使用本项目专用 PostgreSQL filemind_ai；pgvector 不可用，最终 PortableVectorStore / real[] / 完整分批 cosine 扫描，见 `vector-capability.json`。
- PDF 页、DOCX 段落、Markdown 章节/行及 TXT 行/字符映射；约 800 tokens、上限 1000、长段重叠约 100，chunk-v1。
- document_chunks、chunk_embeddings、retrieval_runs 的 FORCE RLS；缓存、资料失效、版本检测、错误重试、内部清理；普通应用账号无管理及绕过 RLS 权限。
- 中英文词元检索、top-20 + top-20 RRF、确定性 Reranker、最大 7 段证据、Context 预算与开发态诊断。
- Ask/Find、实际 SSE 阶段及回答流、严格结构与来源核验、原文抽屉、追问重新检索、历史与刷新恢复。
- Embedding 失败保留 Lexical；Kimi 失败保留可读证据；No-answer 明确拒答并区分最近候选。
- 真实浏览器：回答流、引用点击核对数据库原文、刷新及无答案全部通过，见 `rag-live-browser.json`。
- 便携复制：中文空格目录，无全局 Node/根目录 node_modules 依赖；原文件、Chunk、向量逐值一致、历史引用恢复、新检索、双副本端口隔离、清理并停止，见 `rag-portable-copy.json`。便携检查使用明确 Mock fixture，真实服务另有 E2E。

## 真实评估

自写 10 份混合语言资料，25 个问题：22 个有答案问题用于命中率，3 个无答案问题用于拒答率。按文档去重，Hit@5 对每题是否在前五命中计数。Hybrid 包括实际确定性重排。

| 模式 | Hit@1 | Hit@5 | MRR |
| --- | --- | --- | --- |
| Vector Only | 1.00 | 1.00 | 1.00 |
| Lexical Only | 1.00 | 1.00 | 1.00 |
| Hybrid + Rerank | 1.00 | 1.00 | 1.00 |

最终 No-answer Accuracy=1.00（3/3）；仅检索阈值的 No-answer Accuracy=0.667（2/3），剩余一个由真实 Kimi insufficientEvidence 拒答。一次有答案生成的 3 个引用全部通过身份/内容核验，Citation Validity=1.00；该指标不等于事实正确率。

这组小型合成资料较容易，不能证明 Hybrid 在大型真实资料库优于 Vector 或 Lexical。每题排名、配置、计数及安全诊断见 `../evaluation/rag-live-results.json`。

## 检查状态

- npm run build：通过，包含 TypeScript 与 standalone 生产构建。
- npm run typecheck：通过。
- npm run lint：通过，无错误。
- npm test：52/52。
- npm run test:e2e：13/13。规则整理完成约需 6–10 秒；浏览器断言等待调整为 15 秒，测试没有绕过实际流程。
- npm run test:portable：2/2，含四类实际解析与库中的 Chunk/引用、追问、故障提示、身份隔离、桌面/移动端。
- 真实 RAG 浏览器：1/1；没有用 Mock 证明真实验收。
- 浏览器构建秘密检查：2 项已配置模型 Key 均未出现在 33 个静态构建文件中；脚本不输出秘密。
- Impeccable detector：无检出；桌面与 390px 手机界面已视觉检查，无横向溢出。

## 限制与阶段边界

PortableVectorStore 为线性扫描；确定性重排不具备专用语义 Rerank 模型的能力；相似度阈值需要更大规模资料校准。旧 PDF 缺少页映射时显示字符位置，DOCX 不声称排版页号。引用核验保证出处真实，仍需要原文核对模型陈述。没有 OCR、联网 RAG、完整账号与跨设备身份恢复、后台云队列；当前本地索引作业中断后手动重试。可选独立会话/消息表未实现，检索历史由 retrieval_runs 持久化。

Phase 5 到此停止。建议 Phase 6 优先解决身份恢复与资料迁移，再建立更大规模检索质量基准。
