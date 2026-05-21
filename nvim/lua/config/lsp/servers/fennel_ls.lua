local fennel_ls = {}

fennel_ls.setup = function(opts)
  local on_attach = opts.on_attach

  opts.on_attach = function(client, bufnr)
    on_attach(client, bufnr)
    vim.keymap.set('n', '<leader>ff', '<cmd>%!fnlfmt -<cr>', {buffer = bufnr, noremap = false, silent = true})
  end
end

return fennel_ls
