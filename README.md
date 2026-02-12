# Allium VS Code Extension + Standalone Tooling

This project provides:

1. A VS Code extension for `.allium` files.
2. A standalone `allium-check` CLI for validation.
3. A standalone `allium-format` CLI for formatting.

The extension is not yet published on the VS Code Marketplace. Consumers should install from GitHub Release assets (`.vsix` + standalone CLI npm package artifact) or from source.

## Consumer Installation (No Marketplace Yet)

### Prerequisites

- Node.js 20+ (recommended)
- npm 10+ (recommended)
- VS Code

### Option A: Install from GitHub Release assets (recommended)

Each tagged release publishes:

- `allium-vscode-<version>.vsix` (VS Code extension package)
- `allium-cli-<version>.tgz` (standalone npm CLI package exposing `allium-check` and `allium-format`)

Install extension from VSIX:

1. Download `allium-vscode-<version>.vsix` from GitHub Releases.
2. In VS Code, open command palette.
3. Run: `Extensions: Install from VSIX...`
4. Select the downloaded `.vsix`.

Install standalone CLI tools from release npm artifact:

```bash
npm install -g ./allium-cli-<version>.tgz
allium-check --help
allium-format --help
```

### Option B: Install from source checkout

```bash
git clone <repo-url> allium-vscode
cd allium-vscode
npm install
npm run release:artifacts
```

Then install the locally built extension and CLI package:

1. Install extension VSIX from your local artifacts:
   - VS Code command palette: `Extensions: Install from VSIX...`
   - Select `artifacts/allium-vscode-<version>.vsix`
2. Install standalone CLI tools from your local npm artifact:

```bash
npm install -g ./artifacts/allium-cli-<version>.tgz
allium-check --help
allium-format --help
```

## VS Code Features

### Language support

- `.allium` language registration
- syntax highlighting
- language configuration (comments/brackets)
- authoring snippets covering core declarations (including `enum`, `context`, `default`, and `module`)

### Diagnostics

Implemented checks:

- rule missing `when:` trigger
- rule missing `ensures:` clause
- temporal `when:` without `requires:` guard
- duplicate `let` binding in a rule
- duplicate key in a `config` block
- duplicate named default instance declarations
- config parameter missing explicit type or default value
- undefined `config.<key>` reference
- undefined external config alias in `<alias>/config.<key>` reference
- duplicate literal in a named `enum` declaration
- empty named `enum` declaration
- discriminator names that do not match declared variants
- variants extending a base but missing from its discriminator field
- direct `.created(...)` calls on sum-type base entities
- top-level variant-like declarations missing the `variant` keyword
- variant-specific field access without an observed kind guard
- undefined local type references in entity/value/variant field declarations
- undefined imported alias in field type references (for `<alias>/<Type>`)
- undefined rule trigger/creation type reference
- undefined imported alias in rule trigger/creation type reference
- undefined rule binding reference (not resolved from context/trigger/default/let/for)
- undefined status value assigned in `ensures` against entity status enum
- status enum values never assigned by any rule (`unreachable` state hints)
- non-terminal status enum values with no observed exit transitions
- contradictory `requires` constraints that imply a rule may never fire
- obvious expression type mismatches in `requires`/`ensures` comparisons and arithmetic
- circular dependencies across derived entity values
- duplicate binding name in a module `context` block
- undefined/unimported binding type in a module `context` block
- undefined surface name referenced inside a surface `related:` section
- surface `for`/`context` binding declared but not used in surface body
- unresolved field paths in surface clauses (`exposes`/`requires`/`provides`/`related`)
- surface `for x in ...` iteration over expressions not known to be collections
- surface paths not observed in any rule field references
- contradictory `when` clauses inside surface entries
- duplicate named `requires` block in a surface
- named `requires` block in a surface without matching deferred hint
- duplicate named `provides` block in a surface
- trigger used in surface `provides` but not defined as external-stimulus rule trigger
- implicit lambda shorthand in collection operators (`any/all/each`) instead of explicit `x => ...`
- entity declared but never referenced elsewhere
- external entity declared without obvious governing specification import hint
- deferred specification declaration without location hint
- `open_question` warning finding

Diagnostics setting:

- `allium.diagnostics.mode`:
  - `strict` (default)
  - `relaxed` (suppresses temporal-guard warning and downgrades undefined config reference severity)

Formatting settings:

- `allium.format.indentWidth` (default: `4`)
- `allium.format.topLevelSpacing` (default: `1`)

### Commands and quick actions

- Command: `Allium: Run Checks` (`allium.runChecks`)
- Command: `Allium: Apply All Safe Fixes` (`allium.applySafeFixes`)
- Command: `Allium: Show Spec Health` (`allium.showSpecHealth`)
- Quick fixes:
  - insert `ensures: TODO()` scaffold for missing ensures
  - insert temporal `requires:` guard scaffold
  - insert `-- allium-ignore <code>` suppression directive for diagnostics
- Refactorings:
  - extract repeated string/integer literal to `config.<key>`
  - extract inline enum field literals to a named top-level `enum`
  - add temporal guard from selected temporal `when:` line

### Productivity features

- document symbols / outline for top-level blocks
- workspace symbol search across `.allium` files
- go to definition for local top-level symbols (including named `enum` and `default` declarations), `config.<key>`, and imported symbols via `use "... " as alias`
- find references for local declarations/config keys and imported symbols
- rename for locally declared symbols
- document links for `use "..." as alias` import paths
- hover docs for core Allium keywords with declaration/import context
- folding ranges for top-level blocks
- document formatting for `.allium` files
- semantic tokens for richer syntax-aware highlighting layers
- keyword and `config.<key>` completions

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
node extensions/allium/dist/src/format.js --indent-width 2 --top-level-spacing 0 docs/project/specs
```

Current formatter behavior:

- normalize line endings to LF
- trim trailing whitespace
- enforce a single trailing newline
- normalize block indentation
- normalize spacing between top-level blocks
- normalize spacing around pipe-delimited literals (for example enum literal sets)

## Using CLI Tools Outside This Repo

Supported paths:

- source checkout usage (repo-level npm commands)
- release npm artifact usage (`allium-cli-<version>.tgz`)

Planned improvements:

- publish dedicated standalone CLI package(s) with stable install names (without extension packaging concerns)

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
npm run release:artifacts
```

### Extension development host flow (for plugin development)

Use this when developing/testing extension behavior interactively:

1. Open this repo in VS Code.
2. Press `F5` to launch an Extension Development Host window.
3. Open `.allium` files in that host to test extension features.

### Building release artifacts locally

```bash
npm run release:artifacts
```

Produces `artifacts/` containing:

- VS Code extension package: `allium-vscode-<version>.vsix`
- standalone CLI npm artifact: `allium-cli-<version>.tgz`

### Automated release path

- GitHub Actions workflow: `.github/workflows/release-artifacts.yml`
- Triggered on:
  - tag push matching `v*`
  - manual dispatch
- Actions:
  - install dependencies
  - lint
  - test
  - build release artifacts
  - upload artifacts
  - attach artifacts to GitHub release for tagged builds

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
- Keep and extend golden fixture tests for formatter and refactor output stability.

### Spec maintenance expectations

- All feature work must include updating Allium specs under `docs/project/specs/` when behavior changes.
- Specs should describe current, intended behavior and stay aligned with tooling implementation.
- All language-level behavior must align with the official Allium language reference: `https://juxt.github.io/allium/language`.
