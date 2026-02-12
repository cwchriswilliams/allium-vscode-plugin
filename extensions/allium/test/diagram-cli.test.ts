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

function runDiagram(args: string[], cwd: string) {
  const result = spawnSync(
    process.execPath,
    [path.resolve("dist/src/diagram.js"), ...args],
    { cwd, encoding: "utf8" },
  );
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

test("generates d2 diagram to stdout", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-diagram-"));
  writeAllium(
    dir,
    "spec.allium",
    `entity Ticket {\n  status: open | closed\n}\nrule Close {\n  when: CloseTicket(ticket)\n  ensures: Ticket.created(status: closed)\n}\n`,
  );

  const result = runDiagram(["spec.allium"], dir);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /direction: right/);
  assert.match(result.stdout, /rule_Close/);
});

test("writes mermaid diagram to output path", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-diagram-"));
  writeAllium(
    dir,
    "spec.allium",
    `entity Ticket {\n  status: open | closed\n}\nrule Close {\n  when: CloseTicket(ticket)\n  ensures: Ticket.created(status: closed)\n}\n`,
  );

  const outputPath = path.join(dir, "diagram.mmd");
  const result = runDiagram(
    ["--format", "mermaid", "--output", "diagram.mmd", "spec.allium"],
    dir,
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /Wrote mermaid diagram/);

  const generated = fs.readFileSync(outputPath, "utf8");
  assert.match(generated, /flowchart LR/);
  assert.match(generated, /rule_Close/);
});
