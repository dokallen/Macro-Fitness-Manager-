import { defineConfig, devices } from "@playwright/test";

// Matches the port used by `npm run dev` in package.json.
const baseURL = "http://localhost:3000";

export default defineConfig({
  testDir: "./e2e",
  forbidOnly: !!process.env.CI,
  reporter: "list",
  use: {
    baseURL,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "npm run dev",
    url: `${baseURL}/login`,
    // Locally, a server already running on :3000 is reused. If it may be stale,
    // restart it first ("Restarting the dev server" in CLAUDE.md).
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
