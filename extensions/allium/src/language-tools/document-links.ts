export interface UseImportPath {
  sourcePath: string;
  startOffset: number;
  endOffset: number;
}

export function collectUseImportPaths(text: string): UseImportPath[] {
  const paths: UseImportPath[] = [];
  const pattern = /^\s*use\s+"([^"]+)"\s+as\s+[A-Za-z_][A-Za-z0-9_]*\s*$/gm;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) {
    const sourcePath = match[1];
    const quoted = `"${sourcePath}"`;
    const quotedOffset = match[0].indexOf(quoted);
    const startOffset = match.index + quotedOffset + 1;
    paths.push({
      sourcePath,
      startOffset,
      endOffset: startOffset + sourcePath.length,
    });
  }
  return paths;
}
