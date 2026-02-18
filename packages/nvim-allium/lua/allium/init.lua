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
      local function buf_set_keymap(...)
        vim.api.nvim_buf_set_keymap(bufnr, ...)
      end
      local opts = { noremap = true, silent = true }

      -- LSP Keymaps
      buf_set_keymap("n", "gd", "<cmd>lua vim.lsp.buf.definition()<CR>", opts)
      buf_set_keymap("n", "K", "<cmd>lua vim.lsp.buf.hover()<CR>", opts)
      buf_set_keymap("n", "gr", "<cmd>lua vim.lsp.buf.references()<CR>", opts)
      buf_set_keymap("n", "<leader>rn", "<cmd>lua vim.lsp.buf.rename()<CR>", opts)
      buf_set_keymap("n", "<leader>ca", "<cmd>lua vim.lsp.buf.code_action()<CR>", opts)
      buf_set_keymap("n", "<leader>f", "<cmd>lua vim.lsp.buf.format({ async = true })<CR>", opts)

      -- Set options
      vim.api.nvim_buf_set_option(bufnr, "omnifunc", "v:lua.vim.lsp.omnifunc")
      vim.api.nvim_buf_set_option(bufnr, "formatexpr", "v:lua.vim.lsp.formatexpr()")
    end,
  })
end

function M.setup(opts)
  config.setup(opts)
  setup_lsp()
end

return M
