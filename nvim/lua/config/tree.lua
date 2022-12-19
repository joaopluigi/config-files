-- disable netrw at the very start of your init.lua (strongly advised)
vim.g.loaded_netrw = 1
vim.g.loaded_netrwPlugin = 1

require('nvim-tree').setup({
  diagnostics = {
    enable = true
  },
  view = {
    width = 30,
    side = 'left'
  },
  renderer = {
    icons = {
      webdev_colors = true,
    },
  },
  git = {
    enable = true,
    ignore = false,
    timeout = 500
  },
})

-- Auto close when only NvimTree window is open
vim.api.nvim_create_autocmd('BufEnter', {
  nested = true,
  callback = function()
    if #vim.api.nvim_list_wins() == 1 and require('nvim-tree.utils').is_nvim_tree_buf() then
      vim.cmd 'quit'
    end
  end
})
