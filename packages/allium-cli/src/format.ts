#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

interface ParsedArgs {
  checkOnly: boolean;
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

  let changed = 0;
  for (const filePath of files) {
    const original = fs.readFileSync(filePath, "utf8");
    const formatted = formatAlliumText(original);
    if (formatted === original) {
      continue;
    }

    changed += 1;
    const relPath = path.relative(process.cwd(), filePath) || filePath;
    if (parsed.checkOnly) {
      process.stdout.write(`${relPath}: would format\n`);
    } else {
      fs.writeFileSync(filePath, formatted, "utf8");
      process.stdout.write(`${relPath}: formatted\n`);
    }
  }

  if (parsed.checkOnly) {
    if (changed > 0) {
      process.stderr.write(
        `${changed} file(s) need formatting. Run allium-format without --check.\n`,
      );
      return 1;
    }
    process.stdout.write("All files already formatted.\n");
    return 0;
  }

  process.stdout.write(
    changed > 0
      ? `Formatted ${changed} file(s).\n`
      : "No formatting changes needed.\n",
  );
  return 0;
}

export function formatAlliumText(text: string): string {
  const normalized = text.replace(/\r\n?/g, "\n");
  const lines = normalized
    .split("\n")
    .map((line) => line.replace(/[ \t]+$/g, ""));

  const formattedLines: string[] = [];
  let indentLevel = 0;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();

    if (trimmed.length === 0) {
      if (
        formattedLines.length > 0 &&
        formattedLines[formattedLines.length - 1] !== ""
      ) {
        formattedLines.push("");
      }
      continue;
    }

    const leadingClosers = countLeadingClosers(trimmed);
    indentLevel = Math.max(indentLevel - leadingClosers, 0);

    const isTopLevelDeclaration =
      indentLevel === 0 &&
      /^(entity|external\s+entity|value|variant|rule|surface|actor|config)\b/.test(
        trimmed,
      );
    if (
      isTopLevelDeclaration &&
      formattedLines.length > 0 &&
      formattedLines[formattedLines.length - 1] !== ""
    ) {
      formattedLines.push("");
    }

    const indent = " ".repeat(indentLevel * 4);
    formattedLines.push(`${indent}${trimmed}`);

    const openCount = countOccurrences(trimmed, "{");
    const closeCount = countOccurrences(trimmed, "}");
    const trailingCloseCount = Math.max(closeCount - leadingClosers, 0);
    indentLevel = Math.max(indentLevel + openCount - trailingCloseCount, 0);
  }

  const withoutTrailingBlankLines = formattedLines
    .join("\n")
    .replace(/\n+$/g, "");
  return `${withoutTrailingBlankLines}\n`;
}

function countOccurrences(text: string, token: string): number {
  return text.split(token).length - 1;
}

function countLeadingClosers(text: string): number {
  let count = 0;
  for (const char of text) {
    if (char === "}") {
      count += 1;
      continue;
    }
    break;
  }
  return count;
}

function parseArgs(argv: string[]): ParsedArgs | null {
  const inputs: string[] = [];
  let checkOnly = false;

  for (const arg of argv) {
    if (arg === "--check") {
      checkOnly = true;
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

  return { checkOnly, inputs };
}

function printUsage(error?: string): void {
  if (error) {
    process.stderr.write(`${error}\n`);
  }
  process.stderr.write(
    "Usage: node dist/src/format.js [--check] <file|directory|glob> [...]\n",
  );
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

if (require.main === module) {
  const exitCode = main(process.argv.slice(2));
  process.exitCode = exitCode;
}
