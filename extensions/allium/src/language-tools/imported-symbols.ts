import * as path from "node:path";
import type { Finding } from "./analyzer";
import { parseUseAliases } from "./definitions";
import type { WorkspaceIndex } from "./workspace-index";

export function collectUndefinedImportedSymbolFindings(
  currentFilePath: string,
  text: string,
  index: WorkspaceIndex,
): Finding[] {
  const aliases = parseUseAliases(text);
  if (aliases.length === 0) {
    return [];
  }

  const aliasMap = new Map(
    aliases.map((alias) => [alias.alias, alias.sourcePath]),
  );
  const targetDefsByAlias = new Map<string, Set<string>>();
  for (const [alias, sourcePath] of aliasMap.entries()) {
    const targetPath = resolveImportPath(currentFilePath, sourcePath);
    const doc = index.documents.find(
      (entry) => path.resolve(entry.filePath) === path.resolve(targetPath),
    );
    if (!doc) {
      continue;
    }
    targetDefsByAlias.set(
      alias,
      new Set(doc.definitions.map((definition) => definition.name)),
    );
  }

  const lineStarts = buildLineStarts(text);
  const findings: Finding[] = [];
  const seen = new Set<string>();
  const pattern = /\b([A-Za-z_][A-Za-z0-9_]*)\/([A-Za-z_][A-Za-z0-9_]*)\b/g;

  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const alias = match[1];
    const symbol = match[2];
    if (!aliasMap.has(alias)) {
      continue;
    }
    if (isCommentLineAtIndex(text, match.index)) {
      continue;
    }
    if (isInsideDoubleQuotedStringAtIndex(text, match.index)) {
      continue;
    }

    const symbolOffset = match.index + alias.length + 1;
    if (symbol === "config" && text[symbolOffset + symbol.length] === ".") {
      continue;
    }

    const known = targetDefsByAlias.get(alias);
    if (known && known.has(symbol)) {
      continue;
    }
    const dedupeKey = `${alias}/${symbol}@${symbolOffset}`;
    if (seen.has(dedupeKey)) {
      continue;
    }
    seen.add(dedupeKey);

    findings.push({
      code: "allium.import.undefinedSymbol",
      message: `Imported symbol '${alias}/${symbol}' is not declared in the referenced specification.`,
      severity: "error",
      start: offsetToPosition(lineStarts, symbolOffset),
      end: offsetToPosition(lineStarts, symbolOffset + symbol.length),
    });
  }

  return findings;
}

function resolveImportPath(
  currentFilePath: string,
  sourcePath: string,
): string {
  if (path.extname(sourcePath) !== ".allium") {
    return path.resolve(path.dirname(currentFilePath), `${sourcePath}.allium`);
  }
  return path.resolve(path.dirname(currentFilePath), sourcePath);
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

function isCommentLineAtIndex(text: string, index: number): boolean {
  const lineStart = text.lastIndexOf("\n", index) + 1;
  const lineEnd = text.indexOf("\n", index);
  const line = text.slice(lineStart, lineEnd >= 0 ? lineEnd : text.length);
  return /^\s*--/.test(line);
}

function isInsideDoubleQuotedStringAtIndex(
  text: string,
  index: number,
): boolean {
  const lineStart = text.lastIndexOf("\n", index) + 1;
  let inString = false;
  for (let i = lineStart; i < index; i += 1) {
    if (text[i] !== '"' || text[i - 1] === "\\") {
      continue;
    }
    inString = !inString;
  }
  return inString;
}
