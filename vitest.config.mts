import path from "node:path";
import { fileURLToPath } from "node:url";

import { configDefaults, defineConfig } from "vitest/config";

const rootDir = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  resolve: {
    // Mirror the "@/*" path alias from tsconfig.json.
    alias: { "@": rootDir },
  },
  test: {
    environment: "node",
    include: ["**/*.test.{ts,tsx}"],
    // e2e/ holds Playwright specs; they run with `npm run test:e2e`, not Vitest.
    exclude: [...configDefaults.exclude, "e2e/**", ".next/**"],
  },
});
