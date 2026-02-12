#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildDiagramModel,
  renderDiagram,
  type DiagramFormat,
  type DiagramModel,
} from "./language-tools/diagram";

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
    files.map((filePath) => {
      const text = fs.readFileSync(filePath, "utf8");
      return buildDiagramModel(text);
    }),
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
    "Usage: node dist/src/diagram.js [--format d2|mermaid] [--output path] <file|directory|glob> [...]\n",
  );
}

function mergeModels(models: DiagramModel[]): DiagramModel {
  const nodes = new Map<string, DiagramModel["nodes"][number]>();
  const edges = new Map<string, DiagramModel["edges"][number]>();

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
    edges: [...edges.values()].sort((a, b) => {
      const aKey = `${a.from}|${a.to}|${a.label}`;
      const bKey = `${b.from}|${b.to}|${b.label}`;
      return aKey.localeCompare(bKey);
    }),
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
