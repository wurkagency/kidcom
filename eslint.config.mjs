// Lint scope: the v3.0 frontend packages. Beyond correctness, this file is
// where the theme architecture is enforced (docs: tasks/todo.md, Decisions):
//   1. Themes reach the app only through @kinnd/core and @kinnd/theme-kit —
//      never the router, the query library, i18next or fetch directly.
//   2. @kinnd/core and @kinnd/theme-kit never import a theme.
//   3. Themes never render a hard-coded UI string; everything goes via t().
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import i18next from "eslint-plugin-i18next";
import globals from "globals";

const FRONTEND = ["packages/core/src/**/*.{ts,tsx}", "packages/theme-kit/src/**/*.{ts,tsx}", "packages/themes/*/src/**/*.{ts,tsx}", "apps/web/src/**/*.{ts,tsx}"];

export default tseslint.config(
  { ignores: ["**/node_modules/**", "**/dist/**", "legacy/**", "apps/api/**", "packages/db/**", "packages/shared/**", "**/e2e/.results/**"] },
  {
    files: FRONTEND,
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: { "react-hooks": reactHooks },
    languageOptions: { globals: globals.browser },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },

  // (1) Theme boundary
  {
    files: ["packages/themes/*/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            { group: ["react-router", "react-router-dom"], message: "Themes navigate via @kinnd/core (Link, useNavigate, paths)." },
            { group: ["@tanstack/*"], message: "Themes read data through @kinnd/core hooks." },
            { group: ["i18next", "react-i18next"], message: "Themes translate via @kinnd/core (useT, Trans)." },
            { group: ["@kinnd/themes-*", "@kinnd/theme-*", "!@kinnd/theme-kit"], message: "A theme must not import another theme." },
            { group: ["@/*"], message: "No build-time alias in themes; use a relative import." },
          ],
        },
      ],
      "no-restricted-globals": ["error", { name: "fetch", message: "Themes never call the API directly; use @kinnd/core hooks." }],
    },
  },

  // (2) Core and theme-kit stay theme-agnostic
  {
    files: ["packages/core/src/**/*.{ts,tsx}", "packages/theme-kit/src/**/*.{ts,tsx}"],
    rules: {
      "no-restricted-imports": ["error", { patterns: [{ group: ["@kinnd/theme-*", "!@kinnd/theme-kit"], message: "Core must not depend on a specific theme." }] }],
    },
  },

  // (3) No hard-coded UI strings in theme screens and shells. shadcn's
  // generated primitives (src/ui) carry no user-facing copy of their own.
  {
    files: ["packages/themes/*/src/**/*.tsx"],
    ignores: ["packages/themes/*/src/ui/**"],
    plugins: { i18next },
    rules: {
      "i18next/no-literal-string": [
        "error",
        {
          mode: "jsx-text-only",
          "jsx-attributes": { include: ["aria-label", "alt", "title", "placeholder"] },
          words: { exclude: ["Kinnd", "^[\\s\\p{P}\\p{S}·•–—]*$"] },
        },
      ],
    },
  },

  // Tests
  {
    files: ["**/*.test.{ts,tsx}"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
