vim.g['conjure#client#clojure#nrepl#test#current_form_names'] = { 'deftest', 'defflow', 'defflow-i18n', 'defspec', 'facts' }
vim.g['conjure#extract#tree_sitter#enabled'] = true
vim.g['conjure#client#clojure#nrepl#connection#auto_repl#enabled'] = false
vim.g['conjure#client#clojure#nrepl#connection#auto_repl#cmd'] = "lein with-profiles +dev repl :headless"

-- Colorize the buffer with baleia.nvim
-- https://github.com/m00qek/baleia.nvim#with-conjure
vim.g['conjure#log#strip_ansi_escape_sequences_line_limit'] = 0
local baleia = require('baleia').setup({ line_starts_at = 3 })

vim.api.nvim_create_autocmd({ 'BufWinEnter' }, {
  pattern = 'conjure-log-*',
  callback = function()
    baleia.automatically(vim.api.nvim_win_get_buf(0))
  end,
})
