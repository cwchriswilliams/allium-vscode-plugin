# Allium VS Code Extensions

VS Code support for [Allium](https://juxt.github.io/allium/) including syntax highlighting, diagnostics, snippets, and refactoring support.

## Workspace layout

- `extensions/allium`: single publishable extension with internal split:
  - `language-basics/` for language registration, TextMate grammar, snippets
  - `src/language-tools/` for runtime diagnostics and quick fixes
- `docs/project/plan.md`: implementation roadmap.

## Development

```bash
npm install
npm run build
npm run test
npm run check -- path/to/spec.allium
```
