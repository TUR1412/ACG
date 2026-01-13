import js from "@eslint/js";
import globals from "globals";
import tsPlugin from "@typescript-eslint/eslint-plugin";
import astro from "eslint-plugin-astro";

const TS_FILES = ["**/*.ts", "**/*.tsx", "**/*.mts", "**/*.cts"];
const ASTRO_FILES = ["**/*.astro"];

const tsRecommended = tsPlugin.configs["flat/recommended"].map((cfg) =>
  cfg.files ? cfg : { ...cfg, files: TS_FILES }
);

const astroRecommended = astro.configs["flat/recommended"].map((cfg) =>
  cfg.files ? cfg : { ...cfg, files: ASTRO_FILES }
);

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      ".astro/**",
      ".cache/**",
      ".lighthouseci/**",
      "lhci_reports/**",
      "lhci_reports_simulate/**",
      "public/data/**",
      "public/covers/**",
      "src/data/generated/**"
    ]
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node
      }
    }
  },
  js.configs.recommended,
  ...tsRecommended,
  ...astroRecommended,
  {
    files: TS_FILES,
    rules: {
      // 本项目在数据管线与浏览器观测中不可避免需要少量 `any`（例如 PerformanceEntry 的非标准字段）。
      // 保持 lint 能落地：先以规则收敛为主，逐步替换 `any`。
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }]
    }
  }
];
