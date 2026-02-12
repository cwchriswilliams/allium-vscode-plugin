import test from "node:test";
import assert from "node:assert/strict";
import { collectUseImportPaths } from "../src/language-tools/document-links";

test("collects import path range from use alias statement", () => {
  const text = `use "./shared.allium" as shared\nrule A {\n  when: shared/Ping()\n  ensures: Done()\n}\n`;
  const paths = collectUseImportPaths(text);
  assert.equal(paths.length, 1);
  assert.equal(paths[0].sourcePath, "./shared.allium");
  assert.equal(
    text.slice(paths[0].startOffset, paths[0].endOffset),
    "./shared.allium",
  );
});

test("collects multiple use import paths", () => {
  const text = `use "./a.allium" as a\nuse "./b" as b\n`;
  const paths = collectUseImportPaths(text);
  assert.equal(paths.length, 2);
  assert.deepEqual(
    paths.map((entry) => entry.sourcePath),
    ["./a.allium", "./b"],
  );
});
