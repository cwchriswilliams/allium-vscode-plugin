import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";

function runCheck(
  args: string[],
  cwd: string,
  input?: string,
): {
  status: number | null;
  stdout: string;
  stderr: string;
} {
  const packageRoot = path.resolve(__dirname, "../..");
  const checkScript = path.resolve(packageRoot, "dist/src/check.js");
  const result = spawnSync(process.execPath, [checkScript, ...args], {
    cwd,
    encoding: "utf8",
    input,
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

test("check CLI reports informational findings from spec diagnostics suite", () => {
  const repoRoot = path.resolve(__dirname, "../../../..");
  const result = runCheck(
    [
      "--format",
      "json",
      "docs/project/specs/allium-check-tool-behaviour.allium",
    ],
    repoRoot,
  );
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout) as {
    summary: { infos: number };
    findings: Array<{ code: string; severity: string }>;
  };
  assert.ok(payload.summary.infos > 0);
  assert.ok(
    payload.findings.some(
      (finding) =>
        finding.code === "allium.field.unused" && finding.severity === "info",
    ),
  );
  assert.ok(
    payload.findings.some(
      (finding) =>
        finding.code === "allium.rule.unreachableTrigger" &&
        finding.severity === "info",
    ),
  );
});

test("check CLI supports fail-on threshold", () => {
  const repoRoot = path.resolve(__dirname, "../../../..");
  const result = runCheck(
    [
      "--fail-on",
      "info",
      "--format",
      "json",
      "docs/project/specs/allium-check-tool-behaviour.allium",
    ],
    repoRoot,
  );
  assert.equal(result.status, 1);
});

test("check CLI report writes file output", () => {
  const repoRoot = path.resolve(__dirname, "../../../..");
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-cli-check-"));
  const reportPath = path.join(tempDir, "report.json");
  const result = runCheck(
    [
      "--format",
      "json",
      "--report",
      reportPath,
      "docs/project/specs/allium-check-tool-behaviour.allium",
    ],
    repoRoot,
  );
  assert.equal(result.status, 0);
  const report = fs.readFileSync(reportPath, "utf8");
  assert.equal(report.trim().startsWith("{"), true);
});

test("check CLI supports fix-interactive mode", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-cli-check-"));
  fs.writeFileSync(
    path.join(dir, "spec.allium"),
    `rule A {\n  when: Ping()\n}\n`,
    "utf8",
  );
  const result = runCheck(
    ["--autofix", "--fix-interactive", "spec.allium"],
    dir,
    "y\n",
  );
  assert.equal(result.status, 0);
  const updated = fs.readFileSync(path.join(dir, "spec.allium"), "utf8");
  assert.match(updated, /ensures: TODO\(\)/);
});

test("check CLI reads mode from allium.config.json", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-cli-check-"));
  fs.writeFileSync(
    path.join(dir, "allium.config.json"),
    JSON.stringify({ check: { mode: "relaxed" } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "spec.allium"),
    `entity Invitation {\n  expires_at: Timestamp\n  status: String\n}\n\nrule Expires {\n  when: invitation: Invitation.expires_at <= now\n  ensures: invitation.status = expired\n}\n`,
    "utf8",
  );
  const result = runCheck(["spec.allium"], dir);
  assert.equal(result.status, 0);
});

test("check CLI uses project.specPaths from config when no inputs are passed", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-cli-check-"));
  fs.mkdirSync(path.join(dir, "specs"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "allium.config.json"),
    JSON.stringify({ project: { specPaths: ["specs"] } }),
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "specs", "spec.allium"),
    "rule A {\n  when: Ping()\n}\n",
  );
  const result = runCheck([], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /specs\/spec\.allium/);
});

test("check CLI autofix inserts missing when scaffold", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-cli-check-"));
  fs.writeFileSync(
    path.join(dir, "spec.allium"),
    "rule A {\n  ensures: Done()\n}\n",
  );
  const result = runCheck(["--autofix", "spec.allium"], dir);
  assert.equal(result.status, 0);
  const updated = fs.readFileSync(path.join(dir, "spec.allium"), "utf8");
  assert.match(updated, /when: TODO\(\)/);
});
