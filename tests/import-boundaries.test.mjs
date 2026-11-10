import { test } from "node:test";
import assert from "node:assert/strict";
import { resolve } from "node:path";
import { ESLint } from "eslint";
import { createBoundaryGraph, moduleEdges } from "../scripts/verification/import-boundaries.mjs";

function fixture(files) {
  const root = resolve("synthetic-import-graph");
  const sources = new Map(Object.entries(files).map(([name, text]) => [resolve(root, name), text]));
  return { root, graph: createBoundaryGraph(root, path => sources.get(path)) };
}

test("browser graph rejects alias, relative, re-export, dynamic and require paths to private code", () => {
  for (const edge of [
    'export * from "@/lib/server/database";',
    'export { answer } from "../lib/retrieval/rag";',
    'export const load = () => import("node:fs/promises");',
    'const db = require("pg");',
    'import "server-only";',
    'import { headers } from "next/headers";',
    'import "@/lib/ai/providers/kimi-provider";',
  ]) {
    const { root, graph } = fixture({
      "src/features/client.ts": 'import "@/shared/barrel";',
      "src/shared/barrel.ts": edge,
      "src/lib/server/database.ts": 'export const db = {};',
      "src/lib/retrieval/rag.ts": 'export const answer = {};',
      "src/lib/ai/providers/kimi-provider.ts": 'export const provider = {};',
    });
    assert.ok(graph.violation(resolve(root, "src/features/client.ts")), edge);
  }
});

test("type-only cycles do not create runtime reachability; contracts still cannot depend on implementations", () => {
  const { root, graph } = fixture({
    "src/features/client.ts": 'import type { Result } from "@/lib/server/database"; import { type Source } from "@/lib/retrieval/rag"; export type { Report } from "@/lib/retrieval/rag"; import "@/shared/safe";',
    "src/shared/safe.ts": 'import "mammoth/mammoth.browser"; export type Result = string;',
    "src/lib/server/database.ts": 'import type { Result } from "@/features/client";',
    "src/lib/retrieval/rag.ts": 'export type Source = string; export type Report = string;',
  });
  assert.equal(graph.violation(resolve(root, "src/features/client.ts")), undefined);
  assert.ok(graph.violation(resolve(root, "src/features/client.ts"), true));
  assert.equal(moduleEdges('export type { X } from "./x"; import { type X, value } from "./x";', "test.ts")[1].typeOnly, false);
});

test("contracts reject React, unresolved imports and non-literal runtime loads fail closed", () => {
  for (const text of ['import type { ReactNode } from "react";', 'type Node = import("react").ReactNode;', 'import "./missing";', 'const load = name => import(name);']) {
    const { root, graph } = fixture({ "src/lib/retrieval/answer-contract.ts": text });
    assert.ok(graph.violation(resolve(root, "src/lib/retrieval/answer-contract.ts"), true));
  }
});

test("ESLint enforces browser boundaries and permits public schemas and type-only dependencies", async () => {
  const eslint = new ESLint();
  for (const text of ['import "@/lib/server/search";', 'import "../../lib/retrieval/rag";', 'const load = () => import("node:fs");']) {
    const [result] = await eslint.lintText(text, { filePath: "src/features/search/boundary-fixture.ts" });
    assert.ok(result.messages.some(message => message.ruleId === "boundaries/browser-imports"), text);
  }
  const [result] = await eslint.lintText('import { SearchRequestSchema } from "@/lib/retrieval/search-contract"; export const schema = SearchRequestSchema;', { filePath: "src/features/search/boundary-fixture.ts" });
  assert.equal(result.errorCount, 0);
});
