import test from "node:test";
import assert from "node:assert/strict";
import { collectTopLevelFoldingBlocks } from "../src/language-tools/folding";

test("collects folding ranges for top-level block declarations", () => {
  const text = `config {\n  timeout: Integer = 5\n}\n\nenum Recommendation {\n  strong_yes | yes | no | strong_no\n}\n\nrule Expire {\n  when: Ping()\n  ensures: Done()\n}\n`;
  const ranges = collectTopLevelFoldingBlocks(text);
  assert.deepEqual(ranges, [
    { startLine: 0, endLine: 2 },
    { startLine: 3, endLine: 6 },
    { startLine: 7, endLine: 11 },
  ]);
});

test("ignores single-line and unclosed blocks", () => {
  const text = `rule A { when: Ping() }\n\nrule B {\n  when: Pong()\n`;
  const ranges = collectTopLevelFoldingBlocks(text);
  assert.deepEqual(ranges, []);
});
