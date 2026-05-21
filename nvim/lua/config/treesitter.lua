vim.api.nvim_create_autocmd('FileType', {
  pattern = { '*' },
  callback = function() pcall(vim.treesitter.start) end,
})

require('nvim-treesitter').setup({})
require('nvim-treesitter').install({ 'c', 'clojure', 'dart', 'fennel', 'go', 'json', 'lua', 'markdown', 'vim', 'vimdoc', 'query', 'regex' })
