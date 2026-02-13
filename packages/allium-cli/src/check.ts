#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import { analyzeAllium, type DiagnosticsMode, type Finding } from "./analyzer";

type CheckOutputFormat = "text" | "json" | "sarif";

interface ParsedArgs {
  mode: DiagnosticsMode;
  autofix: boolean;
  format: CheckOutputFormat;
  baselinePath?: string;
  writeBaselinePath?: string;
  inputs: string[];
}

interface TextEdit {
  offset: number;
  text: string;
}

interface FindingRecord {
  filePath: string;
  finding: Finding;
  fingerprint: string;
}

interface BaselineFile {
  version: 1;
  findings: Array<{ fingerprint: string }>;
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

  const allFindings: FindingRecord[] = [];
  for (const filePath of files) {
    let text = fs.readFileSync(filePath, "utf8");

    if (parsed.autofix) {
      const fixed = applyAutoFixes(text, parsed.mode);
      if (fixed !== text) {
        fs.writeFileSync(filePath, fixed, "utf8");
        text = fixed;
        if (parsed.format === "text") {
          process.stdout.write(
            `${path.relative(process.cwd(), filePath) || filePath}: autofixed\n`,
          );
        }
      }
    }

    const findings = analyzeAllium(text, { mode: parsed.mode });
    for (const finding of findings) {
      allFindings.push({
        filePath,
        finding,
        fingerprint: findingFingerprint(filePath, finding),
      });
    }
  }

  if (parsed.writeBaselinePath) {
    writeBaseline(parsed.writeBaselinePath, allFindings);
    if (parsed.format === "text") {
      process.stdout.write(
        `Wrote baseline with ${allFindings.length} finding fingerprints to ${parsed.writeBaselinePath}\n`,
      );
    }
    return 0;
  }

  const baselineFingerprints = parsed.baselinePath
    ? loadBaselineFingerprints(parsed.baselinePath)
    : new Set<string>();
  const filtered = allFindings.filter(
    (record) => !baselineFingerprints.has(record.fingerprint),
  );
  const suppressedCount = allFindings.length - filtered.length;

  let hasNonInfo = false;
  for (const record of filtered) {
    if (record.finding.severity !== "info") {
      hasNonInfo = true;
      break;
    }
  }

  renderOutput(parsed.format, filtered, suppressedCount);

  if (parsed.format === "text" && !hasNonInfo) {
    process.stdout.write("No blocking findings.\n");
  }

  return hasNonInfo ? 1 : 0;
}

function parseArgs(argv: string[]): ParsedArgs | null {
  let mode: DiagnosticsMode = "strict";
  let autofix = false;
  let format: CheckOutputFormat = "text";
  let baselinePath: string | undefined;
  let writeBaselinePath: string | undefined;
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

    if (arg === "--autofix") {
      autofix = true;
      continue;
    }

    if (arg === "--format") {
      const formatArg = argv[i + 1];
      if (
        formatArg !== "text" &&
        formatArg !== "json" &&
        formatArg !== "sarif"
      ) {
        printUsage("Expected --format text|json|sarif");
        return null;
      }
      format = formatArg;
      i += 1;
      continue;
    }

    if (arg === "--baseline") {
      const next = argv[i + 1];
      if (!next) {
        printUsage("Expected a path after --baseline");
        return null;
      }
      baselinePath = next;
      i += 1;
      continue;
    }

    if (arg === "--write-baseline") {
      const next = argv[i + 1];
      if (!next) {
        printUsage("Expected a path after --write-baseline");
        return null;
      }
      writeBaselinePath = next;
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
    mode,
    autofix,
    format,
    baselinePath,
    writeBaselinePath,
    inputs,
  };
}

function printUsage(error?: string): void {
  if (error) {
    process.stderr.write(`${error}\n`);
  }
  process.stderr.write(
    "Usage: allium-check [--mode strict|relaxed] [--autofix] [--format text|json|sarif] [--baseline file] [--write-baseline file] <file|directory|glob> [...]\n",
  );
}

function applyAutoFixes(text: string, mode: DiagnosticsMode): string {
  let current = text;
  for (let i = 0; i < 5; i += 1) {
    const findings = analyzeAllium(current, { mode });
    const edits = buildSafeEdits(current, findings);
    if (edits.length === 0) {
      break;
    }
    current = applyEdits(current, edits);
  }
  return current;
}

function buildSafeEdits(text: string, findings: Finding[]): TextEdit[] {
  const lineStarts = buildLineStarts(text);
  const edits = new Map<string, TextEdit>();

  for (const finding of findings) {
    if (finding.code === "allium.rule.missingEnsures") {
      const lineStart = lineStarts[finding.start.line] ?? text.length;
      const key = `${lineStart}:ensures`;
      edits.set(key, { offset: lineStart, text: "    ensures: TODO()\n" });
    }

    if (finding.code === "allium.temporal.missingGuard") {
      const whenLine = finding.start.line;
      const currentLineStart = lineStarts[whenLine] ?? 0;
      const nextLineStart = lineStarts[whenLine + 1] ?? text.length;
      const lineText = text.slice(
        currentLineStart,
        text.indexOf("\n", currentLineStart) >= 0
          ? text.indexOf("\n", currentLineStart)
          : text.length,
      );
      const indent = lineText.match(/^\s*/)?.[0] ?? "    ";
      const key = `${nextLineStart}:guard`;
      edits.set(key, {
        offset: nextLineStart,
        text: `${indent}requires: /* add temporal guard */\n`,
      });
    }
  }

  return [...edits.values()].sort((a, b) => b.offset - a.offset);
}

function applyEdits(text: string, edits: TextEdit[]): string {
  let out = text;
  for (const edit of edits) {
    out = `${out.slice(0, edit.offset)}${edit.text}${out.slice(edit.offset)}`;
  }
  return out;
}

function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      starts.push(i + 1);
    }
  }
  return starts;
}

function findingFingerprint(filePath: string, finding: Finding): string {
  const relPath = path.relative(process.cwd(), filePath) || filePath;
  return `${relPath}|${finding.start.line}|${finding.start.character}|${finding.code}|${finding.message}`;
}

function writeBaseline(outputPath: string, findings: FindingRecord[]): void {
  const fullPath = path.resolve(process.cwd(), outputPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  const unique = new Set(findings.map((record) => record.fingerprint));
  const baseline: BaselineFile = {
    version: 1,
    findings: [...unique].sort().map((fingerprint) => ({ fingerprint })),
  };
  fs.writeFileSync(fullPath, `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
}

function loadBaselineFingerprints(filePath: string): Set<string> {
  const fullPath = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(fullPath)) {
    return new Set<string>();
  }
  try {
    const parsed = JSON.parse(
      fs.readFileSync(fullPath, "utf8"),
    ) as Partial<BaselineFile>;
    if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.findings)) {
      return new Set<string>();
    }
    return new Set(
      parsed.findings
        .map((item) => item?.fingerprint)
        .filter((item): item is string => typeof item === "string"),
    );
  } catch {
    return new Set<string>();
  }
}

function renderOutput(
  format: CheckOutputFormat,
  findings: FindingRecord[],
  suppressedCount: number,
): void {
  if (format === "json") {
    process.stdout.write(`${renderJson(findings, suppressedCount)}\n`);
    return;
  }
  if (format === "sarif") {
    process.stdout.write(`${renderSarif(findings)}\n`);
    return;
  }
  for (const record of findings) {
    process.stdout.write(formatFinding(record.filePath, record.finding));
    process.stdout.write("\n");
  }
  if (suppressedCount > 0) {
    process.stdout.write(
      `Suppressed ${suppressedCount} finding(s) from baseline.\n`,
    );
  }
}

function renderJson(
  findings: FindingRecord[],
  suppressedCount: number,
): string {
  const errors = findings.filter(
    (record) => record.finding.severity === "error",
  ).length;
  const warnings = findings.filter(
    (record) => record.finding.severity === "warning",
  ).length;
  const infos = findings.filter(
    (record) => record.finding.severity === "info",
  ).length;
  return JSON.stringify(
    {
      summary: {
        findings: findings.length,
        errors,
        warnings,
        infos,
        suppressed: suppressedCount,
      },
      findings: findings.map((record) => ({
        file: path.relative(process.cwd(), record.filePath) || record.filePath,
        line: record.finding.start.line + 1,
        character: record.finding.start.character + 1,
        severity: record.finding.severity,
        code: record.finding.code,
        message: record.finding.message,
        fingerprint: record.fingerprint,
      })),
    },
    null,
    2,
  );
}

function renderSarif(findings: FindingRecord[]): string {
  const toLevel = (
    severity: Finding["severity"],
  ): "error" | "warning" | "note" => {
    if (severity === "error") {
      return "error";
    }
    if (severity === "warning") {
      return "warning";
    }
    return "note";
  };

  const sarif = {
    version: "2.1.0",
    $schema: "https://json.schemastore.org/sarif-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "allium-check",
            rules: uniqueRuleDescriptors(findings),
          },
        },
        results: findings.map((record) => ({
          ruleId: record.finding.code,
          level: toLevel(record.finding.severity),
          message: { text: record.finding.message },
          locations: [
            {
              physicalLocation: {
                artifactLocation: {
                  uri:
                    path.relative(process.cwd(), record.filePath) ||
                    record.filePath,
                },
                region: {
                  startLine: record.finding.start.line + 1,
                  startColumn: record.finding.start.character + 1,
                  endLine: record.finding.end.line + 1,
                  endColumn: record.finding.end.character + 1,
                },
              },
            },
          ],
        })),
      },
    ],
  };
  return JSON.stringify(sarif, null, 2);
}

function uniqueRuleDescriptors(
  findings: FindingRecord[],
): Array<{ id: string; shortDescription: { text: string } }> {
  const descriptors = new Map<
    string,
    { id: string; shortDescription: { text: string } }
  >();
  for (const record of findings) {
    if (!descriptors.has(record.finding.code)) {
      descriptors.set(record.finding.code, {
        id: record.finding.code,
        shortDescription: { text: record.finding.message },
      });
    }
  }
  return [...descriptors.values()];
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
