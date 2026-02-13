export interface SuppressionEdit {
  offset: number;
  text: string;
}

export interface SuppressionCleanupResult {
  text: string;
  removedLines: number;
  removedCodes: number;
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

export function removeStaleSuppressions(
  text: string,
  activeCodes: Set<string>,
): SuppressionCleanupResult {
  const lines = text.split("\n");
  let removedLines = 0;
  let removedCodes = 0;
  const updatedLines = lines.flatMap((line) => {
    const match = line.match(/^(\s*)--\s*allium-ignore\s+(.+)$/);
    if (!match) {
      return [line];
    }
    const indent = match[1] ?? "";
    const originalCodes = match[2]
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0);
    const retainedCodes = originalCodes.filter(
      (code) => code === "all" || activeCodes.has(code),
    );
    removedCodes += originalCodes.length - retainedCodes.length;
    if (retainedCodes.length === 0) {
      removedLines += 1;
      return [];
    }
    if (retainedCodes.length !== originalCodes.length) {
      return [`${indent}-- allium-ignore ${retainedCodes.join(", ")}`];
    }
    return [line];
  });
  return {
    text: updatedLines.join("\n"),
    removedLines,
    removedCodes,
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
