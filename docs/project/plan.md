# Allium VS Code Extensions Plan

## Objectives

Build high-quality VS Code support for `.allium` with this priority order:

1. Syntax highlighting
2. Checks for invalid specifications
3. Snippets
4. Refactorings
5. Additional productivity features

## Product Architecture

We will ship one extension with an internal modular split:

- `extensions/allium/language-basics`
  - Language registration (`.allium`)
  - TextMate grammar + language configuration
  - Snippets
- `extensions/allium/src/language-tools`
  - Diagnostics/checks
  - Quick fixes and refactorings
  - Future: LSP adoption for richer semantics and editor interoperability

Rationale:
- Single install/publish experience for users.
- Internal separation keeps syntax assets and runtime tooling loosely coupled.
- Clean path to future parser and language server without rewriting basics.

## Delivery Phases

### Phase 0: Foundation

- Create workspace package metadata and TypeScript setup.
- Add shared engineering standards:
  - lint/format/test commands
  - CI smoke checks
  - extension packaging scripts

### Phase 1: Syntax Highlighting (Priority 1)

- Register `allium` language with `*.allium`.
- Implement TextMate grammar covering:
  - Section keywords (`entity`, `rule`, `surface`, `config`, etc.)
  - Control keywords (`when`, `requires`, `ensures`, `let`, `for`, `if`, `else`)
  - Type keywords and builtins (`String`, `Integer`, `Timestamp`, `Duration`, `now`, `null`)
  - Triggers and declarations
  - numbers, durations, comments, strings
- Add `language-configuration.json`:
  - comment rules (`--`)
  - bracket pairs and auto closing

Acceptance criteria:
- Basic and advanced examples from Allium docs render with stable scopes.
- No regressions on multiline strings/comments.

### Phase 2: Checks for Invalid Specs (Priority 2)

Start with fast deterministic checks in extension host; later migrate logic to LSP backend.

Initial checks:
- Rule has `when` and at least one `ensures`.
- Temporal trigger without guard (`requires`) warning.
- Duplicate names within `config` block.
- Undefined local binding reference (heuristic, conservative).
- `open_question` emits warning diagnostic (informational quality gate).

Quick fixes:
- Insert missing `ensures:` scaffold.
- Insert temporal `requires:` scaffold.

Later checks (parser-backed):
- Structural/type validation from language reference.
- Sum type validations.
- Surface/actor linkage validation.

Current status:
- Implemented parser-backed block parsing foundation for analyzer traversal.
- Implemented surface/actor linkage checks (`allium.surface.missingActor`, `allium.actor.unused`).
- Implemented enum declaration checks (`allium.enum.duplicateLiteral`, `allium.enum.empty`).
- Implemented context block binding checks (`allium.context.duplicateBinding`, `allium.context.undefinedType`).
- Added diagnostic suppression directives via `-- allium-ignore <code[,code...]>`.

### Phase 3: Snippets (Priority 3)

Provide high-value authoring snippets:
- `entity`, `external entity`, `value`, `variant`, `enum`
- `rule`, temporal rule, chained rule
- `surface`, `actor`, `context`, `module`
- `config`, `default`, `deferred`, `open_question`

Acceptance criteria:
- Snippets mirror current Allium documentation style.
- Tabstops reflect realistic authoring flow.

### Phase 4: Refactorings (Priority 4)

Initial refactors via Code Actions:
- Extract repeated literal to `config` entry.
- Convert inline enum to named `enum`.
- Add temporal guard from selected `when` condition.

Current status:
- Implemented: extract repeated literal to `config`.
- Implemented: add temporal guard from selected `when` condition.
- Implemented: inline enum conversion to named `enum`.
- Implemented: command to apply all safe built-in quick fixes in one action.
- Implemented: quick fix action to add `-- allium-ignore <code>` suppression directives.

Then migrate to semantic refactors via parser AST + symbol table.

### Phase 5: Additional Features (Priority 5)

- Document symbols and outline.
- Go to definition for local entities/rules/surfaces.
- Hover docs using language reference excerpts.
- Folding ranges by top-level blocks.
- Formatting (if grammar stabilizes).
- Semantic tokens (post parser maturity).

Current status:
- Implemented: document symbols and outline for top-level Allium blocks.
- Implemented: workspace symbol provider for cross-file Allium symbol search.
- Implemented: go to definition for local top-level symbols and `config.<key>` references.
- Implemented: go to definition across local `use "... " as alias` imports.
- Implemented: clickable document links for `use "... " as alias` import paths.
- Implemented: find references for local symbols/config keys and imported symbols.
- Implemented: local symbol rename provider.
- Implemented: hover documentation for core Allium keywords.
- Implemented: folding ranges for top-level blocks.
- Implemented: VS Code document formatting via shared Allium formatter.
- Implemented: spec health command for workspace-level Allium diagnostics summary.
- Implemented: semantic token provider for Allium declarations/keywords/literals.
- Implemented: completion provider for core keywords and `config.<key>` suggestions.
- Implemented: named `enum` declarations in definitions/outline/folding and related editor semantics.
- Implemented: `default` declarations in definitions/outline and related editor semantics.

## Engineering Approach

- TypeScript strict mode.
- Small composable analyzers with unit tests.
- Golden-file fixtures for diagnostics and quick-fix edits.
- Keep checks conservative: avoid noisy false positives.
- Add telemetry only if explicitly requested.

## Risks and Mitigations

- Risk: language evolution outpaces regex-based checks.
  - Mitigation: parser-backed architecture path; keep early checks minimal and well-tested.
- Risk: scope naming mismatch in grammar themes.
  - Mitigation: TextMate scope inspector validation + fixture snapshots.
- Risk: refactorings are unsafe without semantics.
  - Mitigation: only offer transformations with strong syntactic confidence.

## Decisions Made

1. Target `.allium` files only (for now).
2. `open_question` diagnostic severity is `Warning`.
3. Diagnostics are strict by default, with a relaxed mode available.
4. Packaging format is one extension with internal basics/tools split.

Current implementation will proceed with defaults unless you override:
- file support: `.allium` only
- `open_question`: `Warning`
- packaging: one extension (`allium`) with internal split
- diagnostics mode: strict by default, configurable to relaxed

## Future Considerations

- Add an independent `check` tool (CLI or library-backed command) so users can run Allium validation outside VS Code.
- Evaluate architecture options for sharing analyzer logic between extension-host diagnostics and the standalone check tool without duplicating rules.
- Initial implementation exists as `extensions/allium/src/check.ts`; next iteration should package and document it as a stable external workflow.
- Workspace command added: `npm run check -- <file|directory|glob>` delegates to the standalone checker.
- Standalone formatter added: `npm run format:allium -- <file|directory|glob>` for project-local `.allium` formatting.

## High Priority Next Work

- Consumer distribution before Marketplace:
  - Completed: repeatable VSIX + standalone CLI archive artifacts via local script and GitHub Actions release workflow.
- Publish standalone CLI tooling:
  - Completed: dedicated `allium-cli` package with stable install name, released as `allium-cli-<version>.tgz` artifact including `allium-check` and `allium-format`.
- Improve Allium formatter depth:
  - In progress: structure-aware indentation and top-level block spacing implemented.
  - Implemented: spacing normalization for pipe-delimited literal sets.
  - Remaining: richer syntax-aware formatting for additional constructs.
