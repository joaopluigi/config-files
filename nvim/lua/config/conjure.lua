vim.g['conjure#client#clojure#nrepl#test#current_form_names'] = { 'deftest', 'defflow', 'defspec' }
vim.g['conjure#extract#tree_sitter#enabled'] = true

-- Colorize the buffer with baleia.nvim
-- https://github.com/m00qek/baleia.nvim#with-conjure
vim.g['conjure#log#strip_ansi_escape_sequences_line_limit'] = 0

local au = require('au')
local baleia = require('baleia').setup({ line_starts_at = 3 })

au({ 'BufWinEnter' }, {
    'conjure-log-*',
    function()
        baleia.automatically(vim.api.nvim_win_get_buf('%'))
    end
})
