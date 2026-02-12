import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { formatAlliumText } from "../src/format";
import { planExtractLiteralToConfig } from "../src/language-tools/extract-literal-refactor";

const fixturesRoot = path.resolve("test/fixtures");

test("golden fixture: format basic", () => {
  const input = fs.readFileSync(
    path.join(fixturesRoot, "format/basic.input.allium"),
    "utf8",
  );
  const expected = fs.readFileSync(
    path.join(fixturesRoot, "format/basic.expected.allium"),
    "utf8",
  );
  const actual = formatAlliumText(input);
  assert.equal(actual, expected);
});

test("golden fixture: extract literal refactor", () => {
  const input = fs.readFileSync(
    path.join(fixturesRoot, "refactor/extract-literal.input.allium"),
    "utf8",
  );
  const expected = fs.readFileSync(
    path.join(fixturesRoot, "refactor/extract-literal.expected.allium"),
    "utf8",
  );

  const literal = '"pending"';
  const start = input.indexOf(literal);
  const end = start + literal.length;
  const plan = planExtractLiteralToConfig(input, start, end);
  assert.ok(plan);

  const actual = applyEdits(input, plan.edits);
  assert.equal(actual, expected);
});

function applyEdits(
  text: string,
  edits: Array<{ startOffset: number; endOffset: number; text: string }>,
): string {
  const sorted = [...edits].sort((a, b) => b.startOffset - a.startOffset);
  let result = text;
  for (const edit of sorted) {
    result =
      result.slice(0, edit.startOffset) +
      edit.text +
      result.slice(edit.endOffset);
  }
  return result;
}
