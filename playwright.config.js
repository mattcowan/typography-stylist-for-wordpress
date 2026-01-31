const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // WordPress state is shared
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to avoid WordPress conflicts
  reporter: 'html',

  use: {
    baseURL: process.env.WP_BASE_URL || 'http://wplayground:8080',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Run WordPress login before all tests
  globalSetup: require.resolve('./tests/e2e/global-setup.js'),
});
