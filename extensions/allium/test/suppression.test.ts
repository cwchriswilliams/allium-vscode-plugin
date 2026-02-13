import test from "node:test";
import assert from "node:assert/strict";
import {
  buildSuppressionDirectiveEdit,
  removeStaleSuppressions,
} from "../src/language-tools/suppression";

test("builds suppression directive insertion for diagnostic line", () => {
  const text = `rule A {\n  when: Ping()\n  ensures: now + config.missing\n}\n`;
  const line = 2;
  const edit = buildSuppressionDirectiveEdit(
    text,
    "allium.config.undefinedReference",
    line,
  );
  assert.ok(edit);
  assert.equal(edit.offset, text.indexOf("  ensures:"));
  assert.equal(
    edit.text,
    "  -- allium-ignore allium.config.undefinedReference\n",
  );
});

test("does not duplicate existing matching suppression line", () => {
  const text = `rule A {\n  when: Ping()\n  -- allium-ignore allium.config.undefinedReference\n  ensures: now + config.missing\n}\n`;
  const edit = buildSuppressionDirectiveEdit(
    text,
    "allium.config.undefinedReference",
    2,
  );
  assert.equal(edit, null);
});

test("removes stale suppression line when all codes are stale", () => {
  const text = `rule A {\n  -- allium-ignore allium.foo.stale\n  ensures: Done()\n}\n`;
  const result = removeStaleSuppressions(
    text,
    new Set(["allium.rule.missingEnsures"]),
  );
  assert.equal(result.removedLines, 1);
  assert.equal(result.removedCodes, 1);
  assert.doesNotMatch(result.text, /allium-ignore/);
});

test("retains live codes and removes stale ones from mixed suppression", () => {
  const text = `rule A {\n  -- allium-ignore allium.foo.stale, allium.rule.missingEnsures\n  ensures: Done()\n}\n`;
  const result = removeStaleSuppressions(
    text,
    new Set(["allium.rule.missingEnsures"]),
  );
  assert.equal(result.removedLines, 0);
  assert.equal(result.removedCodes, 1);
  assert.match(result.text, /allium-ignore allium\.rule\.missingEnsures/);
  assert.doesNotMatch(result.text, /allium\.foo\.stale/);
});
