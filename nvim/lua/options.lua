vim.g.syntax_on = true               -- enable syntax highlight
vim.g.t_Co = 256                     -- for nvim-tree colors be applied properly

vim.opt.backup = false               -- dont keep backup files
vim.opt.clipboard = 'unnamedplus'    -- copy and paste with OS clipboard
vim.opt.cmdheight = 1                -- less space do display messages
vim.opt.completeopt = {              -- better completion experience
  'menuone',
  'noinsert',
  'noselect',
}
vim.opt.encoding = 'utf-8'           -- file encoding utf8
vim.opt.expandtab = true             -- space instead of tab
vim.opt.hidden = true                -- for multiple buffers open multiple buffers
vim.opt.hlsearch = false             -- turn off highlight search
vim.opt.listchars = 'tab:» ,trail:•' -- replace chars like tab and trail whitespace for symbols
vim.opt.mouse = 'a'                  -- enable mouse on insert mode
vim.opt.number = true                -- display line numbers
vim.opt.pumheight = 10               -- Makes popup menu smaller
vim.opt.shiftwidth = 2               -- shift width
vim.opt.splitbelow = true            -- horizontal split to down
vim.opt.splitright = true            -- vertical split to right
vim.opt.swapfile = false             -- no swap files
vim.opt.tabstop = 2                  -- tab width
vim.opt.termguicolors = true         -- for nvim-tree colors be applied properly
vim.opt.updatetime = 300             -- quicker update time
vim.opt.wrap = false                 -- don't wrap lines
vim.opt.writebackup = false          -- dont write backup files

vim.wo.cursorline = true             -- Enable highlighting of the current line
vim.wo.list = true                   -- show whitespace/tab characters
vim.wo.scrolloff = 10                -- lines above the cursor when scrolling
vim.wo.sidescrolloff = 30            -- same but for side scroll
vim.wo.signcolumn = 'yes'            -- Always show the signcolumn for LSP messages
