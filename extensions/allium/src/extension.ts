import * as vscode from "vscode";
import { analyzeAllium } from "./language-tools/analyzer";
import { planExtractLiteralToConfig } from "./language-tools/extract-literal-refactor";

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
          new vscode.Position(finding.end.line, finding.end.character)
        ),
        finding.message,
        severity
      );
      diagnostic.code = finding.code;
      diagnostic.source = "allium";
      return diagnostic;
    });

    diagnostics.set(document.uri, converted);
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(refreshDocument),
    vscode.workspace.onDidChangeTextDocument((event) => refreshDocument(event.document)),
    vscode.workspace.onDidSaveTextDocument(refreshDocument),
    vscode.workspace.onDidCloseTextDocument((document) => diagnostics.delete(document.uri)),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration("allium.diagnostics.mode")) {
        return;
      }
      for (const document of vscode.workspace.textDocuments) {
        refreshDocument(document);
      }
    })
  );

  for (const document of vscode.workspace.textDocuments) {
    refreshDocument(document);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("allium.runChecks", () => {
      const editor = vscode.window.activeTextEditor;
      if (!editor || editor.document.languageId !== ALLIUM_LANGUAGE_ID) {
        void vscode.window.showInformationMessage("Open an .allium file to run checks.");
        return;
      }

      refreshDocument(editor.document);
      void vscode.window.showInformationMessage("Allium checks completed.");
    })
  );

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      ALLIUM_LANGUAGE_ID,
      new AlliumQuickFixProvider(),
      {
        providedCodeActionKinds: [vscode.CodeActionKind.QuickFix, vscode.CodeActionKind.RefactorExtract]
      }
    )
  );
}

export function deactivate(): void {
  // no-op
}

class AlliumQuickFixProvider implements vscode.CodeActionProvider {
  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range,
    context: vscode.CodeActionContext
  ): vscode.CodeAction[] {
    const actions: vscode.CodeAction[] = [];

    for (const diagnostic of context.diagnostics) {
      if (diagnostic.code === "allium.rule.missingEnsures") {
        const action = new vscode.CodeAction(
          "Insert ensures scaffold",
          vscode.CodeActionKind.QuickFix
        );
        action.diagnostics = [diagnostic];
        action.isPreferred = true;

        const edit = new vscode.WorkspaceEdit();
        const insertPosition = new vscode.Position(diagnostic.range.start.line, 0);
        edit.insert(document.uri, insertPosition, "    ensures: TODO()\n");
        action.edit = edit;
        actions.push(action);
      }

      if (diagnostic.code === "allium.temporal.missingGuard") {
        const action = new vscode.CodeAction(
          "Insert requires guard",
          vscode.CodeActionKind.QuickFix
        );
        action.diagnostics = [diagnostic];

        const whenLine = diagnostic.range.start.line;
        const whenText = document.lineAt(whenLine).text;
        const indent = whenText.match(/^\s*/)?.[0] ?? "    ";

        const edit = new vscode.WorkspaceEdit();
        const insertPosition = new vscode.Position(whenLine + 1, 0);
        edit.insert(document.uri, insertPosition, `${indent}requires: /* add temporal guard */\n`);
        action.edit = edit;
        actions.push(action);
      }
    }

    const extractPlan = planExtractLiteralToConfig(
      document.getText(),
      document.offsetAt(range.start),
      document.offsetAt(range.end)
    );
    if (extractPlan) {
      const action = new vscode.CodeAction(
        extractPlan.title,
        vscode.CodeActionKind.RefactorExtract
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

    return actions;
  }
}

function readDiagnosticsMode(): "strict" | "relaxed" {
  const configuredMode = vscode.workspace
    .getConfiguration("allium")
    .get<"strict" | "relaxed">("diagnostics.mode", "strict");

  return configuredMode === "relaxed" ? "relaxed" : "strict";
}

function toDiagnosticSeverity(severity: "error" | "warning" | "info"): vscode.DiagnosticSeverity {
  if (severity === "error") {
    return vscode.DiagnosticSeverity.Error;
  }
  if (severity === "warning") {
    return vscode.DiagnosticSeverity.Warning;
  }
  return vscode.DiagnosticSeverity.Information;
}
