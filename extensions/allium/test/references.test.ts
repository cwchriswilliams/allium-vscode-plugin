import test from "node:test";
import assert from "node:assert/strict";
import { findReferencesInText } from "../src/language-tools/references";

test("finds config key declaration and config references", () => {
  const text = `
config {
  timeout_hours: Integer = 12
}

rule Expire {
  when: Invitation.expires_at <= now + config.timeout_hours
  ensures: Done(config.timeout_hours)
}
`;
  const references = findReferencesInText(text, {
    name: "timeout_hours",
    kind: "config_key",
    startOffset: text.indexOf("timeout_hours"),
    endOffset: text.indexOf("timeout_hours") + "timeout_hours".length,
  });
  assert.equal(references.length, 3);
});

test("finds symbol references and skips comment-only matches", () => {
  const text = `
entity Invitation {
  status: String
}

rule ExpireInvitation {
  -- Invitation should not count in comment
  when: invitation: Invitation.expires_at <= now
  ensures: Notify(Invitation)
}
`;
  const references = findReferencesInText(text, {
    name: "Invitation",
    kind: "entity",
    startOffset: text.indexOf("Invitation"),
    endOffset: text.indexOf("Invitation") + "Invitation".length,
  });
  assert.equal(references.length, 3);
});
