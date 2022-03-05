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
map('n', '<Leader>ca', "<cmd>lua require('config.telescope').lsp_code_actions()<cr>", opts)

-- NvimTree
map('n', '<C-m>', "<cmd>lua require('nvim-tree').toggle()<cr>", opts)

-- LSP
map('n', '<Leader>e', "<cmd>lua vim.diagnostic.show_line_diagnostics({float={border='rounded'}})<CR>", opts)
map('n', '[d', "<cmd>lua vim.diagnostic.goto_prev({float={border='rounded'}})<CR>", opts)
map('n', ']d', "<cmd>lua vim.diagnostic.goto_next({float={border='rounded'}})<CR>", opts)
map('n', '<Leader>q', "<cmd>lua vim.diagnostic.setloclist()<CR>", opts)
map('n', 'gD', "<cmd>lua vim.lsp.buf.declaration()<CR>", opts)
map('n', 'gd', "<cmd>lua vim.lsp.buf.definition()<CR>", opts)
map('n', 'K', "<cmd>lua vim.lsp.buf.hover()<CR>", opts)
map('n', 'gi', "<cmd>lua vim.lsp.buf.implementation()<CR>", opts)
map('n', '<C-k>', "<cmd>lua vim.lsp.buf.signature_help()<CR>", opts)
map('n', '<Leader>wa', "<cmd>lua vim.lsp.buf.add_workspace_folder()<CR>", opts)
map('n', '<Leader>wr', "<cmd>lua vim.lsp.buf.remove_workspace_folder()<CR>", opts)
map('n', '<Leader>wl', "<cmd>lua print(vim.inspect(vim.lsp.buf.list_workspace_folders()))<CR>", opts)
map('n', '<Leader>D', "<cmd>lua vim.lsp.buf.type_definition()<CR>", opts)
map('n', '<Leader>rn', "<cmd>lua vim.lsp.buf.rename()<CR>", opts)
map('n', 'gr', "<cmd>lua vim.lsp.buf.references()<CR>", opts)
map('n', '<Leader>f', "<cmd>lua vim.lsp.buf.formatting()<CR>", opts)

-- REPL
map('c', '<C-r>', '<cmd>Lein! with-profiles +repl repl :headless<cr>', opts)
