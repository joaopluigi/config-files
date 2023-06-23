local servers = {
  'clojure_lsp',
  'gopls',
  'lua_ls'
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

local default_opts = require('config.lsp.options')

for _, name in ipairs(servers) do
  -- Enhance the default opts with the server-specific ones
  pcall(function()
    require('config.lsp.servers.' .. name).setup(default_opts)
  end)

  require('lspconfig')[name].setup(default_opts)
end

require('config.lsp.diagnostic')
require('config.lsp.completion')
