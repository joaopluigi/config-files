local servers = {
  'clojure_lsp',
  'gopls',
  'lua_ls',
  'omnisharp',
  'vimls'
}

require('mason').setup({
  ui = {
    border = 'rounded',
    icons = {
      package_installed = '',
      package_pending = '',
      package_uninstalled = '',
    },
  },
})

require('mason-lspconfig').setup({
  ensure_installed = servers,
  automatic_installation = true,
})

for _, server in ipairs(servers) do
  local default_opts = require('config.lsp.options')

  -- Enhance the default opts with the server-specific ones
  pcall(function()
    require('config.lsp.servers.' .. server).setup(default_opts)
  end)

  require('lspconfig')[server].setup(default_opts)
end

require('config.lsp.diagnostic')
require('config.lsp.completion')
