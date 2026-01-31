require('dotenv').config();
const { chromium } = require('@playwright/test');

module.exports = async config => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Login to WordPress
  await page.goto(`${process.env.WP_BASE_URL}/wp-login.php`);
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  await page.click('#wp-submit');
  await page.waitForURL(`${process.env.WP_BASE_URL}/wp-admin/**`);

  // Save authentication state
  await page.context().storageState({ path: 'tests/e2e/auth.json' });
  await browser.close();
};
