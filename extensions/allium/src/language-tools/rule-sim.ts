import { parseDeclarationAst } from "./typed-ast";

export interface RuleSimulationPreview {
  ruleName: string;
  requires: Array<{ expression: string; result: "true" | "false" | "error" }>;
  ensures: Array<{ expression: string; result: "true" | "false" | "error" }>;
}

export function simulateRuleAtOffset(
  text: string,
  offset: number,
  bindings: Record<string, unknown>,
): RuleSimulationPreview | null {
  const block = parseDeclarationAst(text).find(
    (entry) =>
      entry.kind === "rule" &&
      offset >= entry.startOffset &&
      offset <= entry.endOffset,
  );
  if (!block || block.kind !== "rule") {
    return null;
  }
  return {
    ruleName: block.name,
    requires: block.requires.map((expression) => ({
      expression,
      result: evaluateExpression(expression, bindings),
    })),
    ensures: block.ensures.map((expression) => ({
      expression,
      result: evaluateExpression(expression, bindings),
    })),
  };
}

export function renderSimulationMarkdown(
  preview: RuleSimulationPreview,
  bindings: Record<string, unknown>,
): string {
  const lines: string[] = [];
  lines.push(`# Rule Simulation: ${preview.ruleName}`);
  lines.push("");
  lines.push("## Bindings");
  lines.push("```json");
  lines.push(JSON.stringify(bindings, null, 2));
  lines.push("```");
  lines.push("");
  lines.push("## Requires");
  if (preview.requires.length === 0) {
    lines.push("- _(none)_");
  } else {
    for (const item of preview.requires) {
      lines.push(`- \`${item.expression}\` => **${item.result}**`);
    }
  }
  lines.push("");
  lines.push("## Ensures");
  if (preview.ensures.length === 0) {
    lines.push("- _(none)_");
  } else {
    for (const item of preview.ensures) {
      lines.push(`- \`${item.expression}\` => **${item.result}**`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function evaluateExpression(
  expression: string,
  bindings: Record<string, unknown>,
): "true" | "false" | "error" {
  try {
    const jsExpression = toJavaScriptExpression(expression);
    const result = Function(
      "bindings",
      `with (bindings) { return Boolean(${jsExpression}); }`,
    )(bindings);
    return result ? "true" : "false";
  } catch {
    return "error";
  }
}

function toJavaScriptExpression(expression: string): string {
  return expression
    .replace(/\bexists\s+([A-Za-z_][A-Za-z0-9_]*)/g, "($1 != null)")
    .replace(/\band\b/g, "&&")
    .replace(/\bor\b/g, "||")
    .replace(/\bnot\b/g, "!")
    .replace(/([^!><])=([^=])/g, "$1==$2")
    .replace(
      /([=!><]=?)\s*([A-Za-z_][A-Za-z0-9_]*)\b/g,
      (full, op: string, token: string) => {
        if (token === "true" || token === "false" || token === "null") {
          return `${op} ${token}`;
        }
        return `${op} "${token}"`;
      },
    );
}
