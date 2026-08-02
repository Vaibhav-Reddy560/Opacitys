import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Python service -- not part of the TS/JS project, and its venv bundles
    // vendored JS (e.g. sklearn's HTML repr helper) that isn't ours to lint.
    "services/**",
    "packages/editor-core/**",
  ]),
]);

export default eslintConfig;
