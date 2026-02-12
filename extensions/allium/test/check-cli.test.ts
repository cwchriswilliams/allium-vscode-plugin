import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

function writeAllium(dir: string, relativePath: string, contents: string): string {
  const fullPath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, contents, "utf8");
  return fullPath;
}

function runCheck(args: string[], cwd: string): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    [path.resolve("dist/src/check.js"), ...args],
    { cwd, encoding: "utf8" }
  );
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("fails with exit code 1 on strict warning", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-check-"));
  writeAllium(
    dir,
    "spec.allium",
    `rule Expires {\n  when: invitation: Invitation.expires_at <= now\n  ensures: invitation.status = expired\n}\n`
  );

  const result = runCheck(["spec.allium"], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /allium\.temporal\.missingGuard/);
});

test("relaxed mode suppresses temporal warning and returns success", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-check-"));
  writeAllium(
    dir,
    "spec.allium",
    `rule Expires {\n  when: invitation: Invitation.expires_at <= now\n  ensures: invitation.status = expired\n}\n`
  );

  const result = runCheck(["--mode", "relaxed", "spec.allium"], dir);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /No blocking findings\./);
});

test("checks .allium files found through directory input", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-check-"));
  writeAllium(dir, "nested/a.allium", `rule A {\n  when: Ping()\n}\n`);
  writeAllium(dir, "nested/readme.txt", "ignore");

  const result = runCheck(["nested"], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /nested\/a\.allium:3:1 error allium\.rule\.missingEnsures/);
});
