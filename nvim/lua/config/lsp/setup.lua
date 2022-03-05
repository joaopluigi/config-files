local lsp_installer = require('nvim-lsp-installer')

-- Include the servers you want to have installed by default below
local servers = {
  'clojure_lsp',
  'omnisharp',
  'sumneko_lua'
}

for _, name in pairs(servers) do
  local server_is_found, server = lsp_installer.get_server(name)
  if server_is_found and not server:is_installed() then
    print('Installing ' .. name)
    server:install()
  end
end

local enhance_server_opts = {
  ['omnisharp'] = function(opts)
    require('config.lsp.servers.omnisharp').setup(opts)
  end,
  ['sumneko_lua'] = function(opts)
    require('config.lsp.servers.sumneko_lua').setup(opts)
  end
}

lsp_installer.on_server_ready(function(server)
  -- Specify the default options which we'll use to setup all servers
  local default_opts = require('config.lsp.options')

  if enhance_server_opts[server.name] then
    -- Enhance the default opts with the server-specific ones
    enhance_server_opts[server.name](default_opts)
  end

  server:setup(default_opts)
end)

require('config.lsp.diagnostic')
require('config.lsp.completion')
