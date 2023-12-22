-- Leader key
vim.g.mapleader = '\\'

-- Local Leader key
vim.g.maplocalleader = ','

-- alias to map function and options
local map = vim.api.nvim_set_keymap

-- map options
local opts = { noremap = true, silent = true }

-- Telescope
map('n', '<LocalLeader>ff', "<cmd>lua require('telescope.builtin').find_files()<cr>", opts)
map('n', '<LocalLeader>fg', "<cmd>lua require('telescope.builtin').live_grep()<cr>", opts)
map('n', '<LocalLeader>fb', "<cmd>lua require('telescope.builtin').buffers()<cr>", opts)
map('n', '<LocalLeader>fh', "<cmd>lua require('telescope.builtin').help_tags()<cr>", opts)
map('n', '<LocalLeader>fn', "<cmd>lua require('telescope').extensions.notify.notify()<cr>", opts)

-- LSP
-- see lua/config/lsp/options.lua

-- NvimTree
map('n', '<Leader>m', "<cmd>NvimTreeToggle<cr>", opts)

-- REPL
map('c', '<C-r>', '<cmd>Lein! with-profiles +dev repl :headless<cr>', opts)
map('c', '<C-e>', '<cmd>Lein! with-profiles +repl,+catalyst-start repl :headless<cr>', opts)
