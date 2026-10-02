import { test } from "node:test";
import assert from "node:assert/strict";
import { createOpenAI } from "@ai-sdk/openai";
import { tool } from "ai";
import { z } from "zod";
import { SDKAIProvider } from "../src/lib/ai/providers/sdk-provider";
test("OpenAI adapter sends structured JSON and tool schemas through the official wire format", async () => {
  const bodies: Record<string, unknown>[] = [];
  const openai = createOpenAI({ apiKey: "test-fixture-only", fetch: async (_url, init) => {
    const body = JSON.parse(String(init?.body)); bodies.push(body);
    const tools = body.tools;
    return Response.json({ id: "fixture", object: "chat.completion", created: 1, model: "fixture-model", choices: [{ index: 0, finish_reason: tools ? "tool_calls" : "stop", message: tools ? { role: "assistant", content: null, tool_calls: [{ id: "call-1", type: "function", function: { name: "read_document", arguments: JSON.stringify({ documentIds: ["fixture-id"] }) } }] } : { role: "assistant", content: '{"category":"Study"}' } }], usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 } });
  } });
  const provider = new SDKAIProvider("openai", { main: "fixture-model", small: "fixture-model" }, () => openai.chat("fixture-model"));
  const signal = new AbortController().signal;
  const structured = await provider.generateObject({ system: "Analyze", prompt: "Data", signal, schema: z.object({ category: z.string() }) });
  assert.equal(structured.object.category, "Study"); assert.equal(structured.usage.totalTokens, 8);
  assert.equal((bodies[0].response_format as { type: string }).type, "json_schema");
  const calls = await provider.callTools({ system: "Plan", messages: [{ role: "user", content: "Read" }], signal, tools: { read_document: tool({ description: "Read current workspace", inputSchema: z.object({ documentIds: z.array(z.string()) }) }) } });
  assert.equal(calls.calls[0].name, "read_document"); assert.deepEqual(calls.calls[0].input, { documentIds: ["fixture-id"] }); assert.equal(bodies[1].tool_choice, "required"); assert.equal(bodies[1].parallel_tool_calls, false);
});
