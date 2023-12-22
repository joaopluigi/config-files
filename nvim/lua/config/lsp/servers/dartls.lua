local dartls = {}

dartls.setup = function(opts)
  opts.cmd = { "dart", "language-server", "--protocol=lsp" }
end

return dartls
