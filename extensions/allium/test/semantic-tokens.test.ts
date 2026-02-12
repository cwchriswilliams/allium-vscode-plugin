import test from "node:test";
import assert from "node:assert/strict";
import { collectSemanticTokenEntries } from "../src/language-tools/semantic-tokens";

test("collects semantic tokens for keywords and declaration names", () => {
  const text = `
enum Recommendation {
  strong_yes | yes | no | strong_no
}

entity Invitation {
  status: String
}

rule ExpireInvitation {
  when: Invitation.expires_at <= now
  ensures: invitation.status = "expired"
}
`;
  const tokens = collectSemanticTokenEntries(text);
  assert.ok(tokens.some((entry) => entry.tokenType === "keyword"));
  assert.ok(tokens.some((entry) => entry.tokenType === "class"));
  assert.ok(tokens.some((entry) => entry.tokenType === "function"));
  assert.ok(tokens.some((entry) => entry.tokenType === "namespace"));
});

test("collects semantic tokens for strings, numbers, comments and properties", () => {
  const text = `
-- comment line
config {
  timeout_hours: Integer = 12
}

rule A {
  ensures: "ok"
}
`;
  const tokens = collectSemanticTokenEntries(text);
  assert.ok(tokens.some((entry) => entry.tokenType === "comment"));
  assert.ok(tokens.some((entry) => entry.tokenType === "property"));
  assert.ok(tokens.some((entry) => entry.tokenType === "number"));
  assert.ok(tokens.some((entry) => entry.tokenType === "string"));
});
