import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

function writeAllium(
  dir: string,
  relativePath: string,
  contents: string,
): string {
  const fullPath = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, contents, "utf8");
  return fullPath;
}

function runCheck(
  args: string[],
  cwd: string,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    [path.resolve("dist/src/check.js"), ...args],
    { cwd, encoding: "utf8" },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

test("fails with exit code 1 on strict warning", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-check-"));
  writeAllium(
    dir,
    "spec.allium",
    `entity Invitation {\n  expires_at: Timestamp\n  status: String\n}\n\nrule Expires {\n  when: invitation: Invitation.expires_at <= now\n  ensures: invitation.status = expired\n}\n`,
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
    `entity Invitation {\n  expires_at: Timestamp\n  status: String\n}\n\nrule Expires {\n  when: invitation: Invitation.expires_at <= now\n  ensures: invitation.status = expired\n}\n`,
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
  assert.match(
    result.stdout,
    /nested\/a\.allium:3:1 error allium\.rule\.missingEnsures/,
  );
});

test("returns exit code 2 for invalid mode", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-check-"));
  writeAllium(
    dir,
    "spec.allium",
    `rule A {\n  when: Ping()\n  ensures: Done()\n}\n`,
  );

  const result = runCheck(["--mode", "invalid", "spec.allium"], dir);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Expected --mode strict\|relaxed/);
});

test("returns exit code 2 when no inputs are provided", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-check-"));
  const result = runCheck([], dir);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Provide at least one file, directory, or glob/);
});

test("returns exit code 2 when inputs resolve to no .allium files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-check-"));
  fs.writeFileSync(path.join(dir, "readme.txt"), "no spec files", "utf8");

  const result = runCheck(["readme.txt"], dir);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /No \.allium files found/);
});

test("supports wildcard inputs and checks matched files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-check-"));
  writeAllium(dir, "specs/a.allium", `rule A {\n  when: Ping()\n}\n`);
  writeAllium(
    dir,
    "specs/b.allium",
    `rule B {\n  when: Pong()\n  ensures: Done()\n}\n`,
  );
  fs.writeFileSync(path.join(dir, "specs/c.txt"), "ignore", "utf8");

  const result = runCheck(["specs/*.allium"], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /specs\/a\.allium/);
  assert.doesNotMatch(result.stdout, /specs\/c\.txt/);
});

test("autofix adds missing ensures and returns success", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-check-"));
  const filePath = writeAllium(
    dir,
    "spec.allium",
    `rule A {\n  when: Ping()\n}\n`,
  );

  const result = runCheck(["--autofix", "spec.allium"], dir);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /autofixed/);

  const updated = fs.readFileSync(filePath, "utf8");
  assert.match(updated, /ensures: TODO\(\)/);
});

test("autofix adds temporal guard scaffold", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-check-"));
  const filePath = writeAllium(
    dir,
    "spec.allium",
    `entity Invitation {\n  expires_at: Timestamp\n  status: String\n}\n\nrule Expires {\n  when: invitation: Invitation.expires_at <= now\n  ensures: invitation.status = expired\n}\n`,
  );

  const result = runCheck(["--autofix", "spec.allium"], dir);
  assert.equal(result.status, 0);

  const updated = fs.readFileSync(filePath, "utf8");
  assert.match(updated, /requires: \/\* add temporal guard \*\//);
});

test("json format prints machine-readable payload", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-check-"));
  writeAllium(dir, "spec.allium", `rule A {\n  when: Ping()\n}\n`);

  const result = runCheck(["--format", "json", "spec.allium"], dir);
  assert.equal(result.status, 1);
  const parsed = JSON.parse(result.stdout) as {
    summary: { findings: number; errors: number };
    findings: Array<{ code: string }>;
  };
  assert.equal(parsed.summary.findings > 0, true);
  assert.equal(parsed.summary.errors > 0, true);
  assert.ok(
    parsed.findings.some(
      (entry) => entry.code === "allium.rule.missingEnsures",
    ),
  );
});

test("write-baseline creates baseline file and exits successfully", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-check-"));
  writeAllium(dir, "spec.allium", `rule A {\n  when: Ping()\n}\n`);

  const result = runCheck(
    ["--write-baseline", ".allium-baseline.json", "spec.allium"],
    dir,
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Wrote baseline/);

  const baseline = JSON.parse(
    fs.readFileSync(path.join(dir, ".allium-baseline.json"), "utf8"),
  ) as { version: number; findings: unknown[] };
  assert.equal(baseline.version, 1);
  assert.equal(baseline.findings.length > 0, true);
});

test("baseline suppresses known findings", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-check-"));
  writeAllium(dir, "spec.allium", `rule A {\n  when: Ping()\n}\n`);
  runCheck(["--write-baseline", ".allium-baseline.json", "spec.allium"], dir);

  const result = runCheck(
    ["--baseline", ".allium-baseline.json", "spec.allium"],
    dir,
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Suppressed/);
  assert.match(result.stdout, /No blocking findings\./);
});
