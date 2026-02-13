import test from "node:test";
import assert from "node:assert/strict";
import {
  buildFindingExplanationMarkdown,
  explainFinding,
} from "../src/language-tools/finding-help";

test("returns specific help for known finding code", () => {
  const help = explainFinding(
    "allium.rule.missingEnsures",
    "Rule should include ensures.",
  );
  assert.match(help.title, /Missing ensures/);
  assert.match(help.howToFix, /ensures/);
  assert.match(help.url, /allium\/language/);
});

test("returns fallback help for unknown finding code", () => {
  const help = explainFinding("allium.unknown", "Unknown message.");
  assert.equal(help.title, "allium.unknown");
  assert.match(help.howToFix, /rerun checks/);
});

test("builds markdown with key sections", () => {
  const markdown = buildFindingExplanationMarkdown(
    "allium.temporal.missingGuard",
    "Temporal trigger should include a requires guard.",
  );
  assert.match(markdown, /# Temporal trigger without guard/);
  assert.match(markdown, /## How To Fix/);
  assert.match(markdown, /allium\.temporal\.missingGuard/);
});
