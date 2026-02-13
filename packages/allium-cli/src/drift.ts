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
  sourceExtensions: string[];
  excludeDirs: string[];
  diagnosticsManifestPath?: string;
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

interface AlliumConfig {
  drift?: {
    sources?: string[];
    sourceExtensions?: string[];
    excludeDirs?: string[];
    diagnosticsFrom?: string;
    specs?: string[];
    commandsFrom?: string;
    skipCommands?: boolean;
    format?: DriftOutputFormat;
  };
}

const DEFAULT_DRIFT_EXCLUDE_DIRS = [
  ".git",
  "node_modules",
  "dist",
  "build",
  "target",
  "out",
  ".next",
  ".venv",
  "venv",
  "__pycache__",
];

function main(argv: string[]): number {
  const parsed = parseArgs(argv);
  if (!parsed) {
    return 2;
  }

  const specFiles = collectFiles(parsed.specs, [".allium"], parsed.excludeDirs);
  if (specFiles.length === 0) {
    process.stderr.write("No .allium files found for --specs.\n");
    return 2;
  }

  const specText = specFiles
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  let implementedDiagnostics: Set<string>;
  let commands: ReturnType<typeof buildDriftReport>;
  try {
    implementedDiagnostics = readImplementedDiagnostics(parsed);
    commands = parsed.skipCommands
      ? buildDriftReport(new Set<string>(), new Set<string>())
      : buildCommandDrift(parsed.commandsFrom, specText);
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : "Failed to load drift inputs"}\n`,
    );
    return 2;
  }

  if (implementedDiagnostics.size === 0) {
    process.stderr.write(
      "No implemented diagnostics were discovered. Provide --source/--source-ext or --diagnostics-from.\n",
    );
    return 2;
  }

  const diagnostics = buildDriftReport(
    implementedDiagnostics,
    extractSpecDiagnosticCodes(specText),
  );
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
  let configPath = "allium.config.json";
  let useConfig = true;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--config" && argv[i + 1]) {
      configPath = argv[i + 1];
      i += 1;
      continue;
    }
    if (argv[i] === "--no-config") {
      useConfig = false;
    }
  }
  const config = useConfig ? readAlliumConfig(configPath) : {};

  const parsed: ParsedArgs = {
    sources: [...(config.drift?.sources ?? [])],
    sourceExtensions: [...(config.drift?.sourceExtensions ?? [".ts"])],
    excludeDirs: [...(config.drift?.excludeDirs ?? DEFAULT_DRIFT_EXCLUDE_DIRS)],
    diagnosticsManifestPath: config.drift?.diagnosticsFrom,
    specs: [...(config.drift?.specs ?? [])],
    commandsFrom: config.drift?.commandsFrom,
    skipCommands: config.drift?.skipCommands ?? false,
    format: config.drift?.format ?? "text",
  };

  let resetSources = false;
  let resetSpecs = false;
  let resetSourceExts = false;
  let resetExcludeDirs = false;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--source") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        printUsage("Expected a path after --source");
        return null;
      }
      if (!resetSources) {
        parsed.sources = [];
        resetSources = true;
      }
      parsed.sources.push(next);
      i += 1;
      continue;
    }
    if (arg === "--source-ext") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        printUsage("Expected an extension after --source-ext");
        return null;
      }
      if (!resetSourceExts) {
        parsed.sourceExtensions = [];
        resetSourceExts = true;
      }
      for (const ext of next.split(",")) {
        const value = ext.trim();
        if (value.length === 0) {
          continue;
        }
        parsed.sourceExtensions.push(
          value.startsWith(".")
            ? value.toLowerCase()
            : `.${value.toLowerCase()}`,
        );
      }
      i += 1;
      continue;
    }
    if (arg === "--diagnostics-from") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        printUsage("Expected a path after --diagnostics-from");
        return null;
      }
      parsed.diagnosticsManifestPath = next;
      i += 1;
      continue;
    }
    if (arg === "--exclude-dir") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        printUsage("Expected a directory name after --exclude-dir");
        return null;
      }
      if (!resetExcludeDirs) {
        parsed.excludeDirs = [];
        resetExcludeDirs = true;
      }
      parsed.excludeDirs.push(next.trim());
      i += 1;
      continue;
    }
    if (arg === "--specs") {
      const next = argv[i + 1];
      if (!next || next.startsWith("--")) {
        printUsage("Expected a path after --specs");
        return null;
      }
      if (!resetSpecs) {
        parsed.specs = [];
        resetSpecs = true;
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
    if (arg === "--config") {
      i += 1;
      continue;
    }
    if (arg === "--no-config") {
      continue;
    }
    printUsage(`Unknown option: ${arg}`);
    return null;
  }

  if (parsed.specs.length === 0) {
    parsed.specs = ["."];
  }
  if (parsed.sources.length === 0 && !parsed.diagnosticsManifestPath) {
    parsed.sources = ["."];
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
      "  --source <path>           Implementation source file or directory (repeatable).",
      "  --source-ext <exts>       Source extensions to scan (repeatable, comma-delimited).",
      "  --diagnostics-from <path> JSON manifest listing implemented diagnostics.",
      "  --exclude-dir <name>      Directory name to exclude from recursive scans (repeatable).",
      "  --specs <path>            Allium spec file or directory (repeatable).",
      "  --commands-from <path>    JSON file containing implemented command IDs.",
      "  --skip-commands           Compare diagnostics only.",
      "  --format text|json        Output format (default: text).",
      "  --config <file>           Load defaults from config file (default: allium.config.json).",
      "  --no-config               Disable config loading.",
      "  --help                    Show this message.",
      "",
      "Manifest formats:",
      '  diagnostics: ["allium.x"] or { "diagnostics": ["allium.x"] }',
      '  commands: package.json contributes.commands, or { "commands": [...] }',
      "",
    ].join("\n"),
  );
}

function collectFiles(
  inputs: string[],
  extensions: string[],
  excludeDirs: string[],
): string[] {
  const out = new Set<string>();
  const allowed = new Set(extensions.map((ext) => ext.toLowerCase()));
  const excluded = new Set(excludeDirs.filter((name) => name.length > 0));
  for (const input of inputs) {
    const resolved = path.resolve(input);
    if (!fs.existsSync(resolved)) {
      continue;
    }
    const stat = fs.statSync(resolved);
    if (stat.isFile()) {
      if (allowed.has(path.extname(resolved).toLowerCase())) {
        out.add(resolved);
      }
      continue;
    }
    if (stat.isDirectory()) {
      for (const filePath of walk(resolved, excluded)) {
        if (allowed.has(path.extname(filePath).toLowerCase())) {
          out.add(filePath);
        }
      }
    }
  }
  return [...out].sort();
}

function walk(root: string, excludeDirs: ReadonlySet<string>): string[] {
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
        if (excludeDirs.has(entry.name)) {
          continue;
        }
        stack.push(fullPath);
      } else if (entry.isFile()) {
        out.push(fullPath);
      }
    }
  }
  return out;
}

function readImplementedDiagnostics(parsed: ParsedArgs): Set<string> {
  const manifest = parsed.diagnosticsManifestPath
    ? readDiagnosticsManifest(parsed.diagnosticsManifestPath)
    : new Set<string>();
  const source = extractDiagnosticsFromSources(
    parsed.sources,
    parsed.sourceExtensions,
    parsed.excludeDirs,
  );
  return new Set([...manifest, ...source]);
}

function readDiagnosticsManifest(filePath: string): Set<string> {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    throw new Error(`Diagnostics manifest not found: ${filePath}`);
  }
  const payload = JSON.parse(fs.readFileSync(resolved, "utf8")) as
    | string[]
    | { diagnostics?: string[] };
  const diagnostics = Array.isArray(payload)
    ? payload
    : (payload.diagnostics ?? []);
  return new Set(
    diagnostics.filter((code): code is string => typeof code === "string"),
  );
}

function extractDiagnosticsFromSources(
  sourcePaths: string[],
  sourceExtensions: string[],
  excludeDirs: string[],
): Set<string> {
  const sourceFiles = collectFiles(sourcePaths, sourceExtensions, excludeDirs);
  if (sourceFiles.length === 0) {
    return new Set();
  }
  const sourceText = sourceFiles
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
  return extractAlliumDiagnosticCodes(sourceText);
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
  const manifest = JSON.parse(fs.readFileSync(resolved, "utf8")) as
    | {
        contributes?: { commands?: Array<{ command?: string }> };
        commands?: string[];
        commandIds?: string[];
        command_names?: string[];
      }
    | string[];
  const implementedCommands = new Set<string>();
  if (Array.isArray(manifest)) {
    for (const commandName of manifest) {
      if (typeof commandName === "string") {
        implementedCommands.add(commandName);
      }
    }
  } else {
    for (const commandEntry of manifest.contributes?.commands ?? []) {
      if (typeof commandEntry.command === "string") {
        implementedCommands.add(commandEntry.command);
      }
    }
    for (const commandName of manifest.commands ?? []) {
      implementedCommands.add(commandName);
    }
    for (const commandName of manifest.commandIds ?? []) {
      implementedCommands.add(commandName);
    }
    for (const commandName of manifest.command_names ?? []) {
      implementedCommands.add(commandName);
    }
  }
  return buildDriftReport(implementedCommands, extractSpecCommands(specText));
}

function readAlliumConfig(configPath: string): AlliumConfig {
  const fullPath = path.resolve(process.cwd(), configPath);
  if (!fs.existsSync(fullPath)) {
    return {};
  }
  const raw = fs.readFileSync(fullPath, "utf8");
  try {
    return JSON.parse(raw) as AlliumConfig;
  } catch {
    return {};
  }
}

process.exitCode = main(process.argv.slice(2));
