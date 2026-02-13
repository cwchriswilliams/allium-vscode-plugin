import { type DiagramFormat, type DiagramIssue } from "./diagram";

export interface DiagramPreviewModel {
  format: DiagramFormat;
  diagramText: string;
  issues: DiagramIssue[];
  nodes: Array<{ id: string; label: string }>;
  edges: Array<{ id: string; label: string }>;
}

export function buildDiagramPreviewHtml(model: DiagramPreviewModel): string {
  const issueSummary =
    model.issues.length === 0
      ? "No extraction warnings."
      : `${model.issues.length} extraction warning(s) detected.`;

  const issueItems =
    model.issues.length === 0
      ? ""
      : `<ul>${model.issues
          .map(
            (issue) =>
              `<li><code>${escapeHtml(issue.code)}</code> line ${issue.line + 1}: ${escapeHtml(issue.message)}</li>`,
          )
          .join("")}</ul>`;

  const escapedDiagram = escapeHtml(model.diagramText);
  const nodeItems =
    model.nodes.length === 0
      ? "<p>No nodes found.</p>"
      : `<ul>${model.nodes
          .map(
            (node) =>
              `<li><button type="button" class="jump" data-node-id="${escapeHtml(node.id)}">Go to ${escapeHtml(node.label)}</button></li>`,
          )
          .join("")}</ul>`;
  const edgeItems =
    model.edges.length === 0
      ? "<p>No edges found.</p>"
      : `<ul>${model.edges
          .map(
            (edge) =>
              `<li><button type="button" class="jump-edge" data-edge-id="${escapeHtml(edge.id)}">Go to edge ${escapeHtml(edge.label)}</button></li>`,
          )
          .join("")}</ul>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Allium Diagram Preview</title>
    <style>
      :root {
        color-scheme: light dark;
      }
      body {
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif;
        margin: 0;
        padding: 0;
      }
      header {
        position: sticky;
        top: 0;
        display: flex;
        gap: 10px;
        align-items: center;
        padding: 10px 14px;
        border-bottom: 1px solid color-mix(in srgb, currentColor 20%, transparent);
        background: color-mix(in srgb, canvas 92%, transparent);
      }
      button {
        border: 1px solid color-mix(in srgb, currentColor 30%, transparent);
        border-radius: 6px;
        background: transparent;
        padding: 4px 10px;
        cursor: pointer;
      }
      main {
        padding: 14px;
        display: grid;
        gap: 12px;
      }
      .meta {
        font-size: 12px;
        opacity: 0.8;
      }
      pre {
        margin: 0;
        padding: 12px;
        border-radius: 8px;
        overflow: auto;
        background: color-mix(in srgb, canvas 85%, black 5%);
        border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
      }
      code {
        font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
        font-size: 12px;
      }
      ul {
        margin: 0;
        padding-left: 18px;
      }
    </style>
  </head>
  <body>
    <header>
      <strong>Allium Diagram Preview (${model.format})</strong>
      <button id="copy-btn" type="button">Copy</button>
      <button id="export-btn" type="button">Export</button>
    </header>
    <main>
      <section class="meta">${escapeHtml(issueSummary)}</section>
      ${issueItems}
      <section>
        <h3>Nodes</h3>
        ${nodeItems}
      </section>
      <section>
        <h3>Edges</h3>
        ${edgeItems}
      </section>
      <pre><code>${escapedDiagram}</code></pre>
    </main>
    <script>
      const vscode = acquireVsCodeApi();
      document.getElementById("copy-btn")?.addEventListener("click", () => {
        vscode.postMessage({ type: "copy" });
      });
      document.getElementById("export-btn")?.addEventListener("click", () => {
        vscode.postMessage({ type: "export" });
      });
      for (const button of document.querySelectorAll("button.jump")) {
        button.addEventListener("click", () => {
          const nodeId = button.getAttribute("data-node-id");
          if (!nodeId) {
            return;
          }
          vscode.postMessage({ type: "reveal", nodeId });
        });
      }
      for (const button of document.querySelectorAll("button.jump-edge")) {
        button.addEventListener("click", () => {
          const edgeId = button.getAttribute("data-edge-id");
          if (!edgeId) {
            return;
          }
          vscode.postMessage({ type: "revealEdge", edgeId });
        });
      }
    </script>
  </body>
</html>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
