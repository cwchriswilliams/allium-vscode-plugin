import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { buildWorkspaceIndex } from "../src/language-tools/workspace-index";
import { collectWorkspaceSymbolRecords } from "../src/language-tools/workspace-symbols";

test("collects symbols from workspace documents", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "allium-ws-symbols-"));
  fs.writeFileSync(
    path.join(root, "main.allium"),
    `entity Invitation {\n  status: String\n}\nrule ExpireInvitation {\n  when: Ping()\n  ensures: Done()\n}\n`,
    "utf8",
  );
  const index = buildWorkspaceIndex(root);
  const records = collectWorkspaceSymbolRecords(index, "");
  const names = records.map((record) => record.name).sort();
  assert.deepEqual(names, ["ExpireInvitation", "Invitation"]);
});

test("filters workspace symbols by query", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "allium-ws-symbols-"));
  fs.writeFileSync(
    path.join(root, "main.allium"),
    `entity Invitation {}\nentity Reminder {}\n`,
    "utf8",
  );
  const index = buildWorkspaceIndex(root);
  const records = collectWorkspaceSymbolRecords(index, "invit");
  assert.equal(records.length, 1);
  assert.equal(records[0].name, "Invitation");
});
