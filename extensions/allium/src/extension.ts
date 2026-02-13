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
import {
  planSafeFixesByCategory,
  type FixCategory,
} from "./language-tools/fix-all";
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
import {
  buildSuppressionDirectiveEdit,
  removeStaleSuppressions,
} from "./language-tools/suppression";
import {
  buildWorkspaceIndex,
  resolveImportedDefinition,
} from "./language-tools/workspace-index";
import { collectWorkspaceSymbolRecords } from "./language-tools/workspace-symbols";
import { collectUndefinedImportedSymbolFindings } from "./language-tools/imported-symbols";
import { planRename, prepareRenameTarget } from "./language-tools/rename";
import { resolveDiagnosticsModeForProfile } from "./language-tools/profile";
import { planWorkspaceImportedRename } from "./language-tools/cross-file-rename";
import {
  collectCodeLensTargets,
  countSymbolReferencesInTestBodies,
} from "./language-tools/codelens";
import {
  buildExternalTriggerRuleScaffold,
  extractUndefinedProvidesTriggerName,
} from "./language-tools/provides-trigger-fix";

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
    vscode.commands.registerCommand(
      "allium.applySafeFixes.missingEnsures",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== ALLIUM_LANGUAGE_ID) {
          void vscode.window.showInformationMessage(
            "Open an .allium file to apply safe fixes.",
          );
          return;
        }
        await applySafeFixes(editor.document, "missingEnsures");
      },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "allium.applySafeFixes.temporalGuards",
      async () => {
        const editor = vscode.window.activeTextEditor;
        if (!editor || editor.document.languageId !== ALLIUM_LANGUAGE_ID) {
          void vscode.window.showInformationMessage(
            "Open an .allium file to apply safe fixes.",
          );
          return;
        }
        await applySafeFixes(editor.document, "temporalGuards");
      },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("allium.showSpecHealth", async () => {
      await showSpecHealthSummary();
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("allium.showProblemsSummary", async () => {
      await showProblemsSummary();
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("allium.generateDiagram", async () => {
      await showDiagramPreview();
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("allium.previewRename", async () => {
      await previewRenamePlan();
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "allium.applyQuickFixesInFile",
      async () => {
        await applyAllQuickFixesInActiveFile();
      },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "allium.cleanStaleSuppressions",
      async () => {
        await cleanStaleSuppressions();
      },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "allium.openRelatedSpecOrTest",
      async () => {
        await openRelatedSpecOrTest();
      },
    ),
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
    vscode.languages.registerCodeLensProvider(
      { language: ALLIUM_LANGUAGE_ID },
      new AlliumCodeLensProvider(),
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

      if (diagnostic.code === "allium.surface.undefinedProvidesTrigger") {
        const triggerName = extractUndefinedProvidesTriggerName(
          diagnostic.message,
        );
        if (triggerName) {
          const action = new vscode.CodeAction(
            "Create external trigger rule scaffold",
            vscode.CodeActionKind.QuickFix,
          );
          action.diagnostics = [diagnostic];
          const edit = new vscode.WorkspaceEdit();
          const end = document.positionAt(document.getText().length);
          edit.insert(
            document.uri,
            end,
            buildExternalTriggerRuleScaffold(triggerName),
          );
          action.edit = edit;
          actions.push(action);
        }
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
  const profile = vscode.workspace
    .getConfiguration("allium")
    .get<"custom" | "strict-authoring" | "legacy-migration" | "doc-writing">(
      "profile",
      "custom",
    );
  const configuredMode = vscode.workspace
    .getConfiguration("allium")
    .get<"strict" | "relaxed">("diagnostics.mode", "strict");

  return resolveDiagnosticsModeForProfile(
    profile,
    configuredMode === "relaxed" ? "relaxed" : "strict",
  );
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

class AlliumCodeLensProvider implements vscode.CodeLensProvider {
  async provideCodeLenses(
    document: vscode.TextDocument,
  ): Promise<vscode.CodeLens[]> {
    const text = document.getText();
    const targets = collectCodeLensTargets(text);
    const testFiles = await vscode.workspace.findFiles(
      "**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}",
      "**/{node_modules,dist,.git}/**",
    );
    const testBodies = await Promise.all(
      testFiles.map(async (file) =>
        Buffer.from(await vscode.workspace.fs.readFile(file)).toString("utf8"),
      ),
    );
    const counts = countSymbolReferencesInTestBodies(
      targets.map((target) => target.name),
      testBodies,
    );
    const lenses: vscode.CodeLens[] = [];
    for (const target of targets) {
      const range = new vscode.Range(
        document.positionAt(target.startOffset),
        document.positionAt(target.endOffset),
      );
      lenses.push(
        new vscode.CodeLens(range, {
          title: "Find references",
          command: "editor.action.referenceSearch.trigger",
          arguments: [document.uri, range.start],
        }),
      );
      lenses.push(
        new vscode.CodeLens(range, {
          title: `Referenced in ${counts.get(target.name) ?? 0} tests`,
          command: "workbench.action.findInFiles",
          arguments: [
            {
              query: target.name,
              isRegex: false,
              triggerSearch: true,
              filesToInclude: "**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}",
            },
          ],
        }),
      );
    }
    return lenses;
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
    const workspaceRoot = workspaceRootForUri(document.uri);
    const index = workspaceRoot ? buildWorkspaceIndex(workspaceRoot) : null;

    const localRename = planRename(text, offset, newName);
    if (localRename.plan) {
      const edit = new vscode.WorkspaceEdit();
      for (const reference of localRename.plan.references) {
        edit.replace(
          document.uri,
          new vscode.Range(
            document.positionAt(reference.startOffset),
            document.positionAt(reference.endOffset),
          ),
          newName,
        );
      }

      if (index) {
        const workspacePlan = planWorkspaceImportedRename(
          index,
          document.uri.fsPath,
          localRename.plan.definition,
          newName,
        );
        if (workspacePlan.error) {
          throw new Error(workspacePlan.error);
        }
        for (const change of workspacePlan.edits) {
          edit.replace(
            vscode.Uri.file(change.filePath),
            new vscode.Range(
              offsetToPositionForFile(
                change.filePath,
                change.startOffset,
                index,
              ),
              offsetToPositionForFile(change.filePath, change.endOffset, index),
            ),
            newName,
          );
        }
      }

      return edit;
    }

    if (!localRename.plan && localRename.error) {
      const importedMatches =
        index &&
        resolveImportedDefinition(document.uri.fsPath, text, offset, index);
      if (!importedMatches || importedMatches.length === 0) {
        throw new Error(localRename.error);
      }
    }

    if (!index) {
      return null;
    }
    const importedMatches = resolveImportedDefinition(
      document.uri.fsPath,
      text,
      offset,
      index,
    );
    if (importedMatches.length === 0) {
      return null;
    }

    const target = importedMatches[0];
    const targetText = textForFile(target.filePath, index);
    const localTargetRename = planRename(
      targetText,
      target.definition.startOffset,
      newName,
    );
    if (!localTargetRename.plan) {
      throw new Error(
        localTargetRename.error ?? "Unable to rename imported symbol.",
      );
    }

    const workspacePlan = planWorkspaceImportedRename(
      index,
      target.filePath,
      target.definition,
      newName,
    );
    if (workspacePlan.error) {
      throw new Error(workspacePlan.error);
    }

    const edit = new vscode.WorkspaceEdit();
    for (const change of workspacePlan.edits) {
      edit.replace(
        vscode.Uri.file(change.filePath),
        new vscode.Range(
          offsetToPositionForFile(change.filePath, change.startOffset, index),
          offsetToPositionForFile(change.filePath, change.endOffset, index),
        ),
        newName,
      );
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

async function applySafeFixes(
  document: vscode.TextDocument,
  category: FixCategory = "all",
): Promise<void> {
  const edit = new vscode.WorkspaceEdit();
  const planned = planSafeFixesByCategory(
    document.getText(),
    readDiagnosticsMode(),
    category,
  );
  for (const change of planned) {
    edit.replace(
      document.uri,
      new vscode.Range(
        document.positionAt(change.startOffset),
        document.positionAt(change.endOffset),
      ),
      change.text,
    );
  }

  await vscode.workspace.applyEdit(edit);
  const suffix =
    category === "all"
      ? "all safe"
      : category === "missingEnsures"
        ? "missing ensures"
        : "temporal guard";
  void vscode.window.showInformationMessage(`Applied ${suffix} Allium fixes.`);
}

async function applyAllQuickFixesInActiveFile(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== ALLIUM_LANGUAGE_ID) {
    void vscode.window.showInformationMessage(
      "Open an .allium file to apply quick fixes.",
    );
    return;
  }
  const document = editor.document;
  const wholeRange = new vscode.Range(
    document.positionAt(0),
    document.positionAt(document.getText().length),
  );
  const actions =
    (await vscode.commands.executeCommand<vscode.CodeAction[]>(
      "vscode.executeCodeActionProvider",
      document.uri,
      wholeRange,
      vscode.CodeActionKind.QuickFix.value,
    )) ?? [];
  const quickFixEdits = actions
    .filter(
      (action) =>
        !!action.edit &&
        action.diagnostics?.some((diag) =>
          String(diag.code ?? "").startsWith("allium."),
        ),
    )
    .map((action) => action.edit as vscode.WorkspaceEdit);

  if (quickFixEdits.length === 0) {
    void vscode.window.showInformationMessage(
      "No Allium quick fixes available in this file.",
    );
    return;
  }

  let applied = 0;
  for (const edit of quickFixEdits) {
    const ok = await vscode.workspace.applyEdit(edit);
    if (ok) {
      applied += 1;
    }
  }
  void vscode.window.showInformationMessage(
    `Applied ${applied} Allium quick fix(es).`,
  );
}

async function cleanStaleSuppressions(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== ALLIUM_LANGUAGE_ID) {
    void vscode.window.showInformationMessage(
      "Open an .allium file to clean suppressions.",
    );
    return;
  }
  const document = editor.document;
  const original = document.getText();
  const findings = analyzeAllium(original, { mode: readDiagnosticsMode() });
  const activeCodes = new Set(findings.map((finding) => finding.code));
  const cleanup = removeStaleSuppressions(original, activeCodes);
  if (cleanup.text === original) {
    void vscode.window.showInformationMessage("No stale suppressions found.");
    return;
  }
  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    document.uri,
    new vscode.Range(
      document.positionAt(0),
      document.positionAt(document.getText().length),
    ),
    cleanup.text,
  );
  await vscode.workspace.applyEdit(edit);
  void vscode.window.showInformationMessage(
    `Removed ${cleanup.removedLines} stale suppression line(s) and ${cleanup.removedCodes} stale code reference(s).`,
  );
}

async function openRelatedSpecOrTest(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== ALLIUM_LANGUAGE_ID) {
    void vscode.window.showInformationMessage("Open an .allium file first.");
    return;
  }
  const symbolRange = editor.document.getWordRangeAtPosition(
    editor.selection.active,
    /[A-Za-z_][A-Za-z0-9_]*/,
  );
  if (!symbolRange) {
    void vscode.window.showInformationMessage(
      "Place cursor on a symbol name first.",
    );
    return;
  }
  const symbol = editor.document.getText(symbolRange);
  const matches = await findRelatedSpecOrTestFiles(symbol, editor.document.uri);
  if (matches.length === 0) {
    void vscode.window.showInformationMessage(
      `No related spec/test files found for '${symbol}'.`,
    );
    return;
  }
  if (matches.length === 1) {
    const doc = await vscode.workspace.openTextDocument(matches[0]);
    await vscode.window.showTextDocument(doc);
    return;
  }
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "";
  const item = await vscode.window.showQuickPick(
    matches.map((uri) => ({
      label: path.basename(uri.fsPath),
      description: path.relative(root, uri.fsPath),
      uri,
    })),
    { placeHolder: `Related files for '${symbol}'` },
  );
  if (!item) {
    return;
  }
  const doc = await vscode.workspace.openTextDocument(item.uri);
  await vscode.window.showTextDocument(doc);
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

async function showProblemsSummary(): Promise<void> {
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

  const codeCounts = new Map<string, number>();
  const byCodeByFile = new Map<string, Map<string, number>>();
  for (const file of files) {
    const text = Buffer.from(await vscode.workspace.fs.readFile(file)).toString(
      "utf8",
    );
    const findings = analyzeAllium(text, { mode: "strict" });
    for (const finding of findings) {
      codeCounts.set(finding.code, (codeCounts.get(finding.code) ?? 0) + 1);
      const byFile =
        byCodeByFile.get(finding.code) ?? new Map<string, number>();
      byFile.set(file.fsPath, (byFile.get(file.fsPath) ?? 0) + 1);
      byCodeByFile.set(finding.code, byFile);
    }
  }

  if (codeCounts.size === 0) {
    void vscode.window.showInformationMessage("No Allium findings.");
    return;
  }

  const summaryItems = [...codeCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([code, count]) => ({ label: `${code} (${count})`, code }));
  const summaryPick = await vscode.window.showQuickPick(summaryItems, {
    placeHolder: "Allium problems grouped by code",
  });
  if (!summaryPick) {
    return;
  }

  const byFile =
    byCodeByFile.get(summaryPick.code) ?? new Map<string, number>();
  const fileItems = [...byFile.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([filePath, count]) => ({
      label: `${path.basename(filePath)} (${count})`,
      description: path.relative(
        vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
        filePath,
      ),
      filePath,
    }));
  const filePick = await vscode.window.showQuickPick(fileItems, {
    placeHolder: summaryPick.code,
  });
  if (!filePick) {
    return;
  }
  const doc = await vscode.workspace.openTextDocument(
    vscode.Uri.file(filePick.filePath),
  );
  await vscode.window.showTextDocument(doc);
}

async function previewRenamePlan(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== ALLIUM_LANGUAGE_ID) {
    void vscode.window.showInformationMessage("Open an .allium file first.");
    return;
  }

  const newName = await vscode.window.showInputBox({
    prompt: "New name for rename preview",
    validateInput: (value) =>
      /^[A-Za-z_][A-Za-z0-9_]*$/.test(value)
        ? null
        : "Use a valid identifier (letters, digits, underscore).",
  });
  if (!newName) {
    return;
  }

  const document = editor.document;
  const text = document.getText();
  const offset = document.offsetAt(editor.selection.active);
  const workspaceRoot = workspaceRootForUri(document.uri);
  const index = workspaceRoot ? buildWorkspaceIndex(workspaceRoot) : null;
  const plannedChanges: Array<{ filePath: string; startOffset: number }> = [];

  const localRename = planRename(text, offset, newName);
  if (localRename.plan) {
    for (const reference of localRename.plan.references) {
      plannedChanges.push({
        filePath: document.uri.fsPath,
        startOffset: reference.startOffset,
      });
    }
    if (index) {
      const workspacePlan = planWorkspaceImportedRename(
        index,
        document.uri.fsPath,
        localRename.plan.definition,
        newName,
      );
      if (workspacePlan.error) {
        void vscode.window.showErrorMessage(workspacePlan.error);
        return;
      }
      for (const change of workspacePlan.edits) {
        plannedChanges.push({
          filePath: change.filePath,
          startOffset: change.startOffset,
        });
      }
    }
  } else if (index) {
    const importedMatches = resolveImportedDefinition(
      document.uri.fsPath,
      text,
      offset,
      index,
    );
    if (importedMatches.length === 0) {
      if (localRename.error) {
        void vscode.window.showErrorMessage(localRename.error);
      }
      return;
    }
    const target = importedMatches[0];
    const workspacePlan = planWorkspaceImportedRename(
      index,
      target.filePath,
      target.definition,
      newName,
    );
    if (workspacePlan.error) {
      void vscode.window.showErrorMessage(workspacePlan.error);
      return;
    }
    for (const change of workspacePlan.edits) {
      plannedChanges.push({
        filePath: change.filePath,
        startOffset: change.startOffset,
      });
    }
  } else if (localRename.error) {
    void vscode.window.showErrorMessage(localRename.error);
    return;
  }

  if (plannedChanges.length === 0) {
    void vscode.window.showInformationMessage("No rename changes found.");
    return;
  }

  const items = plannedChanges
    .map((change) => {
      const position =
        index && index.documents.some((doc) => doc.filePath === change.filePath)
          ? offsetToPositionForFile(change.filePath, change.startOffset, index)
          : document.positionAt(change.startOffset);
      return {
        label: `${path.basename(change.filePath)}:${position.line + 1}:${position.character + 1}`,
        description: path.relative(
          workspaceRoot ?? path.dirname(change.filePath),
          change.filePath,
        ),
      };
    })
    .slice(0, 200);

  await vscode.window.showQuickPick(items, {
    placeHolder: `Rename preview: ${plannedChanges.length} change(s)`,
  });
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
  const sourceByNodeId = new Map<string, { uri: vscode.Uri; offset: number }>();
  for (let i = 0; i < results.length; i += 1) {
    const result = results[i];
    const document = documents[i];
    for (const node of result.model.nodes) {
      if (node.sourceOffset === undefined || sourceByNodeId.has(node.id)) {
        continue;
      }
      sourceByNodeId.set(node.id, {
        uri: document.uri,
        offset: node.sourceOffset,
      });
    }
  }
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
    nodes: mergedModel.nodes.map((node) => ({
      id: node.id,
      label: node.label,
    })),
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
        return;
      }
      if (typed.type === "reveal") {
        const nodeId = (message as { nodeId?: unknown }).nodeId;
        if (typeof nodeId !== "string") {
          return;
        }
        const source = sourceByNodeId.get(nodeId);
        if (!source) {
          void vscode.window.showInformationMessage(
            "No source location available for this diagram node.",
          );
          return;
        }
        const document = await vscode.workspace.openTextDocument(source.uri);
        const editor = await vscode.window.showTextDocument(document);
        const position = document.positionAt(source.offset);
        editor.selection = new vscode.Selection(position, position);
        editor.revealRange(new vscode.Range(position, position));
      }
    },
    undefined,
    [],
  );
}

async function findRelatedSpecOrTestFiles(
  symbol: string,
  currentUri: vscode.Uri,
): Promise<vscode.Uri[]> {
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(`\\b${escaped}\\b`, "m");
  const matches = new Map<string, vscode.Uri>();
  const searchIn = async (include: string): Promise<void> => {
    const files = await vscode.workspace.findFiles(
      include,
      "**/{node_modules,dist,.git}/**",
    );
    for (const file of files) {
      if (file.fsPath === currentUri.fsPath) {
        continue;
      }
      const text = Buffer.from(
        await vscode.workspace.fs.readFile(file),
      ).toString("utf8");
      if (matcher.test(text)) {
        matches.set(file.fsPath, file);
      }
    }
  };
  await searchIn("**/*.allium");
  await searchIn("**/*.{test,spec}.{ts,tsx,js,jsx,mjs,cjs}");
  return [...matches.values()].sort((a, b) => a.fsPath.localeCompare(b.fsPath));
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
