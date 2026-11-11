# Phase 4 AI Provider 与 Agent

UI → Workspace Domain → AgentEngine → 服务器 Agent API → AIProvider → SDK Adapter → Kimi。组件不 import Provider SDK，不根据厂商选择实现。WorkspaceAgentEngine 在服务边界读取服务器配置，选择 MockAgentEngine 或 LLMAgentEngine。真实凭据仅存在 `.env.local` 和服务器 `server-only` 工厂中。客户端只请求同源 API。

## Provider 与模型

`AIProvider` 定义 `generateText`、`generateObject`、`streamText`、`callTools`，返回统一输出和 usage。`SDKAIProvider` 使用 AI SDK 7 的 `generateText` + `Output.object`，Zod 验证结构。Kimi 工厂使用 @ai-sdk/openai-compatible 的 Chat Completions，服务地址默认 https://api.moonshot.cn/v1。运行时只读取 KIMI_API_KEY，已移除 OpenAI adapter 和旧密钥配置。

`models.ts` 集中读取 `AI_PROVIDER`、`AI_MODEL`、`AI_SMALL_MODEL`。默认 kimi / kimi-k2.6；small 留空复用 main。当前只适配 kimi-k2.6，未经支持的型号或 Provider 在调用前报告配置错误。主模型负责 Planner 和组织计划，small 角色负责每个文档一次结构化分析，得到摘要、分类、3–8 个标签、命名建议与置信度。四个公开逻辑步骤复用结果，不是四次付费请求。

适配显式发送 thinking={type:disabled}。K2.6 的思考模式与 required 工具选择不兼容；非思考模式符合当前不展示隐藏推理的产品流程。使用 strict JSON Schema，并继续执行 Zod、ID 和分类等业务校验。未传 OpenAI 专有 store/parallel_tool_calls 参数；工具执行仍由 Registry 按顺序控制。

## Agent 执行

`LLMAgentEngine` 先调用既有浏览器解析器，再保存正文与私有原文件。`/api/ai/agent` 只接收 workspaceId、runId、revision，从当前用户 Workspace 读取正文；禁止浏览器提供系统 Prompt 或工具实现。服务器 LLMAgentRunner 把工具定义交给真实模型，取得 Tool Calls，执行 Registry，追加 Tool Results，模型再决定下一步。

Registry 仅包含 `read_document`、`analyze_document`、`detect_duplicates`、`build_relationships`、`generate_organization_plan`。每个工具有 name、description、inputSchema 与 execute handler，且只识别当前 Workspace 的 UUID。没有 Shell、任意 URL、任意文件路径、代码执行或 Apply 工具。Planner 读取元数据和有界公开结果，不需要把每份完整正文再发给 Planner。

文档分析队列状态通过公开 Step 的 pending/running/completed/failed 对应 queued/processing/completed/failed，最多同时 3 次分析。最多 30 个文档、15 个 Planner Tool Calls、每个工具最多重试一次，Provider 45 秒，整次 Agent 240 秒。一次成功的文档分析展开四个逻辑结果，逻辑展示数量不等于 Planner 调用限额。

## 数据边界与成本

正文限制来自已有解析器：250,000 字符、PDF 最多 200 页。AI Input Guard 对短文直接处理，长文抽取开头、中间和结尾共五段，最多 18,000 字符；明确标记 sampled/truncated。没有 Embedding、RAG 或语义检索。图片仅使用元数据，空文本明确说明信息不足。

Prompt 使用独立版本文件。正文、文件名和 Tool Output 被视为不可信数据；固定系统指令要求不能遵循文件内指令。JSON 编码后将尖括号转义并放在唯一的 `<document_content>` 边界中，防止内容闭合标签。模型即使选错工具，Registry、Zod、ID 范围和前置条件仍阻止任意操作。只记录公开输入、结果和活动摘要，不请求、不保存、不输出隐藏思维链。

缓存限定同一用户，key = 内容 SHA-256 + 小模型 + Prompt version + 原文件名 + 分类策略。额外包含名称和分类防止对相同正文复用不适合当前文档的命名与分类。缓存存于 documents.analysis_json / analysis_cache_key，不新建缓存表。重用前重新做 Zod 校验。模型返回的成功调用 usage 聚合到 agent_runs；失败请求可能产生 Provider 费用，本阶段不估算美元金额。

## 错误和降级

`AIError` 统一 code/message/retryable/provider/status，区分 timeout、rate limit、invalid key、服务不可用、结构失败、网络、长度和步数限制。UI 不显示原始 Provider Stack 或 Key。结构化文档分析可重试一次，密钥错误不重试。

组织计划输出 Schema 限制返回已知 ID 和分类；最终完整 OrganizationProposalSchema 再验证引用。无效计划重试一次，仍失败则保留文档 AI 分析并用确定性代码建计划。Provider / Planner 失败使用真实本地正文规则降级，显示 **AI analysis unavailable — using basic local organization.**。配置或 Transport 失败可点击 **Continue with local organization**。存储失败不伪装为 AI 成功或本地成功，必须先恢复保存。

NDJSON 只流式返回公开 Run 事件，不展示模型 Token 或 reasoning。浏览器断开会取消执行；没有后台 Job。人工审核、分类/标签编辑、接受/忽略建议和 Apply 保留，所有原文件始终保留。

## 验证与配置限制

无服务配置时 `AI_ENGINE=mock` 完全可运行。自动化测试使用 SDK Mock 和 Kimi HTTP 格式 fixture，验证服务地址、Bearer 凭据、非思考模式、严格结构、工具选择、流式可见文本、错误安全处理及重试。它们不等同于收费 Provider 端到端验收。用户尚未配置 Key，真实 Kimi 调用待配置后验收。

官方实现依据：[AI SDK 兼容 Provider](https://ai-sdk.dev/providers/openai-compatible-providers)、[Kimi K2.6](https://platform.kimi.com/docs/guide/kimi-k2-6-quickstart)、[结构输出](https://platform.kimi.com/docs/guide/response_format)、[工具约束](https://platform.kimi.com/docs/guide/use-tool-choice)。
