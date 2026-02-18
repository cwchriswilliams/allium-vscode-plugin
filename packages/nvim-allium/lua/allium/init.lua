local M = {}
local config = require("allium.config")

local function setup_lsp()
  local lsp_opts = config.options.lsp
  local lspconfig = require("lspconfig")
  local configs = require("lspconfig.configs")

  -- Register custom server if not already present
  if not configs.allium then
    configs.allium = {
      default_config = {
        cmd = lsp_opts.cmd,
        filetypes = lsp_opts.filetypes,
        root_dir = lsp_opts.root_dir,
        settings = lsp_opts.settings,
      },
    }
  end

  lspconfig.allium.setup({
    on_attach = function(client, bufnr)
      local keymaps = config.options.keymaps
      if keymaps.enabled then
        local function map(mode, lhs, rhs, desc)
          if lhs then
            vim.keymap.set(mode, lhs, rhs, { buffer = bufnr, desc = "Allium: " .. desc })
          end
        end

        map("n", keymaps.definition, vim.lsp.buf.definition, "Go to definition")
        map("n", keymaps.hover, vim.lsp.buf.hover, "Show hover documentation")
        map("n", keymaps.references, vim.lsp.buf.references, "Find references")
        map("n", keymaps.rename, vim.lsp.buf.rename, "Rename symbol")
        map("n", keymaps.code_action, vim.lsp.buf.code_action, "Show code actions")
        map("n", keymaps.format, function()
          vim.lsp.buf.format({ async = true })
        end, "Format buffer")
        map("n", keymaps.prev_diagnostic, vim.diagnostic.goto_prev, "Previous diagnostic")
        map("n", keymaps.next_diagnostic, vim.diagnostic.goto_next, "Next diagnostic")
        map("n", keymaps.loclist, vim.diagnostic.setloclist, "Open diagnostic loclist")
      end

      -- Set options
      vim.api.nvim_buf_set_option(bufnr, "omnifunc", "v:lua.vim.lsp.omnifunc")
      vim.api.nvim_buf_set_option(bufnr, "formatexpr", "v:lua.vim.lsp.formatexpr()")
    end,
  })
end

function M.setup(opts)
  config.setup(opts)
  setup_lsp()
  require("allium.treesitter").setup()
end

return M
