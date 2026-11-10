import { builtinModules } from "node:module";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve, relative, extname } from "node:path";
import { pathToFileURL } from "node:url";
import ts from "typescript";

const nodeModules = new Set(builtinModules.flatMap(name => [name, `node:${name}`]));
const privatePackages = /^(?:server-only|pg|sharp|mammoth|tesseract\.js|@electric-sql\/pglite|@next\/env|next\/(?:headers|server|cache))(?:\/|$)/;
const privateSource = /(?:^|\/)lib\/(?:server\/|ai\/(?:get-provider|providers\/)|multimodal\/(?:provider|kimi-vision|portable-ocr|pipeline)\.|retrieval\/(?:rag|answer-verifier|answer-context|search-service|get-embedding-provider|dashscope-provider|postgres-[^/]+|portable-vector-store)\.[cm]?[jt]sx?$)/;
const normalize = path => path.replaceAll("\\", "/");

// Explicit type edges are recorded separately; they never enter the runtime walk.
export function moduleEdges(text, filename) {
  const source = ts.createSourceFile(filename, text, ts.ScriptTarget.Latest, true);
  const edges = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier) {
      const clause = ts.isImportDeclaration(node) ? node.importClause : node;
      const bindings = ts.isImportDeclaration(node) ? clause?.namedBindings : node.exportClause;
      const typeOnly = !!clause?.isTypeOnly || !!(bindings && (ts.isNamedImports(bindings) || ts.isNamedExports(bindings)) && bindings.elements.length && bindings.elements.every(item => item.isTypeOnly) && !clause?.name);
      edges.push({ specifier: node.moduleSpecifier.text, typeOnly });
    } else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument) && ts.isStringLiteral(node.argument.literal)) {
      edges.push({ specifier: node.argument.literal.text, typeOnly: true });
    } else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) {
      edges.push({ specifier: node.moduleReference.expression.text, typeOnly: node.isTypeOnly });
    } else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || ts.isIdentifier(node.expression) && node.expression.text === "require")) {
      const argument = node.arguments[0];
      if (argument && ts.isStringLiteralLike(argument)) edges.push({ specifier: argument.text, typeOnly: false });
      else edges.push({ specifier: "<non-literal module load>", typeOnly: false });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
  return edges;
}

export function createBoundaryGraph(root, read = path => existsSync(path) ? readFileSync(path, "utf8") : undefined) {
  const cache = new Map();
  const label = path => normalize(relative(root, path));
  function load(path) {
    if (!cache.has(path)) {
      const text = read(path);
      cache.set(path, text === undefined ? undefined : { text, edges: moduleEdges(text, path) });
    }
    return cache.get(path);
  }
  function target(from, specifier) {
    const base = specifier.startsWith("@/") ? resolve(root, "src", specifier.slice(2)) : specifier.startsWith(".") ? resolve(dirname(from), specifier) : undefined;
    if (!base) return undefined;
    // Resolve source only, never probe configuration, user data or dependencies.
    if (!/^(src|scripts)\//.test(label(base))) return undefined;
    const stem = base.replace(/\.[cm]?js$/, "");
    return [base, ...[".ts", ".tsx", ".mts", ".mjs", ".js", "/index.ts", "/index.tsx", "/index.js"].map(suffix => stem + suffix)]
      .filter(path => /\.[cm]?[jt]sx?$/.test(path)).find(path => load(path));
  }
  function violation(entry, contracts = false) {
    const visited = new Set();
    function walk(path, chain) {
      if (visited.has(path)) return;
      visited.add(path);
      const record = load(path);
      if (!record) return;
      for (const edge of record.edges) {
        if (edge.typeOnly && !contracts) continue;
        const next = target(path, edge.specifier);
        const trail = [...chain, next ? label(next) : edge.specifier];
        if (contracts && (next ? !isRetrievalContract(next) : edge.specifier !== "zod")) return trail;
        const browserBuild = edge.specifier === "mammoth/mammoth.browser";
        if (edge.specifier === "<non-literal module load>" || nodeModules.has(edge.specifier) || edge.specifier.startsWith("node:") || !browserBuild && privatePackages.test(edge.specifier) || next && privateSource.test(label(next)) || contracts && /^(?:react|react-dom)(?:\/|$)/.test(edge.specifier)) return trail;
        if (next) {
          const result = walk(next, trail);
          if (result) return result;
        } else if (edge.specifier.startsWith("@/") || edge.specifier.startsWith(".") && !/\.(?:css|svg|png|woff2?)(?:\?|$)/.test(edge.specifier)) return [...trail, "unresolved local import"];
      }
    }
    return walk(resolve(entry), [label(resolve(entry))]);
  }
  return { violation, load, label };
}

export function sourceFiles(root) {
  const files = [];
  function walk(directory) {
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, item.name);
      if (item.isDirectory()) walk(path);
      else if (/\.[jt]sx?$/.test(extname(path))) files.push(path);
    }
  }
  walk(resolve(root, "src"));
  return files;
}

export const isBrowserEntry = (filename, text) => /(?:^|\/)(?:features|components|hooks|store)\//.test(normalize(filename)) || /^\s*["']use client["'];?/m.test(text);
export const isRetrievalContract = filename => /\/lib\/retrieval\/(?:answer-contract|search-contract|citation-contract|types)\.ts$/.test(normalize(filename));

// The same transitive policy runs under eslint and the standalone graph check.
export const boundaryPlugin = {
  rules: {
    "browser-imports": {
      meta: { type: "problem", schema: [], messages: { boundary: "Forbidden import chain: {{chain}}. Use a public contract or an HTTP client." } },
      create(context) {
        return { Program(node) {
          const filename = context.filename;
          const text = context.sourceCode.text;
          if (!isBrowserEntry(filename, text) && !isRetrievalContract(filename)) return;
          const graph = createBoundaryGraph(context.cwd, path => path === filename ? text : existsSync(path) ? readFileSync(path, "utf8") : undefined);
          const chain = graph.violation(filename, isRetrievalContract(filename));
          if (chain) context.report({ node, messageId: "boundary", data: { chain: chain.join(" -> ") } });
        } };
      },
    },
  },
};

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const root = process.cwd(), graph = createBoundaryGraph(root), files = sourceFiles(root);
  let clients = 0, contracts = 0, runtimeEdges = 0, typeEdges = 0;
  const failures = [];
  for (const file of files) {
    const record = graph.load(file);
    for (const edge of record.edges) {
      if (edge.typeOnly) typeEdges++;
      else runtimeEdges++;
    }
    const contract = isRetrievalContract(file), client = isBrowserEntry(file, record.text);
    if (client) clients++;
    if (contract) contracts++;
    if (client || contract) {
      const chain = graph.violation(file, contract);
      if (chain) failures.push(chain.join(" -> "));
    }
  }
  console.log(JSON.stringify({ files: files.length, clients, contracts, runtimeEdges, typeEdges, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}
