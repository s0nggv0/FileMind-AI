# ADR-002: PostgreSQL real[] 的便携向量存储

Status: accepted; Phase 5 决策，Phase 8 补记。

本地打包 PostgreSQL 没有 pgvector。选择现有 `VectorStore` 接口下的 `PortableVectorStore`，将真实 Embedding 存为 `real[]`，先按租户、资料状态、provider/model/dimensions/version 过滤，再在同一快照中每页 200 条扫描并计算 cosine。top-K 有界，不能静默截断资料库。

这保留了目录迁移和未来替换后端的接口，但全扫描仍是 O(N × dimensions)，并受 PostgreSQL 数组解码和进程内存影响。[Phase 8 容量测试](../evaluation/phase8-performance.md) 覆盖 5,000 chunks，不能宣传为 ANN 或无限扩容。本阶段不迁移 pgvector。
