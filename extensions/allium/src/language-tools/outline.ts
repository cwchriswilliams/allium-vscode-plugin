export type AlliumSymbolType =
  | "entity"
  | "external entity"
  | "value"
  | "variant"
  | "rule"
  | "surface"
  | "actor"
  | "config";

export interface AlliumSymbol {
  type: AlliumSymbolType;
  name: string;
  startOffset: number;
  endOffset: number;
  nameStartOffset: number;
  nameEndOffset: number;
}

export function collectAlliumSymbols(text: string): AlliumSymbol[] {
  const symbols: AlliumSymbol[] = [];

  symbols.push(...findNamedBlocks(text, /^\s*entity\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm, "entity"));
  symbols.push(...findNamedBlocks(text, /^\s*external\s+entity\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm, "external entity"));
  symbols.push(...findNamedBlocks(text, /^\s*value\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm, "value"));
  symbols.push(...findNamedBlocks(text, /^\s*variant\s+([A-Za-z_][A-Za-z0-9_]*)\s*:/gm, "variant"));
  symbols.push(...findNamedBlocks(text, /^\s*rule\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm, "rule"));
  symbols.push(...findNamedBlocks(text, /^\s*surface\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm, "surface"));
  symbols.push(...findNamedBlocks(text, /^\s*actor\s+([A-Za-z_][A-Za-z0-9_]*)\s*\{/gm, "actor"));
  symbols.push(...findConfigBlocks(text));

  return symbols.sort((a, b) => a.startOffset - b.startOffset);
}

function findNamedBlocks(
  text: string,
  pattern: RegExp,
  type: Exclude<AlliumSymbolType, "config">
): AlliumSymbol[] {
  const symbols: AlliumSymbol[] = [];

  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const name = match[1];
    const nameStartOffset = match.index + match[0].indexOf(name);
    const nameEndOffset = nameStartOffset + name.length;
    const openOffset = text.indexOf("{", match.index);
    if (openOffset < 0) {
      continue;
    }
    const endOffset = findMatchingBrace(text, openOffset);
    if (endOffset < 0) {
      continue;
    }

    symbols.push({
      type,
      name,
      startOffset: match.index,
      endOffset,
      nameStartOffset,
      nameEndOffset
    });
  }

  return symbols;
}

function findConfigBlocks(text: string): AlliumSymbol[] {
  const symbols: AlliumSymbol[] = [];
  const pattern = /^\s*config\s*\{/gm;

  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const openOffset = text.indexOf("{", match.index);
    if (openOffset < 0) {
      continue;
    }
    const endOffset = findMatchingBrace(text, openOffset);
    if (endOffset < 0) {
      continue;
    }
    symbols.push({
      type: "config",
      name: "config",
      startOffset: match.index,
      endOffset,
      nameStartOffset: match.index + match[0].indexOf("config"),
      nameEndOffset: match.index + match[0].indexOf("config") + "config".length
    });
  }

  return symbols;
}

function findMatchingBrace(text: string, openOffset: number): number {
  let depth = 0;
  for (let i = openOffset; i < text.length; i += 1) {
    const char = text[i];
    if (char === "{") {
      depth += 1;
    } else if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}
