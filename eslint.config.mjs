import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default [
  { ignores: ["node_modules/**", "dist/**", "extension/dist/**"] },

  // Hono API (Node, TypeScript)
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["server/**/*.ts", "test/**/*.ts"],
  })),
  {
    files: ["server/**/*.ts", "test/**/*.ts"],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Chrome extension (Vite + TypeScript)
  ...tseslint.configs.recommended.map((config) => ({
    ...config,
    files: ["extension/src/**/*.ts", "extension/*.ts"],
  })),
  {
    files: ["extension/src/**/*.ts", "extension/*.ts"],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
  },

  // Legacy flat JS (if any remain)
  {
    ...js.configs.recommended,
    files: ["extension/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      "no-empty": ["error", { allowEmptyCatch: true }],
    },
  },

  prettier,
];
