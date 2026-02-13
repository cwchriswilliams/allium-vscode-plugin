import { collectAlliumSymbols } from "./outline";

export interface AlliumCodeLensTarget {
  name: string;
  startOffset: number;
  endOffset: number;
}

export function collectCodeLensTargets(text: string): AlliumCodeLensTarget[] {
  return collectAlliumSymbols(text)
    .filter((symbol) => symbol.type !== "config")
    .map((symbol) => ({
      name: symbol.name,
      startOffset: symbol.nameStartOffset,
      endOffset: symbol.nameEndOffset,
    }));
}

export function countSymbolReferencesInTestBodies(
  symbolNames: string[],
  testBodies: string[],
): Map<string, number> {
  const counts = new Map<string, number>();
  for (const name of symbolNames) {
    const pattern = new RegExp(`\\b${escapeRegExp(name)}\\b`, "g");
    let count = 0;
    for (const body of testBodies) {
      const matches = body.match(pattern);
      count += matches?.length ?? 0;
    }
    counts.set(name, count);
  }
  return counts;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
