import test from "node:test";
import assert from "node:assert/strict";
import { resolveDiagnosticsModeForProfile } from "../src/language-tools/profile";

test("strict-authoring profile forces strict diagnostics", () => {
  assert.equal(
    resolveDiagnosticsModeForProfile("strict-authoring", "relaxed"),
    "strict",
  );
});

test("legacy-migration profile forces relaxed diagnostics", () => {
  assert.equal(
    resolveDiagnosticsModeForProfile("legacy-migration", "strict"),
    "relaxed",
  );
});

test("custom profile keeps configured diagnostics", () => {
  assert.equal(
    resolveDiagnosticsModeForProfile("custom", "relaxed"),
    "relaxed",
  );
});
