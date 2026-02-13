import test from "node:test";
import assert from "node:assert/strict";
import { parseDeclarationAst } from "../src/language-tools/typed-ast";

test("parses typed declarations and rule clauses", () => {
  const text =
    `entity Ticket {\n  status: open | closed\n}\n` +
    `enum Status {\n  open | closed\n}\n` +
    `rule Close {\n  when: ticket: Ticket.status becomes closed\n  requires: ticket.status = open\n  ensures: ticket.status = closed\n}\n`;
  const ast = parseDeclarationAst(text);
  const rule = ast.find((entry) => entry.kind === "rule");
  assert.ok(rule && rule.kind === "rule");
  assert.equal(rule.name, "Close");
  assert.equal(rule.when, "ticket: Ticket.status becomes closed");
  assert.equal(rule.requires[0], "ticket.status = open");
  assert.equal(rule.ensures[0], "ticket.status = closed");
  assert.ok(
    ast.some((entry) => entry.kind === "entity" && entry.name === "Ticket"),
  );
  assert.ok(
    ast.some((entry) => entry.kind === "enum" && entry.name === "Status"),
  );
});
