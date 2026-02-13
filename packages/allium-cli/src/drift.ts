#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildDriftReport,
  extractAlliumDiagnosticCodes,
  extractSpecCommands,
  extractSpecDiagnosticCodes,
  renderDriftMarkdown,
} from "./spec-drift";

type DriftOutputFormat = "text" | "json";

interface ParsedArgs {
  sources: string[];
  specs: string[];
  commandsFrom?: string;
  skipCommands: boolean;
  format: DriftOutputFormat;
}

interface DriftOutputPayload {
  diagnostics: ReturnType<typeof buildDriftReport>;
  commands: ReturnType<typeof buildDriftReport>;
  hasDrift: boolean;
}

function main(argv: string[]): number {
  const parsed = parseArgs(argv);
  if (!parsed) {
    return 2;
  }

  const sourceFiles = collectFiles(parsed.sources, ".ts");
  const specFiles = collectFiles(parsed.specs, ".allium");
  if (sourceFiles.length === 0) {
    process.stderr.write("No TypeScript source files found for --source.\n");
    return 2;
  }
  if (specFiles.length === 0) {
    process.stderr.write("No .allium files found for --specs.\n");
    return 2;
  }

  const sourceText = sourceFiles
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
  const specText = specFiles
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  const diagnostics = buildDriftReport(
    extractAlliumDiagnosticCodes(sourceText),
    extractSpecDiagnosticCodes(specText),
  );
  let commands: ReturnType<typeof buildDriftReport>;
  try {
    commands = parsed.skipCommands
      ? buildDriftReport(new Set<string>(), new Set<string>())
      : buildCommandDrift(parsed.commandsFrom, specText);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Failed to read commands file"}\n`,
    );
    return 2;
  }
  const hasDrift =
    diagnostics.missingInSpecs.length > 0 ||
    diagnostics.staleInSpecs.length > 0 ||
    commands.missingInSpecs.length > 0 ||
    commands.staleInSpecs.length > 0;

  if (parsed.format === "json") {
    const payload: DriftOutputPayload = {
      diagnostics,
      commands,
      hasDrift,
    };
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else if (!hasDrift) {
    process.stdout.write("Spec drift check passed.\n");
  } else {
    process.stderr.write("Spec drift detected.\n");
    process.stderr.write(renderDriftMarkdown(diagnostics, commands));
  }

  return hasDrift ? 1 : 0;
}

function parseArgs(argv: string[]): ParsedArgs | null {
  const parsed: ParsedArgs = {
    sources: ["extensions/allium/src/language-tools"],
    specs: ["docs/project/specs"],
    commandsFrom: "extensions/allium/package.json",
    skipCommands: false,
    format: "text",
  };
  let customSource = false;
  let customSpecs = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        printUsage("Expected a path after --source");
        return null;
      }
      if (!customSource) {
        parsed.sources = [];
        customSource = true;
      }
      parsed.sources.push(next);
      i += 1;
      continue;
    }
    if (arg === "--specs") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        printUsage("Expected a path after --specs");
        return null;
      }
      if (!customSpecs) {
        parsed.specs = [];
        customSpecs = true;
      }
      parsed.specs.push(next);
      i += 1;
      continue;
    }
    if (arg === "--commands-from") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        printUsage("Expected a path after --commands-from");
        return null;
      }
      parsed.commandsFrom = next;
      i += 1;
      continue;
    }
    if (arg === "--skip-commands") {
      parsed.skipCommands = true;
      continue;
    }
    if (arg === "--format") {
      const next = argv[i + 1];
      if (next !== "text" && next !== "json") {
        printUsage("Expected --format text|json");
        return null;
      }
      parsed.format = next;
      i += 1;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printUsage();
      return null;
    }
    printUsage(`Unknown option: ${arg}`);
    return null;
  }
  return parsed;
}

function printUsage(error?: string): void {
  if (error) {
    process.stderr.write(`${error}\n`);
  }
  process.stderr.write(
    [
      "Usage: allium-drift [options]",
      "",
      "Options:",
      "  --source <path>         TypeScript implementation file or directory (repeatable).",
      "  --specs <path>          Allium spec file or directory (repeatable).",
      "  --commands-from <path>  JSON file containing implemented command IDs.",
      "  --skip-commands         Compare diagnostics only.",
      "  --format text|json      Output format (default: text).",
      "  --help                  Show this message.",
      "",
      "Defaults:",
      "  --source extensions/allium/src/language-tools",
      "  --specs docs/project/specs",
      "  --commands-from extensions/allium/package.json",
      "",
    ].join("\n"),
  );
}

function collectFiles(inputs: string[], extension: string): string[] {
  const out = new Set<string>();
  for (const input of inputs) {
    const resolved = path.resolve(input);
    if (!fs.existsSync(resolved)) {
      continue;
    }
    const stat = fs.statSync(resolved);
    if (stat.isFile() && resolved.endsWith(extension)) {
      out.add(resolved);
      continue;
    }
    if (stat.isDirectory()) {
      for (const filePath of walk(resolved)) {
        if (filePath.endsWith(extension)) {
          out.add(filePath);
        }
      }
    }
  }
  return [...out].sort();
}

function walk(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
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

function buildCommandDrift(
  commandsFilePath: string | undefined,
  specText: string,
): ReturnType<typeof buildDriftReport> {
  if (!commandsFilePath) {
    return buildDriftReport(new Set<string>(), extractSpecCommands(specText));
  }
  const resolved = path.resolve(commandsFilePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Commands file not found: ${commandsFilePath}. Use --skip-commands to disable command drift checks.`,
    );
  }
  const packageJson = JSON.parse(fs.readFileSync(resolved, "utf8")) as {
    contributes?: { commands?: Array<{ command?: string }> };
    commands?: string[];
  };
  const implementedCommands = new Set<string>();
  for (const commandEntry of packageJson.contributes?.commands ?? []) {
    if (typeof commandEntry.command === "string") {
      implementedCommands.add(commandEntry.command);
    }
  }
  for (const commandName of packageJson.commands ?? []) {
    implementedCommands.add(commandName);
  }
  return buildDriftReport(implementedCommands, extractSpecCommands(specText));
}

process.exitCode = main(process.argv.slice(2));
