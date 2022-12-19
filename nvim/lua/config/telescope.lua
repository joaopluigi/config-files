local actions = require('telescope.actions')
local previewers = require('telescope.previewers')

require'telescope'.setup {
  defaults = {
    selection_caret = '❯ ',
    entry_prefix = ' ',
    color_devicons = true,
    set_env = { ['COLORTERM'] = 'truecolor' }, -- default = nil,
    selection_strategy = 'reset',
    sorting_strategy = 'descending',
    layout_strategy = 'vertical',
    layout_config = { horizontal = { mirror = false, preview_cutoff = 0 }, vertical = { mirror = false, preview_cutoff = 0 } },
    file_previewer = previewers.vim_buffer_cat.new,
    grep_previewer = previewers.vim_buffer_vimgrep.new,
    qflist_previewer = previewers.vim_buffer_qflist.new,
    mappings = { i = { ['<esc>'] = require('telescope.actions').close } },
    extensions = {
      fzf = {
        fuzzy = true, -- false will only do exact matching
        override_generic_sorter = true, -- override the generic sorter
        override_file_sorter = true, -- override the file sorter
        case_mode = 'smart_case', -- or "ignore_case" or "respect_case"
        -- the default case_mode is "smart_case"
      },
    },
  }
}

require('telescope').load_extension('fzf')
require('telescope').load_extension('notify')
require('telescope').load_extension('ui-select')

-- Wrap text on Telescope previewer
vim.cmd([[ autocmd User TelescopePreviewerLoaded setlocal wrap ]])
