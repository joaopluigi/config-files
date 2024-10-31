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
map('c', '<C-e>', '<cmd>Lein! with-profiles +flutter,+catalyst-start repl :headless<cr>', opts)
map('c', '<C-r>', '<cmd>Lein! with-profiles +dev repl :headless<cr>', opts)
map('c', '<C-t>', '<cmd>Clj! -Sdeps \'{:deps {cljdev/cljdev {:mvn/version,"0.11.0"},nrepl/nrepl {:mvn/version,"1.1.1"},cider/cider-nrepl {:mvn/version,"0.30.0"}} :plugins [[cider/cider-nrepl "0.30.0"],[refactor-nrepl "2.5.0-SNAPSHOT"]]}\' -e "(require,\'nu)" -m nrepl.cmdline --middleware "[cider.nrepl/cider-middleware]"<cr>', opts)

-- Theme
map('n', '<Leader>tl', "<cmd>set background=light<cr>", opts)
map('n', '<Leader>td', "<cmd>set background=dark<cr>", opts)
