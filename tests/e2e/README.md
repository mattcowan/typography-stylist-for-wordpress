# E2E Testing with Playwright

## Overview

This directory contains end-to-end (E2E) tests for the Typography Stylist plugin using Playwright. These tests verify that inline typography features work correctly in the WordPress block editor and prevent regression of critical functionality.

## Setup

### 1. Install Dependencies

```bash
npm install
```

This installs Playwright and all required dependencies (already listed in `devDependencies`).

### 2. Install Playwright Browsers

```bash
npx playwright install chromium
```

This downloads the Chromium browser binary required for running tests.

### 3. Configure Credentials

Copy the example environment file and add your WordPress credentials:

```bash
cp .env.example .env
```

Edit `.env` with your local WordPress installation details:

```env
WP_BASE_URL=http://typography-stylist:8080
WP_USERNAME=your_wordpress_username
WP_PASSWORD=your_wordpress_password
WP_ADMIN_PATH=/wp-admin
```

**Note:** The development site URL is `http://typography-stylist:8080/` and test page with Typography Stylist content is at `http://typography-stylist:8080/?p=13` (Post ID 13).

**IMPORTANT**: Never commit your `.env` file to Git. It contains sensitive credentials and is already git-ignored.

### 4. Start WordPress

Ensure your WordPress installation is running at the URL specified in `.env`:

```bash
# For WAMP (on Windows)
# Start WAMP server

# For other local dev environments
# docker-compose up -d
# or wp server
```

## Running Tests

### Run All Tests

```bash
npm run test:e2e
```

Runs all E2E tests in headless mode and generates an HTML report.

### Interactive UI Mode

```bash
npm run test:e2e:ui
```

Opens Playwright's interactive UI where you can:
- Run individual tests
- See test execution step-by-step
- Debug failing tests
- View DOM snapshots at each step

### Headed Mode (See Browser)

```bash
npm run test:e2e:headed
```

Runs tests with the browser window visible. Useful for watching tests execute and understanding what's happening.

### Debug Mode

```bash
npm run test:e2e:debug
```

Runs tests in debug mode with Playwright Inspector. Allows you to:
- Step through tests line-by-line
- Set breakpoints
- Inspect page state at any point

### View Test Report

After running tests, view the HTML report:

```bash
npm run test:e2e:report
```

This opens the Playwright HTML report in your browser showing:
- Test results (pass/fail)
- Screenshots of failures
- Videos of test execution (for failures)
- Detailed trace logs

## Test Coverage

The E2E test suite covers these critical inline features:

### Font Size Persistence (`font size persists after apply and close`)
- Verifies responsive font size applies correctly to selected text
- Checks data attributes (`data-fontsize`, `data-fontsize-min`, `data-fontsize-max`)
- Validates CSS `clamp()` function in computed styles
- Ensures styling persists after closing Quick Features Toggle popover

### Font Weight Persistence (`font weight persists after apply and close`)
- Verifies font weight (e.g., 700) applies to selection only
- Checks `data-fontweight` attribute
- Validates `font-weight` CSS property
- Ensures no block-wide application

### Letter Spacing Persistence (`letter spacing persists after apply and close`)
- Verifies letter spacing applies to selected text only
- Validates `letter-spacing` CSS property
- Ensures styling persists after popover closes

### Line Height Persistence (`line height persists after apply and close`)
- Verifies line height applies to selection only
- Validates `line-height` CSS property
- Ensures no block-wide application

### Font Family Persistence (`font family persists after apply and close`)
- Verifies font family applies to selection only
- Validates `font-family` CSS property
- Tests with available custom fonts

### Sequential Application (`sequential feature application works correctly`)
- **Critical test** for the bug that affected multiple controls
- Applies line-height to one word, then letter-spacing to another
- Verifies each word has ONLY its applied feature
- Ensures no cross-contamination between selections

## Writing New Tests

### Test Structure

Tests follow this pattern:

```javascript
test('descriptive test name', async ({ page }) => {
  // 1. Select text in the editor
  const editor = page.locator('[data-type="typost/block"] [contenteditable]').first();
  // ... selection logic

  // 2. Open Quick Features Toggle
  await page.click('button[aria-label="Quick Features Toggle"]');
  await page.waitForSelector('.typost-quick-features-popover');

  // 3. Adjust controls
  await page.fill('input[type="number"]', '20');

  // 4. Click Apply button
  await page.click('button:has-text("Apply Font Size")');

  // 5. Close popover
  await page.click('.editor-styles-wrapper');

  // 6. Verify styling persists
  const styledSpan = editor.locator('span.typost-styled');
  await expect(styledSpan).toHaveText('Expected Text');
  await expect(styledSpan).toHaveAttribute('data-fontsize', 'responsive');
});
```

### Best Practices

1. **Use `waitForSelector()` before interacting** with elements to avoid race conditions
2. **Add `waitForTimeout(500)` after clicking Apply** to allow React state updates
3. **Use specific selectors** like `button:has-text("Apply Font Size")` instead of generic classes
4. **Test persistence** by closing the popover and checking styles remain
5. **Use data attributes** in assertions when available (more reliable than computed styles)
6. **Test edge cases** like sequential application to catch state management bugs

### Locator Strategies

```javascript
// By ARIA label (preferred for accessibility)
await page.click('button[aria-label="Quick Features Toggle"]');

// By text content (good for buttons)
await page.click('button:has-text("Apply Font Size")');

// By data attribute (preferred for block types)
const editor = page.locator('[data-type="typost/block"]');

// By CSS class (use sparingly, classes can change)
const popover = page.locator('.typost-quick-features-popover');

// By input type and nth() for multiple similar elements
const minInput = page.locator('input[type="number"]').nth(0);
```

## Configuration

### Playwright Config

Located at [playwright.config.js](../../playwright.config.js).

Key settings:
- **`workers: 1`** - Single worker prevents WordPress state conflicts
- **`fullyParallel: false`** - Tests run sequentially (WordPress shares state)
- **`baseURL`** - Loaded from `.env` file (`WP_BASE_URL`)
- **`globalSetup`** - Handles WordPress login before tests run
- **`screenshot: 'only-on-failure'`** - Captures screenshots when tests fail
- **`video: 'retain-on-failure'`** - Records video for failed tests

### Global Setup

Located at [global-setup.js](global-setup.js).

Handles WordPress authentication:
1. Launches browser
2. Navigates to `/wp-login.php`
3. Fills in username and password from `.env`
4. Saves authentication state to `auth.json`
5. All tests reuse this authenticated state

## Troubleshooting

### Tests Fail with "Element not found"

**Cause**: Timing issue - element hasn't loaded yet.

**Solution**: Add `await page.waitForSelector('.element-class')` before interacting.

### Tests Fail with "Selection not working"

**Cause**: WordPress editor selection is complex and timing-sensitive.

**Solution**:
- Use `click({ clickCount: 3 })` to select all
- Use `keyboard.press()` to navigate and select text
- Add `waitForTimeout(300)` after selection changes

### Authentication Fails

**Cause**: Incorrect credentials or WordPress not running.

**Solution**:
1. Verify `.env` file has correct credentials
2. Check WordPress is running at `WP_BASE_URL`
3. Delete `auth.json` and run tests again (regenerates auth state)

### Tests Pass Locally but Fail in CI

**Cause**: Different timing or environment differences.

**Solution**:
- Increase timeouts in CI environment
- Use `process.env.CI` checks in config
- Set `retries: 2` for CI (already configured)

## Security

### Credential Management

- ✅ **`.env`** - Contains actual credentials, **git-ignored**, **never commit**
- ✅ **`.env.example`** - Template with placeholders, **safe to commit**
- ✅ **`auth.json`** - Generated authentication state, **git-ignored**
- ❌ **Never commit credentials** to package.json, test files, or config files

### Package Distribution

E2E tests are:
- ✅ Included in Git repository (source control)
- ✅ Listed in `devDependencies` (development only)
- ❌ **Excluded from npm package** (via `.npmignore`)
- ❌ Not distributed to end users

Rationale: E2E tests are for development/CI only, not needed in production plugin.

## CI/CD Integration

### GitHub Actions Example

```yaml
name: E2E Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    services:
      mysql:
        image: mysql:5.7
        env:
          MYSQL_ROOT_PASSWORD: root
          MYSQL_DATABASE: wordpress_test
    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'

      - name: Install dependencies
        run: npm ci

      - name: Install Playwright browsers
        run: npx playwright install chromium

      - name: Setup WordPress
        run: |
          # Install WordPress CLI
          # Set up test WordPress instance
          # Configure .env with test credentials

      - name: Run E2E tests
        run: npm run test:e2e
        env:
          WP_BASE_URL: http://localhost:8080
          WP_USERNAME: admin
          WP_PASSWORD: password

      - name: Upload test results
        if: failure()
        uses: actions/upload-artifact@v3
        with:
          name: playwright-report
          path: playwright-report/
```

## Additional Resources

- [Playwright Documentation](https://playwright.dev/)
- [WordPress E2E Testing Best Practices](https://developer.wordpress.org/block-editor/reference-guides/packages/packages-e2e-tests/)
- [Playwright Test API](https://playwright.dev/docs/api/class-test)
- [Playwright Locators](https://playwright.dev/docs/locators)

## Support

For issues with E2E tests:
1. Check this README for troubleshooting steps
2. Review test output and error messages
3. Use `npm run test:e2e:debug` to step through failing tests
4. Open an issue on GitHub with test output and environment details
