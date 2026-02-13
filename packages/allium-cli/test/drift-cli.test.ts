import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

function runDrift(
  args: string[],
  cwd: string,
): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const packageRoot = path.resolve(__dirname, "../..");
  const driftScript = path.resolve(packageRoot, "dist/src/drift.js");
  const result = spawnSync(process.execPath, [driftScript, ...args], {
    cwd,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function writeFixtureFiles(root: string): {
  sourceDir: string;
  specsDir: string;
  commandsPath: string;
} {
  const sourceDir = path.join(root, "src");
  const specsDir = path.join(root, "specs");
  fs.mkdirSync(sourceDir, { recursive: true });
  fs.mkdirSync(specsDir, { recursive: true });
  fs.writeFileSync(
    path.join(sourceDir, "analyzer.ts"),
    `export const finding = "allium.example.rule";\n`,
    "utf8",
  );
  fs.writeFileSync(
    path.join(specsDir, "spec.allium"),
    `rule HasSpecCoverage {\n    when: CommandInvoked(name: "allium.runChecks")\n\n    ensures: Finding.created(\n    code: "allium.example.rule",\n    severity: warning\n    )\n}\n`,
    "utf8",
  );
  const commandsPath = path.join(root, "commands.json");
  fs.writeFileSync(
    commandsPath,
    JSON.stringify({
      contributes: {
        commands: [{ command: "allium.runChecks" }],
      },
    }),
    "utf8",
  );
  return { sourceDir, specsDir, commandsPath };
}

test("drift CLI exits 0 when diagnostics and commands are covered", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-cli-drift-"));
  const fixture = writeFixtureFiles(dir);
  const result = runDrift(
    [
      "--source",
      fixture.sourceDir,
      "--specs",
      fixture.specsDir,
      "--commands-from",
      fixture.commandsPath,
    ],
    dir,
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Spec drift check passed\./);
});

test("drift CLI reports mismatch in json mode", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-cli-drift-"));
  const fixture = writeFixtureFiles(dir);
  fs.writeFileSync(
    fixture.commandsPath,
    JSON.stringify({
      contributes: {
        commands: [{ command: "allium.otherCommand" }],
      },
    }),
    "utf8",
  );
  const result = runDrift(
    [
      "--format",
      "json",
      "--source",
      fixture.sourceDir,
      "--specs",
      fixture.specsDir,
      "--commands-from",
      fixture.commandsPath,
    ],
    dir,
  );
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout) as {
    hasDrift: boolean;
    commands: { missingInSpecs: string[]; staleInSpecs: string[] };
  };
  assert.equal(payload.hasDrift, true);
  assert.ok(payload.commands.missingInSpecs.includes("allium.otherCommand"));
  assert.ok(payload.commands.staleInSpecs.includes("allium.runChecks"));
});
