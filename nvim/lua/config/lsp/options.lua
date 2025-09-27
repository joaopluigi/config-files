return {
  -- Use an on_attach function to only map the following keys
  -- after the language server attaches to the current buffer
  on_attach = function(_, bufnr)
    local function buf_set_keymap(mode, l, r, opts)
      opts = opts or {}
      opts.buffer = bufnr
      vim.keymap.set(mode, l, r, opts)
    end

    -- Enable completion triggered by <c-x><c-o>
    vim.api.nvim_set_option_value('omnifunc', 'v:lua.vim.lsp.omnifunc', { buf = bufnr })

    -- Mappings.
    local opts = { noremap = true, silent = true }

    -- See `:help vim.lsp.*` for documentation on any of the below functions
    -- stylua: ignore start
    buf_set_keymap('n', 'gD', function() vim.lsp.buf.declaration() end, opts)
    buf_set_keymap('n', 'gd', function() vim.lsp.buf.definition() end, opts)
    buf_set_keymap('n', 'K', function() vim.lsp.buf.hover() end, opts)
    buf_set_keymap('n', 'gi', function() vim.lsp.buf.implementation() end, opts)
    buf_set_keymap('n', '<C-k>', function() vim.lsp.buf.signature_help() end, opts)
    buf_set_keymap('n', '<leader>wa', function() vim.lsp.buf.add_workspace_folder() end, opts)
    buf_set_keymap('n', '<leader>wr', function() vim.lsp.buf.remove_workspace_folder() end, opts)
    buf_set_keymap('n', '<leader>wl', function() print(vim.inspect(vim.lsp.buf.list_workspace_folders())) end, opts)
    buf_set_keymap('n', '<leader>D', function() vim.lsp.buf.type_definition() end, opts)
    buf_set_keymap('n', '<Leader>rn', function() vim.lsp.buf.rename() end, opts)
    buf_set_keymap('n', '<F2>', function() vim.lsp.buf.rename() end, opts)
    buf_set_keymap('n', 'gr', function() vim.lsp.buf.references() end, opts)
    buf_set_keymap('n', '<leader>ca', function() vim.lsp.buf.code_action() end, opts)
    buf_set_keymap('n', '<leader>e', function() vim.diagnostic.open_float({ float = { border = 'rounded' } }) end, opts)
    buf_set_keymap('n', '[d', "<cmd>lua vim.diagnostic.goto_prev({float={border='rounded'}})<CR>", opts)
    buf_set_keymap('n', ']d', "<cmd>lua vim.diagnostic.goto_next({float={border='rounded'}})<CR>", opts)
    buf_set_keymap('n', '<leader>q', function() vim.diagnostic.set_loclist() end, opts)
    buf_set_keymap('n', '<leader>ff', function() vim.lsp.buf.format() end, opts)
    -- stylua: ignore end

    vim.cmd('setlocal omnifunc=v:lua.vim.lsp.omnifunc')

    vim.notify('LSP Attached.')
  end,
  capabilities = require('cmp_nvim_lsp').default_capabilities(),
}
