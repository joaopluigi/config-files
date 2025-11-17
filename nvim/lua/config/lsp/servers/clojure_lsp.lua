local clojure_lsp = {}

vim.api.nvim_create_augroup("DisableConjureLogClojureLsp", { clear = true })

clojure_lsp.setup = function()
  local capabilities = vim.lsp.protocol.make_client_capabilities()
  capabilities = vim.tbl_deep_extend('force', capabilities, require('cmp_nvim_lsp').default_capabilities())
end

return clojure_lsp
