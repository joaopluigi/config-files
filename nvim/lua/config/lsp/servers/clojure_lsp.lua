local clojure_lsp = {}
local ag = vim.api.nvim_create_augroup
local au = vim.api.nvim_create_autocmd
local disable_conjure_log_clojure_lsp_group = ag("DisableConjureLogClojureLsp", { clear = true })

au({ "BufNewFile", "BufRead" }, {
  pattern = 'conjure-log-*',
  callback = function()
    vim.diagnostic.enable(false)
  end,
  group = disable_conjure_log_clojure_lsp_group,
})

clojure_lsp.setup = function()
  -- local clojure_lsp_bin = "/Users/joao.luigi/dev/clojure-lsp/clojure-lsp"

  -- opts.cmd = {
  --   clojure_lsp_bin
  -- }
end

return clojure_lsp
