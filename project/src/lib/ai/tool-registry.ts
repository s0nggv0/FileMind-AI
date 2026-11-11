import { tool, type ToolSet } from "ai";
import { z } from "zod";
import { AIError } from "./errors";

export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  execute(input: unknown): Promise<unknown>;
}
export class ToolRegistry {
  private definitions = new Map<string, ToolDefinition>();
  constructor(definitions: ToolDefinition[]) {
    for (const definition of definitions) {
      if (this.definitions.has(definition.name)) throw new Error("Duplicate tool registration");
      this.definitions.set(definition.name, definition);
    }
  }
  static fromSDK(specs: ToolSet, handlers: Record<string, (input: unknown) => Promise<unknown>>) {
    return new ToolRegistry(Object.entries(specs).map(([name, spec]) => {
      if (!(spec.inputSchema instanceof z.ZodType) || typeof spec.description !== "string" || !Object.hasOwn(handlers, name)) throw new Error("Tools require a Zod schema, description and executor");
      return { name, description: spec.description, inputSchema: spec.inputSchema, execute: handlers[name] };
    }));
  }
  has(name: string) { return this.definitions.has(name); }
  forModel(): ToolSet {
    // Execution stays in the domain loop; the Provider receives schemas only.
    return Object.fromEntries([...this.definitions.values()].map(definition => [definition.name, tool({ description: definition.description, inputSchema: definition.inputSchema })]));
  }
  execute(name: string, input: unknown) {
    const definition = this.definitions.get(name);
    if (!definition) throw new AIError("STRUCTURED_OUTPUT", "Planner requested an unavailable tool.", false, "ai");
    return definition.execute(definition.inputSchema.parse(input));
  }
}
