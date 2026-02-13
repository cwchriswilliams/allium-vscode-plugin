import test from "node:test";
import assert from "node:assert/strict";
import { buildRuleTestScaffold } from "../src/language-tools/test-scaffold";

test("builds scaffold tests from rule declarations", () => {
  const text =
    `rule Close {\n` +
    `  when: CloseTicket(ticket)\n` +
    `  requires: ticket.status = open\n` +
    `  ensures: ticket.status = closed\n` +
    `}\n`;
  const output = buildRuleTestScaffold(text, "ticketing");
  assert.match(output, /test\("ticketing \/ Close"/);
  assert.match(output, /trigger: CloseTicket\(ticket\)/);
  assert.match(output, /requires: ticket.status = open/);
  assert.match(output, /ensures: ticket.status = closed/);
});
