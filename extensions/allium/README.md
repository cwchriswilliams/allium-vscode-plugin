# Allium VS Code Extension

Single extension package with internal split:

- `language-basics/`: language registration, grammar, snippets.
- `src/language-tools/`: diagnostics and quick-fix logic.

## Settings

- `allium.diagnostics.mode` (default: `strict`)
  - `strict`: all implemented checks enabled
  - `relaxed`: suppresses temporal guard warning and downgrades undefined config reference severity
