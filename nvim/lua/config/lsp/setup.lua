local servers = {
  'clojure_lsp',
  'gopls',
  'lua_ls',
  'omnisharp',
  'dartls'
}

local ensured_installed_servers = {}
for i = 1, #servers do
  if servers[i] ~= 'dartls' then
    ensured_installed_servers[i] = servers[i]
  end
end

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
  ensure_installed = ensured_installed_servers,
  automatic_installation = true,
  automatic_enable = true,
})

for _, server in ipairs(servers) do
  local default_opts = require('config.lsp.options')
  local server_opts = {}

  -- Enhance the default opts with the server-specific ones
  pcall(function()
    require('config.lsp.servers.' .. server).setup(server_opts)
  end)

  local new_opts = {}

  for k, v in pairs(default_opts) do
    new_opts[k] = v
  end

  for k, v in pairs(server_opts) do
    new_opts[k] = v
  end

  vim.lsp.config(server, new_opts)
end

require('config.lsp.diagnostic')
require('config.lsp.completion')
