import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.spec.mjs",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  expect: { timeout: 10000 },
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://127.0.0.1:4173", viewport: { width: 1440, height: 1000 }, trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: [
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort --mode browser-test",
      url: "http://127.0.0.1:4173",
      reuseExistingServer: false,
      env: { VITE_SUPABASE_URL: "http://127.0.0.1:54321", VITE_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_browser_test_only", VITE_SUPABASE_ANON_KEY: "", VITE_APP_URL: "http://127.0.0.1:4173" },
    },
    {
      command: "npm run dev -- --host 127.0.0.1 --port 4174 --strictPort --mode browser-test",
      url: "http://127.0.0.1:4174",
      reuseExistingServer: false,
      env: { VITE_SUPABASE_URL: "", VITE_SUPABASE_PUBLISHABLE_KEY: "", VITE_SUPABASE_ANON_KEY: "", VITE_APP_URL: "http://127.0.0.1:4174" },
    },
  ],
})
