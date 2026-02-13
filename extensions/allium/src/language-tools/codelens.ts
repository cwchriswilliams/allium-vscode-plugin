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
