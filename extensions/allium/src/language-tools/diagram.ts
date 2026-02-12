import { parseAlliumBlocks } from "./parser";

export type DiagramFormat = "d2" | "mermaid";

export interface DiagramNode {
  id: string;
  key: string;
  label: string;
  kind:
    | "entity"
    | "value"
    | "variant"
    | "rule"
    | "surface"
    | "actor"
    | "enum"
    | "trigger";
}

export interface DiagramEdge {
  from: string;
  to: string;
  label: string;
}

export interface DiagramModel {
  nodes: DiagramNode[];
  edges: DiagramEdge[];
}

export function buildDiagramModel(text: string): DiagramModel {
  const nodes: DiagramNode[] = [];
  const edges: DiagramEdge[] = [];
  const nodeByKey = new Map<string, DiagramNode>();

  const ensureNode = (
    kind: DiagramNode["kind"],
    name: string,
    labelPrefix?: string,
  ): DiagramNode => {
    const key = `${kind}:${name}`;
    const existing = nodeByKey.get(key);
    if (existing) {
      return existing;
    }
    const id = `${kind}_${name}`.replace(/[^A-Za-z0-9_]/g, "_");
    const label = labelPrefix ? `[${labelPrefix}] ${name}` : name;
    const node: DiagramNode = { id, key, label, kind };
    nodeByKey.set(key, node);
    nodes.push(node);
    return node;
  };

  const addEdge = (from: DiagramNode, to: DiagramNode, label: string): void => {
    edges.push({ from: from.id, to: to.id, label });
  };

  const blocks = parseAlliumBlocks(text);
  for (const block of blocks) {
    if (block.kind === "rule") {
      ensureNode("rule", block.name, "rule");
    } else if (block.kind === "surface") {
      ensureNode("surface", block.name, "surface");
    } else if (block.kind === "actor") {
      ensureNode("actor", block.name, "actor");
    } else if (block.kind === "enum") {
      ensureNode("enum", block.name, "enum");
    }
  }

  const topLevelPattern =
    /^\s*(external\s+entity|entity|value|variant)\s+([A-Za-z_][A-Za-z0-9_]*)(?:\s*:\s*([A-Za-z_][A-Za-z0-9_]*))?\s*\{/gm;
  for (
    let match = topLevelPattern.exec(text);
    match;
    match = topLevelPattern.exec(text)
  ) {
    const declKind = match[1];
    const name = match[2];
    const base = match[3];
    if (declKind === "value") {
      ensureNode("value", name, "value");
      continue;
    }
    if (declKind === "variant") {
      const variant = ensureNode("variant", name, "variant");
      if (base) {
        const baseEntity = ensureNode("entity", base, "entity");
        addEdge(variant, baseEntity, "extends");
      }
      continue;
    }
    ensureNode(
      "entity",
      name,
      declKind.startsWith("external") ? "external" : "entity",
    );
  }

  const entityBlockPattern =
    /^\s*(?:external\s+)?entity\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]*?)^\s*\}/gm;
  for (
    let entity = entityBlockPattern.exec(text);
    entity;
    entity = entityBlockPattern.exec(text)
  ) {
    const source = ensureNode("entity", entity[1], "entity");
    const body = entity[2];
    const relPattern =
      /^\s*[A-Za-z_][A-Za-z0-9_]*\s*:\s*([A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)?)\s+for\s+this\s+[A-Za-z_][A-Za-z0-9_]*\s*$/gm;
    for (let rel = relPattern.exec(body); rel; rel = relPattern.exec(body)) {
      const targetType = rel[1].includes("/") ? rel[1].split("/")[1] : rel[1];
      const target = ensureNode("entity", targetType, "entity");
      addEdge(source, target, "rel");
    }
  }

  const rulePattern =
    /^\s*rule\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]*?)^\s*\}/gm;
  for (let rule = rulePattern.exec(text); rule; rule = rulePattern.exec(text)) {
    const ruleNode = ensureNode("rule", rule[1], "rule");
    const body = rule[2];

    const when = body.match(/^\s*when\s*:\s*(.+)$/m);
    if (when) {
      const trigger = when[1].trim();
      const typed = trigger.match(
        /^[a-z_][a-z0-9_]*\s*:\s*([A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)?)\./,
      );
      if (typed) {
        const typeName = typed[1].includes("/")
          ? typed[1].split("/")[1]
          : typed[1];
        const entity = ensureNode("entity", typeName, "entity");
        addEdge(entity, ruleNode, "when");
      }

      const callPattern = /([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
      for (
        let call = callPattern.exec(trigger);
        call;
        call = callPattern.exec(trigger)
      ) {
        const triggerNode = ensureNode("trigger", call[1], "trigger");
        addEdge(triggerNode, ruleNode, "when");
      }
    }

    const createPattern =
      /\b([A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)?)\.created\s*\(/g;
    for (
      let create = createPattern.exec(body);
      create;
      create = createPattern.exec(body)
    ) {
      const raw = create[1];
      const typeName = raw.includes("/") ? raw.split("/")[1] : raw;
      const target = ensureNode("entity", typeName, "entity");
      addEdge(ruleNode, target, "ensures");
    }
  }

  const surfacePattern =
    /^\s*surface\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{([\s\S]*?)^\s*\}/gm;
  for (
    let surface = surfacePattern.exec(text);
    surface;
    surface = surfacePattern.exec(text)
  ) {
    const surfaceNode = ensureNode("surface", surface[1], "surface");
    const body = surface[2];

    const forMatch = body.match(
      /^\s*for\s+[A-Za-z_][A-Za-z0-9_]*\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/m,
    );
    if (forMatch) {
      const actor = ensureNode("actor", forMatch[1], "actor");
      addEdge(actor, surfaceNode, "for");
    }

    const contextMatch = body.match(
      /^\s*context\s+[A-Za-z_][A-Za-z0-9_]*\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/m,
    );
    if (contextMatch) {
      const contextEntity = ensureNode("entity", contextMatch[1], "entity");
      addEdge(contextEntity, surfaceNode, "context");
    }

    for (const callName of parseSurfaceProvidesCalls(body)) {
      const triggerNode = ensureNode("trigger", callName, "trigger");
      addEdge(surfaceNode, triggerNode, "provides");
    }
  }

  const uniqueEdges = new Map<string, DiagramEdge>();
  for (const edge of edges) {
    uniqueEdges.set(`${edge.from}|${edge.to}|${edge.label}`, edge);
  }

  return {
    nodes: [...nodes].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...uniqueEdges.values()].sort((a, b) => {
      const aKey = `${a.from}|${a.to}|${a.label}`;
      const bKey = `${b.from}|${b.to}|${b.label}`;
      return aKey.localeCompare(bKey);
    }),
  };
}

export function renderDiagram(
  model: DiagramModel,
  format: DiagramFormat,
): string {
  if (format === "mermaid") {
    return renderMermaid(model);
  }
  return renderD2(model);
}

function renderD2(model: DiagramModel): string {
  const lines: string[] = ["direction: right", ""];
  for (const node of model.nodes) {
    lines.push(`${node.id}: "${escapeD2(node.label)}"`);
  }
  if (model.nodes.length > 0) {
    lines.push("");
  }
  for (const edge of model.edges) {
    lines.push(`${edge.from} -> ${edge.to}: "${escapeD2(edge.label)}"`);
  }
  return `${lines.join("\n").replace(/\n+$/g, "")}\n`;
}

function renderMermaid(model: DiagramModel): string {
  const lines: string[] = ["flowchart LR"];
  for (const node of model.nodes) {
    lines.push(`  ${node.id}["${escapeMermaid(node.label)}"]`);
  }
  for (const edge of model.edges) {
    lines.push(`  ${edge.from} -->|${escapeMermaid(edge.label)}| ${edge.to}`);
  }
  return `${lines.join("\n")}\n`;
}

function escapeD2(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function escapeMermaid(value: string): string {
  return value.replace(/"/g, "'");
}

function parseSurfaceProvidesCalls(body: string): string[] {
  const calls: string[] = [];
  const sectionPattern = /^(\s*)provides\s*:\s*$/gm;
  for (
    let section = sectionPattern.exec(body);
    section;
    section = sectionPattern.exec(body)
  ) {
    const baseIndent = (section[1] ?? "").length;
    let cursor = section.index + section[0].length + 1;
    while (cursor < body.length) {
      const lineEnd = body.indexOf("\n", cursor);
      const end = lineEnd >= 0 ? lineEnd : body.length;
      const line = body.slice(cursor, end);
      const trimmed = line.trim();
      const indent = (line.match(/^\s*/) ?? [""])[0].length;
      if (trimmed.length === 0) {
        cursor = end + 1;
        continue;
      }
      if (indent <= baseIndent) {
        break;
      }
      const match = line.match(/([A-Za-z_][A-Za-z0-9_]*)\s*\(/);
      if (match) {
        calls.push(match[1]);
      }
      cursor = end + 1;
    }
  }
  return calls;
}
