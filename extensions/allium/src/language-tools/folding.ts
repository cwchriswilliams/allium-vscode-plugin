export interface FoldingBlock {
  startLine: number;
  endLine: number;
}

export function collectTopLevelFoldingBlocks(text: string): FoldingBlock[] {
  const blocks: FoldingBlock[] = [];
  const blockStart =
    /^\s*(entity|external\s+entity|value|variant|enum|default|rule|surface|actor|config)\b[^{]*\{/gm;

  for (
    let match = blockStart.exec(text);
    match;
    match = blockStart.exec(text)
  ) {
    const openOffset = text.indexOf("{", match.index);
    if (openOffset < 0) {
      continue;
    }
    const closeOffset = findMatchingBrace(text, openOffset);
    if (closeOffset < 0) {
      continue;
    }

    const startLine = lineAtOffset(text, match.index);
    const endLine = lineAtOffset(text, closeOffset);
    if (endLine > startLine) {
      blocks.push({ startLine, endLine });
    }
  }

  return blocks;
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

function lineAtOffset(text: string, offset: number): number {
  let line = 0;
  for (let i = 0; i < offset && i < text.length; i += 1) {
    if (text[i] === "\n") {
      line += 1;
    }
  }
  return line;
}
