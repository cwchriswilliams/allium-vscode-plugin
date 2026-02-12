import test from "node:test";
import assert from "node:assert/strict";
import { collectCompletionCandidates } from "../src/language-tools/completion";

test("returns keyword completions in generic context", () => {
  const text = `rule A {\n  when: Ping()\n  ensures: Done()\n}\n`;
  const candidates = collectCompletionCandidates(text, text.indexOf("Ping"));
  const labels = candidates.map((entry) => entry.label);
  assert.ok(labels.includes("rule"));
  assert.ok(labels.includes("ensures"));
  assert.ok(labels.includes("enum"));
  assert.ok(labels.includes("context"));
  assert.ok(labels.includes("module"));
});

test("returns config key completions after config prefix", () => {
  const text = `config {\n  timeout_hours: Integer = 12\n}\nrule A {\n  ensures: now + config.\n}\n`;
  const offset = text.indexOf("config.") + "config.".length;
  const candidates = collectCompletionCandidates(text, offset);
  assert.ok(candidates.some((entry) => entry.kind === "property"));
  assert.ok(candidates.some((entry) => entry.label === "timeout_hours"));
});
