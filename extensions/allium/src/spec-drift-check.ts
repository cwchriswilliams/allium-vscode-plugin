#!/usr/bin/env node
import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildDriftReport,
  extractAlliumDiagnosticCodes,
  extractSpecCommands,
  extractSpecDiagnosticCodes,
} from "./language-tools/spec-drift";

function main(): number {
  const root = process.cwd();
  const sourceFiles = walk(
    path.join(root, "extensions/allium/src/language-tools"),
  ).filter((filePath) => filePath.endsWith(".ts"));
  const specFiles = walk(path.join(root, "docs/project/specs")).filter(
    (filePath) => filePath.endsWith(".allium"),
  );
  const sourceText = sourceFiles
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
  const specText = specFiles
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
  const implementedDiagnostics = extractAlliumDiagnosticCodes(sourceText);
  const specifiedDiagnostics = extractSpecDiagnosticCodes(specText);

  const extensionPackage = JSON.parse(
    fs.readFileSync(path.join(root, "extensions/allium/package.json"), "utf8"),
  ) as { contributes?: { commands?: Array<{ command?: string }> } };
  const implementedCommands = new Set(
    (extensionPackage.contributes?.commands ?? [])
      .map((entry) => entry.command)
      .filter((value): value is string => typeof value === "string"),
  );
  const specifiedCommands = extractSpecCommands(specText);
  const diagnostics = buildDriftReport(
    implementedDiagnostics,
    specifiedDiagnostics,
  );
  const commands = buildDriftReport(implementedCommands, specifiedCommands);
  const hasDrift =
    diagnostics.missingInSpecs.length > 0 ||
    diagnostics.staleInSpecs.length > 0 ||
    commands.missingInSpecs.length > 0 ||
    commands.staleInSpecs.length > 0;
  if (!hasDrift) {
    process.stdout.write("Spec drift check passed.\n");
    return 0;
  }
  process.stderr.write("Spec drift detected.\n");
  if (diagnostics.missingInSpecs.length > 0) {
    process.stderr.write(
      `Diagnostics missing in specs:\n${diagnostics.missingInSpecs.map((item) => `- ${item}`).join("\n")}\n`,
    );
  }
  if (diagnostics.staleInSpecs.length > 0) {
    process.stderr.write(
      `Diagnostics stale in specs:\n${diagnostics.staleInSpecs.map((item) => `- ${item}`).join("\n")}\n`,
    );
  }
  if (commands.missingInSpecs.length > 0) {
    process.stderr.write(
      `Commands missing in specs:\n${commands.missingInSpecs.map((item) => `- ${item}`).join("\n")}\n`,
    );
  }
  if (commands.staleInSpecs.length > 0) {
    process.stderr.write(
      `Commands stale in specs:\n${commands.staleInSpecs.map((item) => `- ${item}`).join("\n")}\n`,
    );
  }
  return 1;
}

function walk(root: string): string[] {
  if (!fs.existsSync(root)) {
    return [];
  }
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

process.exitCode = main();
