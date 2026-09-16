/**
 * Log in once with headless Chromium and save the cookies for the
 * screen-reader project. Credentials come from .env (WP_USERNAME /
 * WP_PASSWORD); WP_BASE_URL is the site.
 *
 * HTTP policy: the login posts the password, so plain HTTP is allowed on
 * its own only for hosts that resolve to loopback. Because Chromium
 * resolves the name again for itself, the validated address is also pinned
 * into the browser with --host-resolver-rules, so a DNS answer that changes
 * between our lookup and the navigation (rebinding) cannot send the password
 * to another peer. `WP_ALLOW_HTTP=1` is the explicit override.
 */
require('dotenv').config();
const dns = require('dns').promises;
const net = require('net');
const path = require('path');

/** Loopback addresses: the only hosts where cleartext HTTP never leaves the machine. */
function isLoopbackAddress(address) {
  const a = String(address || '').toLowerCase().replace(/^\[|\]$/g, '');
  return a === '::1' || a === '0.0.0.0' || /^127\./.test(a) || /^::ffff:127\./.test(a);
}

/**
 * Resolve a hostname and return its addresses when every one of them is
 * loopback; null otherwise. A literal address or `localhost` needs no lookup.
 */
async function resolveLoopbackAddresses(hostname, lookup = dns.lookup) {
  const h = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
  if (!h) return null;
  if (h === 'localhost') return ['127.0.0.1'];
  if (net.isIP(h)) return isLoopbackAddress(h) ? [h] : null;
  try {
    const records = await lookup(h, { all: true });
    const addresses = records.map((r) => r.address);
    return addresses.length > 0 && addresses.every(isLoopbackAddress) ? addresses : null;
  } catch (e) {
    return null; // unresolvable: not provably local
  }
}

/**
 * Decide whether the login may proceed over this URL and, for a plain-HTTP
 * hostname that resolved to loopback, which address Chromium must use.
 *
 * @return {{ pinned: string|null }} The loopback address to pin, or null when nothing needs pinning.
 */
async function assertSafeBaseUrl(baseURL, lookup = dns.lookup) {
  const url = new URL(baseURL);
  if (url.protocol === 'https:') return { pinned: null };
  if (url.protocol !== 'http:') {
    throw new Error(`WP_BASE_URL must be http(s): ${baseURL}`);
  }
  if (process.env.WP_ALLOW_HTTP === '1') return { pinned: null };
  const addresses = await resolveLoopbackAddresses(url.hostname, lookup);
  if (!addresses) {
    throw new Error(`WP_BASE_URL uses plain HTTP for a host that does not resolve to loopback (${url.hostname}). Use https://, or set WP_ALLOW_HTTP=1 for a trusted intranet host.`);
  }
  const literal = net.isIP(url.hostname.replace(/^\[|\]$/g, '')) || url.hostname.toLowerCase() === 'localhost';
  // Prefer IPv4: hosts files usually map a name to both ::1 and 127.0.0.1,
  // and the site listens on the v4 loopback.
  const preferred = addresses.find((a) => net.isIPv4(a)) || addresses[0];
  return { pinned: literal ? null : preferred };
}

/**
 * Chromium launch args that pin a hostname to the address we validated, so
 * the browser cannot be steered elsewhere by a later DNS answer.
 */
function buildChromiumArgs(hostname, pinned) {
  if (!pinned) return [];
  // Chromium wants IPv6 literals in brackets here; bare ::1 fails to resolve.
  const address = net.isIPv6(pinned) ? `[${pinned}]` : pinned;
  return [`--host-resolver-rules=MAP ${hostname} ${address}`];
}

module.exports = async () => {
  // Required here, not at load: the policy functions above are unit-tested
  // under Jest, where @playwright/test cannot be loaded.
  const { chromium } = require('@playwright/test');
  const baseURL = process.env.WP_BASE_URL || 'http://mnc4.local';
  const username = process.env.WP_USERNAME;
  const password = process.env.WP_PASSWORD;
  if (!username || !password) {
    throw new Error('Set WP_USERNAME and WP_PASSWORD in .env before running the screen-reader tests.');
  }
  const { pinned } = await assertSafeBaseUrl(baseURL);
  const base = new URL(baseURL);
  const expectedOrigin = base.origin;

  const browser = await chromium.launch({ args: buildChromiumArgs(base.hostname, pinned) });
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

module.exports.isLoopbackAddress = isLoopbackAddress;
module.exports.resolveLoopbackAddresses = resolveLoopbackAddresses;
module.exports.assertSafeBaseUrl = assertSafeBaseUrl;
module.exports.buildChromiumArgs = buildChromiumArgs;
