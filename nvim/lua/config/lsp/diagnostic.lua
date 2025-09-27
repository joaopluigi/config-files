-- Diagnostic icons
local signs = {
  Error = ' ',
  Warn = ' ',
  Hint = '硫',
  Info = ' ',
}

for type, icon in pairs(signs) do
  local hl = 'DiagnosticSign' .. type
  vim.fn.sign_define(hl, { text = icon, texthl = hl, numhl = '' })
end

vim.diagnostic.config({
  virtual_text = {
    prefix = ""
  }
})

-- Border
_G.border = { '─', '│', '─', '│', '╭', '╮', '╯', '╰' }

-- Docs Window
vim.lsp.handlers['textDocument/hover'] = vim.lsp.buf.hover({ border = 'rounded' })
vim.lsp.handlers['textDocument/signatureHelp'] = vim.lsp.buf.signature_help({ border = 'rounded' })
