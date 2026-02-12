import test from "node:test";
import assert from "node:assert/strict";
import { planRename, prepareRenameTarget } from "../src/language-tools/rename";

test("prepares rename target for unambiguous symbol", () => {
  const text = `entity Invitation {\n  status: String\n}\n\nrule Accept {\n  when: invitation: Invitation.status becomes pending\n  ensures: Done()\n}\n`;
  const offset = text.indexOf("Invitation.status") + 2;
  const range = prepareRenameTarget(text, offset);
  assert.ok(range);
  assert.equal(text.slice(range?.startOffset, range?.endOffset), "Invitation");
});

test("rejects rename when target collides with existing symbol", () => {
  const text = `entity Invitation {\n  status: String\n}\nentity Role {\n  name: String\n}\n`;
  const offset = text.indexOf("Invitation") + 2;
  const rename = planRename(text, offset, "Role");
  assert.equal(rename.plan, null);
  assert.match(rename.error ?? "", /collide/);
});

test("rejects rename when symbol is ambiguous", () => {
  const text = `entity Shared {\n  status: String\n}\nrule Shared {\n  when: Ping()\n  ensures: Done()\n}\n`;
  const offset = text.indexOf("Shared") + 1;
  const rename = planRename(text, offset, "Renamed");
  assert.equal(rename.plan, null);
  assert.match(rename.error ?? "", /unambiguous/);
});
