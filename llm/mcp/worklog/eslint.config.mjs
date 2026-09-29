import eslint from '@eslint/js';

export default [
  {
    ignores: ['node_modules/**', 'worklog-data/**'],
  },
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        Buffer: 'readonly',
        URL: 'readonly',
        clearTimeout: 'readonly',
        console: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
      },
    },
    rules: {
      ...eslint.configs.recommended.rules,
    },
  },
];
