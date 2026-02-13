import test from "node:test";
import assert from "node:assert/strict";
import {
  renderSimulationMarkdown,
  simulateRuleAtOffset,
} from "../src/language-tools/rule-sim";

test("simulates requires and ensures clauses for rule at offset", () => {
  const text =
    `rule Approve {\n` +
    `  when: ReviewRequested()\n` +
    `  requires: score >= 80 and exists reviewer\n` +
    `  ensures: status = approved\n` +
    `}\n`;
  const preview = simulateRuleAtOffset(text, text.indexOf("Approve"), {
    score: 90,
    reviewer: { id: "u1" },
    status: "approved",
  });
  assert.ok(preview);
  assert.equal(preview.ruleName, "Approve");
  assert.equal(preview.requires[0]?.result, "true");
  assert.equal(preview.ensures[0]?.result, "true");
});

test("returns null when offset is not inside a rule block", () => {
  const preview = simulateRuleAtOffset(`entity A {\n  id: String\n}\n`, 2, {});
  assert.equal(preview, null);
});

test("renders markdown summary for simulation output", () => {
  const markdown = renderSimulationMarkdown(
    {
      ruleName: "Approve",
      requires: [{ expression: "score >= 80", result: "true" }],
      ensures: [{ expression: "status = approved", result: "false" }],
    },
    { score: 90, status: "pending" },
  );
  assert.match(markdown, /Rule Simulation: Approve/);
  assert.match(markdown, /score >= 80/);
  assert.match(markdown, /\*\*false\*\*/);
});
