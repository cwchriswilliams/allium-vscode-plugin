import test from "node:test";
import assert from "node:assert/strict";
import { buildDiagramPreviewHtml } from "../src/language-tools/diagram-preview";

test("renders preview HTML with controls and escaped diagram", () => {
  const html = buildDiagramPreviewHtml({
    format: "d2",
    diagramText: 'entity_A: "A < B"',
    issues: [],
    nodes: [{ id: "entity_A", label: "Entity A" }],
  });

  assert.match(html, /Copy/);
  assert.match(html, /Export/);
  assert.match(html, /Allium Diagram Preview \(d2\)/);
  assert.match(html, /A &lt; B/);
  assert.match(html, /Go to Entity A/);
});

test("renders issue list when warnings are present", () => {
  const html = buildDiagramPreviewHtml({
    format: "mermaid",
    diagramText: "flowchart LR",
    issues: [
      {
        code: "allium.diagram.skippedDeclaration",
        line: 6,
        message: "Diagram extraction skipped 'config' declaration at line 7.",
      },
    ],
    nodes: [],
  });

  assert.match(html, /extraction warning\(s\) detected/);
  assert.match(html, /allium.diagram.skippedDeclaration/);
  assert.match(html, /line 7/);
});
