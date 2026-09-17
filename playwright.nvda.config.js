/**
 * Playwright config for the screen-reader (NVDA) journeys in tests/e2e-sr.
 *
 * Separate from playwright.config.js on purpose: these tests drive a real,
 * headed Firefox with a silent portable NVDA attached (Guidepup), so they
 * cannot run in parallel, cannot run headless, and take the keyboard while
 * they run. Run them with `npm run test:sr` when the machine is free.
 *
 * Prerequisites (once per machine):
 *   npx @guidepup/setup setup
 *   npx @guidepup/setup install nvda
 *   npx playwright install firefox
 */
require('dotenv').config();
const { defineConfig, devices } = require('@playwright/test');
const { screenReaderConfig } = require('@guidepup/playwright');

module.exports = defineConfig({
  ...screenReaderConfig,
  testDir: './tests/e2e-sr',
  testMatch: /.*\.sr\.spec\.js/,
  timeout: 5 * 60 * 1000,
  reportSlowTests: null,
  retries: 0,
  forbidOnly: !!process.env.CI,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report-sr' }]],

  use: {
    ...screenReaderConfig.use,
    baseURL: process.env.WP_BASE_URL || 'http://mnc4.local',
    storageState: 'tests/e2e-sr/auth.json',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'off',
    viewport: { width: 1400, height: 900 },
  },

  projects: [
    {
      name: 'firefox-nvda',
      use: { ...devices['Desktop Firefox'], headless: false },
    },
  ],

  globalSetup: require.resolve('./tests/e2e-sr/global-setup.js'),
});
