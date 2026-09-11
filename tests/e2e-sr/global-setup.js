/**
 * Log in once with headless Chromium and save the cookies for the
 * screen-reader project. Credentials come from .env (WP_USERNAME /
 * WP_PASSWORD); the base URL defaults to the mnc4 Local site.
 */
require('dotenv').config();
const path = require('path');
const { chromium } = require('@playwright/test');

module.exports = async () => {
  const baseURL = process.env.WP_BASE_URL || 'http://mnc4.local';
  const username = process.env.WP_USERNAME;
  const password = process.env.WP_PASSWORD;
  if (!username || !password) {
    throw new Error('Set WP_USERNAME and WP_PASSWORD in .env before running the screen-reader tests.');
  }
  // The login posts the password. Plain HTTP is acceptable only for a local
  // development site; a remote site must be reached over HTTPS.
  const url = new URL(baseURL);
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname) || /\.(local|test|localhost)$/i.test(url.hostname);
  if (url.protocol === 'http:' && !localHost) {
    throw new Error(`WP_BASE_URL uses plain HTTP for a non-local host (${url.hostname}). Use https:// for remote sites.`);
  }

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${baseURL}/wp-login.php`);
  await page.fill('#user_login', username);
  await page.fill('#user_pass', password);
  await Promise.all([
    page.waitForURL(`${baseURL}/wp-admin/**`),
    page.click('#wp-submit'),
  ]);
  await page.context().storageState({ path: path.join(__dirname, 'auth.json') });
  await browser.close();
};
