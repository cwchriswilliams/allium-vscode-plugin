import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { spawnSync } from "node:child_process";
import { formatAlliumText } from "../src/format";

function runFormat(
  args: string[],
  cwd: string,
): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(
    process.execPath,
    [path.resolve("dist/src/format.js"), ...args],
    { cwd, encoding: "utf8" },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

test("formatAlliumText normalizes line endings and trims trailing whitespace", () => {
  const input = "rule A {\r\n  when: Ping()  \r\n}\r\n\r\n";
  const output = formatAlliumText(input);
  assert.equal(output, "rule A {\n    when: Ping()\n}\n");
});

test("formatAlliumText applies structural indentation and top-level spacing", () => {
  const input =
    "rule A{\nwhen: Ping()\nensures: Done()\n}\nrule B {\nwhen: Pong()\nensures: Done()\n}\n";
  const output = formatAlliumText(input);
  assert.equal(
    output,
    "rule A{\n    when: Ping()\n    ensures: Done()\n}\n\nrule B {\n    when: Pong()\n    ensures: Done()\n}\n",
  );
});

test("format CLI rewrites .allium files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-format-"));
  const target = path.join(dir, "spec.allium");
  fs.writeFileSync(target, "rule A {\r\n  when: Ping()  \r\n}\r\n", "utf8");

  const result = runFormat(["spec.allium"], dir);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /spec\.allium: formatted/);
  assert.equal(
    fs.readFileSync(target, "utf8"),
    "rule A {\n    when: Ping()\n}\n",
  );
});

test("format CLI --check fails when formatting is needed", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-format-"));
  const target = path.join(dir, "spec.allium");
  fs.writeFileSync(target, "rule A {\n  when: Ping()  \n}\n", "utf8");

  const result = runFormat(["--check", "spec.allium"], dir);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /spec\.allium: would format/);
});

test("format CLI --check succeeds when file is already formatted", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-format-"));
  const target = path.join(dir, "spec.allium");
  fs.writeFileSync(target, "rule A {\n    when: Ping()\n}\n", "utf8");

  const result = runFormat(["--check", "spec.allium"], dir);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /All files already formatted\./);
});

test("format CLI fails with exit code 2 when no inputs are provided", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-format-"));
  const result = runFormat([], dir);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /Provide at least one file, directory, or glob/);
});

test("format CLI fails with exit code 2 when input has no .allium files", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-format-"));
  fs.writeFileSync(path.join(dir, "notes.txt"), "no allium", "utf8");

  const result = runFormat(["notes.txt"], dir);
  assert.equal(result.status, 2);
  assert.match(result.stderr, /No \.allium files found/);
});
