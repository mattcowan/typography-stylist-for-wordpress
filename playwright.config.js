const { defineConfig, devices } = require('@playwright/test');

module.exports = defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false, // WordPress state is shared
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // Single worker to avoid WordPress conflicts
  // In CI: stop a run that is failing everywhere before the 30-minute step
  // timeout in compat.yml and in ci.yml's e2e job kills it (#189, #373).
  // Each failure can wait out a 90 s test timeout three times, and the
  // reporters write only when the run ends. This limit is lower than the
  // step timeout, so it is the one that ends a slow run. The first run of
  // the e2e job on GitHub took 3 minutes for 37 tests; raise this limit if
  // the suite grows toward it.
  globalTimeout: process.env.CI ? 25 * 60 * 1000 : 0,
  maxFailures: process.env.CI ? 10 : 0,
  // In CI: failure annotations on the run, and an HTML report that is
  // uploaded as an artifact instead of opened (#189).
  reporter: process.env.CI
    ? [['github'], ['list'], ['html', { open: 'never' }]]
    : 'html',

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
