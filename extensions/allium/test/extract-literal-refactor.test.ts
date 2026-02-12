import test from "node:test";
import assert from "node:assert/strict";
import { planExtractLiteralToConfig } from "../src/language-tools/extract-literal-refactor";

test("returns null when selection is not a literal", () => {
  const text = `rule A {\n  when: Ping()\n  ensures: x = y\n}`;
  const start = text.indexOf("x = y");
  const end = start + "x = y".length;
  const plan = planExtractLiteralToConfig(text, start, end);
  assert.equal(plan, null);
});

test("returns null when literal is not repeated", () => {
  const text = `rule A {\n  when: Ping()\n  ensures: status = "pending"\n}`;
  const literal = `"pending"`;
  const start = text.indexOf(literal);
  const end = start + literal.length;
  const plan = planExtractLiteralToConfig(text, start, end);
  assert.equal(plan, null);
});

test("adds config block and replaces all repeated string literal occurrences", () => {
  const text = `rule A {\n  when: Ping()\n  ensures: status = "pending"\n}\n\nrule B {\n  when: Pong()\n  ensures: previous = "pending"\n}`;
  const literal = `"pending"`;
  const start = text.indexOf(literal);
  const end = start + literal.length;

  const plan = planExtractLiteralToConfig(text, start, end);
  assert.ok(plan);
  assert.equal(plan.title, "Extract repeated literal to config");
  assert.equal(plan.edits.length, 3);
  assert.ok(
    plan.edits.some((edit) =>
      edit.text.startsWith("config {\n    extracted_pending: String = "),
    ),
  );
  assert.equal(
    plan.edits.filter((edit) => edit.text === "config.extracted_pending")
      .length,
    2,
  );
});

test("inserts key into existing config block", () => {
  const text = `config {\n    timeout: Integer = 5\n}\n\nrule A {\n  when: Ping()\n  ensures: retries = 3\n}\n\nrule B {\n  when: Pong()\n  ensures: max = 3\n}`;
  const literal = "3";
  const start = text.indexOf("retries = 3") + "retries = ".length;
  const end = start + literal.length;

  const plan = planExtractLiteralToConfig(text, start, end);
  assert.ok(plan);
  assert.equal(
    plan.edits.filter((edit) => edit.text === "config.extracted_3").length,
    2,
  );
  assert.ok(
    plan.edits.some(
      (edit) =>
        edit.startOffset === text.indexOf("}\n\nrule A") &&
        edit.text.includes("\n    extracted_3: Integer = 3\n"),
    ),
  );
});
