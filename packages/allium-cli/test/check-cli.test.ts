import test from "node:test";
import assert from "node:assert/strict";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

function runCheck(
  args: string[],
  cwd: string,
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
