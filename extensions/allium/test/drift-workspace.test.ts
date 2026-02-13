import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import * as path from "node:path";
import test from "node:test";
import assert from "node:assert/strict";
import {
  collectWorkspaceFiles,
  readCommandManifest,
  readDiagnosticsManifest,
  readWorkspaceAlliumConfig,
} from "../src/language-tools/drift-workspace";

function withTempWorkspace(run: (workspaceRoot: string) => void): void {
  const workspaceRoot = mkdtempSync(
    path.join(tmpdir(), "allium-drift-workspace-"),
  );
  try {
    run(workspaceRoot);
  } finally {
    rmSync(workspaceRoot, { recursive: true, force: true });
  }
}

test("readWorkspaceAlliumConfig reads drift config from workspace root", () => {
  withTempWorkspace((workspaceRoot) => {
    writeFileSync(
      path.join(workspaceRoot, "allium.config.json"),
      JSON.stringify({
        drift: {
          sources: ["src"],
          specs: ["specs"],
          commandsFrom: ".allium/commands.json",
        },
      }),
      "utf8",
    );

    const config = readWorkspaceAlliumConfig(workspaceRoot);
    assert.ok(config);
    assert.deepEqual(config?.drift?.sources, ["src"]);
    assert.deepEqual(config?.drift?.specs, ["specs"]);
    assert.equal(config?.drift?.commandsFrom, ".allium/commands.json");
  });
});

test("collectWorkspaceFiles resolves relative inputs and extension filters", () => {
  withTempWorkspace((workspaceRoot) => {
    mkdirSync(path.join(workspaceRoot, "specs", "nested"), { recursive: true });
    writeFileSync(
      path.join(workspaceRoot, "specs", "a.allium"),
      "entity A {}",
      "utf8",
    );
    writeFileSync(
      path.join(workspaceRoot, "specs", "nested", "b.allium"),
      "entity B {}",
      "utf8",
    );
    writeFileSync(
      path.join(workspaceRoot, "specs", "notes.txt"),
      "ignore",
      "utf8",
    );

    const files = collectWorkspaceFiles(
      workspaceRoot,
      ["specs"],
      [".allium"],
      [],
    );
    assert.deepEqual(files, [
      path.join(workspaceRoot, "specs", "a.allium"),
      path.join(workspaceRoot, "specs", "nested", "b.allium"),
    ]);
  });
});

test("collectWorkspaceFiles skips configured excluded directories", () => {
  withTempWorkspace((workspaceRoot) => {
    mkdirSync(path.join(workspaceRoot, "specs"), { recursive: true });
    mkdirSync(path.join(workspaceRoot, "node_modules", "pkg"), {
      recursive: true,
    });
    writeFileSync(
      path.join(workspaceRoot, "specs", "main.allium"),
      "entity A {}",
      "utf8",
    );
    writeFileSync(
      path.join(workspaceRoot, "node_modules", "pkg", "ignored.allium"),
      "entity B {}",
      "utf8",
    );

    const files = collectWorkspaceFiles(
      workspaceRoot,
      ["."],
      [".allium"],
      ["node_modules"],
    );
    assert.deepEqual(files, [path.join(workspaceRoot, "specs", "main.allium")]);
  });
});

test("readDiagnosticsManifest supports object and array forms", () => {
  withTempWorkspace((workspaceRoot) => {
    mkdirSync(path.join(workspaceRoot, ".allium"), { recursive: true });
    writeFileSync(
      path.join(workspaceRoot, ".allium", "diagnostics.json"),
      JSON.stringify({ diagnostics: ["allium.one", "allium.two"] }),
      "utf8",
    );
    writeFileSync(
      path.join(workspaceRoot, ".allium", "diagnostics-array.json"),
      JSON.stringify(["allium.alpha", "allium.beta"]),
      "utf8",
    );

    assert.deepEqual(
      [
        ...readDiagnosticsManifest(workspaceRoot, ".allium/diagnostics.json"),
      ].sort(),
      ["allium.one", "allium.two"],
    );
    assert.deepEqual(
      [
        ...readDiagnosticsManifest(
          workspaceRoot,
          ".allium/diagnostics-array.json",
        ),
      ].sort(),
      ["allium.alpha", "allium.beta"],
    );
  });
});

test("readCommandManifest supports package.json and generic command lists", () => {
  withTempWorkspace((workspaceRoot) => {
    mkdirSync(path.join(workspaceRoot, ".allium"), { recursive: true });
    writeFileSync(
      path.join(workspaceRoot, ".allium", "package-like.json"),
      JSON.stringify({
        contributes: {
          commands: [{ command: "allium.a" }, { command: "allium.b" }],
        },
      }),
      "utf8",
    );
    writeFileSync(
      path.join(workspaceRoot, ".allium", "generic.json"),
      JSON.stringify({
        commands: ["allium.c"],
        commandIds: ["allium.d"],
        command_names: ["allium.e"],
      }),
      "utf8",
    );

    assert.deepEqual(
      [
        ...readCommandManifest(workspaceRoot, ".allium/package-like.json"),
      ].sort(),
      ["allium.a", "allium.b"],
    );
    assert.deepEqual(
      [...readCommandManifest(workspaceRoot, ".allium/generic.json")].sort(),
      ["allium.c", "allium.d", "allium.e"],
    );
  });
});
