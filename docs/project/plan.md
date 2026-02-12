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

### Phase 3: Snippets (Priority 3)

Provide high-value authoring snippets:
- `entity`, `external entity`, `value`, `variant`
- `rule`, temporal rule, chained rule
- `surface`, `actor`, `context`
- `config`, `default`, `deferred`, `open_question`

Acceptance criteria:
- Snippets mirror current Allium documentation style.
- Tabstops reflect realistic authoring flow.

### Phase 4: Refactorings (Priority 4)

Initial refactors via Code Actions:
- Extract repeated literal to `config` entry.
- Convert inline enum to named `enum` (if/when enum syntax support is finalized).
- Add temporal guard from selected `when` condition.

Then migrate to semantic refactors via parser AST + symbol table.

### Phase 5: Additional Features (Priority 5)

- Document symbols and outline.
- Go to definition for local entities/rules/surfaces.
- Hover docs using language reference excerpts.
- Folding ranges by top-level blocks.
- Formatting (if grammar stabilizes).
- Semantic tokens (post parser maturity).

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
2. `open_question` diagnostic severity is `Information`.
3. Diagnostics are strict by default, with a relaxed mode available.
4. Packaging format is one extension with internal basics/tools split.

Current implementation will proceed with defaults unless you override:
- file support: `.allium` only
- `open_question`: `Information`
- packaging: one extension (`allium`) with internal split
- diagnostics mode: strict by default, configurable to relaxed

## Future Considerations

- Add an independent `check` tool (CLI or library-backed command) so users can run Allium validation outside VS Code.
- Evaluate architecture options for sharing analyzer logic between extension-host diagnostics and the standalone check tool without duplicating rules.
