import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";

function runTrace(
  args: string[],
  cwd: string,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    [path.resolve("dist/src/trace.js"), ...args],
    { cwd, encoding: "utf8" },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

test("trace CLI fails when test inputs are missing", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-trace-"));
  const result = runTrace(["specs"], dir);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Provide at least one test input via --tests/);
});

test("trace CLI reports uncovered rules and exits 1", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-trace-"));
  fs.mkdirSync(path.join(dir, "specs"), { recursive: true });
  fs.mkdirSync(path.join(dir, "tests"), { recursive: true });

  fs.writeFileSync(
    path.join(dir, "specs", "spec.allium"),
    "rule CoveredRule {\n  when: Ping()\n  ensures: Done()\n}\nrule UncoveredRule {\n  when: Pong()\n  ensures: Done()\n}\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tests", "spec.test.ts"),
    'test("CoveredRule", () => {});\n',
    "utf8",
  );

  const result = runTrace(["--tests", "tests", "specs"], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /1 uncovered/);
  assert.match(result.stdout, /UncoveredRule/);
});

test("trace CLI succeeds when all rules are covered", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-trace-"));
  fs.mkdirSync(path.join(dir, "specs"), { recursive: true });
  fs.mkdirSync(path.join(dir, "tests"), { recursive: true });

  fs.writeFileSync(
    path.join(dir, "specs", "spec.allium"),
    "rule CoveredRule {\n  when: Ping()\n  ensures: Done()\n}\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tests", "spec.test.ts"),
    'test("CoveredRule", () => {});\n',
    "utf8",
  );

  const result = runTrace(["--tests", "tests", "specs"], dir);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /All spec rules are referenced by tests/);
});

test("trace CLI supports json output", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-trace-"));
  fs.mkdirSync(path.join(dir, "specs"), { recursive: true });
  fs.mkdirSync(path.join(dir, "tests"), { recursive: true });

  fs.writeFileSync(
    path.join(dir, "specs", "spec.allium"),
    "rule CoveredRule {\n  when: Ping()\n  ensures: Done()\n}\nrule UncoveredRule {\n  when: Pong()\n  ensures: Done()\n}\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tests", "spec.test.ts"),
    'test("CoveredRule", () => {});\n',
    "utf8",
  );

  const result = runTrace(
    ["--format", "json", "--tests", "tests", "specs"],
    dir,
  );
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout) as {
    totalRules: number;
    coveredRules: number;
    uncoveredRules: Array<{ name: string }>;
  };
  assert.equal(payload.totalRules, 2);
  assert.equal(payload.coveredRules, 1);
  assert.equal(payload.uncoveredRules[0]?.name, "UncoveredRule");
});

test("trace CLI supports allowlist for uncovered rules", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-trace-"));
  fs.mkdirSync(path.join(dir, "specs"), { recursive: true });
  fs.mkdirSync(path.join(dir, "tests"), { recursive: true });

  fs.writeFileSync(
    path.join(dir, "specs", "spec.allium"),
    "rule CoveredRule {\n  when: Ping()\n  ensures: Done()\n}\nrule AllowedGap {\n  when: Pong()\n  ensures: Done()\n}\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tests", "spec.test.ts"),
    'test("CoveredRule", () => {});\n',
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "allowlist.txt"), "AllowedGap\n", "utf8");

  const result = runTrace(
    ["--allowlist", "allowlist.txt", "--tests", "tests", "specs"],
    dir,
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /0 uncovered/);
});

test("trace strict mode fails with stale allowlist entries", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-trace-"));
  fs.mkdirSync(path.join(dir, "specs"), { recursive: true });
  fs.mkdirSync(path.join(dir, "tests"), { recursive: true });

  fs.writeFileSync(
    path.join(dir, "specs", "spec.allium"),
    "rule CoveredRule {\n  when: Ping()\n  ensures: Done()\n}\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tests", "spec.test.ts"),
    'test("CoveredRule", () => {});\n',
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "allowlist.txt"), "OldRule\n", "utf8");

  const result = runTrace(
    ["--strict", "--allowlist", "allowlist.txt", "--tests", "tests", "specs"],
    dir,
  );
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Stale allowlist entries/);
});
