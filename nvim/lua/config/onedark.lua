require('onedark').setup {
    style = 'light', -- Default theme style. Choose between 'dark', 'darker', 'cool', 'deep', 'warm', 'warmer' and 'light'
    transparent = false,  -- Show/hide background
    term_colors = true, -- Change terminal color as per the selected theme style
    ending_tildes = false, -- Show the end-of-buffer tildes. By default they are hidden
    cmp_itemkind_reverse = false, -- reverse item kind highlights in cmp menu

    -- toggle theme style ---
    toggle_style_key = '<leader>od', -- keybind to toggle theme style. Leave it nil to disable it, or set it to a string, for example "<leader>ts"
    toggle_style_list = {
      'cool'
      -- , 'dark'
      -- , 'darker'
      -- , 'deep'
      -- , 'warm'
      -- , 'warmer'
      , 'light'
    }, -- List of styles to toggle between

    -- Change code style ---
    -- Options are italic, bold, underline, none
    -- You can configure multiple style with comma seperated, For e.g., keywords = 'italic,bold'
    code_style = {
        comments = 'italic',
        keywords = 'none',
        functions = 'none',
        strings = 'none',
        variables = 'none'
    },

    -- Lualine options --
    lualine = {
        transparent = false, -- lualine center bar transparency
    },

    -- Custom Highlights --
    colors = {}, -- Override default colors
    highlights = { -- Override highlight groups
      clojureTSVariable = { fg = '#abb2bf' },
      clojureTSType = { fg = '#abb2bf' },
      clojureTSNamespace = { fg = '#e5c07b' },
      clojureTSFuncBuiltin = { fg = '#56b6c2' }
    },

    -- Plugins Config --
    diagnostics = {
        darker = true, -- darker colors for diagnostic
        undercurl = true,   -- use undercurl instead of underline for diagnostics
        background = true,    -- use background color for virtual text
    },

  -- overrides = function(c)
  --   return {
  --     clojureTSVariable = { fg = c.fg0 },
  --     clojureTSType = { fg = c.fg0 },
  --     clojureTSNamespace = { fg = c.yellow1 },
  --     clojureTSFuncBuiltin = { fg = c.cyan0 }
  --   }
  -- end
}
require('onedark').load()
