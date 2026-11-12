/**
 * Helpers shared by the e2e specs: open the editor, find a block's editable
 * element, select text with real key presses, read the editor's state and
 * delete what a test made.
 *
 * Not a spec file (Playwright runs only *.spec.js), so it registers no tests.
 */
const path = require('path');
const { expect } = require('@playwright/test');

const BASE = process.env.WP_BASE_URL;
// Written by global-setup.js (the path there is relative to the plugin root)
const AUTH_FILE = path.join(__dirname, 'auth.json');

// The editor canvas iframe
function canvas(page) {
	return page.frameLocator('iframe[name="editor-canvas"]');
}

// The login that global-setup.js saved
async function addAuthCookies(page) {
	const authState = require('./auth.json');
	await page.context().addCookies(authState.cookies);
}

// global-setup.js saves the welcome guide as off in the user's preferences
// before any test runs. Check it here, so a guide that would take every
// click fails with this message instead of a click time-out. Setting the
// preference from the page is not a fix: for a user with no saved
// preferences the editor loads them after it starts and replaces the value.
async function expectNoWelcomeGuide(page) {
	expect(await page.evaluate(() => wp.data.select('core/preferences').get('core/edit-post', 'welcomeGuide')),
		'the welcome guide preference (global-setup.js turns it off)').toBe(false);
	await expect(page.locator('.edit-post-welcome-guide'), 'the welcome guide is closed').toHaveCount(0);
}

async function openNewPost(page) {
	await addAuthCookies(page);
	await page.goto(`${BASE}/wp-admin/post-new.php`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => window.wp && wp.data && wp.data.select('core/block-editor') && window.typostHooks &&
		wp.data.select('core/editor') && wp.data.select('core/editor').__unstableIsEditorReady());
	await expectNoWelcomeGuide(page);
	await page.waitForSelector('iframe[name="editor-canvas"]');
}

// Open a saved post. Waits until the editor has parsed its blocks and the
// canvas shows them.
async function openPost(page, postId) {
	await addAuthCookies(page);
	await page.goto(`${BASE}/wp-admin/post.php?post=${postId}&action=edit`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => window.wp && wp.data && wp.data.select('core/editor') &&
		wp.data.select('core/editor').__unstableIsEditorReady() &&
		wp.data.select('core/block-editor').getBlocks().length > 0 && window.typostHooks);
	await expectNoWelcomeGuide(page);
	await page.waitForSelector('iframe[name="editor-canvas"]');
}

// The element of a block that takes the caret: the block itself for a core
// Heading or Paragraph, an element inside it for the Typography Stylist block
function editable(page, clientId) {
	return canvas(page)
		.locator(`[data-block="${clientId}"][contenteditable="true"], [data-block="${clientId}"] [contenteditable="true"]`)
		.first();
}

function selectionOffsets(page) {
	return page.evaluate(() => {
		const s = wp.data.select('core/block-editor');
		return [s.getSelectionStart().offset, s.getSelectionEnd().offset];
	});
}

// Press `key` until the editor store reports `done(offsets)`. The number of
// presses is not the number of characters: at the edge of a styled span the
// first arrow press only moves the caret into or out of the format (RichText
// format boundaries) and leaves the offset where it is.
async function pressUntil(page, key, done, maxPresses) {
	for (let i = 0; i < maxPresses; i++) {
		const before = await selectionOffsets(page);
		if (done(before)) {
			return;
		}
		await page.keyboard.press(key);
		// The store follows the DOM selection on selectionchange, a moment
		// after the key press. Give it up to a second, because a press made
		// before the store catches up overshoots, and these loops only move
		// forward (a boundary press changes no offset, so this cannot wait
		// for a change alone).
		for (let tries = 0; tries < 50; tries++) {
			const after = await selectionOffsets(page);
			if (after[0] !== before[0] || after[1] !== before[1]) {
				break;
			}
			await page.waitForTimeout(20);
		}
	}
}

// Put the caret at `start` and, when `end` is past it, select up to `end`,
// with the keyboard. Waits until the editor store reports the selection.
async function select(page, clientId, start, end = start) {
	await editable(page, clientId).click();
	await page.keyboard.press('Home');
	await expect.poll(async () => (await selectionOffsets(page))[0]).toBe(0);
	await pressUntil(page, 'ArrowRight', ([caret]) => caret >= start, start * 2 + 2);
	await pressUntil(page, 'Shift+ArrowRight', ([, focus]) => focus >= end, (end - start) * 2 + 2);
	await expect.poll(() => selectionOffsets(page)).toEqual([start, end]);
}

// A REST request as the logged-in user, without opening the editor. Uses the
// ?rest_route= form, which works with any permalink setting. A query string
// in `route` ('/wp/v2/posts/1?context=edit') is sent as query arguments.
async function rest(page, method, route, data) {
	await addAuthCookies(page);
	if (!page.__restNonce) {
		const nonce = await page.request.get(`${BASE}/wp-admin/admin-ajax.php?action=rest-nonce`);
		expect(nonce.ok(), 'REST nonce (is the user logged in?)').toBe(true);
		page.__restNonce = (await nonce.text()).trim();
	}
	const response = await page.request.fetch(restUrl(route), {
		method,
		headers: { 'X-WP-Nonce': page.__restNonce },
		data,
	});
	const body = await response.json().catch(() => null);
	expect(response.ok(), `${method} ${route}: ${response.status()} ${JSON.stringify(body)}`).toBe(true);
	return body;
}

function restUrl(route) {
	const [routePath, query] = route.split('?');
	return `${BASE}/?rest_route=${encodeURIComponent(routePath)}${query ? `&${query}` : ''}`;
}

// Send DELETE to each REST route, without the test's page: after a time-out
// the page is closed. Logs in with the state that global-setup.js saved.
// Returns one line per route that could not be deleted, for the caller to
// report; never throws.
async function deleteWithoutPage(playwright, routes) {
	const failures = [];
	if (!routes.length) {
		return failures;
	}
	let request;
	try {
		request = await playwright.request.newContext({ storageState: AUTH_FILE });
		const nonce = await request.get(`${BASE}/wp-admin/admin-ajax.php?action=rest-nonce`);
		if (!nonce.ok()) {
			throw new Error(`REST nonce: ${nonce.status()}`);
		}
		const headers = { 'X-WP-Nonce': (await nonce.text()).trim() };
		for (const route of routes) {
			const response = await request.fetch(restUrl(route), { method: 'DELETE', headers });
			if (!response.ok()) {
				failures.push(`${route}: ${response.status()}`);
			}
		}
	} catch (error) {
		failures.push(`${routes.join(', ')}: ${error.message}`);
	} finally {
		if (request) {
			await request.dispose();
		}
	}
	return failures;
}

// Delete the draft that post-new.php autosaves once the content changes
async function deleteDraft(page) {
	await page.evaluate(() => {
		const postId = wp.data.select('core/editor').getCurrentPostId();
		return postId ? wp.apiFetch({ path: `/wp/v2/posts/${postId}?force=true`, method: 'DELETE' }).catch(() => {}) : null;
	}).catch(() => {});
}

module.exports = {
	BASE,
	canvas,
	addAuthCookies,
	openNewPost,
	openPost,
	editable,
	selectionOffsets,
	pressUntil,
	select,
	rest,
	deleteWithoutPage,
	deleteDraft,
};
