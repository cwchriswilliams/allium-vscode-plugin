import { type DefinitionSite } from "./definitions";

export interface ReferenceSite {
  startOffset: number;
  endOffset: number;
}

export function findReferencesInText(
  text: string,
  definition: DefinitionSite,
): ReferenceSite[] {
  if (definition.kind === "config_key") {
    return findConfigKeyReferences(text, definition.name);
  }
  return findWordReferences(text, definition.name);
}

function findConfigKeyReferences(text: string, key: string): ReferenceSite[] {
  const references: ReferenceSite[] = [];
  const declarationPattern = new RegExp(
    `^\\s*(${escapeRegex(key)})\\s*:`,
    "gm",
  );
  for (
    let match = declarationPattern.exec(text);
    match;
    match = declarationPattern.exec(text)
  ) {
    references.push({
      startOffset: match.index + match[0].indexOf(key),
      endOffset: match.index + match[0].indexOf(key) + key.length,
    });
  }

  const refPattern = new RegExp(`\\bconfig\\.(${escapeRegex(key)})\\b`, "g");
  for (
    let match = refPattern.exec(text);
    match;
    match = refPattern.exec(text)
  ) {
    references.push({
      startOffset: match.index + "config.".length,
      endOffset: match.index + "config.".length + key.length,
    });
  }

  return dedupe(references);
}

function findWordReferences(text: string, name: string): ReferenceSite[] {
  const references: ReferenceSite[] = [];
  const pattern = new RegExp(`\\b${escapeRegex(name)}\\b`, "g");
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    if (isCommentLineAtIndex(text, match.index)) {
      continue;
    }
    references.push({
      startOffset: match.index,
      endOffset: match.index + name.length,
    });
  }
  return dedupe(references);
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isCommentLineAtIndex(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf("\n", index) + 1;
  const lineEnd = text.indexOf("\n", index);
  const line = text.slice(lineStart, lineEnd >= 0 ? lineEnd : text.length);
  return /^\s*--/.test(line);
}

function dedupe(values: ReferenceSite[]): ReferenceSite[] {
  const seen = new Set<string>();
  const out: ReferenceSite[] = [];
  for (const value of values) {
    const key = `${value.startOffset}:${value.endOffset}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    out.push(value);
  }
  return out;
}
