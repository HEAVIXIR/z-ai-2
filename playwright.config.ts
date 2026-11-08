import { defineConfig } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://127.0.0.1:3000";

export default defineConfig({
  testDir: "./tests/e2e/browser",
  testMatch: "**/*.spec.ts",
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI
    ? [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]]
    : "list",
  outputDir: "test-results",
  use: {
    baseURL,
    browserName: "chromium",
    actionTimeout: 10_000,
    navigationTimeout: 30_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-mobile-320",
      use: {
        browserName: "chromium",
        viewport: { width: 320, height: 800 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "chromium-tablet-768",
      use: {
        browserName: "chromium",
        viewport: { width: 768, height: 1024 },
        isMobile: false,
      },
    },
    {
      name: "chromium-desktop-1280",
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 900 },
        isMobile: false,
      },
    },
  ],
  webServer: {
    command: "bun run start",
    url: `${baseURL}/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      HOSTNAME: "127.0.0.1",
      PORT: "3000",
      NODE_ENV: "production",
    },
  },
});
