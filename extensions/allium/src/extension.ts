import * as vscode from "vscode";
import { analyzeAllium } from "./language-tools/analyzer";
import * as fs from "node:fs";
import * as path from "node:path";
import {
  findDefinitionsAtOffset,
  importedSymbolAtOffset,
  parseUseAliases,
  tokenAtOffset,
} from "./language-tools/definitions";
import { planExtractLiteralToConfig } from "./language-tools/extract-literal-refactor";
import { collectTopLevelFoldingBlocks } from "./language-tools/folding";
import { formatAlliumText } from "./format";
import { hoverTextAtOffset } from "./language-tools/hover";
import { planInsertTemporalGuard } from "./language-tools/insert-temporal-guard-refactor";
import { collectAlliumSymbols } from "./language-tools/outline";
import { findReferencesInText } from "./language-tools/references";
import {
  buildWorkspaceIndex,
  resolveImportedDefinition,
} from "./language-tools/workspace-index";

const ALLIUM_LANGUAGE_ID = "allium";

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection("allium");
  context.subscriptions.push(diagnostics);

  const refreshDocument = (document: vscode.TextDocument): void => {
    if (document.languageId !== ALLIUM_LANGUAGE_ID) {
      return;
    }

    const mode = readDiagnosticsMode();
    const findings = analyzeAllium(document.getText(), { mode });
    const converted = findings.map((finding) => {
      const severity = toDiagnosticSeverity(finding.severity);
      const diagnostic = new vscode.Diagnostic(
        new vscode.Range(
          new vscode.Position(finding.start.line, finding.start.character),
          new vscode.Position(finding.end.line, finding.end.character),
        ),
        finding.message,
        severity,
      );
      diagnostic.code = finding.code;
      diagnostic.source = "allium";
      return diagnostic;
    });

    diagnostics.set(document.uri, converted);
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(refreshDocument),
    vscode.workspace.onDidChangeTextDocument((event) =>
      refreshDocument(event.document),
    ),
    vscode.workspace.onDidSaveTextDocument(refreshDocument),
    vscode.workspace.onDidCloseTextDocument((document) =>
      diagnostics.delete(document.uri),
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("allium.diagnostics.mode")) {
        return;
      }
      for (const document of vscode.workspace.textDocuments) {
        refreshDocument(document);
      }
    }),
  );

  for (const document of vscode.workspace.textDocuments) {
    refreshDocument(document);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("allium.runChecks", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== ALLIUM_LANGUAGE_ID) {
        void vscode.window.showInformationMessage(
          "Open an .allium file to run checks.",
        );
        return;
      }

      refreshDocument(editor.document);
      void vscode.window.showInformationMessage("Allium checks completed.");
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("allium.applySafeFixes", async () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== ALLIUM_LANGUAGE_ID) {
        void vscode.window.showInformationMessage(
          "Open an .allium file to apply safe fixes.",
        );
        return;
      }
      await applySafeFixes(editor.document);
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("allium.showSpecHealth", async () => {
      await showSpecHealthSummary();
    }),
  );

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      ALLIUM_LANGUAGE_ID,
      new AlliumQuickFixProvider(),
      {
        providedCodeActionKinds: [
          vscode.CodeActionKind.QuickFix,
          vscode.CodeActionKind.RefactorExtract,
          vscode.CodeActionKind.RefactorRewrite,
        ],
      },
    ),
  );

  context.subscriptions.push(
    vscode.languages.registerDocumentSymbolProvider(
      { language: ALLIUM_LANGUAGE_ID },
      new AlliumDocumentSymbolProvider(),
    ),
  );

  context.subscriptions.push(
    vscode.languages.registerDefinitionProvider(
      { language: ALLIUM_LANGUAGE_ID },
      new AlliumDefinitionProvider(),
    ),
  );
  context.subscriptions.push(
    vscode.languages.registerRenameProvider(
      { language: ALLIUM_LANGUAGE_ID },
      new AlliumRenameProvider(),
    ),
  );
  context.subscriptions.push(
    vscode.languages.registerReferenceProvider(
      { language: ALLIUM_LANGUAGE_ID },
      new AlliumReferenceProvider(),
    ),
  );

  context.subscriptions.push(
    vscode.languages.registerHoverProvider(
      { language: ALLIUM_LANGUAGE_ID },
      new AlliumHoverProvider(),
    ),
  );

  context.subscriptions.push(
    vscode.languages.registerFoldingRangeProvider(
      { language: ALLIUM_LANGUAGE_ID },
      new AlliumFoldingRangeProvider(),
    ),
  );

  context.subscriptions.push(
    vscode.languages.registerDocumentFormattingEditProvider(
      { language: ALLIUM_LANGUAGE_ID },
      new AlliumFormattingProvider(),
    ),
  );
}

export function deactivate(): void {
  // no-op
}

class AlliumQuickFixProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.code === "allium.rule.missingEnsures") {
        const action = new vscode.CodeAction(
          "Insert ensures scaffold",
          vscode.CodeActionKind.QuickFix,
        );
        action.diagnostics = [diagnostic];
        action.isPreferred = true;

        const edit = new vscode.WorkspaceEdit();
        const insertPosition = new vscode.Position(
          diagnostic.range.start.line,
          0,
        );
        edit.insert(document.uri, insertPosition, "    ensures: TODO()\n");
        action.edit = edit;
        actions.push(action);
      }

      if (diagnostic.code === "allium.temporal.missingGuard") {
        const action = new vscode.CodeAction(
          "Insert requires guard",
          vscode.CodeActionKind.QuickFix,
        );
        action.diagnostics = [diagnostic];

        const whenLine = diagnostic.range.start.line;
        const whenText = document.lineAt(whenLine).text;
        const indent = whenText.match(/^\s*/)?.[0] ?? "    ";

        const edit = new vscode.WorkspaceEdit();
        const insertPosition = new vscode.Position(whenLine + 1, 0);
        edit.insert(
          document.uri,
          insertPosition,
          `${indent}requires: /* add temporal guard */\n`,
        );
        action.edit = edit;
        actions.push(action);
      }
    }

    const extractPlan = planExtractLiteralToConfig(
      document.getText(),
      document.offsetAt(range.start),
      document.offsetAt(range.end),
    );
    if (extractPlan) {
      const action = new vscode.CodeAction(
        extractPlan.title,
        vscode.CodeActionKind.RefactorExtract,
      );
      const edit = new vscode.WorkspaceEdit();
      for (const change of extractPlan.edits) {
        const start = document.positionAt(change.startOffset);
        const end = document.positionAt(change.endOffset);
        edit.replace(document.uri, new vscode.Range(start, end), change.text);
      }
      action.edit = edit;
      actions.push(action);
    }

    const temporalGuardPlan = planInsertTemporalGuard(
      document.getText(),
      document.offsetAt(range.start),
    );
    if (temporalGuardPlan) {
      const action = new vscode.CodeAction(
        temporalGuardPlan.title,
        vscode.CodeActionKind.RefactorRewrite,
      );
      const edit = new vscode.WorkspaceEdit();
      const start = document.positionAt(temporalGuardPlan.edit.startOffset);
      const end = document.positionAt(temporalGuardPlan.edit.endOffset);
      edit.replace(
        document.uri,
        new vscode.Range(start, end),
        temporalGuardPlan.edit.text,
      );
      action.edit = edit;
      actions.push(action);
    }

    return actions;
  }
}

function readDiagnosticsMode(): "strict" | "relaxed" {
  const configuredMode = vscode.workspace
    .getConfiguration("allium")
    .get<"strict" | "relaxed">("diagnostics.mode", "strict");

  return configuredMode === "relaxed" ? "relaxed" : "strict";
}

function toDiagnosticSeverity(
  severity: "error" | "warning" | "info",
): vscode.DiagnosticSeverity {
  if (severity === "error") {
    return vscode.DiagnosticSeverity.Error;
  }
  if (severity === "warning") {
    return vscode.DiagnosticSeverity.Warning;
  }
  return vscode.DiagnosticSeverity.Information;
}

class AlliumDocumentSymbolProvider implements vscode.DocumentSymbolProvider {
  provideDocumentSymbols(
    document: vscode.TextDocument,
  ): vscode.DocumentSymbol[] {
    const text = document.getText();
    const symbols = collectAlliumSymbols(text);
    return symbols.map((symbol) => {
      const range = new vscode.Range(
        document.positionAt(symbol.startOffset),
        document.positionAt(symbol.endOffset + 1),
      );
      const selectionRange = new vscode.Range(
        document.positionAt(symbol.nameStartOffset),
        document.positionAt(symbol.nameEndOffset),
      );
      return new vscode.DocumentSymbol(
        symbol.name,
        symbol.type,
        toSymbolKind(symbol.type),
        range,
        selectionRange,
      );
    });
  }
}

function toSymbolKind(
  type: ReturnType<typeof collectAlliumSymbols>[number]["type"],
): vscode.SymbolKind {
  if (type === "rule") {
    return vscode.SymbolKind.Method;
  }
  if (type === "surface") {
    return vscode.SymbolKind.Interface;
  }
  if (type === "config") {
    return vscode.SymbolKind.Module;
  }
  return vscode.SymbolKind.Class;
}

class AlliumDefinitionProvider implements vscode.DefinitionProvider {
  provideDefinition(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Location[] {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const localMatches = findDefinitionsAtOffset(text, offset);
    if (localMatches.length > 0) {
      return localMatches.map((match) => {
        const start = document.positionAt(match.startOffset);
        const end = document.positionAt(match.endOffset);
        return new vscode.Location(document.uri, new vscode.Range(start, end));
      });
    }

    const workspaceRoot = workspaceRootForUri(document.uri);
    if (!workspaceRoot) {
      return [];
    }

    const index = buildWorkspaceIndex(workspaceRoot);
    const matches = resolveImportedDefinition(
      document.uri.fsPath,
      text,
      offset,
      index,
    );
    return matches.map((match) => {
      const start = offsetToPositionForFile(
        match.filePath,
        match.definition.startOffset,
        index,
      );
      const end = offsetToPositionForFile(
        match.filePath,
        match.definition.endOffset,
        index,
      );
      return new vscode.Location(
        vscode.Uri.file(match.filePath),
        new vscode.Range(start, end),
      );
    });
  }
}

class AlliumRenameProvider implements vscode.RenameProvider {
  provideRenameEdits(
    document: vscode.TextDocument,
    position: vscode.Position,
    newName: string,
  ): vscode.WorkspaceEdit | null {
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(newName)) {
      return null;
    }

    const text = document.getText();
    const offset = document.offsetAt(position);
    const token = tokenAtOffset(text, offset);
    if (!token) {
      return null;
    }
    const definitions = findDefinitionsAtOffset(text, offset);
    if (definitions.length === 0) {
      return null;
    }

    const edit = new vscode.WorkspaceEdit();
    const references = findReferencesInText(text, definitions[0]);
    for (const reference of references) {
      const start = document.positionAt(reference.startOffset);
      const end = document.positionAt(reference.endOffset);
      edit.replace(document.uri, new vscode.Range(start, end), newName);
    }
    return edit;
  }

  prepareRename(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Range | null {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const tokenRange = tokenRangeAtOffset(text, offset);
    if (!tokenRange) {
      return null;
    }
    return new vscode.Range(
      document.positionAt(tokenRange.startOffset),
      document.positionAt(tokenRange.endOffset),
    );
  }
}

class AlliumHoverProvider implements vscode.HoverProvider {
  provideHover(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.Hover | null {
    const text = document.getText();
    const message = hoverTextAtOffset(text, document.offsetAt(position));
    const definitions = findDefinitionsAtOffset(
      text,
      document.offsetAt(position),
    );
    if (!message && definitions.length === 0) {
      return null;
    }

    const lines: string[] = [];
    if (message) {
      lines.push(message);
    }
    if (definitions.length > 0) {
      const symbol = definitions[0];
      lines.push(`\nDeclared as \`${symbol.kind}\` in this file.`);
    } else {
      const imported = importedSymbolAtOffset(
        text,
        document.offsetAt(position),
      );
      if (imported) {
        const alias = parseUseAliases(text).find(
          (entry) => entry.alias === imported.alias,
        );
        if (alias) {
          lines.push(
            `\nImported via \`${imported.alias}\` from \`${alias.sourcePath}\`.`,
          );
        }
      }
    }

    return new vscode.Hover(lines.join(""));
  }
}

class AlliumFoldingRangeProvider implements vscode.FoldingRangeProvider {
  provideFoldingRanges(document: vscode.TextDocument): vscode.FoldingRange[] {
    const blocks = collectTopLevelFoldingBlocks(document.getText());
    return blocks.map(
      (block) => new vscode.FoldingRange(block.startLine, block.endLine),
    );
  }
}

class AlliumFormattingProvider
  implements vscode.DocumentFormattingEditProvider
{
  provideDocumentFormattingEdits(
    document: vscode.TextDocument,
  ): vscode.TextEdit[] {
    const original = document.getText();
    const config = vscode.workspace.getConfiguration("allium");
    const formatted = formatAlliumText(original, {
      indentWidth: config.get<number>("format.indentWidth", 4),
      topLevelSpacing: config.get<number>("format.topLevelSpacing", 1),
    });
    if (formatted === original) {
      return [];
    }

    const wholeDocument = new vscode.Range(
      document.positionAt(0),
      document.positionAt(original.length),
    );
    return [vscode.TextEdit.replace(wholeDocument, formatted)];
  }
}

class AlliumReferenceProvider implements vscode.ReferenceProvider {
  provideReferences(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.ReferenceContext,
  ): vscode.Location[] {
    const text = document.getText();
    const offset = document.offsetAt(position);
    const localDefinitions = findDefinitionsAtOffset(text, offset);
    if (localDefinitions.length > 0) {
      const definition = localDefinitions[0];
      const references = findReferencesInText(text, definition);
      return references
        .filter(
          (reference) =>
            context.includeDeclaration ||
            !isDefinitionReference(definition, reference),
        )
        .map((reference) => {
          const start = document.positionAt(reference.startOffset);
          const end = document.positionAt(reference.endOffset);
          return new vscode.Location(
            document.uri,
            new vscode.Range(start, end),
          );
        });
    }

    const workspaceRoot = workspaceRootForUri(document.uri);
    if (!workspaceRoot) {
      return [];
    }
    const index = buildWorkspaceIndex(workspaceRoot);
    const importedMatches = resolveImportedDefinition(
      document.uri.fsPath,
      text,
      offset,
      index,
    );
    const locations: vscode.Location[] = [];
    for (const match of importedMatches) {
      const references = findReferencesInText(
        textForFile(match.filePath, index),
        match.definition,
      );
      for (const reference of references) {
        if (
          !context.includeDeclaration &&
          isDefinitionReference(match.definition, reference)
        ) {
          continue;
        }
        locations.push(
          new vscode.Location(
            vscode.Uri.file(match.filePath),
            new vscode.Range(
              offsetToPositionForFile(
                match.filePath,
                reference.startOffset,
                index,
              ),
              offsetToPositionForFile(
                match.filePath,
                reference.endOffset,
                index,
              ),
            ),
          ),
        );
      }
    }
    return locations;
  }
}

async function applySafeFixes(document: vscode.TextDocument): Promise<void> {
  const findings = analyzeAllium(document.getText(), {
    mode: readDiagnosticsMode(),
  });
  const edit = new vscode.WorkspaceEdit();

  for (const finding of findings) {
    if (finding.code === "allium.rule.missingEnsures") {
      edit.insert(
        document.uri,
        new vscode.Position(finding.start.line, 0),
        "    ensures: TODO()\n",
      );
    }
    if (finding.code === "allium.temporal.missingGuard") {
      const whenLine = finding.start.line;
      const indent =
        document.lineAt(whenLine).text.match(/^\s*/)?.[0] ?? "    ";
      edit.insert(
        document.uri,
        new vscode.Position(whenLine + 1, 0),
        `${indent}requires: /* add temporal guard */\n`,
      );
    }
  }

  await vscode.workspace.applyEdit(edit);
  void vscode.window.showInformationMessage("Applied all safe Allium fixes.");
}

async function showSpecHealthSummary(): Promise<void> {
  const files = await vscode.workspace.findFiles(
    "**/*.allium",
    "**/{node_modules,dist,.git}/**",
  );
  let errors = 0;
  let warnings = 0;
  let infos = 0;
  const fileSummaries: string[] = [];

  for (const file of files) {
    const text = Buffer.from(await vscode.workspace.fs.readFile(file)).toString(
      "utf8",
    );
    const findings = analyzeAllium(text, { mode: "strict" });
    const e = findings.filter((f) => f.severity === "error").length;
    const w = findings.filter((f) => f.severity === "warning").length;
    const i = findings.filter((f) => f.severity === "info").length;
    errors += e;
    warnings += w;
    infos += i;
    fileSummaries.push(`${path.basename(file.fsPath)}  E:${e} W:${w} I:${i}`);
  }

  const pick = await vscode.window.showQuickPick(fileSummaries.sort(), {
    placeHolder: `Allium spec health — Errors: ${errors}, Warnings: ${warnings}, Info: ${infos}`,
  });
  if (!pick) {
    return;
  }
  void vscode.window.showInformationMessage(pick);
}

function offsetToPosition(text: string, offset: number): vscode.Position {
  let line = 0;
  let character = 0;
  for (let i = 0; i < offset && i < text.length; i += 1) {
    if (text[i] === "\n") {
      line += 1;
      character = 0;
    } else {
      character += 1;
    }
  }
  return new vscode.Position(line, character);
}

function tokenRangeAtOffset(
  text: string,
  offset: number,
): { startOffset: number; endOffset: number } | null {
  if (offset < 0 || offset >= text.length) {
    return null;
  }
  const isIdent = (char: string | undefined): boolean =>
    !!char && /[A-Za-z0-9_]/.test(char);
  let start = offset;
  while (start > 0 && isIdent(text[start - 1])) {
    start -= 1;
  }
  let end = offset;
  while (end < text.length && isIdent(text[end])) {
    end += 1;
  }
  if (start === end) {
    return null;
  }
  return { startOffset: start, endOffset: end };
}

function workspaceRootForUri(uri: vscode.Uri): string | null {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  return folder?.uri.fsPath ?? null;
}

function textForFile(
  filePath: string,
  index: ReturnType<typeof buildWorkspaceIndex>,
): string {
  return (
    index.documents.find(
      (doc) => path.resolve(doc.filePath) === path.resolve(filePath),
    )?.text ?? fs.readFileSync(filePath, "utf8")
  );
}

function offsetToPositionForFile(
  filePath: string,
  offset: number,
  index: ReturnType<typeof buildWorkspaceIndex>,
): vscode.Position {
  return offsetToPosition(textForFile(filePath, index), offset);
}

function isDefinitionReference(
  definition: { startOffset: number; endOffset: number },
  reference: { startOffset: number; endOffset: number },
): boolean {
  return (
    definition.startOffset === reference.startOffset &&
    definition.endOffset === reference.endOffset
  );
}
