-- Automatically install and set up packer.nvim
local ensure_packer = function()
  local fn = vim.fn
  local install_path = fn.stdpath('data') .. '/site/pack/packer/start/packer.nvim'
  if fn.empty(fn.glob(install_path)) > 0 then
    fn.system({ 'git', 'clone', '--depth', '1', 'https://github.com/wbthomason/packer.nvim', install_path })
    vim.cmd [[packadd packer.nvim]]
    return true
  end
  return false
end

local packer_bootstrap = ensure_packer()

-- Automatically run :PackerCompile whenever plugins.lua is updated
vim.cmd([[
  augroup packer_user_config
    autocmd!
    autocmd BufWritePost plugins.lua source <afile> | PackerCompile
  augroup end
]])

return require('packer').startup({
  function(use)
    -- Packer can manage itself
    use('wbthomason/packer.nvim')

    -- Atom's iconic One Dark theme for Neovim
    use('navarasu/onedark.nvim')

    -- Notifications component
    use({
      'rcarriga/nvim-notify',
      config = function()
        require('config.notify')
        vim.notify = require('notify')
      end
    })

    -- Highly extendable fuzzy finder over lists
    use({
      'nvim-telescope/telescope.nvim',
      requires = {
        { 'nvim-lua/plenary.nvim' },
        { 'nvim-lua/popup.nvim' },
        { 'nvim-telescope/telescope-fzf-native.nvim', run = 'make' },
        { 'nvim-telescope/telescope-ui-select.nvim' },
        { 'kyazdani42/nvim-web-devicons' },
      },
      config = function()
        require('config.telescope')
      end,
    })

    use {
      'nvim-tree/nvim-tree.lua',
      requires = {
        { 'nvim-tree/nvim-web-devicons' },
      },
      config = function()
        require('config.tree')
      end,
    }

    use({
      'nvim-lualine/lualine.nvim',
      requires = { 'kyazdani42/nvim-web-devicons', opt = true },
      config = function()
        require('config.lualine')
      end,
    })

    -- Syntax highlighting
    use({
      'nvim-treesitter/nvim-treesitter',
      requires = { { 'p00f/nvim-ts-rainbow', 'nvim-treesitter/playground' } },
      run = function()
        local ts_update = require('nvim-treesitter.install').update({ with_sync = true })
        ts_update()
      end,
      config = function()
        require('config.treesitter')
      end,
    })

    -- Text view and manipulation
    use({
      'guns/vim-sexp',                              -- sexp
      'tpope/vim-sexp-mappings-for-regular-people', -- more acessible sexp mappings
      'tpope/vim-surround',                         -- surround parentheses
      'tpope/vim-repeat',                           -- remaps . in a way that plugins can tap into it
      'mg979/vim-visual-multi',                     -- select multi lines
    })

    -- use gcc to comment out a line
    use({
      'tpope/vim-commentary',
      config = function()
        require('config.commentary')
      end,
    })

    --  Neovim job control
    use({
      'tpope/vim-dispatch',
      'clojure-vim/vim-jack-in',
      'radenling/vim-dispatch-neovim'
    })

    -- Git visualization and commands
    use({
      'airblade/vim-gitgutter', branch = 'main'
    })

    use({
      'tpope/vim-fugitive'
    })

    -- A cross platform terminal image viewer for Neovim (ONLY if using Kitty terminal)
    use({
      'edluffy/hologram.nvim',
      config = function()
        require('config.hologram')
      end,
    })

    -- LSP
    use({
      'williamboman/mason.nvim',
      requires = {
        -- LSP Support
        { 'neovim/nvim-lspconfig' },
        { 'williamboman/mason-lspconfig.nvim' },
        -- Autocompletion
        { 'hrsh7th/nvim-cmp' },
        { 'hrsh7th/cmp-buffer' },
        { 'hrsh7th/cmp-path' },
        { 'f3fora/cmp-spell' },
        { 'hrsh7th/cmp-vsnip' },
        { 'hrsh7th/vim-vsnip' },
        { 'hrsh7th/cmp-nvim-lsp' },
        { 'hrsh7th/cmp-nvim-lua' },
        -- Snippets
        { 'rafamadriz/friendly-snippets' },
        -- vscode-like pictograms
        { 'onsails/lspkind.nvim' },
      },
      config = function()
        require('config.lsp.setup')
      end,
    })

    -- Clojure REPL
    use({
      'Olical/conjure',
      requires = { 'm00qek/baleia.nvim' },
      config = function()
        require('config.conjure')
      end,
    })

    -- Markdown previewer
    use({
      'iamcco/markdown-preview.nvim',
      run = function()
        vim.fn["mkdp#util#install"]()
      end,
      setup = function()
        vim.g.mkdp_filetypes = { 'markdown' }
      end,
      ft = { 'markdown' },
    })

    -- GitHub co-pilot
    use('github/copilot.vim')

    use({
      'akinsho/flutter-tools.nvim',
      requires = {
        'nvim-lua/plenary.nvim',
        'stevearc/dressing.nvim', -- optional for vim.ui.select
      },
      config = function()
        require('config.flutter_tools')
      end,
    })

    -- Automatically set up your configuration after cloning packer.nvim
    -- Put this at the end after all plugins
    if packer_bootstrap then
      require('packer').sync()
    end
  end,
  -- Set packer to opens a float windows instead of split screen
  config = {
    display = {
      open_fn = function()
        return require('packer.util').float({ border = 'rounded' })
      end,
      working_sym = '',
      error_sym = '',
      done_sym = '',
      removed_sym = '',
      moved_sym = '',
      prompt_border = 'rounded'
    }
  }
})
