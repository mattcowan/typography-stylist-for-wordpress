/**
 * Log in once with headless Chromium and save the cookies for the
 * screen-reader project. Credentials come from .env (WP_USERNAME /
 * WP_PASSWORD); WP_BASE_URL is the site.
 */
require('dotenv').config();
const dns = require('dns').promises;
const path = require('path');
const { chromium } = require('@playwright/test');

/** Loopback addresses: the only hosts where cleartext HTTP never leaves the machine. */
function isLoopbackAddress(address) {
  const a = String(address || '').toLowerCase().replace(/^\[|\]$/g, '');
  return a === '::1' || a === '0.0.0.0' || /^127\./.test(a) || /^::ffff:127\./.test(a);
}

/**
 * May this host be reached over plain HTTP for a login?
 *
 * Only a host that resolves to loopback qualifies on its own: Local-style
 * hosts-file names (`mnc4.local`, `typography-stylist`) resolve to
 * 127.0.0.1, so they pass without ceremony, while a LAN address such as
 * `192.168.1.10` does not — the password would cross the network in clear.
 * `WP_ALLOW_HTTP=1` is the explicit override for a trusted intranet host.
 */
async function isLoopbackHost(hostname) {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return false;
  if (h === 'localhost' || isLoopbackAddress(h)) return true;
  try {
    const records = await dns.lookup(h, { all: true });
    return records.length > 0 && records.every((r) => isLoopbackAddress(r.address));
  } catch (e) {
    return false; // unresolvable: not provably local
  }
}

/** Throw unless the URL is HTTPS, loopback, or explicitly allowed. */
async function assertSafeBaseUrl(baseURL) {
  const url = new URL(baseURL);
  if (url.protocol === 'https:') return;
  if (url.protocol !== 'http:') {
    throw new Error(`WP_BASE_URL must be http(s): ${baseURL}`);
  }
  if (process.env.WP_ALLOW_HTTP === '1') return;
  if (!(await isLoopbackHost(url.hostname))) {
    throw new Error(`WP_BASE_URL uses plain HTTP for a host that does not resolve to loopback (${url.hostname}). Use https://, or set WP_ALLOW_HTTP=1 for a trusted intranet host.`);
  }
}

module.exports = async () => {
  const baseURL = process.env.WP_BASE_URL || 'http://mnc4.local';
  const username = process.env.WP_USERNAME;
  const password = process.env.WP_PASSWORD;
  if (!username || !password) {
    throw new Error('Set WP_USERNAME and WP_PASSWORD in .env before running the screen-reader tests.');
  }
  await assertSafeBaseUrl(baseURL);
  const expectedOrigin = new URL(baseURL).origin;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(`${baseURL}/wp-login.php`);
  // goto follows redirects. Do not type the password into a page that a
  // redirect moved to another origin or downgraded to HTTP.
  const landed = page.url();
  if (new URL(landed).origin !== expectedOrigin) {
    await browser.close();
    throw new Error(`The login page redirected to a different origin (${landed}); expected ${expectedOrigin}.`);
  }
  await assertSafeBaseUrl(landed);
  await page.fill('#user_login', username);
  await page.fill('#user_pass', password);
  await Promise.all([
    page.waitForURL(`${baseURL}/wp-admin/**`),
    page.click('#wp-submit'),
  ]);
  await page.context().storageState({ path: path.join(__dirname, 'auth.json') });
  await browser.close();
};

module.exports.isLoopbackHost = isLoopbackHost;
module.exports.assertSafeBaseUrl = assertSafeBaseUrl;
