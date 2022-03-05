require('onedark').setup({
  dark_float = true,
  hide_inactive_statusline = true,
  highlight_linenumber = true,
  dark_sidebar = true,
  dev = true,

  overrides = function(c)
    return {
      clojureTSVariable = { fg = c.fg0 },
      clojureTSType = { fg = c.fg0 },
      clojureTSNamespace = { fg = c.yellow1 },
      clojureTSFuncBuiltin = { fg = c.cyan0 }
    }
  end
})
