import eslint from "@eslint/js";

export default [
  {
    ignores: ["node_modules/**"],
  },
  {
    files: ["**/*.mjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: {
        Buffer: "readonly",
        console: "readonly",
        process: "readonly",
        setInterval: "readonly",
      },
    },
    rules: {
      ...eslint.configs.recommended.rules,
    },
  },
];
