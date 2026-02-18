local M = {}

---@class AlliumConfig
M.defaults = {
  lsp = {
    cmd = { "allium-lsp", "--stdio" },
    filetypes = { "allium" },
    root_dir = function(fname)
      return require("lspconfig").util.root_pattern("allium.config.json", ".git")(fname)
    end,
    settings = {},
  },
  treesitter = {
    ensure_installed = { "allium" },
  },
  keymaps = {
    enabled = true,
    definition = "gd",
    hover = "K",
    references = "gr",
    rename = "<leader>rn",
    code_action = "<leader>ca",
    format = "<leader>f",
    prev_diagnostic = "[d",
    next_diagnostic = "]d",
    loclist = "<leader>q",
  },
}

M.options = {}

function M.setup(opts)
  M.options = vim.tbl_deep_extend("force", M.defaults, opts or {})
end

return M
