import test from "node:test";
import assert from "node:assert/strict";
import {
  buildExternalTriggerRuleScaffold,
  extractUndefinedProvidesTriggerName,
} from "../src/language-tools/provides-trigger-fix";

test("extracts undefined provides trigger name from finding message", () => {
  const message =
    "Surface 'X' provides trigger 'InvitationAccepted' which is not defined as an external stimulus rule trigger.";
  assert.equal(
    extractUndefinedProvidesTriggerName(message),
    "InvitationAccepted",
  );
});

test("builds external trigger scaffold from trigger name", () => {
  const scaffold = buildExternalTriggerRuleScaffold("InvitationAccepted");
  assert.match(scaffold, /rule EmitInvitationAccepted/);
  assert.match(scaffold, /external_stimulus\(InvitationAccepted\(event\)\)/);
});
