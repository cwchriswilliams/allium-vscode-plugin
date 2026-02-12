#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { analyzeAllium, type DiagnosticsMode, type Finding } from "./analyzer";

interface ParsedArgs {
  mode: DiagnosticsMode;
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

  let hasNonInfo = false;
  for (const filePath of files) {
    const text = fs.readFileSync(filePath, "utf8");
    const findings = analyzeAllium(text, { mode: parsed.mode });
    if (findings.length === 0) {
      continue;
    }

    for (const finding of findings) {
      if (finding.severity !== "info") {
        hasNonInfo = true;
      }
      process.stdout.write(formatFinding(filePath, finding));
      process.stdout.write("\n");
    }
  }

  if (!hasNonInfo) {
    process.stdout.write("No blocking findings.\n");
  }

  return hasNonInfo ? 1 : 0;
}

function parseArgs(argv: string[]): ParsedArgs | null {
  let mode: DiagnosticsMode = "strict";
  const inputs: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--mode") {
      const modeArg = argv[i + 1];
      if (modeArg !== "strict" && modeArg !== "relaxed") {
        printUsage("Expected --mode strict|relaxed");
        return null;
      }
      mode = modeArg;
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

  return { mode, inputs };
}

function printUsage(error?: string): void {
  if (error) {
    process.stderr.write(`${error}\n`);
  }
  process.stderr.write(
    "Usage: node dist/src/check.js [--mode strict|relaxed] <file|directory|glob> [...]\n",
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

function formatFinding(filePath: string, finding: Finding): string {
  const line = finding.start.line + 1;
  const character = finding.start.character + 1;
  const relPath = path.relative(process.cwd(), filePath) || filePath;
  return `${relPath}:${line}:${character} ${finding.severity} ${finding.code} ${finding.message}`;
}

const exitCode = main(process.argv.slice(2));
process.exitCode = exitCode;
