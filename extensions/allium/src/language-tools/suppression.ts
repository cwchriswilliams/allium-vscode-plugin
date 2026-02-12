export interface SuppressionEdit {
  offset: number;
  text: string;
}

export function buildSuppressionDirectiveEdit(
  text: string,
  diagnosticCode: string,
  diagnosticLine: number,
): SuppressionEdit | null {
  const lineStart = lineStartOffset(text, diagnosticLine);
  if (lineStart < 0) {
    return null;
  }
  const existingLine = lineText(text, diagnosticLine);
  if (hasSuppression(existingLine, diagnosticCode)) {
    return null;
  }
  const indent = existingLine.match(/^\s*/)?.[0] ?? "";
  return {
    offset: lineStart,
    text: `${indent}-- allium-ignore ${diagnosticCode}\n`,
  };
}

function lineStartOffset(text: string, line: number): number {
  if (line < 0) {
    return -1;
  }
  if (line === 0) {
    return 0;
  }
  let currentLine = 0;
  for (let i = 0; i < text.length; i += 1) {
    if (text[i] === "\n") {
      currentLine += 1;
      if (currentLine === line) {
        return i + 1;
      }
    }
  }
  return -1;
}

function lineText(text: string, line: number): string {
  const start = lineStartOffset(text, line);
  if (start < 0) {
    return "";
  }
  const end = text.indexOf("\n", start);
  return text.slice(start, end >= 0 ? end : text.length);
}

function hasSuppression(line: string, code: string): boolean {
  const match = line.match(/^\s*--\s*allium-ignore\s+(.+)$/);
  if (!match) {
    return false;
  }
  const codes = match[1]
    .split(",")
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  return codes.includes("all") || codes.includes(code);
}
