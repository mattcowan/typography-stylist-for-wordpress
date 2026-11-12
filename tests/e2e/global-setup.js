require('dotenv').config();
const { chromium } = require('@playwright/test');

/**
 * Turn the editor's welcome guide off in the user's saved preferences
 * (#373), once per run, before any test opens the editor.
 *
 * Core keeps the editor preferences in the persisted_preferences user meta
 * (wp_register_persisted_preferences_meta() in wp-includes/user.php): an
 * object keyed by scope ('core/edit-post', 'core', …) with a _modified time.
 * The editor page prints that meta inline. For a user who has none (every
 * new wp-env site, so CI), the editor asks for it with a request after it
 * starts, and the answer replaces the whole preferences state: a value set
 * in the page before then was lost, and the welcome guide then opened over
 * the canvas in the middle of a test and took every click.
 *
 * Writes only when the guide is not already off, and keeps every other
 * preference the user has.
 *
 * @return {Promise<{before: *, after: *, written: boolean}>} The stored
 *         welcomeGuide value before and after.
 */
async function turnOffWelcomeGuide(page, baseUrl) {
	const nonceResponse = await page.request.get(`${baseUrl}/wp-admin/admin-ajax.php?action=rest-nonce`);
	if (!nonceResponse.ok()) {
		throw new Error(`REST nonce: ${nonceResponse.status()}`);
	}
	const headers = { 'X-WP-Nonce': (await nonceResponse.text()).trim() };
	const route = `${baseUrl}/?rest_route=${encodeURIComponent('/wp/v2/users/me')}`;

	const userResponse = await page.request.get(`${route}&context=edit`, { headers });
	if (!userResponse.ok()) {
		throw new Error(`GET /wp/v2/users/me: ${userResponse.status()}`);
	}
	const user = await userResponse.json();
	const stored = user.meta && user.meta.persisted_preferences;
	// An empty meta comes back as [] (an empty PHP array)
	const preferences = stored && !Array.isArray(stored) && typeof stored === 'object' ? stored : {};
	const scope = preferences['core/edit-post'] && typeof preferences['core/edit-post'] === 'object' ? preferences['core/edit-post'] : {};
	const before = 'welcomeGuide' in scope ? scope.welcomeGuide : undefined;
	if (before === false) {
		return { before, after: before, written: false };
	}

	const updated = Object.assign({}, preferences, {
		'core/edit-post': Object.assign({}, scope, { welcomeGuide: false }),
		_modified: new Date().toISOString(),
	});
	const saveResponse = await page.request.post(route, {
		headers,
		data: { meta: { persisted_preferences: updated } },
	});
	if (!saveResponse.ok()) {
		throw new Error(`POST /wp/v2/users/me: ${saveResponse.status()} ${await saveResponse.text()}`);
	}
	const saved = (await saveResponse.json()).meta.persisted_preferences;
	return { before, after: saved['core/edit-post'].welcomeGuide, written: true };
}

module.exports = async config => {
  const browser = await chromium.launch();
  const page = await browser.newPage();

  // Login to WordPress
  await page.goto(`${process.env.WP_BASE_URL}/wp-login.php`);
  await page.fill('#user_login', process.env.WP_USERNAME);
  await page.fill('#user_pass', process.env.WP_PASSWORD);
  await page.click('#wp-submit');
  await page.waitForURL(`${process.env.WP_BASE_URL}/wp-admin/**`);

  const guide = await turnOffWelcomeGuide(page, process.env.WP_BASE_URL);
  if (guide.after !== false) {
    throw new Error(`The welcome guide preference is ${JSON.stringify(guide.after)} after saving it`);
  }

  // Save authentication state
  await page.context().storageState({ path: 'tests/e2e/auth.json' });
  await browser.close();
};
