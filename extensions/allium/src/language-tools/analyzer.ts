import { parseAlliumBlocks } from "./parser";

export type FindingSeverity = "error" | "warning" | "info";
export type DiagnosticsMode = "strict" | "relaxed";

export interface Finding {
  code: string;
  message: string;
  severity: FindingSeverity;
  start: { line: number; character: number };
  end: { line: number; character: number };
}

export interface AnalyzeOptions {
  mode?: DiagnosticsMode;
}

export function analyzeAllium(
  text: string,
  options: AnalyzeOptions = {},
): Finding[] {
  const findings: Finding[] = [];
  const lineStarts = buildLineStarts(text);
  const blocks = parseAlliumBlocks(text);

  const ruleBlocks = blocks.filter((block) => block.kind === "rule");
  for (const block of ruleBlocks) {
    const hasWhen = /^\s*when\s*:/m.test(block.body);
    const hasEnsures = /^\s*ensures\s*:/m.test(block.body);

    if (!hasWhen) {
      findings.push(
        rangeFinding(
          lineStarts,
          block.startOffset,
          block.startOffset + block.name.length,
          "allium.rule.missingWhen",
          `Rule '${block.name}' must define a 'when:' trigger.`,
          "error",
        ),
      );
    }

    if (!hasEnsures) {
      findings.push(
        rangeFinding(
          lineStarts,
          block.endOffset,
          block.endOffset + 1,
          "allium.rule.missingEnsures",
          `Rule '${block.name}' should include at least one 'ensures:' clause.`,
          "error",
        ),
      );
    }

    const whenMatch = block.body.match(/^\s*when\s*:\s*(.+)$/m);
    const hasRequires = /^\s*requires\s*:/m.test(block.body);
    if (whenMatch && isTemporalWhenClause(whenMatch[1]) && !hasRequires) {
      const lineOffset =
        block.startOffset + 1 + block.body.indexOf(whenMatch[0]);
      findings.push(
        rangeFinding(
          lineStarts,
          lineOffset,
          lineOffset + whenMatch[0].length,
          "allium.temporal.missingGuard",
          "Temporal trigger should include a 'requires:' guard to avoid re-firing.",
          "warning",
        ),
      );
    }

    const letNames = new Set<string>();
    const letRegex = /^\s*let\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/gm;
    for (
      let match = letRegex.exec(block.body);
      match;
      match = letRegex.exec(block.body)
    ) {
      const name = match[1];
      if (letNames.has(name)) {
        const offset = block.startOffset + 1 + match.index;
        findings.push(
          rangeFinding(
            lineStarts,
            offset,
            offset + match[0].length,
            "allium.let.duplicateBinding",
            `Binding '${name}' is declared more than once in rule '${block.name}'.`,
            "error",
          ),
        );
      }
      letNames.add(name);
    }
  }

  findings.push(...findDuplicateConfigKeys(text, lineStarts, blocks));
  findings.push(...findUndefinedConfigReferences(text, lineStarts, blocks));
  findings.push(...findEnumDeclarationIssues(lineStarts, blocks));
  findings.push(...findContextBindingIssues(text, lineStarts, blocks));
  findings.push(...findOpenQuestions(text, lineStarts));
  findings.push(...findSurfaceActorLinkIssues(text, lineStarts, blocks));
  findings.push(...findSurfaceRelatedIssues(lineStarts, blocks));
  findings.push(...findSurfaceBindingUsageIssues(lineStarts, blocks));

  return applySuppressions(
    applyDiagnosticsMode(findings, options.mode ?? "strict"),
    text,
    lineStarts,
  );
}

function applyDiagnosticsMode(
  findings: Finding[],
  mode: DiagnosticsMode,
): Finding[] {
  if (mode === "strict") {
    return findings;
  }

  return findings.flatMap((finding) => {
    if (finding.code === "allium.temporal.missingGuard") {
      return [];
    }
    if (finding.code === "allium.config.undefinedReference") {
      return [{ ...finding, severity: "info" }];
    }
    return [finding];
  });
}

function findOpenQuestions(text: string, lineStarts: number[]): Finding[] {
  const findings: Finding[] = [];
  const pattern = /^\s*open_question\s+"[^"]*"/gm;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    findings.push(
      rangeFinding(
        lineStarts,
        match.index,
        match.index + match[0].length,
        "allium.openQuestion.present",
        "Open question present: specification is likely incomplete.",
        "warning",
      ),
    );
  }
  return findings;
}

function findUndefinedConfigReferences(
  text: string,
  lineStarts: number[],
  blocks: ReturnType<typeof parseAlliumBlocks>,
): Finding[] {
  const findings: Finding[] = [];
  const declared = new Set<string>();

  const configBlocks = blocks.filter((block) => block.kind === "config");
  const keyPattern = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm;
  for (const block of configBlocks) {
    for (
      let keyMatch = keyPattern.exec(block.body);
      keyMatch;
      keyMatch = keyPattern.exec(block.body)
    ) {
      declared.add(keyMatch[1]);
    }
  }

  const refPattern = /\bconfig\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
  for (
    let match = refPattern.exec(text);
    match;
    match = refPattern.exec(text)
  ) {
    if (isCommentLineAtIndex(text, match.index)) {
      continue;
    }
    const key = match[1];
    if (!declared.has(key)) {
      findings.push(
        rangeFinding(
          lineStarts,
          match.index,
          match.index + match[0].length,
          "allium.config.undefinedReference",
          `Reference '${match[0]}' has no matching declaration in a local config block.`,
          "warning",
        ),
      );
    }
  }

  return findings;
}

function findDuplicateConfigKeys(
  text: string,
  lineStarts: number[],
  blocks: ReturnType<typeof parseAlliumBlocks>,
): Finding[] {
  const findings: Finding[] = [];
  const configBlocks = blocks.filter((block) => block.kind === "config");

  for (const block of configBlocks) {
    const seen = new Set<string>();
    const pattern = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:/gm;
    for (
      let match = pattern.exec(block.body);
      match;
      match = pattern.exec(block.body)
    ) {
      const key = match[1];
      if (seen.has(key)) {
        const offset = block.startOffset + 1 + match.index;
        findings.push(
          rangeFinding(
            lineStarts,
            offset,
            offset + match[0].length,
            "allium.config.duplicateKey",
            `Config key '${key}' is declared more than once in this block.`,
            "error",
          ),
        );
      }
      seen.add(key);
    }
  }

  return findings;
}

function findEnumDeclarationIssues(
  lineStarts: number[],
  blocks: ReturnType<typeof parseAlliumBlocks>,
): Finding[] {
  const findings: Finding[] = [];
  const enumBlocks = blocks.filter((block) => block.kind === "enum");

  for (const block of enumBlocks) {
    const literals = new Set<string>();
    let foundAny = false;
    const literalPattern = /\b([a-z_][a-z0-9_]*)\b/g;
    for (
      let literal = literalPattern.exec(block.body);
      literal;
      literal = literalPattern.exec(block.body)
    ) {
      foundAny = true;
      const value = literal[1];
      if (literals.has(value)) {
        const offset = block.startOffset + 1 + literal.index;
        findings.push(
          rangeFinding(
            lineStarts,
            offset,
            offset + value.length,
            "allium.enum.duplicateLiteral",
            `Enum '${block.name}' declares literal '${value}' more than once.`,
            "error",
          ),
        );
      }
      literals.add(value);
    }

    if (!foundAny) {
      findings.push(
        rangeFinding(
          lineStarts,
          block.startOffset,
          block.startOffset + block.name.length,
          "allium.enum.empty",
          `Enum '${block.name}' should declare at least one literal.`,
          "warning",
        ),
      );
    }
  }

  return findings;
}

function findContextBindingIssues(
  text: string,
  lineStarts: number[],
  blocks: ReturnType<typeof parseAlliumBlocks>,
): Finding[] {
  const findings: Finding[] = [];
  const localEntityTypes = new Set<string>();
  const declaredEntityPattern =
    /^\s*(?:external\s+)?entity\s+([A-Za-z_][A-Za-z0-9_]*)\b/gm;
  for (
    let match = declaredEntityPattern.exec(text);
    match;
    match = declaredEntityPattern.exec(text)
  ) {
    localEntityTypes.add(match[1]);
  }
  const variantPattern = /^\s*variant\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/gm;
  for (
    let match = variantPattern.exec(text);
    match;
    match = variantPattern.exec(text)
  ) {
    localEntityTypes.add(match[1]);
  }

  const importAliases = new Set(
    blocks
      .filter((block) => block.kind === "use")
      .map((block) => block.alias ?? block.name),
  );
  const contextBlocks = blocks.filter((block) => block.kind === "context");
  const bindingPattern =
    /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*:\s*([A-Za-z_][A-Za-z0-9_]*(?:\/[A-Za-z_][A-Za-z0-9_]*)?)\s*$/gm;

  for (const block of contextBlocks) {
    const seenBindings = new Set<string>();
    for (
      let match = bindingPattern.exec(block.body);
      match;
      match = bindingPattern.exec(block.body)
    ) {
      const bindingName = match[1];
      const bindingType = match[2];
      const bindingOffset =
        block.startOffset + 1 + match.index + match[0].indexOf(bindingName);

      if (seenBindings.has(bindingName)) {
        findings.push(
          rangeFinding(
            lineStarts,
            bindingOffset,
            bindingOffset + bindingName.length,
            "allium.context.duplicateBinding",
            `Context binding '${bindingName}' is declared more than once.`,
            "error",
          ),
        );
      }
      seenBindings.add(bindingName);

      if (bindingType.includes("/")) {
        const alias = bindingType.split("/")[0];
        if (!importAliases.has(alias)) {
          const typeOffset =
            block.startOffset + 1 + match.index + match[0].indexOf(bindingType);
          findings.push(
            rangeFinding(
              lineStarts,
              typeOffset,
              typeOffset + bindingType.length,
              "allium.context.undefinedType",
              `Context binding type '${bindingType}' does not resolve to a local entity or imported alias.`,
              "error",
            ),
          );
        }
        continue;
      }

      if (!localEntityTypes.has(bindingType)) {
        const typeOffset =
          block.startOffset + 1 + match.index + match[0].indexOf(bindingType);
        findings.push(
          rangeFinding(
            lineStarts,
            typeOffset,
            typeOffset + bindingType.length,
            "allium.context.undefinedType",
            `Context binding type '${bindingType}' does not resolve to a local entity or imported alias.`,
            "error",
          ),
        );
      }
    }
  }

  return findings;
}

function isTemporalWhenClause(clause: string): boolean {
  const normalized = clause.trim();
  if (/:[^\n]*(<=|>=|<|>)\s*now\b/.test(normalized)) {
    return true;
  }
  if (/\bnow\s*[+-]\s*\d/.test(normalized)) {
    return true;
  }
  return false;
}

function buildLineStarts(text: string): number[] {
  const starts = [0];
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      starts.push(i + 1);
    }
  }
  return starts;
}

function offsetToPosition(
  lineStarts: number[],
  offset: number,
): { line: number; character: number } {
  let line = 0;
  let hi = lineStarts.length - 1;
  while (line <= hi) {
    const mid = Math.floor((line + hi) / 2);
    if (lineStarts[mid] <= offset) {
      if (mid === lineStarts.length - 1 || lineStarts[mid + 1] > offset) {
        return { line: mid, character: offset - lineStarts[mid] };
      }
      line = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return { line: 0, character: offset };
}

function rangeFinding(
  lineStarts: number[],
  startOffset: number,
  endOffset: number,
  code: string,
  message: string,
  severity: FindingSeverity,
): Finding {
  return {
    code,
    message,
    severity,
    start: offsetToPosition(lineStarts, startOffset),
    end: offsetToPosition(lineStarts, endOffset),
  };
}

function findSurfaceActorLinkIssues(
  _text: string,
  lineStarts: number[],
  blocks: ReturnType<typeof parseAlliumBlocks>,
): Finding[] {
  const findings: Finding[] = [];
  const actorNames = new Set(
    blocks.filter((block) => block.kind === "actor").map((block) => block.name),
  );
  const surfaceBlocks = blocks.filter((block) => block.kind === "surface");
  const referencedActors = new Set<string>();
  const forPattern =
    /^\s*for\s+[A-Za-z_][A-Za-z0-9_]*\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s*$/m;

  for (const surface of surfaceBlocks) {
    const match = surface.body.match(forPattern);
    if (!match) {
      continue;
    }
    const actorName = match[1];
    referencedActors.add(actorName);
    if (!actorNames.has(actorName)) {
      const lineOffset =
        surface.startOffset + 1 + surface.body.indexOf(match[0]);
      findings.push(
        rangeFinding(
          lineStarts,
          lineOffset,
          lineOffset + match[0].length,
          "allium.surface.missingActor",
          `Surface '${surface.name}' references actor '${actorName}' which is not declared locally.`,
          "warning",
        ),
      );
    }
  }

  for (const actor of blocks.filter((block) => block.kind === "actor")) {
    if (referencedActors.has(actor.name)) {
      continue;
    }
    findings.push(
      rangeFinding(
        lineStarts,
        actor.startOffset,
        actor.startOffset + actor.name.length,
        "allium.actor.unused",
        `Actor '${actor.name}' is not referenced by any local surface.`,
        "info",
      ),
    );
  }

  return findings;
}

function findSurfaceRelatedIssues(
  lineStarts: number[],
  blocks: ReturnType<typeof parseAlliumBlocks>,
): Finding[] {
  const findings: Finding[] = [];
  const surfaceBlocks = blocks.filter((block) => block.kind === "surface");
  const knownSurfaceNames = new Set(
    surfaceBlocks.map((surface) => surface.name),
  );

  for (const surface of surfaceBlocks) {
    const relatedRefs = parseRelatedReferences(surface.body);
    for (const ref of relatedRefs) {
      if (knownSurfaceNames.has(ref.name)) {
        continue;
      }
      const offset = surface.startOffset + 1 + ref.offsetInBody;
      findings.push(
        rangeFinding(
          lineStarts,
          offset,
          offset + ref.name.length,
          "allium.surface.relatedUndefined",
          `Surface '${surface.name}' references unknown related surface '${ref.name}'.`,
          "error",
        ),
      );
    }
  }

  return findings;
}

function findSurfaceBindingUsageIssues(
  lineStarts: number[],
  blocks: ReturnType<typeof parseAlliumBlocks>,
): Finding[] {
  const findings: Finding[] = [];
  const surfaceBlocks = blocks.filter((block) => block.kind === "surface");

  for (const surface of surfaceBlocks) {
    const body = surface.body;
    const forMatch = body.match(
      /^\s*for\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*[A-Za-z_][A-Za-z0-9_]*(?:\s+with\s+.+)?\s*$/m,
    );
    const contextMatch = body.match(
      /^\s*context\s+([A-Za-z_][A-Za-z0-9_]*)\s*:\s*[A-Za-z_][A-Za-z0-9_]*(?:\s+with\s+.+)?\s*$/m,
    );
    const bindings = [
      ...(forMatch
        ? [{ name: forMatch[1], source: "for", line: forMatch[0] }]
        : []),
      ...(contextMatch
        ? [{ name: contextMatch[1], source: "context", line: contextMatch[0] }]
        : []),
    ];

    for (const binding of bindings) {
      const usagePattern = new RegExp(
        `\\b${escapeRegex(binding.name)}\\b`,
        "g",
      );
      const matches = [...body.matchAll(usagePattern)];
      if (matches.length > 1) {
        continue;
      }

      const linePattern = new RegExp(
        `^\\s*${binding.source}\\s+${escapeRegex(binding.name)}\\s*:`,
        "m",
      );
      const lineMatch = body.match(linePattern);
      if (!lineMatch) {
        continue;
      }
      const offsetInBody = body.indexOf(lineMatch[0]);
      const absoluteOffset =
        surface.startOffset +
        1 +
        offsetInBody +
        lineMatch[0].indexOf(binding.name);
      findings.push(
        rangeFinding(
          lineStarts,
          absoluteOffset,
          absoluteOffset + binding.name.length,
          "allium.surface.unusedBinding",
          `Surface '${surface.name}' binding '${binding.name}' from '${binding.source}' is not used in the surface body.`,
          "warning",
        ),
      );
    }
  }

  return findings;
}

function parseRelatedReferences(
  body: string,
): Array<{ name: string; offsetInBody: number }> {
  const refs: Array<{ name: string; offsetInBody: number }> = [];
  const relatedPattern = /^(\s*)related\s*:\s*$/gm;
  for (
    let related = relatedPattern.exec(body);
    related;
    related = relatedPattern.exec(body)
  ) {
    const baseIndent = (related[1] ?? "").length;
    const sectionStart = related.index + related[0].length + 1;
    let cursor = sectionStart;

    while (cursor < body.length) {
      const nextNewline = body.indexOf("\n", cursor);
      const lineEnd = nextNewline >= 0 ? nextNewline : body.length;
      const line = body.slice(cursor, lineEnd);
      const trimmed = line.trim();
      const indent = (line.match(/^\s*/) ?? [""])[0].length;

      if (trimmed.length === 0) {
        cursor = lineEnd + 1;
        continue;
      }
      if (indent <= baseIndent) {
        break;
      }
      if (!trimmed.startsWith("--")) {
        const identifierPattern = /([A-Za-z_][A-Za-z0-9_]*)/g;
        for (
          let ident = identifierPattern.exec(line);
          ident;
          ident = identifierPattern.exec(line)
        ) {
          refs.push({
            name: ident[1],
            offsetInBody: cursor + ident.index,
          });
        }
      }

      cursor = lineEnd + 1;
    }
  }
  return refs;
}

function applySuppressions(
  findings: Finding[],
  text: string,
  lineStarts: number[],
): Finding[] {
  const directives = collectSuppressions(text, lineStarts);
  return findings.filter((finding) => {
    const line = finding.start.line;
    const lineSuppressed = directives.get(line);
    const prevLineSuppressed = directives.get(line - 1);
    const active = lineSuppressed ?? prevLineSuppressed;
    if (!active) {
      return true;
    }
    return !(active.has("all") || active.has(finding.code));
  });
}

function collectSuppressions(
  text: string,
  lineStarts: number[],
): Map<number, Set<string>> {
  const suppressionByLine = new Map<number, Set<string>>();
  const pattern = /^\s*--\s*allium-ignore\s+([A-Za-z0-9._,\- \t]+)$/gm;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const line = offsetToPosition(lineStarts, match.index).line;
    const codes = match[1]
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    suppressionByLine.set(line, new Set(codes));
  }
  return suppressionByLine;
}

function isCommentLineAtIndex(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf("\n", index) + 1;
  const lineEnd = text.indexOf("\n", index);
  const line = text.slice(lineStart, lineEnd >= 0 ? lineEnd : text.length);
  return /^\s*--/.test(line);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
