const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // WordPress state is shared
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to avoid WordPress conflicts
  reporter: 'html',

  use: {
    baseURL: process.env.WP_BASE_URL || 'http://typography-stylist:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
    // Firefox moves focus where Chromium does not: it takes focus from a
    // button that becomes disabled, and RichText's selection write can move
    // it into the canvas. Tests tagged @firefox check focus there too (#303).
    {
      name: 'firefox-focus',
      use: { ...devices['Desktop Firefox'] },
      grep: /@firefox/,
    },
  ],

  // Run WordPress login before all tests
  globalSetup: require.resolve('./tests/e2e/global-setup.js'),
});
