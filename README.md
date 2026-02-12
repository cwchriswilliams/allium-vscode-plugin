# Allium VS Code Extension + Standalone Tooling

This project provides:

1. A VS Code extension for `.allium` files.
2. A standalone `allium-check` CLI for validation.
3. A standalone `allium-format` CLI for formatting.

The extension is not yet published on the VS Code Marketplace, so consumers currently install from source.

## Consumer Installation (No Marketplace Yet)

### Prerequisites

- Node.js 20+ (recommended)
- npm 10+ (recommended)
- VS Code

### 1. Download the project

```bash
git clone <repo-url> allium-vscode
cd allium-vscode
npm install
```

### 2. Build the extension/tooling package

```bash
npm run --workspace extensions/allium build
```

This produces `extensions/allium/dist/...` including:

- extension entrypoint: `extensions/allium/dist/src/extension.js`
- checker CLI: `extensions/allium/dist/src/check.js`
- formatter CLI: `extensions/allium/dist/src/format.js`

### 3. Use in VS Code (local development install path)

Until Marketplace/VSIX distribution is added, run the extension in an Extension Development Host:

1. Open this repo in VS Code.
2. Press `F5` (Run Extension).
3. In the new Extension Development Host window, open `.allium` files.

## VS Code Features

### Language support

- `.allium` language registration
- syntax highlighting
- language configuration (comments/brackets)
- authoring snippets

### Diagnostics

Implemented checks:

- rule missing `when:` trigger
- rule missing `ensures:` clause
- temporal `when:` without `requires:` guard
- duplicate `let` binding in a rule
- duplicate key in a `config` block
- undefined `config.<key>` reference
- `open_question` informational finding

Diagnostics setting:

- `allium.diagnostics.mode`:
  - `strict` (default)
  - `relaxed` (suppresses temporal-guard warning and downgrades undefined config reference severity)

### Commands and quick actions

- Command: `Allium: Run Checks` (`allium.runChecks`)
- Quick fixes:
  - insert `ensures: TODO()` scaffold for missing ensures
  - insert temporal `requires:` guard scaffold
- Refactorings:
  - extract repeated string/integer literal to `config.<key>`
  - add temporal guard from selected temporal `when:` line

### Productivity features

- document symbols / outline for top-level blocks
- go to definition for local top-level symbols and `config.<key>` references
- hover docs for core Allium keywords
- folding ranges for top-level blocks

## Standalone CLI Usage

These CLIs can be used independently of VS Code editing workflows.

### `allium-check`

Validate one or more `.allium` files.

Repo-level command:

```bash
npm run check -- docs/project/specs
npm run check -- --mode relaxed "docs/project/specs/**/*.allium"
```

Direct built script:

```bash
node extensions/allium/dist/src/check.js docs/project/specs
node extensions/allium/dist/src/check.js --mode strict path/to/file.allium
```

Behavior summary:

- exits `0` when only informational findings (or no findings) are present
- exits `1` when warning/error findings exist
- exits `2` on invalid arguments / no resolved `.allium` files

### `allium-format`

Apply basic formatting to `.allium` files.

Repo-level commands:

```bash
npm run format:allium -- docs/project/specs
npm run format:allium:check -- docs/project/specs
```

Direct built script:

```bash
node extensions/allium/dist/src/format.js docs/project/specs
node extensions/allium/dist/src/format.js --check "docs/project/specs/**/*.allium"
```

Current formatter behavior:

- normalize line endings to LF
- trim trailing whitespace
- enforce a single trailing newline

## Using CLI Tools Outside This Repo

Current status:

- fully supported from source checkout (commands above)
- not yet published as an independent npm package with stable versioned distribution

Planned:

- publish standalone CLI package(s) so consumers can install without cloning the full repository

## Development

### Project layout

- `extensions/allium`
  - `language-basics/`: syntax assets and snippets
  - `src/language-tools/`: analyzer, refactors, definitions, hover, folding, CLI tooling
- `docs/project/specs/`: Allium specs describing expected system behavior
- `docs/project/plan.md`: project roadmap and priorities
- `AGENTS.md`: development rules for humans and AI agents

### Development workflow

```bash
npm install
npm run build
npm run lint
npm run test
npm run check -- docs/project/specs
npm run format:allium -- docs/project/specs
```

### Pre-commit checks enforced

Pre-commit runs:

1. `lint-staged`:
   - Biome formatting
   - ESLint autofix
2. `allium-check` on `docs/project/specs`
3. `allium-format` on `docs/project/specs`
4. full unit test suite (`npm run test`)

### Testing expectations

- Add or update unit tests for non-trivial behavior changes.
- Prefer behavior-focused tests over implementation-detail tests.
- Preserve or improve signal quality (avoid brittle tests).

### Spec maintenance expectations

- All feature work must include updating Allium specs under `docs/project/specs/` when behavior changes.
- Specs should describe current, intended behavior and stay aligned with tooling implementation.
