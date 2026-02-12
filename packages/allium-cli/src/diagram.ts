#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

type DiagramFormat = "d2" | "mermaid";

interface DiagramNode {
  id: string;
  key: string;
  label: string;
}

interface DiagramEdge {
  from: string;
  to: string;
  label: string;
}

interface DiagramModel {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

interface ParsedArgs {
  format: DiagramFormat;
  outputPath?: string;
  inputs: string[];
}

function main(argv: string[]): number {
  const parsed = parseArgs(argv);
  if (!parsed) {
    return 2;
  }

  const files = resolveInputs(parsed.inputs);
  if (files.length === 0) {
    process.stderr.write("No .allium files found for the provided inputs.\n");
    return 2;
  }

  const combined = mergeModels(
    files.map((filePath) =>
      buildDiagramModel(fs.readFileSync(filePath, "utf8")),
    ),
  );

  const output = renderDiagram(combined, parsed.format);
  if (parsed.outputPath) {
    const fullPath = path.resolve(process.cwd(), parsed.outputPath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, output, "utf8");
    process.stdout.write(
      `Wrote ${parsed.format} diagram to ${parsed.outputPath}\n`,
    );
  } else {
    process.stdout.write(output);
  }

  return 0;
}

function parseArgs(argv: string[]): ParsedArgs | null {
  let format: DiagramFormat = "d2";
  let outputPath: string | undefined;
  const inputs: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--format") {
      const formatArg = argv[i + 1];
      if (formatArg !== "d2" && formatArg !== "mermaid") {
        printUsage("Expected --format d2|mermaid");
        return null;
      }
      format = formatArg;
      i += 1;
      continue;
    }
    if (arg === "--output") {
      const outArg = argv[i + 1];
      if (!outArg) {
        printUsage("Expected a path after --output");
        return null;
      }
      outputPath = outArg;
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsage();
      return null;
    }
    inputs.push(arg);
  }

  if (inputs.length === 0) {
    printUsage("Provide at least one file, directory, or glob.");
    return null;
  }

  return { format, outputPath, inputs };
}

function printUsage(error?: string): void {
  if (error) {
    process.stderr.write(`${error}\n`);
  }
  process.stderr.write(
    "Usage: allium-diagram [--format d2|mermaid] [--output path] <file|directory|glob> [...]\n",
  );
}

function buildDiagramModel(text: string): DiagramModel {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const nodeByKey = new Map<string, DiagramNode>();

  const ensureNode = (kind: string, name: string): DiagramNode => {
    const key = `${kind}:${name}`;
    const existing = nodeByKey.get(key);
    if (existing) {
      return existing;
    }
    const id = `${kind}_${name}`.replace(/[^A-Za-z0-9_]/g, "_");
    const label = `[${kind}] ${name}`;
    const node: DiagramNode = { id, key, label };
    nodeByKey.set(key, node);
    nodes.push(node);
    return node;
  };

  const addEdge = (from: DiagramNode, to: DiagramNode, label: string): void => {
    edges.push({ from: from.id, to: to.id, label });
  };

  const topLevelPattern =
    /^\s*(external\s+entity|entity|value|variant|rule|surface|actor|enum)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*([A-Za-z_][A-Za-z0-9_]*))?\s*\{/gm;
  for (
    let match = topLevelPattern.exec(text);
    match;
    match = topLevelPattern.exec(text)
  ) {
    const kind = match[1].replace(/\s+/g, "_");
    const name = match[2];
    const base = match[3];
    const node = ensureNode(kind, name);
    if (kind === "variant" && base) {
      addEdge(node, ensureNode("entity", base), "extends");
    }
  }

  const entityBlockPattern =
    /^\s*(?:external\s+)?entity\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]*?)^\s*\}/gm;
  for (
    let entity = entityBlockPattern.exec(text);
    entity;
    entity = entityBlockPattern.exec(text)
  ) {
    const source = ensureNode("entity", entity[1]);
    const body = entity[2];
    const relPattern =
      /^\s*[A-Za-z_][A-Za-z0-9_]*\s*:\s*([A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)?)\s+for\s+this\s+[A-Za-z_][A-Za-z0-9_]*\s*$/gm;
    for (let rel = relPattern.exec(body); rel; rel = relPattern.exec(body)) {
      const targetType = rel[1].includes("/") ? rel[1].split("/")[1] : rel[1];
      addEdge(source, ensureNode("entity", targetType), "rel");
    }
  }

  const rulePattern =
    /^\s*rule\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]*?)^\s*\}/gm;
  for (let rule = rulePattern.exec(text); rule; rule = rulePattern.exec(text)) {
    const ruleNode = ensureNode("rule", rule[1]);
    const body = rule[2];

    const when = body.match(/^\s*when\s*:\s*(.+)$/m);
    if (when) {
      const trigger = when[1].trim();
      const typed = trigger.match(
        /^[a-z_][a-z0-9_]*\s*:\s*([A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)?)\./,
      );
      if (typed) {
        const typeName = typed[1].includes("/")
          ? typed[1].split("/")[1]
          : typed[1];
        addEdge(ensureNode("entity", typeName), ruleNode, "when");
      }

      const callPattern = /([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
      for (
        let call = callPattern.exec(trigger);
        call;
        call = callPattern.exec(trigger)
      ) {
        addEdge(ensureNode("trigger", call[1]), ruleNode, "when");
      }
    }

    const createPattern =
      /\b([A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)?)\.created\s*\(/g;
    for (
      let create = createPattern.exec(body);
      create;
      create = createPattern.exec(body)
    ) {
      const raw = create[1];
      const typeName = raw.includes("/") ? raw.split("/")[1] : raw;
      addEdge(ruleNode, ensureNode("entity", typeName), "ensures");
    }
  }

  const surfacePattern =
    /^\s*surface\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]*?)^\s*\}/gm;
  for (
    let surface = surfacePattern.exec(text);
    surface;
    surface = surfacePattern.exec(text)
  ) {
    const surfaceNode = ensureNode("surface", surface[1]);
    const body = surface[2];

    const forMatch = body.match(
      /^\s*for\s+[A-Za-z_][A-Za-z0-9_]*\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/m,
    );
    if (forMatch) {
      addEdge(ensureNode("actor", forMatch[1]), surfaceNode, "for");
    }

    const contextMatch = body.match(
      /^\s*context\s+[A-Za-z_][A-Za-z0-9_]*\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/m,
    );
    if (contextMatch) {
      addEdge(ensureNode("entity", contextMatch[1]), surfaceNode, "context");
    }

    for (const callName of parseSurfaceProvidesCalls(body)) {
      addEdge(surfaceNode, ensureNode("trigger", callName), "provides");
    }
  }

  const uniqueEdges = new Map<string, DiagramEdge>();
  for (const edge of edges) {
    uniqueEdges.set(`${edge.from}|${edge.to}|${edge.label}`, edge);
  }

  return {
    nodes: [...nodes].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...uniqueEdges.values()].sort((a, b) =>
      `${a.from}|${a.to}|${a.label}`.localeCompare(
        `${b.from}|${b.to}|${b.label}`,
      ),
    ),
  };
}

function renderDiagram(model: DiagramModel, format: DiagramFormat): string {
  if (format === "mermaid") {
    return renderMermaid(model);
  }
  return renderD2(model);
}

function renderD2(model: DiagramModel): string {
  const lines: string[] = ["direction: right", ""];
  for (const node of model.nodes) {
    lines.push(`${node.id}: "${escapeD2(node.label)}"`);
  }
  if (model.nodes.length > 0) {
    lines.push("");
  }
  for (const edge of model.edges) {
    lines.push(`${edge.from} -> ${edge.to}: "${escapeD2(edge.label)}"`);
  }
  return `${lines.join("\n").replace(/\n+$/g, "")}\n`;
}

function renderMermaid(model: DiagramModel): string {
  const lines: string[] = ["flowchart LR"];
  for (const node of model.nodes) {
    lines.push(`  ${node.id}["${escapeMermaid(node.label)}"]`);
  }
  for (const edge of model.edges) {
    lines.push(`  ${edge.from} -->|${escapeMermaid(edge.label)}| ${edge.to}`);
  }
  return `${lines.join("\n")}\n`;
}

function escapeD2(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeMermaid(value: string): string {
  return value.replace(/"/g, "'");
}

function parseSurfaceProvidesCalls(body: string): string[] {
  const calls: string[] = [];
  const sectionPattern = /^(\s*)provides\s*:\s*$/gm;
  for (
    let section = sectionPattern.exec(body);
    section;
    section = sectionPattern.exec(body)
  ) {
    const baseIndent = (section[1] ?? "").length;
    let cursor = section.index + section[0].length + 1;
    while (cursor < body.length) {
      const lineEnd = body.indexOf("\n", cursor);
      const end = lineEnd >= 0 ? lineEnd : body.length;
      const line = body.slice(cursor, end);
      const trimmed = line.trim();
      const indent = (line.match(/^\s*/) ?? [""])[0].length;
      if (trimmed.length === 0) {
        cursor = end + 1;
        continue;
      }
      if (indent <= baseIndent) {
        break;
      }
      const match = line.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
      if (match) {
        calls.push(match[1]);
      }
      cursor = end + 1;
    }
  }
  return calls;
}

function mergeModels(models: DiagramModel[]): DiagramModel {
  const nodes = new Map<string, DiagramNode>();
  const edges = new Map<string, DiagramEdge>();

  for (const model of models) {
    for (const node of model.nodes) {
      nodes.set(node.id, node);
    }
    for (const edge of model.edges) {
      edges.set(`${edge.from}|${edge.to}|${edge.label}`, edge);
    }
  }

  return {
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...edges.values()].sort((a, b) =>
      `${a.from}|${a.to}|${a.label}`.localeCompare(
        `${b.from}|${b.to}|${b.label}`,
      ),
    ),
  };
}

function resolveInputs(inputs: string[]): string[] {
  const files = new Set<string>();
  const cwd = process.cwd();
  let recursiveCache: string[] | null = null;

  for (const input of inputs) {
    const resolved = path.resolve(cwd, input);
    if (fs.existsSync(resolved)) {
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        for (const filePath of walkAlliumFiles(resolved)) {
          files.add(filePath);
        }
      } else if (stat.isFile() && resolved.endsWith(".allium")) {
        files.add(resolved);
      }
      continue;
    }

    if (recursiveCache === null) {
      recursiveCache = walkAllFiles(cwd);
    }

    const matcher = wildcardToRegex(input);
    for (const candidate of recursiveCache) {
      const relative = path.relative(cwd, candidate).split(path.sep).join("/");
      if (matcher.test(relative) && candidate.endsWith(".allium")) {
        files.add(candidate);
      }
    }
  }

  return [...files].sort();
}

function walkAlliumFiles(root: string): string[] {
  return walkAllFiles(root).filter((entry) => entry.endsWith(".allium"));
}

function walkAllFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        out.push(fullPath);
      }
    }
  }

  return out;
}

function wildcardToRegex(pattern: string): RegExp {
  const escaped = pattern
    .split(path.sep)
    .join("/")
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, ".*")
    .replace(/\?/g, ".");

  return new RegExp(`^${escaped}$`);
}

const exitCode = main(process.argv.slice(2));
process.exitCode = exitCode;
