#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";

interface ParsedArgs {
  checkOnly: boolean;
  indentWidth: number;
  topLevelSpacing: number;
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
    const formatted = formatAlliumText(original, {
      indentWidth: parsed.indentWidth,
      topLevelSpacing: parsed.topLevelSpacing,
    });
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

export interface FormatOptions {
  indentWidth?: number;
  topLevelSpacing?: number;
}

export function formatAlliumText(
  text: string,
  options: FormatOptions = {},
): string {
  const indentWidth = clampInteger(options.indentWidth ?? 4, 1, 8);
  const topLevelSpacing = clampInteger(options.topLevelSpacing ?? 1, 0, 3);
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
      blankLinesAtEnd(formattedLines) < topLevelSpacing
    ) {
      while (blankLinesAtEnd(formattedLines) < topLevelSpacing) {
        formattedLines.push("");
      }
    }

    const indent = " ".repeat(indentLevel * indentWidth);
    formattedLines.push(`${indent}${normalizePipeSpacing(trimmed)}`);

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
  let indentWidth = 4;
  let topLevelSpacing = 1;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--check") {
      checkOnly = true;
      continue;
    }
    if (arg === "--indent-width") {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value < 1 || value > 8) {
        printUsage("Expected --indent-width <1-8>");
        return null;
      }
      indentWidth = value;
      i += 1;
      continue;
    }
    if (arg === "--top-level-spacing") {
      const value = Number(argv[i + 1]);
      if (!Number.isInteger(value) || value < 0 || value > 3) {
        printUsage("Expected --top-level-spacing <0-3>");
        return null;
      }
      topLevelSpacing = value;
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

  return { checkOnly, indentWidth, topLevelSpacing, inputs };
}

function printUsage(error?: string): void {
  if (error) {
    process.stderr.write(`${error}\n`);
  }
  process.stderr.write(
    "Usage: node dist/src/format.js [--check] [--indent-width N] [--top-level-spacing N] <file|directory|glob> [...]\n",
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

function blankLinesAtEnd(lines: string[]): number {
  let count = 0;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (lines[i] !== "") {
      break;
    }
    count += 1;
  }
  return count;
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function normalizePipeSpacing(line: string): string {
  const trimmed = line.trim();
  if (trimmed.startsWith("--") || !line.includes("|")) {
    return line;
  }
  return line.replace(/\s*\|\s*/g, " | ");
}

if (require.main === module) {
  const exitCode = main(process.argv.slice(2));
  process.exitCode = exitCode;
}
