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
  assert.match(result.stdout, /entity_group/);
  assert.match(result.stdout, /rule_group/);
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
  assert.match(generated, /subgraph rule_group/);
});

test("supports focus and kind filters", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-diagram-"));
  writeAllium(
    dir,
    "spec.allium",
    `entity Ticket {\n  status: open | closed\n}\nentity Team {\n  name: String\n}\nrule Close {\n  when: CloseTicket(ticket)\n  ensures: Ticket.created(status: closed)\n}\n`,
  );

  const result = runDiagram(
    ["--kind", "entity,rule", "--focus", "Ticket", "spec.allium"],
    dir,
  );
  assert.equal(result.status, 0);
  assert.match(result.stdout, /entity_Ticket/);
  assert.equal(/entity_Team/.test(result.stdout), false);
  assert.equal(/trigger_CloseTicket/.test(result.stdout), false);
});

test("fails strict mode when skipped declarations are found", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-diagram-"));
  writeAllium(
    dir,
    "spec.allium",
    `config {\n  timeout: Integer = 1\n}\nentity Ticket {\n  status: open | closed\n}\n`,
  );

  const result = runDiagram(["--strict", "spec.allium"], dir);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /allium.diagram.skippedDeclaration/);
});

test("writes split-by-module diagrams", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-diagram-"));
  writeAllium(
    dir,
    "a.allium",
    `module onboarding\nentity Invitation {\n  status: pending | accepted\n}\n`,
  );
  writeAllium(
    dir,
    "b.allium",
    `module operations\nentity Ticket {\n  status: open | closed\n}\n`,
  );

  const outDir = path.join(dir, "diagrams");
  const result = runDiagram(
    ["--split", "module", "--output", "diagrams", "*.allium"],
    dir,
  );

  assert.equal(result.status, 0);
  assert.ok(fs.existsSync(path.join(outDir, "onboarding.d2")));
  assert.ok(fs.existsSync(path.join(outDir, "operations.d2")));
});

test("reverse-links emits inverse edges", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-diagram-"));
  writeAllium(
    dir,
    "spec.allium",
    `entity Ticket {\n  status: open | closed\n}\nrule Close {\n  when: ticket: Ticket.status becomes closed\n  ensures: Done()\n}\n`,
  );
  const result = runDiagram(["--reverse-links", "spec.allium"], dir);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /reverse:when/);
});

test("constraint-labels appends requires expression to when edge labels", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "allium-diagram-"));
  writeAllium(
    dir,
    "spec.allium",
    `entity Ticket {\n  status: open | closed\n}\nrule Close {\n  when: ticket: Ticket.status becomes closed\n  requires: ticket.status = open\n  ensures: Done()\n}\n`,
  );
  const result = runDiagram(["--constraint-labels", "spec.allium"], dir);
  assert.equal(result.status, 0);
  assert.match(result.stdout, /when \[ticket.status = open\]/);
});
