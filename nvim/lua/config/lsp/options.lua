local opts = {
  -- Use an on_attach function to only map the following keys
  -- after the language server attaches to the current buffer
  on_attach = function(_, bufnr)
    -- Border
    _G.border = { '─', '│', '─', '│', '╭', '╮', '╯', '╰' }

    -- Docs Window
    vim.lsp.handlers['textDocument/hover'] = vim.lsp.with(vim.lsp.handlers.hover, { border = 'rounded' })
    vim.lsp.handlers['textDocument/signatureHelp'] = vim.lsp.with(vim.lsp.handlers.signature_help, { border = 'rounded' })

    local function buf_set_option(...)
      vim.api.nvim_buf_set_option(bufnr, ...)
    end

    -- Enable completion triggered by <c-x><c-o>
    buf_set_option('omnifunc', 'v:lua.vim.lsp.omnifunc')
    vim.cmd('setlocal omnifunc=v:lua.vim.lsp.omnifunc')
  end,
  capabilities = require('cmp_nvim_lsp').update_capabilities(vim.lsp.protocol.make_client_capabilities())
}

return opts
