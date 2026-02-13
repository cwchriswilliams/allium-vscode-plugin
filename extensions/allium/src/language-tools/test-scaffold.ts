import { parseDeclarationAst } from "./typed-ast";

export function buildRuleTestScaffold(
  specText: string,
  moduleName: string,
): string {
  const declarations = parseDeclarationAst(specText).filter(
    (entry) => entry.kind === "rule",
  );
  const lines: string[] = [];
  lines.push(`import test from "node:test";`);
  lines.push(`import assert from "node:assert/strict";`);
  lines.push("");
  for (const declaration of declarations) {
    if (declaration.kind !== "rule") {
      continue;
    }
    lines.push(`test("${moduleName} / ${declaration.name}", () => {`);
    if (declaration.when) {
      lines.push(
        `  // trigger: ${declaration.when.replace(/\s+/g, " ").trim()}`,
      );
    }
    for (const req of declaration.requires) {
      lines.push(`  // requires: ${req}`);
    }
    for (const ens of declaration.ensures) {
      lines.push(`  // ensures: ${ens}`);
    }
    lines.push(`  assert.ok(true);`);
    lines.push(`});`);
    lines.push("");
  }
  return lines.join("\n");
}
