import { generateText, streamText, Output, type LanguageModel, type LanguageModelUsage } from "ai";
import type { z } from "zod";
import type { AIProvider, AIUsage, GenerationInput } from "../provider";
import { aiLimits } from "../config";
import { normalizeAIError } from "../errors";
import type { ModelRole } from "../models";
function usage(value: LanguageModelUsage): AIUsage { return { promptTokens: value.inputTokens ?? 0, completionTokens: value.outputTokens ?? 0, totalTokens: value.totalTokens ?? 0 }; }
export class SDKAIProvider implements AIProvider {
  constructor(public readonly name: string, public readonly models: { main: string; small: string }, private model: (role: ModelRole) => LanguageModel) {}
  private settings(input: GenerationInput) { return { model: this.model(input.role ?? "main"), system: input.system, prompt: input.prompt, abortSignal: AbortSignal.any([input.signal, AbortSignal.timeout(aiLimits.providerTimeoutMs)]), maxRetries: 0, maxOutputTokens: aiLimits.maxOutputTokens }; }
  async generateText(input: GenerationInput) {
    try { const result = await generateText(this.settings(input)); return { text: result.text, usage: usage(result.usage) }; } catch (e) { throw normalizeAIError(e, this.name); }
  }
  async generateObject<T>(input: GenerationInput & { schema: z.ZodType<T> }) {
    try { const result = await generateText({ ...this.settings(input), output: Output.object({ schema: input.schema }) }); return { object: input.schema.parse(result.output), usage: usage(result.usage) }; } catch (e) { throw normalizeAIError(e, this.name); }
  }
  async *streamText(input: GenerationInput) {
    try { for await (const part of streamText(this.settings(input)).textStream) yield part; } catch (e) { throw normalizeAIError(e, this.name); }
  }
  async callTools(input: Parameters<AIProvider["callTools"]>[0]) {
    try {
      const result = await generateText({ model: this.model("main"), system: input.system, messages: input.messages, tools: input.tools, toolChoice: "required", maxRetries: 0, maxOutputTokens: aiLimits.maxOutputTokens, abortSignal: AbortSignal.any([input.signal, AbortSignal.timeout(aiLimits.providerTimeoutMs)]), providerOptions: { openai: { parallelToolCalls: false, store: false } } });
      return { calls: result.toolCalls.map(call => ({ name: call.toolName, id: call.toolCallId, input: call.input })), messages: result.response.messages, usage: usage(result.usage) };
    } catch (e) { throw normalizeAIError(e, this.name); }
  }
}
