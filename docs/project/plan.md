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
- Rule `when` clause uses a supported trigger shape.
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
- Implemented surface `related:` reference checks (`allium.surface.relatedUndefined`).
- Implemented surface binding usage checks (`allium.surface.unusedBinding`).
- Implemented surface path and iteration checks (`allium.surface.undefinedPath`, `allium.surface.nonCollectionIteration`).
- Implemented surface coverage/impossible-condition warnings (`allium.surface.unusedPath`, `allium.surface.impossibleWhen`).
- Implemented named surface block uniqueness checks (`allium.surface.duplicateRequiresBlock`, `allium.surface.duplicateProvidesBlock`).
- Implemented warning checks for named surface `requires` blocks without deferred hints (`allium.surface.requiresWithoutDeferred`).
- Implemented surface `provides` trigger reference checks (`allium.surface.undefinedProvidesTrigger`).
- Implemented explicit-lambda checks for collection operators (`allium.expression.implicitLambda`).
- Implemented enum declaration checks (`allium.enum.duplicateLiteral`, `allium.enum.empty`).
- Implemented sum-type consistency checks (`allium.sum.*` discriminator/variant/base-instantiation rules).
- Implemented sum-type guard checks for variant-specific field access (`allium.sum.unguardedVariantFieldAccess`).
- Implemented field type reference checks (`allium.type.undefinedReference`, `allium.type.undefinedImportedAlias`).
- Implemented relationship target checks (`allium.relationship.undefinedTarget`, `allium.relationship.nonSingularTarget`).
- Implemented rule trigger/creation type reference checks (`allium.rule.undefinedTypeReference`, `allium.rule.undefinedImportedAlias`).
- Implemented rule binding resolution checks (`allium.rule.undefinedBinding`) for unresolved dotted references, `exists` names, and `for ... in` sources.
- Implemented status-assignment enum checks (`allium.status.undefinedValue`).
- Implemented status-machine heuristic checks for unassigned and no-exit status values (`allium.status.unreachableValue`, `allium.status.noExit`).
- Implemented context block binding checks (`allium.context.duplicateBinding`, `allium.context.undefinedType`).
- Implemented warning checks for unused entities and external entity source hints.
- Implemented informational unused-field checks (`allium.field.unused`).
- Implemented warning checks for deferred specifications missing location hints.
- Implemented config/default parameter and duplicate/undefined-type checks (`allium.config.invalidParameter`, `allium.config.undefinedExternalReference`, `allium.default.duplicateName`, `allium.default.undefinedType`).
- Implemented contradictory-requires warning for rules that may never fire (`allium.rule.neverFires`).
- Implemented expression semantic checks for obvious type mismatches and derived cycles (`allium.expression.typeMismatch`, `allium.derived.circularDependency`).
- Implemented unreachable-trigger informational hints for rules with no local provider/emitter (`allium.rule.unreachableTrigger`).
- Implemented warnings for unused named value/enum/default declarations (`allium.definition.unused`).
- Implemented duplicate/shadowed rule behavior diagnostics (`allium.rule.duplicateBehavior`, `allium.rule.potentialShadow`).
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
- Implemented: category-specific safe-fix commands for missing ensures and temporal guards.
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
- Implemented: code lenses for top-level declarations (`Find references`).
- Implemented: local symbol rename provider.
- Implemented: safer rename guardrails for ambiguous symbols and naming collisions.
- Implemented: workspace-aware rename updates across imported symbol usages.
- Implemented: hover documentation for core Allium keywords.
- Implemented: hover includes leading declaration comment blocks as symbol docs.
- Implemented: cross-file imported symbol diagnostics (`allium.import.undefinedSymbol`).
- Implemented: folding ranges for top-level blocks.
- Implemented: VS Code document formatting via shared Allium formatter.
- Implemented: spec health command for workspace-level Allium diagnostics summary.
- Implemented: semantic token provider for Allium declarations/keywords/literals.
- Implemented: completion provider for core keywords and `config.<key>` suggestions.
- Implemented: named `enum` declarations in definitions/outline/folding and related editor semantics.
- Implemented: `default` declarations in definitions/outline and related editor semantics.
- Implemented: `Allium: Generate Diagram` command with preview panel and copy/export actions.
- Implemented: diagram preview node jump-to-source actions.
- Implemented: diagnostics profile presets (`custom`, `strict-authoring`, `legacy-migration`, `doc-writing`).
- Implemented: problems summary command grouped by finding code.
- Implemented: rename preview command to inspect planned edits before applying rename.
- Implemented: top-level symbol code lenses now include test-reference counts.

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
- Completed: standalone `allium-cli` now carries the same parser-backed analyzer implementation as the extension to prevent diagnostics drift.
- Initial implementation exists as `extensions/allium/src/check.ts`; next iteration should package and document it as a stable external workflow.
- Workspace command added: `npm run check -- <file|directory|glob>` delegates to the standalone checker.
- Standalone formatter added: `npm run format:allium -- <file|directory|glob>` for project-local `.allium` formatting.
- Standalone checker supports `--autofix` for safe automatic rule scaffolding fixes.
- Standalone checker supports machine-readable outputs (`--format json|sarif`) and baseline files (`--baseline`, `--write-baseline`).
- Standalone checker supports scoped execution and reporting controls (`--changed`, `--min-severity`, `--ignore-code`, `--stats`) plus autofix preview mode (`--autofix --dryrun`).
- Standalone checker supports advanced controls: fix scoping (`--fix-code`), configurable failure threshold (`--fail-on`), report artifacts (`--report`), and watch mode (`--watch`).
- Experimental diagram generator added: `npm run diagram:allium -- <file|directory|glob>` with D2 (default) and Mermaid output.
- Experimental diagram generator now supports strict extraction checks, focus/kind filtering, grouped rendering, and split-by-module output.
- Standalone traceability checker added: `npm run trace:allium -- --tests <file|directory|glob> <spec-file|directory|glob>` for rule-name coverage checks between specs and tests.
- Standalone traceability checker supports CI-friendly outputs and reporting detail (`--junit`, `--by-file`) in addition to allowlist/strict controls.
- Standalone formatter supports preview/pipeline modes (`--dryrun`, `--stdin --stdout`).
- VS Code quality-of-life commands now include apply-all quick fixes in file, stale suppression cleanup, and related spec/test navigation.

## High Priority Next Work

- Consumer distribution before Marketplace:
  - Completed: repeatable VSIX + standalone CLI archive artifacts via local script and GitHub Actions release workflow.
  - Completed: release checksum manifest generation (`artifacts/SHA256SUMS.txt`).
- Publish standalone CLI tooling:
  - Completed: dedicated `allium-cli` package with stable install name, released as `allium-cli-<version>.tgz` artifact including `allium-check`, `allium-format`, experimental `allium-diagram`, and `allium-trace`.
- Improve Allium formatter depth:
  - In progress: structure-aware indentation and top-level block spacing implemented.
  - Implemented: spacing normalization for pipe-delimited literal sets.
  - Implemented: declaration-header spacing normalization before `{` across official top-level declarations.
