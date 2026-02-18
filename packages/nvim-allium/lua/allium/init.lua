local M = {}
local config = require("allium.config")

function M.setup(opts)
  config.setup(opts)

  -- The actual wiring of LSP and Treesitter will be done in separate tasks (8lf.1.2, 8lf.1.3).
  -- This setup function serves as the entry point for merging options.
end

return M
