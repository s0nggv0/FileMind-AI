# Phase 5：个人知识检索与引用

> 历史阶段记录。当前版本已加入图片、Adaptive Retrieval、身份恢复、原子索引发布和发布前事实门；不会向用户发送未验证回答草稿，实验 reranker 默认关闭。以 [Phase 8 系统架构](system-overview.md) 和 [答案验证](answer-verification.md) 为准。下文保留 Phase 5 当时的实现和评测上下文。

知识来源只包含当前浏览器身份拥有的已保存资料；没有互联网 RAG、OCR、图片理解或跨用户搜索。

## 数据与索引

`202610020002_knowledge_index.sql` 为文档增加状态、版本和索引代次，并建立 `document_chunks`、`chunk_embeddings`、`retrieval_runs`。三个新表启用 FORCE RLS；每次查询使用事务内的 `filemind.user_id`，应用身份来自服务端签名 Cookie。输入不能声明其他用户身份。数据库与原文件位于 FileMind 专用的 `.filemind` 目录。

Chunk 保留原始提取文本、SHA-256、字符起止位置、页/行/段落范围、标题路径及 `chunk-v1`。目标约 800 tokens，上限 1000，长段约 100 tokens 重叠；这是中英文近似估计，并非模型 tokenizer。PDF 按实际页映射分段，不跨页；DOCX 保留段落并在同一标题下合并；Markdown 按标题、段落和句子拆分，跳过围栏内的假标题；TXT 保留行号。

解析器保存 PDF 页和 DOCX 段落的字符映射。旧 PDF 缺少映射时只能显示字符位置，需要重新导入才能获得页号；不编造页号。DOCX 的段落不是 Word 排版页。

Apply 后通过 Next.js `after()` 启动索引；Library 可查看状态并重试，Search 可更新整个资料库。状态为 not_indexed → chunking → embedding → ready，错误为 failed，资料或模型变化为 stale。数据库代次锁防止过期作业将修改后的文档标成 ready；中断后可重试。队列按文档顺序调度，每份文档的批处理并发可配置，默认 2、最多 8，失败重试最多 2 次。没有后台云队列，关闭程序会中断尚未完成的作业。

缓存键包含内容 hash、provider、model、chunk version，读取另核对 dimensions。相同资料重建索引复用向量。资料或定位元数据变化触发旧 Chunk/向量失效；搜索及索引状态接口检测模型、维度和分段版本变更。内部清理同时删除关联向量、关系及检索历史。

## Embedding 与 VectorStore

实际使用 DashScope / `qwen3.7-text-embedding-flash`，1024 维，独立于 Kimi Key。适配器遵循官方 OpenAI 兼容 Embedding 接口，限制每请求最多 10 条，验证返回数量、index、维度及有限数值。

真实 Flash 批响应曾出现两个 index=0。适配器不根据返回数组顺序猜测对应关系，而是退回逐条请求；这会增加请求数，但能避免将错误向量绑定到资料。Key 不进入客户端、日志、数据库、Git 或验收结果。

本机专用 PostgreSQL 未提供 pgvector 扩展，能力报告见 `../phase-checklists/vector-capability.json`。最终使用 `PortableVectorStore`，以 PostgreSQL `real[]` 持久化，按身份、workspace、provider、model、dimensions、版本筛选，分页扫描完整可访问索引并计算 cosine，仅在内存保留 top-K。无随机向量、无静默截断、无百分比“置信度”。复杂度约 O(N×dimensions)，适合当前小型个人资料库；更大规模应实现 ANN/pgvector 后端。

显式 Mock 使用独立的 256 维 token-hash fixture，界面标记 Demo / Mock；缺少真实 Key 不会静默创建 Mock 向量。真实模式缺少或无法访问 Embedding 时仍可使用已提取 Chunk 的关键词检索。

## 检索与 RAG

英文采用规范化词元；中文采用汉字 bigram，并过滤停用词。SQL 查询持久化词元数组，使用 GIN 重叠检索与词元覆盖评分。它不是 BM25，也不是 `includes()`。Vector / Lexical 各取 top-20，按 Chunk 去重，以 RRF `1/(60+rank)` 融合，避免混合不同量纲的原始分数。

默认启用确定性 Reranker，以融合排名和标题/章节词元重合轻量重排前 15 个候选；最多 7 个证据段落，Context 上限 24000 字符。没有调用 Qwen Rerank，也没有额外的 Kimi 重排费用。可通过 `RAG_RERANK_ENABLED=false` 做关闭对比。

证据准入是 cosine≥0.35 或 lexical coverage≥0.2。阈值只是初筛，并不证明资料能够回答问题；真实评估中一个无答案问题仍有候选证据，最终由 Kimi 的 insufficientEvidence 拒答。没有足够证据时不调用 LLM，直接返回“我没有在你的资料中找到足够依据回答这个问题。”并将最近段落明确标为 Closest passages。

RAG Context 是标为不可信资料的 JSON，包括真实 Chunk 内容、稳定来源编号及位置。System 只允许依据这些资料回答；不提供联网、shell、删除工具，不展示隐藏推理。模型必须返回 answer、citations 数组、confidence、insufficientEvidence。真实 Kimi 曾忽略部分 Schema 字段，因此 Prompt 同时明确规定完整 JSON 结构；任何未通过 Zod 或引用校验的答案都不展示为最终回答。

服务端核对每个引用是否属于 Context、用户、workspace、Chunk 和文档，并重新读取数据库核对 hash、版本及内容。内联来源编号也必须有匹配元数据。该校验保证来源身份与当前内容真实，不能数学保证每条模型陈述都被原文语义蕴含。抽屉点击后再次读取数据库原文，摘要与原文分别标注；没有客户端拼造引用。

Ask 生成回答；Find 只检索。SSE 阶段消息来自实际执行阶段，真实 Kimi 的 partialOutputStream 提供回答草稿；草稿标为生成中，最终引用验证完成后才出现可点击编号。Embedding 故障退回 Lexical，Kimi 故障保留可读段落，不替换成假答案。retrieval_runs 保存查询、改写、候选、证据、模式、模型、重排状态、延迟及最终结果。刷新可恢复；含代词追问结合同身份历史问题重新检索，不复用旧 Context。

## 验收与限制

评估材料全部为自写合成文本：10 份资料、22 个有答案问题及 3 个无答案问题。命中率按文档去重；Hybrid 包含实际确定性重排。真实结果与每题排名见 `../evaluation/rag-live-results.json`，Mock 结果单独标记，不作为真实效果证据。小样本很容易命中，不能外推到大规模或困难资料。

真实 Citation Validity 1.00 是单次有答案生成中引用的身份/内容有效性；不是所有问题的事实正确率。No-answer 评估包括阈值拒答及真实 Kimi insufficientEvidence，报告分别记录初筛和最终拒答指标。

已覆盖真实模型与浏览器引用、四类格式定位、缓存、RLS 越权、内容失效、故障退回、追问、刷新、桌面/移动端。便携复制检查使用明确 Mock fixture，核对持久化 Chunk/向量/搜索/引用及原文件，独立真实模型 E2E 另验收。当前仍无账号登录或跨设备身份恢复，完整文件夹可复制数据，但新浏览器的 Cookie 身份不会自动继承。

Phase 5 完成后停止；Phase 6 可优先做可恢复的本地身份、资料迁移与较大规模检索质量校准。
