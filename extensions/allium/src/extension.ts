import * as vscode from "vscode";
import { analyzeAllium } from "./language-tools/analyzer";
import * as fs from "node:fs";
import * as path from "node:path";
import { parseUseAliases } from "./language-tools/definitions";
import {
  planSafeFixesByCategory,
  type FixCategory,
} from "./language-tools/fix-all";
import {
  renderSimulationMarkdown,
  simulateRuleAtOffset,
} from "./language-tools/rule-sim";
import { parseDeclarationAst } from "./language-tools/typed-ast";
import { buildRuleTestScaffold } from "./language-tools/test-scaffold";
import {
  buildDiagramResult,
  renderDiagram,
  type DiagramFormat,
  type DiagramModel,
} from "./language-tools/diagram";
import { buildDiagramPreviewHtml } from "./language-tools/diagram-preview";
import { removeStaleSuppressions } from "./language-tools/suppression";
import { buildFindingExplanationMarkdown } from "./language-tools/finding-help";
import {
  buildWorkspaceIndex,
  resolveImportedDefinition,
} from "./language-tools/workspace-index";
import { planRename } from "./language-tools/rename";
import { resolveDiagnosticsModeForProfile } from "./language-tools/profile";
import { planWorkspaceImportedRename } from "./language-tools/cross-file-rename";
import {
  buildDriftReport,
  extractAlliumDiagnosticCodes,
  extractSpecCommands,
  extractSpecDiagnosticCodes,
  renderDriftMarkdown,
} from "./language-tools/spec-drift";
import {
  collectWorkspaceFiles,
  readCommandManifest,
  readDiagnosticsManifest,
  readWorkspaceAlliumConfig,
} from "./language-tools/drift-workspace";
import {
  buildFindInFilesIncludePattern,
  buildTestFileMatcher,
  resolveTestDiscoveryOptions,
} from "./language-tools/test-discovery";
import {
  LanguageClient,
  type LanguageClientOptions,
  type ServerOptions,
  TransportKind,
} from "vscode-languageclient/node";

const ALLIUM_LANGUAGE_ID = "allium";
const DEFAULT_DRIFT_EXCLUDE_DIRS = [
  ".git",
  "node_modules",
  "dist",
  "build",
  "target",
  "out",
  ".next",
  ".venv",
  "venv",
  "__pycache__",
];

let client: LanguageClient | undefined;

export function activate(context: vscode.ExtensionContext): void {
  const serverModule = context.asAbsolutePath(
    path.join("dist", "allium-lsp.js"),
  );
  const serverOptions: ServerOptions = {
    run: { module: serverModule, transport: TransportKind.stdio },
    debug: { module: serverModule, transport: TransportKind.stdio },
  };
  const clientOptions: LanguageClientOptions = {
    documentSelector: [{ scheme: "file", language: ALLIUM_LANGUAGE_ID }],
  };
  client = new LanguageClient(
    "allium",
    "Allium Language Server",
    serverOptions,
    clientOptions,
  );
  void client.start();
  context.subscriptions.push({ dispose: () => void client?.stop() });

  context.subscriptions.push(
    vscode.commands.registerCommand("allium.runChecks", () => {
      void vscode.window.showInformationMessage(
        "Allium checks run automatically by the language server. Save the file to trigger a re-check.",
      );
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
      "allium.previewRuleSimulation",
      async () => {
        await previewRuleSimulation();
      },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "allium.generateRuleTestScaffold",
      async () => {
        await generateRuleTestScaffold();
      },
    ),
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
    vscode.commands.registerCommand("allium.explainFinding", async () => {
      await explainFindingAtCursor();
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("allium.checkSpecDrift", async () => {
      await checkSpecDriftReport();
    }),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "allium.explainFindingDiagnostic",
      async (code: string, message: string) => {
        await showFindingExplanation(code, message);
      },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "allium.createImportedSymbolStub",
      async (uri: vscode.Uri, alias: string, symbol: string) => {
        await createImportedSymbolStub(uri, alias, symbol);
      },
    ),
  );
  context.subscriptions.push(
    vscode.commands.registerCommand("allium.manageBaseline", async () => {
      await manageWorkspaceBaseline();
    }),
  );
}

export function deactivate(): Thenable<void> | undefined {
  return client?.stop();
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
  const configMode =
    profile === "custom" ? readAlliumConfigDiagnosticsMode() : undefined;
  const effectiveMode = configMode ?? configuredMode;

  return resolveDiagnosticsModeForProfile(
    profile,
    effectiveMode === "relaxed" ? "relaxed" : "strict",
  );
}

function readAlliumConfigDiagnosticsMode(): "strict" | "relaxed" | undefined {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    return undefined;
  }
  return readWorkspaceAlliumConfig(root)?.check?.mode;
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

  const previewLines = actions
    .filter(
      (action) =>
        !!action.edit &&
        action.diagnostics?.some((diag) =>
          String(diag.code ?? "").startsWith("allium."),
        ),
    )
    .map(
      (action) =>
        `- ${action.title}${action.diagnostics?.[0]?.code ? ` (\`${String(action.diagnostics[0].code)}\`)` : ""}`,
    );
  const previewDoc = await vscode.workspace.openTextDocument({
    content: [
      "# Allium Quick Fix Preview",
      "",
      `File: \`${path.basename(document.uri.fsPath)}\``,
      `Planned fixes: ${previewLines.length}`,
      "",
      ...previewLines,
      "",
    ].join("\n"),
    language: "markdown",
  });
  await vscode.window.showTextDocument(previewDoc, { preview: true });
  const decision = await vscode.window.showQuickPick(
    ["Apply fixes", "Cancel"],
    { placeHolder: "Apply these quick fixes?" },
  );
  if (decision !== "Apply fixes") {
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

async function checkSpecDriftReport(): Promise<void> {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) {
    void vscode.window.showInformationMessage("Open a workspace first.");
    return;
  }
  const alliumConfig = readWorkspaceAlliumConfig(workspaceRoot);
  const driftConfig = alliumConfig?.drift;
  const sourceInputs = driftConfig?.sources ?? ["."];
  const sourceExtensions = driftConfig?.sourceExtensions ?? [".ts"];
  const excludeDirs = driftConfig?.excludeDirs ?? DEFAULT_DRIFT_EXCLUDE_DIRS;
  const specInputs = driftConfig?.specs ?? ["."];
  const sourceFiles = collectWorkspaceFiles(
    workspaceRoot,
    sourceInputs,
    sourceExtensions,
    excludeDirs,
  );
  const specFiles = collectWorkspaceFiles(
    workspaceRoot,
    specInputs,
    [".allium"],
    excludeDirs,
  );
  if (specFiles.length === 0) {
    void vscode.window.showErrorMessage(
      "No .allium files found for drift check. Configure drift.specs in allium.config.json or pass explicit paths to CLI.",
    );
    return;
  }

  const sourceText = sourceFiles
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");
  const specText = specFiles
    .map((filePath) => fs.readFileSync(filePath, "utf8"))
    .join("\n");

  const implementedDiagnostics = new Set(
    extractAlliumDiagnosticCodes(sourceText),
  );
  try {
    if (driftConfig?.diagnosticsFrom) {
      for (const code of readDiagnosticsManifest(
        workspaceRoot,
        driftConfig.diagnosticsFrom,
      )) {
        implementedDiagnostics.add(code);
      }
    }
  } catch (error) {
    void vscode.window.showErrorMessage(
      `Failed to read diagnostics manifest: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return;
  }
  if (implementedDiagnostics.size === 0) {
    void vscode.window.showErrorMessage(
      "No implemented diagnostics discovered. Configure drift.sources/drift.sourceExtensions or drift.diagnosticsFrom.",
    );
    return;
  }

  const specifiedDiagnostics = extractSpecDiagnosticCodes(specText);
  let implementedCommands = new Set<string>();
  try {
    if (!driftConfig?.skipCommands && driftConfig?.commandsFrom) {
      implementedCommands = readCommandManifest(
        workspaceRoot,
        driftConfig.commandsFrom,
      );
    }
  } catch (error) {
    void vscode.window.showErrorMessage(
      `Failed to read commands manifest: ${
        error instanceof Error ? error.message : "unknown error"
      }`,
    );
    return;
  }
  const specifiedCommands = extractSpecCommands(specText);
  const diagnosticsDrift = buildDriftReport(
    implementedDiagnostics,
    specifiedDiagnostics,
  );
  const commandsDrift = buildDriftReport(
    driftConfig?.skipCommands ? new Set<string>() : implementedCommands,
    specifiedCommands,
  );
  const markdown = renderDriftMarkdown(diagnosticsDrift, commandsDrift);
  const doc = await vscode.workspace.openTextDocument({
    content: markdown,
    language: "markdown",
  });
  await vscode.window.showTextDocument(doc, { preview: true });
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

async function previewRuleSimulation(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== ALLIUM_LANGUAGE_ID) {
    void vscode.window.showInformationMessage("Open an .allium file first.");
    return;
  }
  const raw = await vscode.window.showInputBox({
    prompt:
      'Enter sample bindings JSON object for simulation (for example: {"status":"approved"})',
    value: "{}",
  });
  if (raw === undefined) {
    return;
  }
  let bindings: Record<string, unknown>;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Bindings must be a JSON object.");
    }
    bindings = parsed as Record<string, unknown>;
  } catch {
    void vscode.window.showErrorMessage(
      "Invalid JSON bindings. Please provide an object.",
    );
    return;
  }
  const preview = simulateRuleAtOffset(
    editor.document.getText(),
    editor.document.offsetAt(editor.selection.active),
    bindings,
  );
  if (!preview) {
    void vscode.window.showInformationMessage(
      "Place cursor inside a rule block first.",
    );
    return;
  }
  const markdown = renderSimulationMarkdown(preview, bindings);
  const doc = await vscode.workspace.openTextDocument({
    content: markdown,
    language: "markdown",
  });
  await vscode.window.showTextDocument(doc, { preview: true });
}

async function generateRuleTestScaffold(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== ALLIUM_LANGUAGE_ID) {
    void vscode.window.showInformationMessage("Open an .allium file first.");
    return;
  }
  const declarations = parseDeclarationAst(editor.document.getText());
  if (!declarations.some((entry) => entry.kind === "rule")) {
    void vscode.window.showInformationMessage(
      "No rules found in current spec.",
    );
    return;
  }
  const moduleName = path.basename(editor.document.uri.fsPath, ".allium");
  const scaffold = buildRuleTestScaffold(editor.document.getText(), moduleName);
  const doc = await vscode.workspace.openTextDocument({
    content: scaffold,
    language: "typescript",
  });
  await vscode.window.showTextDocument(doc);
}

async function manageWorkspaceBaseline(): Promise<void> {
  const root = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!root) {
    void vscode.window.showInformationMessage("Open a workspace first.");
    return;
  }
  const action = await vscode.window.showQuickPick(
    ["Write baseline", "Preview baseline findings", "Cancel"],
    { placeHolder: "Allium baseline manager" },
  );
  if (!action || action === "Cancel") {
    return;
  }
  const baselinePath = await vscode.window.showInputBox({
    prompt: "Baseline output path",
    value: ".allium-baseline.json",
  });
  if (!baselinePath) {
    return;
  }
  const files = await vscode.workspace.findFiles(
    "**/*.allium",
    "**/{node_modules,dist,.git}/**",
  );
  const records: string[] = [];
  for (const file of files) {
    const text = Buffer.from(await vscode.workspace.fs.readFile(file)).toString(
      "utf8",
    );
    const findings = analyzeAllium(text, { mode: "strict" });
    for (const finding of findings) {
      const rel = path.relative(root, file.fsPath) || file.fsPath;
      records.push(
        `${rel}|${finding.start.line}|${finding.start.character}|${finding.code}|${finding.message}`,
      );
    }
  }
  const unique = [...new Set(records)].sort();
  if (action === "Preview baseline findings") {
    const preview = await vscode.workspace.openTextDocument({
      content: [
        "# Baseline Preview",
        "",
        ...unique.map((line) => `- \`${line}\``),
      ].join("\n"),
      language: "markdown",
    });
    await vscode.window.showTextDocument(preview, { preview: true });
    return;
  }
  const output = {
    version: 1,
    findings: unique.map((fingerprint) => ({ fingerprint })),
  };
  const target = path.resolve(root, baselinePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, `${JSON.stringify(output, null, 2)}\n`, "utf8");
  void vscode.window.showInformationMessage(
    `Wrote baseline with ${unique.length} finding fingerprints to ${baselinePath}.`,
  );
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
  const sourceByEdgeId = new Map<string, { uri: vscode.Uri; offset: number }>();
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
    for (const edge of result.model.edges) {
      if (edge.sourceOffset === undefined) {
        continue;
      }
      const edgeId = `${edge.from}|${edge.to}|${edge.label}`;
      if (sourceByEdgeId.has(edgeId)) {
        continue;
      }
      sourceByEdgeId.set(edgeId, {
        uri: document.uri,
        offset: edge.sourceOffset,
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
    edges: mergedModel.edges.map((edge) => ({
      id: `${edge.from}|${edge.to}|${edge.label}`,
      label: `${edge.from} -> ${edge.to} (${edge.label})`,
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
        return;
      }
      if (typed.type === "revealEdge") {
        const edgeId = (message as { edgeId?: unknown }).edgeId;
        if (typeof edgeId !== "string") {
          return;
        }
        const source = sourceByEdgeId.get(edgeId);
        if (!source) {
          void vscode.window.showInformationMessage(
            "No source location available for this diagram edge.",
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

async function explainFindingAtCursor(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || editor.document.languageId !== ALLIUM_LANGUAGE_ID) {
    void vscode.window.showInformationMessage("Open an .allium file first.");
    return;
  }
  const position = editor.selection.active;
  const allDiagnostics = vscode.languages.getDiagnostics(editor.document.uri);
  const entry = allDiagnostics.find(
    (diagnostic) =>
      diagnostic.source === "allium" &&
      typeof diagnostic.code === "string" &&
      diagnostic.range.contains(position),
  );
  if (!entry || typeof entry.code !== "string") {
    void vscode.window.showInformationMessage(
      "No Allium finding at cursor position.",
    );
    return;
  }
  await showFindingExplanation(entry.code, entry.message);
}

async function showFindingExplanation(
  code: string,
  message: string,
): Promise<void> {
  const markdown = buildFindingExplanationMarkdown(code, message);
  const doc = await vscode.workspace.openTextDocument({
    content: markdown,
    language: "markdown",
  });
  await vscode.window.showTextDocument(doc, { preview: true });
}

async function createImportedSymbolStub(
  fromUri: vscode.Uri,
  alias: string,
  symbol: string,
): Promise<void> {
  const sourceText = Buffer.from(
    await vscode.workspace.fs.readFile(fromUri),
  ).toString("utf8");
  const useAlias = parseUseAliases(sourceText).find(
    (entry) => entry.alias === alias,
  );
  if (!useAlias) {
    void vscode.window.showErrorMessage(
      `Could not resolve import alias '${alias}' in current document.`,
    );
    return;
  }
  const targetPath = resolveImportPath(fromUri.fsPath, useAlias.sourcePath);
  const targetUri = vscode.Uri.file(targetPath);
  const edit = new vscode.WorkspaceEdit();
  let existingText = "";
  let insertPosition = new vscode.Position(0, 0);
  let fileExists = false;
  try {
    existingText = Buffer.from(
      await vscode.workspace.fs.readFile(targetUri),
    ).toString("utf8");
    fileExists = true;
  } catch {
    edit.createFile(targetUri, { ignoreIfExists: true });
  }
  if (new RegExp(`\\b${symbol}\\b`).test(existingText)) {
    void vscode.window.showInformationMessage(
      `Symbol '${symbol}' already exists in ${path.basename(targetPath)}.`,
    );
    return;
  }
  const needsLeadingNewline =
    existingText.length > 0 && !existingText.endsWith("\n");
  const insertion = `${needsLeadingNewline ? "\n" : ""}\nvalue ${symbol} {\n    value: TODO\n}\n`;
  if (fileExists) {
    const doc = await vscode.workspace.openTextDocument(targetUri);
    insertPosition = doc.positionAt(existingText.length);
  }
  edit.insert(targetUri, insertPosition, insertion);
  const applied = await vscode.workspace.applyEdit(edit);
  if (!applied) {
    void vscode.window.showErrorMessage(
      `Failed to create '${symbol}' in imported specification.`,
    );
    return;
  }
  const doc = await vscode.workspace.openTextDocument(targetUri);
  await vscode.window.showTextDocument(doc);
}

async function findRelatedSpecOrTestFiles(
  symbol: string,
  currentUri: vscode.Uri,
): Promise<vscode.Uri[]> {
  const workspaceRoot = workspaceRootForUri(currentUri);
  if (!workspaceRoot) {
    return [];
  }
  const alliumConfig = readWorkspaceAlliumConfig(workspaceRoot);
  const testOptions = resolveTestDiscoveryOptions(alliumConfig);
  const testMatcher = buildTestFileMatcher(
    testOptions.testExtensions,
    testOptions.testNamePatterns,
  );
  const excludedDirs =
    alliumConfig?.drift?.excludeDirs ?? DEFAULT_DRIFT_EXCLUDE_DIRS;
  const specInputs = alliumConfig?.project?.specPaths ?? ["."];
  const escaped = symbol.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const matcher = new RegExp(`\\b${escaped}\\b`, "m");
  const matches = new Map<string, vscode.Uri>();
  const searchIn = (filePaths: string[]): void => {
    for (const filePath of filePaths) {
      if (filePath === currentUri.fsPath) {
        continue;
      }
      const text = fs.readFileSync(filePath, "utf8");
      if (matcher.test(text)) {
        matches.set(filePath, vscode.Uri.file(filePath));
      }
    }
  };
  searchIn(
    collectWorkspaceFiles(workspaceRoot, specInputs, [".allium"], excludedDirs),
  );
  searchIn(
    collectWorkspaceFiles(
      workspaceRoot,
      testOptions.testInputs,
      testOptions.testExtensions,
      excludedDirs,
    ).filter(testMatcher),
  );
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
