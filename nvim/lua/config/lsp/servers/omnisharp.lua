local omnisharp = {}

omnisharp.setup = function(opts)
  local pid = vim.fn.getpid()
  local omnisharp_bin = "/usr/local/bin/omnisharp"

  -- opts.cmd = {
  --   omnisharp_bin, "--languageserver" , "--hostPID", tostring(pid)
  -- }
end

return omnisharp
