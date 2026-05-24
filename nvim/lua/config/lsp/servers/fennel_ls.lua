local fennel_ls = {}

fennel_ls.setup = function(opts)
  local on_attach = opts.on_attach

  opts.on_attach = function(client, bufnr)
    on_attach(client, bufnr)
    vim.keymap.set('n', '<leader>ff', '<cmd>update | silent !fnlfmt --fix % | edit<cr>',
      {buffer = bufnr, silent = true, desc = 'Format Fennel buffer with fnlfmt'})
  end
end

return fennel_ls
