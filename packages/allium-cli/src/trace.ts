#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

type TraceOutputFormat = "text" | "json" | "junit";

interface ParsedArgs {
  format: TraceOutputFormat;
  byFile: boolean;
  strict: boolean;
  allowlistPath?: string;
  testInputs: string[];
  specInputs: string[];
}

interface RuleReference {
  name: string;
  filePath: string;
}

interface TraceResult {
  totalRules: number;
  coveredRules: number;
  uncovered: RuleReference[];
  staleAllowlistEntries: string[];
  byFile: FileCoverage[];
}

interface FileCoverage {
  filePath: string;
  totalRules: number;
  coveredRules: number;
  uncoveredRules: RuleReference[];
}

function main(argv: string[]): number {
  const parsed = parseArgs(argv);
  if (!parsed) {
    return 2;
  }

  const specFiles = resolveInputs(parsed.specInputs, (filePath) =>
    filePath.endsWith(".allium"),
  );
  if (specFiles.length === 0) {
    process.stderr.write(
      "No .allium files found for the provided spec inputs.\n",
    );
    return 2;
  }

  const testFiles = resolveInputs(parsed.testInputs, isTestFilePath);
  if (testFiles.length === 0) {
    process.stderr.write("No test files found for the provided test inputs.\n");
    return 2;
  }

  const rules = collectRules(specFiles);
  const allowlist = parsed.allowlistPath
    ? readAllowlist(parsed.allowlistPath)
    : new Set<string>();
  const testBodies = testFiles.map((filePath) =>
    fs.readFileSync(filePath, "utf8"),
  );
  const uncovered = rules.filter(
    (rule) =>
      !allowlist.has(rule.name) &&
      !testBodies.some((content) => content.includes(rule.name)),
  );
  const ruleNames = new Set(rules.map((rule) => rule.name));
  const staleAllowlistEntries = [...allowlist].filter(
    (name) => !ruleNames.has(name),
  );
  const byFile = parsed.byFile ? buildFileCoverage(rules, uncovered) : [];

  const result: TraceResult = {
    totalRules: rules.length,
    coveredRules: rules.length - uncovered.length,
    uncovered,
    staleAllowlistEntries,
    byFile,
  };

  renderOutput(parsed.format, result);
  if (parsed.strict && staleAllowlistEntries.length > 0) {
    return 1;
  }
  return uncovered.length > 0 ? 1 : 0;
}

function parseArgs(argv: string[]): ParsedArgs | null {
  const specInputs: string[] = [];
  const testInputs: string[] = [];
  let format: TraceOutputFormat = "text";
  let byFile = false;
  let strict = false;
  let allowlistPath: string | undefined;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--tests") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        printUsage("Expected a file, directory, or glob after --tests");
        return null;
      }
      testInputs.push(value);
      i += 1;
      continue;
    }
    if (arg === "--format") {
      const value = argv[i + 1];
      if (value !== "text" && value !== "json" && value !== "junit") {
        printUsage("Expected --format text|json|junit");
        return null;
      }
      format = value;
      i += 1;
      continue;
    }
    if (arg === "--junit") {
      format = "junit";
      continue;
    }
    if (arg === "--by-file") {
      byFile = true;
      continue;
    }
    if (arg === "--strict") {
      strict = true;
      continue;
    }
    if (arg === "--allowlist") {
      const value = argv[i + 1];
      if (!value || value.startsWith("--")) {
        printUsage("Expected a path after --allowlist");
        return null;
      }
      allowlistPath = value;
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsage();
      return null;
    }
    specInputs.push(arg);
  }

  if (testInputs.length === 0) {
    printUsage("Provide at least one test input via --tests.");
    return null;
  }
  if (specInputs.length === 0) {
    printUsage("Provide at least one spec file, directory, or glob.");
    return null;
  }

  return { format, byFile, strict, allowlistPath, testInputs, specInputs };
}

function printUsage(error?: string): void {
  if (error) {
    process.stderr.write(`${error}\n`);
  }
  process.stderr.write(
    "Usage: allium-trace [--format text|json|junit] [--junit] [--by-file] [--strict] [--allowlist file] --tests <file|directory|glob> [--tests ...] <spec-file|directory|glob> [...]\n",
  );
}

function collectRules(specFiles: string[]): RuleReference[] {
  const dedupe = new Set<string>();
  const rules: RuleReference[] = [];
  const rulePattern = /^\s*rule\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm;
  for (const filePath of specFiles) {
    const text = fs.readFileSync(filePath, "utf8");
    for (
      let match = rulePattern.exec(text);
      match;
      match = rulePattern.exec(text)
    ) {
      const name = match[1];
      if (dedupe.has(name)) {
        continue;
      }
      dedupe.add(name);
      rules.push({ name, filePath });
    }
  }
  return rules;
}

function buildFileCoverage(
  rules: RuleReference[],
  uncovered: RuleReference[],
): FileCoverage[] {
  const uncoveredByFile = new Map<string, RuleReference[]>();
  for (const entry of uncovered) {
    const bucket = uncoveredByFile.get(entry.filePath);
    if (bucket) {
      bucket.push(entry);
    } else {
      uncoveredByFile.set(entry.filePath, [entry]);
    }
  }
  const rulesByFile = new Map<string, RuleReference[]>();
  for (const rule of rules) {
    const bucket = rulesByFile.get(rule.filePath);
    if (bucket) {
      bucket.push(rule);
    } else {
      rulesByFile.set(rule.filePath, [rule]);
    }
  }

  const out: FileCoverage[] = [];
  for (const [filePath, fileRules] of rulesByFile) {
    const fileUncovered = uncoveredByFile.get(filePath) ?? [];
    out.push({
      filePath,
      totalRules: fileRules.length,
      coveredRules: fileRules.length - fileUncovered.length,
      uncoveredRules: fileUncovered,
    });
  }
  return out.sort((a, b) => a.filePath.localeCompare(b.filePath));
}

function renderOutput(format: TraceOutputFormat, result: TraceResult): void {
  if (format === "json") {
    process.stdout.write(
      `${JSON.stringify(
        {
          totalRules: result.totalRules,
          coveredRules: result.coveredRules,
          uncoveredRules: result.uncovered.map((entry) => ({
            name: entry.name,
            filePath: entry.filePath,
          })),
          staleAllowlistEntries: result.staleAllowlistEntries,
          byFile: result.byFile.map((entry) => ({
            filePath: entry.filePath,
            totalRules: entry.totalRules,
            coveredRules: entry.coveredRules,
            uncoveredRules: entry.uncoveredRules.map((rule) => rule.name),
          })),
        },
        null,
        2,
      )}\n`,
    );
    return;
  }
  if (format === "junit") {
    process.stdout.write(`${renderJunit(result)}\n`);
    return;
  }

  const coverage =
    result.totalRules === 0
      ? 100
      : (result.coveredRules / result.totalRules) * 100;
  process.stdout.write(
    `Rules: ${result.totalRules} total, ${result.coveredRules} covered, ${result.uncovered.length} uncovered (${coverage.toFixed(1)}%).\n`,
  );
  if (result.uncovered.length > 0) {
    process.stdout.write("Uncovered rules:\n");
    for (const entry of result.uncovered) {
      const relPath =
        path.relative(process.cwd(), entry.filePath) || entry.filePath;
      process.stdout.write(`- ${entry.name} (${relPath})\n`);
    }
  } else {
    process.stdout.write("All spec rules are referenced by tests.\n");
  }
  if (result.staleAllowlistEntries.length > 0) {
    process.stdout.write("Stale allowlist entries:\n");
    for (const name of result.staleAllowlistEntries) {
      process.stdout.write(`- ${name}\n`);
    }
  }
  if (result.byFile.length > 0) {
    process.stdout.write("Coverage by file:\n");
    for (const entry of result.byFile) {
      process.stdout.write(
        `- ${path.relative(process.cwd(), entry.filePath) || entry.filePath}: ${entry.coveredRules}/${entry.totalRules} covered\n`,
      );
    }
  }
}

function renderJunit(result: TraceResult): string {
  const testcases: string[] = [];
  for (const rule of result.uncovered) {
    const relPath =
      path.relative(process.cwd(), rule.filePath) || rule.filePath;
    testcases.push(
      `    <testcase name="${escapeXml(rule.name)}" classname="allium-trace.${escapeXml(relPath)}"><failure message="Rule is not referenced by tests"/></testcase>`,
    );
  }
  if (testcases.length === 0) {
    testcases.push(
      '    <testcase name="allium-trace-coverage" classname="allium-trace"/>',
    );
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<testsuite name="allium-trace" tests="${result.totalRules}" failures="${result.uncovered.length}">`,
    ...testcases,
    "</testsuite>",
  ].join("\n");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function readAllowlist(filePath: string): Set<string> {
  const fullPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    return new Set<string>();
  }
  const raw = fs.readFileSync(fullPath, "utf8");
  return new Set(
    raw
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith("#")),
  );
}

function isTestFilePath(filePath: string): boolean {
  const base = path.basename(filePath);
  if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(base)) {
    return false;
  }
  return base.includes(".test.") || base.includes(".spec.");
}

function resolveInputs(
  inputs: string[],
  includeFile: (filePath: string) => boolean,
): string[] {
  const files = new Set<string>();
  const cwd = process.cwd();
  let recursiveCache: string[] | null = null;

  for (const input of inputs) {
    const resolved = path.resolve(cwd, input);
    if (fs.existsSync(resolved)) {
      const stat = fs.statSync(resolved);
      if (stat.isDirectory()) {
        for (const filePath of walkAllFiles(resolved)) {
          if (includeFile(filePath)) {
            files.add(filePath);
          }
        }
      } else if (stat.isFile() && includeFile(resolved)) {
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
      if (matcher.test(relative) && includeFile(candidate)) {
        files.add(candidate);
      }
    }
  }

  return [...files].sort();
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

if (require.main === module) {
  const exitCode = main(process.argv.slice(2));
  process.exitCode = exitCode;
}
