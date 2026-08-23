import { defineConfig, devices } from "@playwright/test";

// Lab 2 end-to-end and responsive tests — docs/lab-02/tests.md §2.5.
// The API and the Vite dev server are started automatically; an already
// running pair is reused so a developer can keep their own servers up.

export default defineConfig({
  testDir: "./e2e/lab-02",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "on-first-retry",
    ...devices["Desktop Chrome"],
  },
  webServer: [
    {
      command: "npm run dev --prefix server",
      url: "http://localhost:3000/api/health",
      reuseExistingServer: true,
      timeout: 60_000,
    },
    {
      command: "npm run dev --prefix client",
      url: "http://localhost:5173",
      reuseExistingServer: true,
      timeout: 60_000,
    },
  ],
});
