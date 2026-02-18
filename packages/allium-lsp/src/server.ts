import {
  createConnection,
  TextDocuments,
  ProposedFeatures,
  TextDocumentSyncKind,
  DiagnosticSeverity,
  Range,
  type InitializeParams,
  type InitializeResult,
  type Hover,
  type Location,
  type CompletionList,
  type DocumentSymbol,
  type WorkspaceSymbol,
  type CodeAction,
  type WorkspaceEdit,
  type FoldingRange,
  type SemanticTokens,
  type SemanticTokensParams,
  type CodeLens,
  type DocumentLink,
  type TextEdit,
  type Diagnostic,
  type Position,
} from "vscode-languageserver/node";
import { TextDocument } from "vscode-languageserver-textdocument";
import { fileURLToPath } from "node:url";

import { analyzeAllium } from "../../../extensions/allium/src/language-tools/analyzer";
import { ALLIUM_SEMANTIC_TOKEN_TYPES } from "../../../extensions/allium/src/language-tools/semantic-tokens";
import {
  buildWorkspaceIndex,
  type WorkspaceIndex,
} from "../../../extensions/allium/src/language-tools/workspace-index";

// ---------------------------------------------------------------------------
// Connection + document store
// ---------------------------------------------------------------------------

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);

// ---------------------------------------------------------------------------
// Workspace state
// ---------------------------------------------------------------------------

let workspaceRoot: string | null = null;
let workspaceIndex: WorkspaceIndex = { documents: [] };

function refreshWorkspaceIndex(): void {
  if (!workspaceRoot) return;
  try {
    workspaceIndex = buildWorkspaceIndex(workspaceRoot);
  } catch {
    // Non-fatal: cross-file features degrade gracefully to single-file mode
  }
}

// ---------------------------------------------------------------------------
// Coordinate helpers
// ---------------------------------------------------------------------------

export function offsetToPosition(text: string, offset: number): Position {
  const before = text.slice(0, offset);
  const lines = before.split("\n");
  return {
    line: lines.length - 1,
    character: lines[lines.length - 1].length,
  };
}

export function positionToOffset(text: string, position: Position): number {
  const lines = text.split("\n");
  let offset = 0;
  for (let i = 0; i < position.line && i < lines.length; i++) {
    offset += lines[i].length + 1; // +1 for \n
  }
  offset += Math.min(position.character, (lines[position.line] ?? "").length);
  return offset;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

connection.onInitialize((params: InitializeParams): InitializeResult => {
  if (params.rootUri) {
    try {
      workspaceRoot = fileURLToPath(params.rootUri);
    } catch {
      workspaceRoot = params.rootUri.replace(/^file:\/\//, "");
    }
  } else if (params.rootPath) {
    workspaceRoot = params.rootPath;
  } else if (params.workspaceFolders?.length) {
    try {
      workspaceRoot = fileURLToPath(params.workspaceFolders[0].uri);
    } catch {
      workspaceRoot = params.workspaceFolders[0].uri.replace(/^file:\/\//, "");
    }
  }

  return {
    capabilities: {
      textDocumentSync: TextDocumentSyncKind.Full,
      hoverProvider: true,
      definitionProvider: true,
      referencesProvider: true,
      documentSymbolProvider: true,
      workspaceSymbolProvider: true,
      completionProvider: { triggerCharacters: [".", " "] },
      codeActionProvider: true,
      renameProvider: { prepareProvider: true },
      documentFormattingProvider: true,
      foldingRangeProvider: true,
      semanticTokensProvider: {
        legend: {
          tokenTypes: [...ALLIUM_SEMANTIC_TOKEN_TYPES],
          tokenModifiers: [],
        },
        full: true,
      },
      codeLensProvider: { resolveProvider: false },
      documentLinkProvider: { resolveProvider: false },
    },
  };
});

connection.onInitialized(() => {
  refreshWorkspaceIndex();
});

// ---------------------------------------------------------------------------
// Document sync + diagnostics  (T1.3)
// ---------------------------------------------------------------------------

function findingSeverityToDiagnostic(
  severity: "error" | "warning" | "info",
): DiagnosticSeverity {
  switch (severity) {
    case "error":
      return DiagnosticSeverity.Error;
    case "warning":
      return DiagnosticSeverity.Warning;
    default:
      return DiagnosticSeverity.Information;
  }
}

function publishDiagnostics(document: TextDocument): void {
  const text = document.getText();
  const findings = analyzeAllium(text);

  const diagnostics: Diagnostic[] = findings.map((finding) => ({
    range: Range.create(
      finding.start.line,
      finding.start.character,
      finding.end.line,
      finding.end.character,
    ),
    severity: findingSeverityToDiagnostic(finding.severity),
    code: finding.code,
    source: "allium",
    message: finding.message,
  }));

  connection.sendDiagnostics({ uri: document.uri, diagnostics });
}

documents.onDidOpen((event) => publishDiagnostics(event.document));
documents.onDidChangeContent((event) => publishDiagnostics(event.document));
documents.onDidSave((event) => {
  refreshWorkspaceIndex();
  publishDiagnostics(event.document);
});
documents.onDidClose((event) => {
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

// ---------------------------------------------------------------------------
// Hover  (T1.4)
// ---------------------------------------------------------------------------

connection.onHover((_params): Hover | null => {
  return null;
});

// ---------------------------------------------------------------------------
// Go to definition  (T1.5)
// ---------------------------------------------------------------------------

connection.onDefinition((_params): Location | Location[] | null => {
  return null;
});

// ---------------------------------------------------------------------------
// Find references  (T1.6)
// ---------------------------------------------------------------------------

connection.onReferences((_params): Location[] | null => {
  return null;
});

// ---------------------------------------------------------------------------
// Document symbols  (T1.7)
// ---------------------------------------------------------------------------

connection.onDocumentSymbol((_params): DocumentSymbol[] => {
  return [];
});

// ---------------------------------------------------------------------------
// Workspace symbols  (T1.8)
// ---------------------------------------------------------------------------

connection.onWorkspaceSymbol((_params): WorkspaceSymbol[] => {
  return [];
});

// ---------------------------------------------------------------------------
// Completions  (T1.9)
// ---------------------------------------------------------------------------

connection.onCompletion((_params): CompletionList => {
  return { isIncomplete: false, items: [] };
});

// ---------------------------------------------------------------------------
// Code actions  (T1.10)
// ---------------------------------------------------------------------------

connection.onCodeAction((_params): CodeAction[] => {
  return [];
});

// ---------------------------------------------------------------------------
// Rename  (T1.11)
// ---------------------------------------------------------------------------

connection.onPrepareRename((_params) => {
  return null;
});

connection.onRenameRequest((_params): WorkspaceEdit | null => {
  return null;
});

// ---------------------------------------------------------------------------
// Formatting  (T1.12)
// ---------------------------------------------------------------------------

connection.onDocumentFormatting((_params): TextEdit[] => {
  return [];
});

// ---------------------------------------------------------------------------
// Folding ranges  (T1.13)
// ---------------------------------------------------------------------------

connection.onFoldingRanges((_params): FoldingRange[] => {
  return [];
});

// ---------------------------------------------------------------------------
// Semantic tokens  (T1.14)
// ---------------------------------------------------------------------------

connection.languages.semanticTokens.on(
  (_params: SemanticTokensParams): SemanticTokens => {
    return { data: [] };
  },
);

// ---------------------------------------------------------------------------
// Code lens  (T1.15)
// ---------------------------------------------------------------------------

connection.onCodeLens((_params): CodeLens[] => {
  return [];
});

// ---------------------------------------------------------------------------
// Document links  (T1.16)
// ---------------------------------------------------------------------------

connection.onDocumentLinks((_params): DocumentLink[] => {
  return [];
});

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

documents.listen(connection);
connection.listen();
