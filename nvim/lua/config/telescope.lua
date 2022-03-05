local actions = require('telescope.actions')

require('telescope').setup({
  defaults = {
    selection_caret = '❯ ',
    entry_prefix = '  ',
    color_devicons = true,
    set_env = { ['COLORTERM'] = 'truecolor' }, -- default = nil,
    selection_strategy = 'reset',
    sorting_strategy = 'descending',
    layout_strategy = 'horizontal',
    layout_config = { horizontal = { mirror = false }, vertical = { mirror = false } },
    file_previewer = require('telescope.previewers').vim_buffer_cat.new,
    grep_previewer = require('telescope.previewers').vim_buffer_vimgrep.new,
    qflist_previewer = require('telescope.previewers').vim_buffer_qflist.new,
    mappings = { i = { ['<esc>'] = actions.close } }
  }
})

local M = {}

M.lsp_code_actions = function()
  require('telescope.builtin').lsp_code_actions(require('telescope.themes').get_cursor())
end

return M
