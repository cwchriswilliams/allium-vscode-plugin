import * as vscode from "vscode";
import { analyzeAllium } from "./language-tools/analyzer";
import * as fs from "node:fs";
import * as path from "node:path";
import { planExtractInlineEnumToNamedEnum } from "./language-tools/extract-inline-enum-refactor";
import {
  findDefinitionsAtOffset,
  importedSymbolAtOffset,
  parseUseAliases,
} from "./language-tools/definitions";
import { collectUseImportPaths } from "./language-tools/document-links";
import { planExtractLiteralToConfig } from "./language-tools/extract-literal-refactor";
import { collectTopLevelFoldingBlocks } from "./language-tools/folding";
import { formatAlliumText } from "./format";
import {
  findLeadingDocComment,
  hoverTextAtOffset,
} from "./language-tools/hover";
import { planInsertTemporalGuard } from "./language-tools/insert-temporal-guard-refactor";
import { collectAlliumSymbols } from "./language-tools/outline";
import { collectCompletionCandidates } from "./language-tools/completion";
import {
  buildDiagramResult,
  renderDiagram,
  type DiagramFormat,
  type DiagramModel,
} from "./language-tools/diagram";
import { buildDiagramPreviewHtml } from "./language-tools/diagram-preview";
import { findReferencesInText } from "./language-tools/references";
import {
  ALLIUM_SEMANTIC_TOKEN_TYPES,
  collectSemanticTokenEntries,
} from "./language-tools/semantic-tokens";
import { buildSuppressionDirectiveEdit } from "./language-tools/suppression";
import {
  buildWorkspaceIndex,
  resolveImportedDefinition,
} from "./language-tools/workspace-index";
import { collectWorkspaceSymbolRecords } from "./language-tools/workspace-symbols";
import { collectUndefinedImportedSymbolFindings } from "./language-tools/imported-symbols";
import { planRename, prepareRenameTarget } from "./language-tools/rename";

const ALLIUM_LANGUAGE_ID = "allium";
const semanticTokensLegend = new vscode.SemanticTokensLegend([
  ...ALLIUM_SEMANTIC_TOKEN_TYPES,
]);

export function activate(context: vscode.ExtensionContext): void {
  const diagnostics = vscode.languages.createDiagnosticCollection("allium");
  context.subscriptions.push(diagnostics);

  const refreshDocument = (document: vscode.TextDocument): void => {
    if (document.languageId !== ALLIUM_LANGUAGE_ID) {
      return;
    }

    const mode = readDiagnosticsMode();
    const baseFindings = analyzeAllium(document.getText(), { mode });
    const workspaceRoot = workspaceRootForUri(document.uri);
    const importedFindings = workspaceRoot
      ? collectUndefinedImportedSymbolFindings(
          document.uri.fsPath,
          document.getText(),
          buildWorkspaceIndex(workspaceRoot),
        )
      : [];
    const findings = [...baseFindings, ...importedFindings];
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
    vscode.commands.registerCommand("allium.generateDiagram", async () => {
      await showDiagramPreview();
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
  context.subscriptions.push(
    vscode.languages.registerDocumentSemanticTokensProvider(
      { language: ALLIUM_LANGUAGE_ID },
      new AlliumSemanticTokensProvider(),
      semanticTokensLegend,
    ),
  );
  context.subscriptions.push(
    vscode.languages.registerCompletionItemProvider(
      { language: ALLIUM_LANGUAGE_ID },
      new AlliumCompletionProvider(),
      ".",
    ),
  );
  context.subscriptions.push(
    vscode.languages.registerWorkspaceSymbolProvider(
      new AlliumWorkspaceSymbolProvider(),
    ),
  );
  context.subscriptions.push(
    vscode.languages.registerDocumentLinkProvider(
      { language: ALLIUM_LANGUAGE_ID },
      new AlliumDocumentLinkProvider(),
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

      const diagnosticCode = String(diagnostic.code ?? "");
      if (diagnosticCode.startsWith("allium.")) {
        const suppression = buildSuppressionDirectiveEdit(
          document.getText(),
          diagnosticCode,
          diagnostic.range.start.line,
        );
        if (suppression) {
          const action = new vscode.CodeAction(
            "Suppress this diagnostic here",
            vscode.CodeActionKind.QuickFix,
          );
          action.diagnostics = [diagnostic];
          const edit = new vscode.WorkspaceEdit();
          edit.insert(
            document.uri,
            document.positionAt(suppression.offset),
            suppression.text,
          );
          action.edit = edit;
          actions.push(action);
        }
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

    const inlineEnumPlan = planExtractInlineEnumToNamedEnum(
      document.getText(),
      document.offsetAt(range.start),
    );
    if (inlineEnumPlan) {
      const action = new vscode.CodeAction(
        inlineEnumPlan.title,
        vscode.CodeActionKind.RefactorRewrite,
      );
      const edit = new vscode.WorkspaceEdit();
      for (const change of inlineEnumPlan.edits) {
        const start = document.positionAt(change.startOffset);
        const end = document.positionAt(change.endOffset);
        edit.replace(document.uri, new vscode.Range(start, end), change.text);
      }
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
  type:
    | ReturnType<typeof collectAlliumSymbols>[number]["type"]
    | "external_entity"
    | "value"
    | "variant"
    | "enum"
    | "default"
    | "default_instance"
    | "config_key",
): vscode.SymbolKind {
  if (type === "entity" || type === "external_entity") {
    return vscode.SymbolKind.Class;
  }
  if (type === "value" || type === "variant") {
    return vscode.SymbolKind.EnumMember;
  }
  if (type === "enum") {
    return vscode.SymbolKind.Enum;
  }
  if (type === "rule") {
    return vscode.SymbolKind.Method;
  }
  if (type === "surface") {
    return vscode.SymbolKind.Interface;
  }
  if (type === "actor") {
    return vscode.SymbolKind.Class;
  }
  if (type === "config_key") {
    return vscode.SymbolKind.Property;
  }
  if (type === "default" || type === "default_instance") {
    return vscode.SymbolKind.Constant;
  }
  if (type === "config") {
    return vscode.SymbolKind.Module;
  }
  return vscode.SymbolKind.Variable;
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
    const text = document.getText();
    const offset = document.offsetAt(position);
    const rename = planRename(text, offset, newName);
    if (!rename.plan) {
      if (rename.error) {
        throw new Error(rename.error);
      }
      return null;
    }

    const edit = new vscode.WorkspaceEdit();
    for (const reference of rename.plan.references) {
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
    const tokenRange = prepareRenameTarget(text, offset);
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
      const docComment = findLeadingDocComment(text, symbol.startOffset);
      if (docComment) {
        lines.push(`\n${docComment}`);
      }
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

class AlliumSemanticTokensProvider
  implements vscode.DocumentSemanticTokensProvider
{
  provideDocumentSemanticTokens(
    document: vscode.TextDocument,
  ): vscode.SemanticTokens {
    const builder = new vscode.SemanticTokensBuilder(semanticTokensLegend);
    const entries = collectSemanticTokenEntries(document.getText());
    for (const entry of entries) {
      const tokenTypeIndex = ALLIUM_SEMANTIC_TOKEN_TYPES.indexOf(
        entry.tokenType,
      );
      if (tokenTypeIndex < 0) {
        continue;
      }
      builder.push(
        entry.line,
        entry.character,
        entry.length,
        tokenTypeIndex,
        0,
      );
    }
    return builder.build();
  }
}

class AlliumCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
  ): vscode.CompletionItem[] {
    const candidates = collectCompletionCandidates(
      document.getText(),
      document.offsetAt(position),
    );
    return candidates.map((candidate) => {
      const kind =
        candidate.kind === "property"
          ? vscode.CompletionItemKind.Property
          : vscode.CompletionItemKind.Keyword;
      return new vscode.CompletionItem(candidate.label, kind);
    });
  }
}

class AlliumWorkspaceSymbolProvider implements vscode.WorkspaceSymbolProvider {
  provideWorkspaceSymbols(query: string): vscode.SymbolInformation[] {
    const folders = vscode.workspace.workspaceFolders ?? [];
    const out: vscode.SymbolInformation[] = [];
    for (const folder of folders) {
      const index = buildWorkspaceIndex(folder.uri.fsPath);
      const records = collectWorkspaceSymbolRecords(index, query);
      for (const record of records) {
        out.push(
          new vscode.SymbolInformation(
            record.name,
            toSymbolKind(record.kind),
            path.basename(record.filePath),
            new vscode.Location(
              vscode.Uri.file(record.filePath),
              new vscode.Range(
                offsetToPositionForFile(
                  record.filePath,
                  record.startOffset,
                  index,
                ),
                offsetToPositionForFile(
                  record.filePath,
                  record.endOffset,
                  index,
                ),
              ),
            ),
          ),
        );
      }
    }
    return out;
  }
}

class AlliumDocumentLinkProvider implements vscode.DocumentLinkProvider {
  provideDocumentLinks(document: vscode.TextDocument): vscode.DocumentLink[] {
    const links = collectUseImportPaths(document.getText());
    return links.map((link) => {
      const start = document.positionAt(link.startOffset);
      const end = document.positionAt(link.endOffset);
      const targetPath = resolveImportPath(
        document.uri.fsPath,
        link.sourcePath,
      );
      return new vscode.DocumentLink(
        new vscode.Range(start, end),
        vscode.Uri.file(targetPath),
      );
    });
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

async function showDiagramPreview(): Promise<void> {
  const active = vscode.window.activeTextEditor?.document;
  const choices: Array<{
    label: string;
    detail: string;
    scope: "active" | "workspace";
  }> = [];
  if (active?.languageId === ALLIUM_LANGUAGE_ID) {
    choices.push({
      label: "Active .allium file",
      detail: path.basename(active.uri.fsPath),
      scope: "active",
    });
  }
  choices.push({
    label: "All workspace .allium files",
    detail: "Merge all specs into one diagram",
    scope: "workspace",
  });

  const scopePick = await vscode.window.showQuickPick(choices, {
    placeHolder: "Choose diagram source",
  });
  if (!scopePick) {
    return;
  }

  const formatPick = (await vscode.window.showQuickPick(["d2", "mermaid"], {
    placeHolder: "Choose diagram format",
  })) as DiagramFormat | undefined;
  if (!formatPick) {
    return;
  }

  let documents: vscode.TextDocument[] = [];
  if (scopePick.scope === "active") {
    if (!active || active.languageId !== ALLIUM_LANGUAGE_ID) {
      void vscode.window.showInformationMessage("Open an .allium file first.");
      return;
    }
    documents = [active];
  } else {
    const files = await vscode.workspace.findFiles(
      "**/*.allium",
      "**/{node_modules,dist,.git}/**",
    );
    if (files.length === 0) {
      void vscode.window.showInformationMessage(
        "No .allium files found in workspace.",
      );
      return;
    }
    documents = await Promise.all(
      files.map((file) => vscode.workspace.openTextDocument(file)),
    );
  }

  const results = documents.map((document) =>
    buildDiagramResult(document.getText()),
  );
  const mergedModel = mergeDiagramModels(results.map((result) => result.model));
  const issues = results.flatMap((result) => result.issues);
  const diagramText = renderDiagram(mergedModel, formatPick);

  const panel = vscode.window.createWebviewPanel(
    "allium.diagram.preview",
    `Allium Diagram (${formatPick})`,
    vscode.ViewColumn.Beside,
    { enableScripts: true },
  );
  panel.webview.html = buildDiagramPreviewHtml({
    format: formatPick,
    diagramText,
    issues,
  });

  panel.webview.onDidReceiveMessage(
    async (message: unknown) => {
      if (!message || typeof message !== "object") {
        return;
      }
      const typed = message as { type?: string };
      if (typed.type === "copy") {
        await vscode.env.clipboard.writeText(diagramText);
        void vscode.window.showInformationMessage("Allium diagram copied.");
        return;
      }
      if (typed.type === "export") {
        const extension = formatPick === "mermaid" ? "mmd" : "d2";
        const uri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(
            path.join(
              workspaceRootForUri(documents[0].uri) ?? process.cwd(),
              `allium-diagram.${extension}`,
            ),
          ),
          filters:
            formatPick === "mermaid"
              ? { Mermaid: ["mmd", "mermaid"], Text: ["txt"] }
              : { D2: ["d2"], Text: ["txt"] },
        });
        if (!uri) {
          return;
        }
        await vscode.workspace.fs.writeFile(
          uri,
          Buffer.from(diagramText, "utf8"),
        );
        void vscode.window.showInformationMessage(
          `Allium diagram exported to ${uri.fsPath}.`,
        );
      }
    },
    undefined,
    [],
  );
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

function resolveImportPath(
  currentFilePath: string,
  sourcePath: string,
): string {
  if (path.extname(sourcePath) !== ".allium") {
    return path.resolve(path.dirname(currentFilePath), `${sourcePath}.allium`);
  }
  return path.resolve(path.dirname(currentFilePath), sourcePath);
}

function mergeDiagramModels(models: DiagramModel[]): DiagramModel {
  const nodes = new Map<string, DiagramModel["nodes"][number]>();
  const edges = new Map<string, DiagramModel["edges"][number]>();
  for (const model of models) {
    for (const node of model.nodes) {
      nodes.set(node.id, node);
    }
    for (const edge of model.edges) {
      edges.set(`${edge.from}|${edge.to}|${edge.label}`, edge);
    }
  }
  return {
    nodes: [...nodes.values()].sort((a, b) => a.id.localeCompare(b.id)),
    edges: [...edges.values()].sort((a, b) =>
      `${a.from}|${a.to}|${a.label}`.localeCompare(
        `${b.from}|${b.to}|${b.label}`,
      ),
    ),
  };
}
