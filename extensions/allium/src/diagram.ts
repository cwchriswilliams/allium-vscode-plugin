#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import {
  applyDiagramFilters,
  buildDiagramResult,
  renderDiagram,
  type DiagramBuildResult,
  type DiagramFilterOptions,
  type DiagramFormat,
  type DiagramModel,
  type DiagramNodeKind,
} from "./language-tools/diagram";

type SplitMode = "module";

interface ParsedArgs {
  format: DiagramFormat;
  outputPath?: string;
  strict: boolean;
  split?: SplitMode;
  filters: DiagramFilterOptions;
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

  const diagramResults = files.map((filePath) => {
    const text = fs.readFileSync(filePath, "utf8");
    return { filePath, result: buildDiagramResult(text) };
  });

  const issueCount = writeIssues(diagramResults);
  if (parsed.strict && issueCount > 0) {
    process.stderr.write(
      "Diagram extraction produced skipped declaration findings in strict mode.\n",
    );
    return 1;
  }

  if (parsed.split === "module") {
    if (!parsed.outputPath) {
      process.stderr.write(
        "Expected --output <directory> when using --split module.\n",
      );
      return 2;
    }
    writeSplitByModule(diagramResults, parsed);
    return 0;
  }

  const combined = mergeModels(
    diagramResults.map((entry) => entry.result.model),
  );
  const filtered = applyDiagramFilters(combined, parsed.filters);
  const output = renderDiagram(filtered, parsed.format);
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
  let strict = false;
  let split: SplitMode | undefined;
  const focusNames: string[] = [];
  const kinds: DiagramNodeKind[] = [];
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
    if (arg === "--focus") {
      const focusArg = argv[i + 1];
      if (!focusArg) {
        printUsage("Expected comma-delimited names after --focus");
        return null;
      }
      focusNames.push(...focusArg.split(","));
      i += 1;
      continue;
    }
    if (arg === "--kind") {
      const kindArg = argv[i + 1];
      if (!kindArg) {
        printUsage("Expected comma-delimited kinds after --kind");
        return null;
      }
      for (const kind of kindArg.split(",").map((value) => value.trim())) {
        if (!isDiagramKind(kind)) {
          printUsage(`Unsupported diagram kind '${kind}'`);
          return null;
        }
        kinds.push(kind);
      }
      i += 1;
      continue;
    }
    if (arg === "--strict") {
      strict = true;
      continue;
    }
    if (arg === "--split") {
      const splitArg = argv[i + 1];
      if (splitArg !== "module") {
        printUsage("Expected --split module");
        return null;
      }
      split = splitArg;
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

  return {
    format,
    outputPath,
    strict,
    split,
    filters: {
      focusNames,
      kinds,
    },
    inputs,
  };
}

function printUsage(error?: string): void {
  if (error) {
    process.stderr.write(`${error}\n`);
  }
  process.stderr.write(
    "Usage: node dist/src/diagram.js [--format d2|mermaid] [--output path] [--focus names] [--kind kinds] [--split module] [--strict] <file|directory|glob> [...]\n",
  );
}

function writeIssues(
  diagramResults: Array<{ filePath: string; result: DiagramBuildResult }>,
): number {
  let issueCount = 0;
  for (const entry of diagramResults) {
    for (const issue of entry.result.issues) {
      issueCount += 1;
      const relPath =
        path.relative(process.cwd(), entry.filePath) || entry.filePath;
      process.stderr.write(
        `${relPath}:${issue.line + 1}:1 warning ${issue.code} ${issue.message}\n`,
      );
    }
  }
  return issueCount;
}

function writeSplitByModule(
  diagramResults: Array<{ filePath: string; result: DiagramBuildResult }>,
  parsed: ParsedArgs,
): void {
  const perModule = new Map<string, DiagramModel[]>();

  for (const entry of diagramResults) {
    const moduleNames =
      entry.result.modules.length > 0 ? entry.result.modules : ["root"];
    for (const moduleName of moduleNames) {
      const existing = perModule.get(moduleName) ?? [];
      existing.push(entry.result.model);
      perModule.set(moduleName, existing);
    }
  }

  const outputDir = path.resolve(process.cwd(), parsed.outputPath ?? "");
  fs.mkdirSync(outputDir, { recursive: true });

  const extension = parsed.format === "mermaid" ? "mmd" : "d2";
  for (const [moduleName, models] of [...perModule.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    const merged = mergeModels(models);
    const filtered = applyDiagramFilters(merged, parsed.filters);
    const output = renderDiagram(filtered, parsed.format);
    const fileName = `${sanitizePathToken(moduleName)}.${extension}`;
    const filePath = path.join(outputDir, fileName);
    fs.writeFileSync(filePath, output, "utf8");
    process.stdout.write(`Wrote ${parsed.format} diagram to ${filePath}\n`);
  }
}

function isDiagramKind(value: string): value is DiagramNodeKind {
  return (
    value === "entity" ||
    value === "value" ||
    value === "variant" ||
    value === "rule" ||
    value === "surface" ||
    value === "actor" ||
    value === "enum" ||
    value === "trigger"
  );
}

function sanitizePathToken(value: string): string {
  return value.replace(/[^A-Za-z0-9_-]/g, "-");
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
