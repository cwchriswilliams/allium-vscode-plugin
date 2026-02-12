import test from "node:test";
import assert from "node:assert/strict";
import { buildSuppressionDirectiveEdit } from "../src/language-tools/suppression";

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
