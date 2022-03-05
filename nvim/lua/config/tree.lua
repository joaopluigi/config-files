require('nvim-tree').setup({
  diagnostics = { enable = true },
  tab_open = true,
  auto_close = false,
  view = { width = 30, side = 'left' },
  git = { enable = true, ignore = false, timeout = 500 }
})
