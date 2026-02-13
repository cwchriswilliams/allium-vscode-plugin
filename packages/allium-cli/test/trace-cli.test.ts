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
  const packageRoot = path.resolve(__dirname, "../..");
  const traceScript = path.resolve(packageRoot, "dist/src/trace.js");
  const result = spawnSync(process.execPath, [traceScript, ...args], {
    cwd,
    encoding: "utf8",
  });
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

test("trace CLI supports junit output", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-cli-trace-"));
  fs.mkdirSync(path.join(dir, "specs"), { recursive: true });
  fs.mkdirSync(path.join(dir, "tests"), { recursive: true });

  fs.writeFileSync(
    path.join(dir, "specs", "spec.allium"),
    "rule UncoveredRule {\n  when: Ping()\n  ensures: Done()\n}\n",
    "utf8",
  );
  fs.writeFileSync(path.join(dir, "tests", "spec.test.ts"), "", "utf8");

  const result = runTrace(["--junit", "--tests", "tests", "specs"], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /<testsuite name="allium-trace"/);
});

test("trace CLI supports by-file output", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-cli-trace-"));
  fs.mkdirSync(path.join(dir, "specs"), { recursive: true });
  fs.mkdirSync(path.join(dir, "tests"), { recursive: true });

  fs.writeFileSync(
    path.join(dir, "specs", "a.allium"),
    "rule CoveredRule {\n  when: Ping()\n  ensures: Done()\n}\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "specs", "b.allium"),
    "rule UncoveredRule {\n  when: Pong()\n  ensures: Done()\n}\n",
    "utf8",
  );
  fs.writeFileSync(
    path.join(dir, "tests", "spec.test.ts"),
    'test("CoveredRule", () => {});\n',
    "utf8",
  );

  const result = runTrace(["--by-file", "--tests", "tests", "specs"], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Coverage by file:/);
  assert.match(result.stdout, /a\.allium: 1\/1 covered/);
  assert.match(result.stdout, /b\.allium: 0\/1 covered/);
});

test("trace CLI json includes rule hit line numbers", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-cli-trace-"));
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
  const result = runTrace(
    ["--format", "json", "--tests", "tests", "specs"],
    dir,
  );
  assert.equal(result.status, 0);
  const payload = JSON.parse(result.stdout) as {
    hitsByRule: Array<{ ruleName: string; hits: Array<{ line: number }> }>;
  };
  const covered = payload.hitsByRule.find(
    (entry) => entry.ruleName === "CoveredRule",
  );
  assert.ok(covered);
  assert.equal(covered.hits[0]?.line, 1);
});

test("trace CLI reads config defaults", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-cli-trace-"));
  fs.mkdirSync(path.join(dir, "specs"), { recursive: true });
  fs.mkdirSync(path.join(dir, "tests"), { recursive: true });
  fs.writeFileSync(
    path.join(dir, "allium.config.json"),
    JSON.stringify({ trace: { format: "json" } }),
    "utf8",
  );
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
  const parsed = JSON.parse(result.stdout) as { coveredRules: number };
  assert.equal(parsed.coveredRules, 1);
});
