return require('packer').startup(function(use)
  -- Packer can manage itself
  use('wbthomason/packer.nvim')

  -- Notifications component
  use({
    'rcarriga/nvim-notify',
    config = function()
      require('config.notify')
      vim.notify = require('notify')
    end
  })

  -- Atom's iconic One Dark theme for Neovim
  use('ful1e5/onedark.nvim')

  -- Fuzzy finder for Neovim
  use({
    'nvim-telescope/telescope.nvim',
    requires = { { 'nvim-lua/popup.nvim' }, {'nvim-lua/plenary.nvim'} },
    event = 'VimEnter',
    config = function()
      require('config.telescope')
    end
  })

  -- Lua file explorer for Neovim
  use({
    'kyazdani42/nvim-tree.lua',
    requires = {
      'kyazdani42/nvim-web-devicons', -- file icons
    },
    config = function()
      require('config.tree')
    end
  })

  -- Treesitter configurations and abstraction layer for Neovim
  use({
    'nvim-treesitter/nvim-treesitter',
    run = ':TSUpdate',
    requires = { 'p00f/nvim-ts-rainbow', 'nvim-treesitter/playground' },
    config = function()
      require('config.treesitter')
    end
  })

  -- Lua statusline for Neovim
  use({
    'nvim-lualine/lualine.nvim',
    requires = { 'kyazdani42/nvim-web-devicons', opt = true },
    config = function()
      require('config.lualine')
    end
  })

  -- LSP config
  use({
    'neovim/nvim-lspconfig',
    requires = { 'williamboman/nvim-lsp-installer', 'hrsh7th/nvim-cmp', 'hrsh7th/cmp-nvim-lsp', 'saadparwaiz1/cmp_luasnip',  'L3MON4D3/LuaSnip' },
    config = function()
      require('config.lsp.setup')
    end
  })

  --  Neovim job control
  use({
    'tpope/vim-dispatch',
    'clojure-vim/vim-jack-in',
    'radenling/vim-dispatch-neovim'
  })

  -- Text view and manipulation: surround parentheses, brackets, quotes, comments, multi-line edit, etc
  use({
   'guns/vim-sexp',
   'tpope/vim-sexp-mappings-for-regular-people',
   'tpope/vim-surround',
   'tpope/vim-repeat',
   'tpope/vim-commentary',
   'mg979/vim-visual-multi'
  })

  -- Clojure REPL
  use({
    'Olical/conjure',
    requires = { 'm00qek/baleia.nvim' },
    config = function()
      require('config.conjure')
    end
  })

  -- Git visualization and commands
  use({
    'airblade/vim-gitgutter',
    'tpope/vim-fugitive'
  })

  -- See startup time for plugins
  use('dstein64/vim-startuptime')

  -- Markdown preview
  use {
    'iamcco/markdown-preview.nvim',
    run = 'cd app && npm install',
    cmd = 'MarkdownPreview'
  }
end)
