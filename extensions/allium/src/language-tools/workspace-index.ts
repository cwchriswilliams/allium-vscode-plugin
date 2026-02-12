import * as fs from "node:fs";
import * as path from "node:path";
import {
  buildDefinitionLookup,
  importedSymbolAtOffset,
  parseUseAliases,
  type DefinitionSite,
} from "./definitions";

export interface IndexedDocument {
  filePath: string;
  text: string;
  definitions: DefinitionSite[];
  uses: ReturnType<typeof parseUseAliases>;
}

export interface WorkspaceIndex {
  documents: IndexedDocument[];
}

export function buildWorkspaceIndex(root: string): WorkspaceIndex {
  const files = walkAllFiles(root).filter((filePath) =>
    filePath.endsWith(".allium"),
  );
  const documents = files.map((filePath) => {
    const text = fs.readFileSync(filePath, "utf8");
    const lookup = buildDefinitionLookup(text);
    return {
      filePath,
      text,
      definitions: [...lookup.symbols, ...lookup.configKeys],
      uses: parseUseAliases(text),
    };
  });
  return { documents };
}

export function resolveImportedDefinition(
  currentFilePath: string,
  text: string,
  offset: number,
  index: WorkspaceIndex,
): { filePath: string; definition: DefinitionSite }[] {
  const imported = importedSymbolAtOffset(text, offset);
  if (!imported) {
    return [];
  }

  const alias = parseUseAliases(text).find(
    (entry) => entry.alias === imported.alias,
  );
  if (!alias) {
    return [];
  }
  const target = resolveTargetPath(currentFilePath, alias.sourcePath);
  const targetDoc = index.documents.find(
    (doc) => path.resolve(doc.filePath) === path.resolve(target),
  );
  if (!targetDoc) {
    return [];
  }

  const definitions = targetDoc.definitions.filter(
    (def) => def.name === imported.symbol,
  );
  return definitions.map((definition) => ({
    filePath: targetDoc.filePath,
    definition,
  }));
}

function walkAllFiles(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (
          entry.name === "node_modules" ||
          entry.name === "dist" ||
          entry.name === ".git"
        ) {
          continue;
        }
        stack.push(fullPath);
      } else if (entry.isFile()) {
        out.push(fullPath);
      }
    }
  }
  return out;
}

function resolveTargetPath(
  currentFilePath: string,
  sourcePath: string,
): string {
  if (path.extname(sourcePath) !== ".allium") {
    return path.resolve(path.dirname(currentFilePath), `${sourcePath}.allium`);
  }
  return path.resolve(path.dirname(currentFilePath), sourcePath);
}
