import { test } from "node:test";
import assert from "node:assert/strict";
import { tool } from "ai";
import { z } from "zod";
import { createKimiProvider, kimiBaseURL } from "../src/lib/ai/providers/kimi-provider";
import { readModelConfig } from "../src/lib/ai/models";
import { AIError } from "../src/lib/ai/errors";

const signal = () => new AbortController().signal;
const completion = (content: string, toolCalls?: unknown[]) => ({
  id: "fixture", object: "chat.completion", created: 1, model: "kimi-k2.6",
  choices: [{ index: 0, finish_reason: toolCalls ? "tool_calls" : "stop", message: { role: "assistant", content, ...(toolCalls ? { tool_calls: toolCalls } : {}) } }],
  usage: { prompt_tokens: 5, completion_tokens: 3, total_tokens: 8 },
});

test("Kimi uses Moonshot authentication, strict structured output and instant-mode tool calls", async () => {
  const bodies: Record<string, unknown>[] = [];
  const provider = createKimiProvider({ apiKey: "test-fixture-only", models: readModelConfig({}), fetch: async (url, init) => {
    assert.equal(String(url), `${kimiBaseURL}/chat/completions`);
    assert.equal(new Headers(init?.headers).get("authorization"), "Bearer test-fixture-only");
    const body = JSON.parse(String(init?.body)); bodies.push(body);
    return Response.json(completion(body.tools ? "" : '{"category":"Study"}', body.tools ? [{ id: "call-1", type: "function", function: { name: "read_document", arguments: JSON.stringify({ documentIds: ["fixture-id"] }) } }] : undefined));
  } });
  assert.equal(provider.name, "kimi");
  const structured = await provider.generateObject({ system: "Analyze", prompt: "Data", signal: signal(), schema: z.object({ category: z.string() }) });
  assert.equal(structured.object.category, "Study"); assert.equal(structured.usage.totalTokens, 8);
  assert.deepEqual(bodies[0].thinking, { type: "disabled" });
  assert.equal((bodies[0].response_format as { type: string }).type, "json_schema");
  assert.equal((bodies[0].response_format as { json_schema: { strict: boolean } }).json_schema.strict, true);
  const calls = await provider.callTools({ system: "Plan", messages: [{ role: "user", content: "Read" }], signal: signal(), tools: { read_document: tool({ description: "Read current workspace", inputSchema: z.object({ documentIds: z.array(z.string()) }) }) } });
  assert.equal(calls.calls[0].name, "read_document"); assert.deepEqual(calls.calls[0].input, { documentIds: ["fixture-id"] });
  assert.equal(bodies[1].tool_choice, "required"); assert.deepEqual(bodies[1].thinking, { type: "disabled" });
  assert.equal(bodies[1].model, "kimi-k2.6"); assert.equal(bodies[1].max_tokens, 2400);
  assert.equal(bodies[1].store, undefined); assert.equal(bodies[1].parallel_tool_calls, undefined);
});

test("Kimi rejects incompatible configuration before requesting a provider", () => {
  const models = readModelConfig({});
  assert.deepEqual(models, { provider: "kimi", main: "kimi-k2.6", small: "kimi-k2.6" });
  assert.throws(() => createKimiProvider({ models }), (error: unknown) => error instanceof AIError && error.code === "CONFIGURATION" && !error.retryable);
  assert.throws(() => createKimiProvider({ apiKey: "fixture", models: { ...models, small: "kimi-k2.5" } }), /kimi-k2.6/);
  assert.throws(() => createKimiProvider({ apiKey: "fixture", models, baseURL: "http://example.test/v1" }), /HTTPS/);
});

test("Kimi responses still pass domain validation and safe credential error handling", async () => {
  const invalid = createKimiProvider({ apiKey: "fixture", models: readModelConfig({}), fetch: async () => Response.json(completion('{"category":42}')) });
  await assert.rejects(invalid.generateObject({ system: "Analyze", prompt: "Data", signal: signal(), schema: z.object({ category: z.string() }) }), (error: unknown) => error instanceof AIError && error.code === "STRUCTURED_OUTPUT");
  const denied = createKimiProvider({ apiKey: "fixture-secret", models: readModelConfig({}), fetch: async () => Response.json({ error: { message: "fixture-secret", type: "invalid_authentication_error" } }, { status: 401 }) });
  await assert.rejects(denied.generateText({ system: "Analyze", prompt: "Data", signal: signal() }), (error: unknown) => error instanceof AIError && error.code === "INVALID_KEY" && !error.retryable && !error.message.includes("fixture-secret"));
});

test("Kimi streams only visible text in instant mode", async () => {
  const provider = createKimiProvider({ apiKey: "fixture", models: readModelConfig({}), fetch: async (_url, init) => {
    const body = JSON.parse(String(init?.body)); assert.equal(body.stream, true); assert.deepEqual(body.thinking, { type: "disabled" });
    const events = [
      { id: "stream", object: "chat.completion.chunk", created: 1, model: "kimi-k2.6", choices: [{ index: 0, delta: { role: "assistant", reasoning_content: "private fixture" }, finish_reason: null }] },
      { id: "stream", object: "chat.completion.chunk", created: 1, model: "kimi-k2.6", choices: [{ index: 0, delta: { content: "Visible summary" }, finish_reason: null }] },
      { id: "stream", object: "chat.completion.chunk", created: 1, model: "kimi-k2.6", choices: [{ index: 0, delta: {}, finish_reason: "stop" }] },
    ];
    return new Response(events.map(event => `data: ${JSON.stringify(event)}\n\n`).join("") + "data: [DONE]\n\n", { headers: { "content-type": "text/event-stream" } });
  } });
  let visible = "";
  for await (const chunk of provider.streamText({ system: "Summarize", prompt: "Data", signal: signal() })) visible += chunk;
  assert.equal(visible, "Visible summary");
});
