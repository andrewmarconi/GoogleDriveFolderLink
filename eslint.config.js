// eslint.config.mjs
import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";

export default defineConfig([
  ...obsidianmd.configs.recommended,
  // Or include English locale files (JSON and TS/JS modules)
  // ...obsidianmd.configs.recommendedWithLocalesEn,

  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
    },

    // Optional project overrides
    rules: {
      // TypeScript handles undefined-variable checks; no-undef causes
      // false positives for browser globals (window, setTimeout, etc.)
      "no-undef": "off",
      "obsidianmd/ui/sentence-case": [
        "warn",
        {
          brands: ["Google", "Google Drive", "Google Cloud", "Obsidian"],
          acronyms: ["OK", "ID"],
          ignoreWords: ["OAuth"],
          enforceCamelCaseLower: true,
        },
      ],
    },
  },
]);