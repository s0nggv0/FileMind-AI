import type { z } from "zod";
import type { ModelMessage, ToolSet } from "ai";
import type { ModelRole } from "./models";
export interface AIUsage { promptTokens: number; completionTokens: number; totalTokens: number }
export interface GenerationInput { system: string; prompt: string; role?: ModelRole; signal: AbortSignal }
export interface AIProvider {
  readonly name: string; readonly models: { main: string; small: string };
  generateText(input: GenerationInput): Promise<{ text: string; usage: AIUsage }>;
  generateObject<T>(input: GenerationInput & { schema: z.ZodType<T> }): Promise<{ object: T; usage: AIUsage }>;
  streamText(input: GenerationInput): AsyncIterable<string>;
  callTools(input: { system: string; messages: ModelMessage[]; tools: ToolSet; signal: AbortSignal }): Promise<{ calls: { name: string; id: string; input: unknown }[]; messages: ModelMessage[]; usage: AIUsage }>;
}
