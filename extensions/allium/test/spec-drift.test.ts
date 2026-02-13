import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDriftReport,
  extractAlliumDiagnosticCodes,
  extractSpecCommands,
  extractSpecDiagnosticCodes,
  renderDriftMarkdown,
} from "../src/language-tools/spec-drift";

test("extracts diagnostic codes from source and specs", () => {
  const source = `const code = "allium.rule.missingEnsures";`;
  const spec = `ensures: Finding.created(\ncode: "allium.rule.missingEnsures",\nseverity: error\n)\n`;
  assert.equal(
    extractAlliumDiagnosticCodes(source).has("allium.rule.missingEnsures"),
    true,
  );
  assert.equal(
    extractSpecDiagnosticCodes(spec).has("allium.rule.missingEnsures"),
    true,
  );
});

test("extracts command names from specs", () => {
  const spec =
    `when: CommandInvoked(name: "allium.runChecks")\n` +
    `when: WorkspaceCommandInvoked(name: "npm run check -- docs")`;
  assert.equal(extractSpecCommands(spec).has("allium.runChecks"), true);
  assert.equal(extractSpecCommands(spec).has("npm run check -- docs"), false);
});

test("builds drift report and markdown", () => {
  const diagnostics = buildDriftReport(
    new Set(["allium.a", "allium.b"]),
    new Set(["allium.b", "allium.c"]),
  );
  assert.deepEqual(diagnostics.missingInSpecs, ["allium.a"]);
  assert.deepEqual(diagnostics.staleInSpecs, ["allium.c"]);
  const markdown = renderDriftMarkdown(diagnostics, {
    missingInSpecs: ["allium.runChecks"],
    staleInSpecs: [],
  });
  assert.match(markdown, /Allium Spec Drift Report/);
  assert.match(markdown, /allium\.a/);
  assert.match(markdown, /allium\.runChecks/);
});
