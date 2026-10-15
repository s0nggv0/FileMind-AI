# 配置个人知识检索

Kimi 负责整理与回答，Embedding 负责把段落和问题转换成可检索向量。两者使用独立接口和 Key，不要把任意聊天模型 Key 填入 Embedding 配置。以下内容只填写在项目根目录 `.env.local`，不要发送到聊天或提交到 Git：

```dotenv
EMBEDDING_PROVIDER=dashscope
EMBEDDING_MODEL=qwen3.7-text-embedding-flash
EMBEDDING_DIMENSIONS=1024
EMBEDDING_API_KEY=在本机填写百炼Key
EMBEDDING_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
EMBEDDING_BATCH_SIZE=10
EMBEDDING_CONCURRENCY=2
RAG_RERANK_ENABLED=true
```

接口地址以百炼控制台为准；Key、工作空间及地域必须一致。当前本机已使用上述地址通过真实验收。[百炼官方 Embedding 文档](https://help.aliyun.com/zh/model-studio/embedding-interfaces-compatible-with-openai/)说明可用模型、维度和地域地址。`qwen3.7-text-rerank` 是重排模型，不能替代 Embedding。

保存配置后重新启动项目。便携启动器在存在 Kimi Key 时选择真实模式；`node scripts/portable-start.mjs --mock` 明确选择离线规则与 Mock 索引。正常开发启动时还需按 `.env.example` 设置 `AI_ENGINE=llm`。

在 Workspace 导入、解析并 Apply 后自动建立索引；Library 展示状态，失败可重试。已有资料可在 Search 点击“更新知识索引”。模型或维度改变后旧索引显示 stale，重建前不会使用旧配置向量。

Search 的 Ask 依据原文生成带引用回答，Find 只找文件和段落；点击引用可看当前数据库原文。没有依据时明确拒答，服务暂不可用时保留关键词检索或原始段落。

## 开发者复验

先启动本项目专用便携数据库。以下实时命令会调用已配置的收费模型，仅使用自写合成资料；结果不包含 Key。

```powershell
node --import tsx scripts/verification/verify-kimi-live.ts
node --import tsx scripts/verification/verify-embedding-live.ts
node --import tsx scripts/evaluation/evaluate-rag.ts --live
```

真实浏览器验收：先运行 `node scripts/portable-start.mjs --port 3082`，然后 `npx playwright test --config playwright.rag-live.config.ts`。完成后运行 `node scripts/portable-start.mjs --stop`。

离线与便携验收：`npm test`、`npm run test:e2e`、`npm run test:portable`、`npm run test:portable:copy`。复制测试会在 artifacts 中建立自己的中文空格目录，成功后删除测试副本；不要在运行数据库时复制项目。
