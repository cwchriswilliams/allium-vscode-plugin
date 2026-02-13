# Allium VS Code Extension + Standalone Tooling

This project provides:

1. A VS Code extension for `.allium` files.
2. A standalone `allium-check` CLI for validation.
3. A standalone `allium-format` CLI for formatting.
4. A standalone `allium-diagram` CLI for text-first diagram generation from specs.

The extension is not yet published on the VS Code Marketplace. Consumers should install from GitHub Release assets (`.vsix` + standalone CLI npm package artifact) or from source.

## Consumer Installation (No Marketplace Yet)

### Prerequisites

- Node.js 20+ (recommended)
- npm 10+ (recommended)
- VS Code

### Option A: Install from GitHub Release assets (recommended)

Each tagged release publishes:

- `allium-vscode-<version>.vsix` (VS Code extension package)
- `allium-cli-<version>.tgz` (standalone npm CLI package exposing `allium-check`, `allium-format`, and `allium-diagram`)
- `SHA256SUMS.txt` (artifact checksums)

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
allium-diagram --help
```

Optional checksum verification:

```bash
sha256sum -c SHA256SUMS.txt
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
allium-diagram --help
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
- unsupported/invalid `when:` trigger shape
- rule missing `ensures:` clause
- temporal `when:` without `requires:` guard
- duplicate `let` binding in a rule
- duplicate key in a `config` block
- duplicate named default instance declarations
- default declaration references unknown target type
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
- undefined imported symbol references across `use "... " as alias` boundaries
- undefined relationship target entity type (for `<Type> for this ...` fields)
- relationship target entity type names that look plural (advisory)
- undefined rule trigger/creation type reference
- undefined imported alias in rule trigger/creation type reference
- undefined rule binding reference (including unresolved dotted roots, `exists <name>`, and `for ... in <name>` sources)
- undefined status value assigned in `ensures` against entity status enum
- status enum values never assigned by any rule (`unreachable` state hints)
- non-terminal status enum values with no observed exit transitions
- contradictory `requires` constraints that imply a rule may never fire
- external trigger rules with no local provider/emitter path (informational unreachable trigger hints)
- duplicate rule behavior and potentially shadowed stricter rules
- obvious expression type mismatches in `requires`/`ensures` comparisons and arithmetic
- unused named value/enum/default declarations
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
- entity field declared but not referenced elsewhere
- external entity declared without obvious governing specification import hint
- deferred specification declaration without location hint
- `open_question` warning finding

Diagnostics setting:

- `allium.diagnostics.mode`:
  - `strict` (default)
  - `relaxed` (suppresses temporal-guard warning and downgrades undefined config reference severity)
- `allium.profile`:
  - `custom` (default; uses `allium.diagnostics.mode`)
  - `strict-authoring` (forces strict diagnostics)
  - `legacy-migration` (forces relaxed diagnostics)
  - `doc-writing` (forces relaxed diagnostics)

Formatting settings:

- `allium.format.indentWidth` (default: `4`)
- `allium.format.topLevelSpacing` (default: `1`)

### Commands and quick actions

- Command: `Allium: Run Checks` (`allium.runChecks`)
- Command: `Allium: Apply All Safe Fixes` (`allium.applySafeFixes`)
- Command: `Allium: Apply Safe Fixes (Missing Ensures)` (`allium.applySafeFixes.missingEnsures`)
- Command: `Allium: Apply Safe Fixes (Temporal Guards)` (`allium.applySafeFixes.temporalGuards`)
- Command: `Allium: Show Spec Health` (`allium.showSpecHealth`)
- Command: `Allium: Generate Diagram` (`allium.generateDiagram`)
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
- rename for locally declared symbols and imported symbol usages across workspace `use` boundaries
- document links for `use "..." as alias` import paths
- hover docs for core Allium keywords with declaration/import context
- hover appends leading declaration comments as inline symbol docs
- safer rename checks for ambiguous targets and name-collision rejection
- diagram preview panel with copy/export and node-to-source jump actions from active file or workspace (`allium.generateDiagram`)
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
npm run check -- --autofix docs/project/specs
npm run check -- --format json docs/project/specs
npm run check -- --write-baseline .allium-baseline.json docs/project/specs
npm run check -- --baseline .allium-baseline.json docs/project/specs
```

Direct built script:

```bash
node extensions/allium/dist/src/check.js docs/project/specs
node extensions/allium/dist/src/check.js --mode strict path/to/file.allium
node extensions/allium/dist/src/check.js --autofix docs/project/specs
node extensions/allium/dist/src/check.js --format sarif docs/project/specs
```

Behavior summary:

- exits `0` when only informational findings (or no findings) are present
- exits `1` when warning/error findings exist
- exits `2` on invalid arguments / no resolved `.allium` files
- `--autofix` applies safe automatic edits (`missing ensures` scaffold and temporal `requires` guard scaffold)
- `--format json|sarif` emits machine-readable findings for CI/code-scanning integrations
- `--write-baseline <file>` records current findings as suppression fingerprints and exits successfully
- `--baseline <file>` suppresses matching known findings to support ratcheting in legacy specs

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
- normalize declaration header spacing before `{` for official top-level declarations
- normalize spacing around pipe-delimited literals (for example enum literal sets)

### `allium-diagram` (experimental)

Generate text-based diagrams directly from `.allium` specs.

Format options:

- `d2` (default) for diagram-as-code source with good text diff ergonomics
- `mermaid` for markdown-native rendering pipelines

Repo-level commands:

```bash
npm run diagram:allium -- docs/project/specs
npm run diagram:allium -- --format mermaid --output docs/project/diagrams/spec-overview.mmd docs/project/specs
```

Direct built script:

```bash
node extensions/allium/dist/src/diagram.js docs/project/specs
node extensions/allium/dist/src/diagram.js --format d2 --output docs/project/diagrams/spec-overview.d2 docs/project/specs
node extensions/allium/dist/src/diagram.js --format mermaid docs/project/specs/allium-extension-behaviour.allium
node extensions/allium/dist/src/diagram.js --focus Invitation,AcceptInvitation --kind entity,rule docs/project/specs
node extensions/allium/dist/src/diagram.js --split module --output docs/project/diagrams/by-module docs/project/specs
```

Key diagram options:

- `--strict` to fail when extraction skips non-diagram declarations (`allium.diagram.skippedDeclaration`)
- `--focus NameA,NameB` to include matching nodes and one-hop neighbours
- `--kind entity,rule,...` to filter node kinds
- `--split module --output <dir>` to emit one file per detected `module` declaration
- grouped rendering by declaration kind in both D2 and Mermaid outputs

Current diagram model captures:

- key declarations (`entity`, `value`, `variant`, `rule`, `surface`, `actor`, `enum`, trigger nodes)
- variant inheritance edges
- relationship edges from `Type for this ...` fields
- rule trigger and creation edges
- surface `for`, `context`, and `provides` links

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
npm run diagram:allium -- docs/project/specs
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
- checksum manifest: `SHA256SUMS.txt`

### Pre-commit checks enforced

Pre-commit runs:

1. `lint-staged`:
   - Biome formatting
   - ESLint autofix
2. `allium-check --autofix` on `docs/project/specs` (and restages updated specs)
3. `allium-format` on `docs/project/specs`
4. unit tests
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

## Deployment

Use this section for creating GitHub Releases with VSIX + CLI artifacts.

### Workflow used

- Workflow file: `.github/workflows/release-artifacts.yml`
- Triggered by:
  - pushing a tag matching `v*` (for example `v0.1.0`)
  - manual `workflow_dispatch`

### What the workflow does

1. `npm ci`
2. `npm run lint`
3. `npm run test`
4. `npm run release:artifacts`
5. upload `artifacts/*` to Actions run artifacts
6. if the run is from a tag, publish a GitHub Release and attach artifacts:
   - `allium-vscode-<version>.vsix`
   - `allium-cli-<version>.tgz`
   - `SHA256SUMS.txt`

### Required GitHub repo setup

1. Ensure GitHub Actions is enabled for the repository.
2. Set workflow permissions to `Read and write`:
   - `Settings` -> `Actions` -> `General` -> `Workflow permissions` -> `Read and write permissions`.
3. Push this repository (including `.github/workflows/release-artifacts.yml`) to GitHub.

### Release commands

Create and push a release tag:

```bash
git tag v0.1.0
git push origin v0.1.0
```

This triggers the workflow and creates/updates the corresponding GitHub Release with attached artifacts.

### Manual run behavior

- `workflow_dispatch` builds artifacts and uploads them to the Actions run.
- It does **not** publish a GitHub Release unless the workflow run is on a tag ref.
