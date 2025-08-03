local clojure_lsp = {}
local ag = vim.api.nvim_create_augroup
local au = vim.api.nvim_create_autocmd
local disable_conjure_log_clojure_lsp_group = ag("DisableConjureLogClojureLsp", { clear = true })

clojure_lsp.setup = function(opts)
  local clojure_lsp_bin = "/opt/homebrew/bin/clojure-lsp"

  local util = require('lspconfig.util')
  local capabilities = vim.lsp.protocol.make_client_capabilities()
  capabilities = vim.tbl_deep_extend('force', capabilities, require('cmp_nvim_lsp').default_capabilities())

  opts.cmd = {
    clojure_lsp_bin
  }

 capabilities = capabilities
 root_dir = function(pattern)
   local fallback = vim.loop.cwd()
   local patterns = { 'project.clj', 'deps.edn', 'build.boot', 'shadow-cljs.edn', '.git', 'bb.edn' }
   local root = util.root_pattern(patterns)(pattern)
 end

end

return clojure_lsp
