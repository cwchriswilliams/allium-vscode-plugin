import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { collectUndefinedImportedSymbolFindings } from "../src/language-tools/imported-symbols";
import { buildWorkspaceIndex } from "../src/language-tools/workspace-index";

function writeFile(
  root: string,
  relativePath: string,
  content: string,
): string {
  const fullPath = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content, "utf8");
  return fullPath;
}

test("reports undefined imported symbol usage", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "allium-imports-"));
  writeFile(root, "shared.allium", `entity Ticket {\n  status: String\n}\n`);
  const currentPath = writeFile(
    root,
    "main.allium",
    `use "./shared.allium" as shared\nrule A {\n  when: shared/Missing(t)\n  ensures: Done()\n}\n`,
  );

  const findings = collectUndefinedImportedSymbolFindings(
    currentPath,
    fs.readFileSync(currentPath, "utf8"),
    buildWorkspaceIndex(root),
  );

  assert.ok(
    findings.some(
      (finding) => finding.code === "allium.import.undefinedSymbol",
    ),
  );
});

test("does not report known imported symbol usage", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "allium-imports-"));
  writeFile(
    root,
    "shared.allium",
    `rule Ping {\n  when: Trigger()\n  ensures: Done()\n}\n`,
  );
  const currentPath = writeFile(
    root,
    "main.allium",
    `use "./shared.allium" as shared\nrule A {\n  when: shared/Ping(x)\n  ensures: Done()\n}\n`,
  );

  const findings = collectUndefinedImportedSymbolFindings(
    currentPath,
    fs.readFileSync(currentPath, "utf8"),
    buildWorkspaceIndex(root),
  );

  assert.equal(findings.length, 0);
});
