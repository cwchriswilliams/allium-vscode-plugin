import test from "node:test";
import assert from "node:assert/strict";
import { planExtractInlineEnumToNamedEnum } from "../src/language-tools/extract-inline-enum-refactor";

test("returns null when line is not inline enum field", () => {
  const text = `entity Invitation {\n  status: Recommendation\n}\n`;
  const start = text.indexOf("status:");
  const plan = planExtractInlineEnumToNamedEnum(text, start);
  assert.equal(plan, null);
});

test("extracts inline enum into named enum and updates field type", () => {
  const text = `entity Invitation {\n  status: pending | active | completed\n}\n\nrule A {\n  when: Ping()\n  ensures: Done()\n}\n`;
  const start = text.indexOf("status:");
  const plan = planExtractInlineEnumToNamedEnum(text, start);
  assert.ok(plan);
  assert.equal(plan.title, "Extract inline enum to named enum");
  assert.equal(plan.edits.length, 2);
  assert.ok(plan.edits.some((edit) => edit.text === "  status: Status"));
  assert.ok(
    plan.edits.some((edit) =>
      edit.text.includes(
        "enum Status {\n    pending | active | completed\n}\n",
      ),
    ),
  );
});

test("suffixes enum name when preferred name already exists", () => {
  const text = `enum Status {\n  pending | active\n}\n\nentity Invitation {\n  status: pending | active | completed\n}\n`;
  const start = text.indexOf("status:");
  const plan = planExtractInlineEnumToNamedEnum(text, start);
  assert.ok(plan);
  assert.ok(plan.edits.some((edit) => edit.text === "  status: Status2"));
  assert.ok(plan.edits.some((edit) => edit.text.includes("enum Status2 {")));
});
