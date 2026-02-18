# nvim-allium

Neovim integration for the Allium language, providing LSP and Tree-sitter support.

## Installation

### Using lazy.nvim

```lua
{
  "cwchriswilliams/allium-vscode-plugin", -- Replace with actual repo when split
  dir = "~/path/to/allium-vscode-plugin/packages/nvim-allium", -- Local development path
  dependencies = {
    "neovim/nvim-lspconfig",
    "nvim-treesitter/nvim-treesitter",
  },
  opts = {
    -- Optional: Override defaults
    lsp = {
      cmd = { "allium-lsp", "--stdio" },
    },
  },
  config = function(_, opts)
    require("allium").setup(opts)
  end,
}
```

## Features

- LSP support via `allium-lsp`.
- Tree-sitter syntax highlighting, indents, and folds.
- Diagnostic reporting and quick fixes.
