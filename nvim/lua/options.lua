local au = require('au')

-- Highlight on Yank
au.TextYankPost = function()
  vim.highlight.on_yank({ higroup = 'Visual', timeout = 120 })
end

-- set json syntax on files with for ex: <file>.json.base extension
au({ 'BufNewFile', 'BufRead' }, {
    '*.json*',
    function()
        vim.bo.filetype = 'json'
    end
})

-- dont keep backup files
vim.opt.backup = false

-- copy and paste with OS clipboard
vim.opt.clipboard = 'unnamedplus'

-- less space do display messages
vim.opt.cmdheight = 1

-- set completeopt to have a better completion experience
vim.opt.completeopt = {'menuone', 'noinsert', 'noselect'}

-- file encoding utf8
vim.opt.encoding = 'utf-8'

-- space instead of tab
vim.opt.expandtab = true

-- required to keep multiple buffers open multiple buffers
vim.opt.hidden = true

-- turn off highlight search
vim.opt.hlsearch = false

-- replace chars like tab and trail whitespace for symbols
vim.opt.listchars = 'tab:→ ,trail:•'

-- enable mouse on insert mode
vim.opt.mouse = 'a'

-- display line numbers
vim.opt.number = true

-- Makes popup menu smaller
vim.opt.pumheight = 10

-- shift width
vim.opt.shiftwidth = 2

-- vertical split to right
vim.opt.splitright = true

-- horizontal split to down
vim.opt.splitbelow = true

-- no swap files
vim.opt.swapfile = false

-- tab width
vim.opt.tabstop = 2

-- must be enabled so colors for nvim-tree are applied properly
vim.opt.termguicolors = true
vim.g.t_Co = 256
vim.g.syntax_on = true

-- quicker update time
vim.opt.updatetime = 300

-- don't wrap lines
vim.opt.wrap = false

-- dont backup files
vim.opt.writebackup = false

-- Enable highlighting of the current line
vim.wo.cursorline = true

-- show whitespace/tab characters (follows vim.opt.listchars symbols)
vim.wo.list = true

-- set mininum of 10 lines above the cursor when scrolling
vim.wo.scrolloff = 10

-- same but for side scroll
vim.wo.sidescrolloff = 30

-- Always show the signcolumn for displaying LSP messages
vim.wo.signcolumn = 'yes'
