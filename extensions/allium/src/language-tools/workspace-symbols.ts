import { type DefinitionSite } from "./definitions";
import { type WorkspaceIndex } from "./workspace-index";

export interface WorkspaceSymbolRecord {
  name: string;
  kind: DefinitionSite["kind"];
  filePath: string;
  startOffset: number;
  endOffset: number;
}

export function collectWorkspaceSymbolRecords(
  index: WorkspaceIndex,
  query: string,
): WorkspaceSymbolRecord[] {
  const normalized = query.trim().toLowerCase();
  const records = index.documents.flatMap((document) =>
    document.definitions.map((definition) => ({
      name: definition.name,
      kind: definition.kind,
      filePath: document.filePath,
      startOffset: definition.startOffset,
      endOffset: definition.endOffset,
    })),
  );

  if (normalized.length === 0) {
    return records;
  }
  return records.filter((record) =>
    record.name.toLowerCase().includes(normalized),
  );
}
