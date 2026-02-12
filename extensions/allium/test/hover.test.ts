import test from "node:test";
import assert from "node:assert/strict";
import {
  findLeadingDocComment,
  hoverTextAtOffset,
} from "../src/language-tools/hover";

test("returns hover text for known keyword", () => {
  const text = `rule Expire {\n  when: Ping()\n  ensures: Done()\n}\n`;
  const offset = text.indexOf("ensures") + 2;
  const hover = hoverTextAtOffset(text, offset);
  assert.ok(hover);
  assert.match(hover, /Outcome clause/);
});

test("returns null for unknown identifier", () => {
  const text = `rule Expire {\n  when: Ping()\n  ensures: Done()\n}\n`;
  const offset = text.indexOf("Expire") + 2;
  const hover = hoverTextAtOffset(text, offset);
  assert.equal(hover, null);
});

test("extracts declaration doc comments above a symbol", () => {
  const text = `-- This rule expires invitations.\n-- It runs hourly.\nrule Expire {\n  when: Tick()\n  ensures: Done()\n}\n`;
  const startOffset = text.indexOf("rule Expire");
  const doc = findLeadingDocComment(text, startOffset);
  assert.equal(doc, "This rule expires invitations.\nIt runs hourly.");
});
