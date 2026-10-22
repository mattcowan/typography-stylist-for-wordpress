/**
 * #303: the Paragraph Style panel in the Typography Stylist block's Quick
 * Feature Toggles works on the selected text. Before the fix it worked on
 * the whole block: a style saved from one letter restyled the block and did
 * not describe the letter. Also covered: no "replaces that styling" question
 * for a style saved from one set of values (it still asks for more than
 * one), Detach on a selection keeps the look, focus stays in the panel, and
 * the block sidebar's panel compares the block, not the selected text.
 *
 * Each test creates its own style (named "ZZ #303 …") and draft post, and
 * deletes both afterwards.
 */
const { test, expect } = require('@playwright/test');

test.setTimeout(90000);

const BASE = process.env.WP_BASE_URL;

// The editor canvas iframe
function canvas(page) {
	return page.frameLocator('iframe[name="editor-canvas"]');
}

async function openNewPost(page) {
	const authState = require('./auth.json');
	await page.context().addCookies(authState.cookies);
	// Applying a style to a selection that carries styling of its own asks
	// first (QA PS-2); accept it, and record it
	if (!page.__dialogs) {
		page.__dialogs = [];
		page.on('dialog', (dialog) => {
			if (dialog.type() === 'confirm') {
				page.__dialogs.push(dialog.message());
			}
			dialog.accept();
		});
	}
	await page.goto(`${BASE}/wp-admin/post-new.php`, { waitUntil: 'domcontentloaded' });
	await page.waitForFunction(() => window.wp && wp.data && wp.data.select('core/block-editor') && window.typostHooks);
	await page.evaluate(() => wp.data.dispatch('core/preferences').set('core/edit-post', 'welcomeGuide', false));
	await page.waitForSelector('iframe[name="editor-canvas"]');
}

async function insertBlock(page, text, attributes) {
	const clientId = await page.evaluate(({ content, extra }) => {
		const block = wp.blocks.createBlock('typost/block', Object.assign({ content }, extra || {}));
		wp.data.dispatch('core/block-editor').insertBlocks(block);
		return block.clientId;
	}, { content: text, extra: attributes });
	await canvas(page).locator(`[data-block="${clientId}"] [contenteditable="true"]`).first().waitFor();
	return clientId;
}

// Select the first letters with the keyboard
async function selectFirstLetter(page, clientId, count = 1) {
	await canvas(page).locator(`[data-block="${clientId}"] [contenteditable="true"]`).first().click();
	await page.keyboard.press('Home');
	await page.keyboard.down('Shift');
	for (let i = 0; i < count; i++) {
		await page.keyboard.press('ArrowRight');
	}
	await page.keyboard.up('Shift');
	await expect.poll(() => page.evaluate(() => {
		const s = wp.data.select('core/block-editor');
		return [s.getSelectionStart().offset, s.getSelectionEnd().offset];
	})).toEqual([0, count]);
}

// Whether keyboard focus is inside the open modal
function focusInModal(page) {
	return page.evaluate(() => !!(document.activeElement && document.activeElement.closest('.components-modal__content')));
}

async function openQuickFeatureToggles(page) {
	await page.getByRole('button', { name: 'Typography Stylist Features' }).click();
	const modal = page.locator('.components-modal__content');
	await expect(modal.getByText('Paragraph Style', { exact: false }).first()).toBeVisible();
	return modal;
}

function readBlock(page, clientId) {
	return page.evaluate((id) => {
		const attributes = wp.data.select('core/block-editor').getBlockAttributes(id);
		return {
			styleClass: attributes.styleClass,
			fontWeight: attributes.fontWeight,
			content: String(attributes.content),
		};
	}, clientId);
}

// Text inside the element carrying data-style-id="N" in the block content
function styledText(page, clientId, styleId) {
	return page.evaluate(({ id, sid }) => {
		const holder = document.createElement('div');
		holder.innerHTML = String(wp.data.select('core/block-editor').getBlockAttributes(id).content);
		const el = holder.querySelector(`[data-style-id="${sid}"]`);
		return el ? el.textContent : null;
	}, { id: clientId, sid: styleId });
}

// Computed weight of the text after the first letter
function restOfTextWeight(page, clientId) {
	return canvas(page).locator(`[data-block="${clientId}"] [contenteditable="true"]`).first()
		.evaluate((el) => el.ownerDocument.defaultView.getComputedStyle(el).fontWeight);
}

async function saveStyleFromPanel(page, modal, name) {
	await modal.getByRole('button', { name: 'Save Current Settings as Style' }).click();
	await page.getByPlaceholder('Style name…').fill(name);
	const response = page.waitForResponse((r) => r.url().includes('paragraph-styles') && r.request().method() === 'POST');
	await page.locator('.typost-ps-save-actions').getByRole('button', { name: 'Save' }).click();
	return (await response).json();
}

// Delete the test's styles and the draft that post-new.php autosaves as
// soon as the content changes
async function cleanUp(page, createdStyleIds) {
	for (const id of createdStyleIds.splice(0)) {
		await page.evaluate((styleId) => wp.apiFetch({ path: `/typost/v1/paragraph-styles/${styleId}`, method: 'DELETE' }).catch(() => {}), id);
	}
	await page.evaluate(() => {
		const postId = wp.data.select('core/editor').getCurrentPostId();
		return postId ? wp.apiFetch({ path: `/wp/v2/posts/${postId}?force=true`, method: 'DELETE' }).catch(() => {}) : null;
	}).catch(() => {});
}

async function saveFromOneLetter(page, createdStyleIds) {
	await openNewPost(page);
	const clientId = await insertBlock(page, 'The quick brown fox');
	const weightBefore = await restOfTextWeight(page, clientId);

	await selectFirstLetter(page, clientId);
	const modal = await openQuickFeatureToggles(page);
	await modal.getByLabel('Font Weight (for selected text)').selectOption('700');
	await expect.poll(async () => (await readBlock(page, clientId)).content).toContain('data-fontweight="700"');

	const style = await saveStyleFromPanel(page, modal, `ZZ #303 one letter ${Date.now()}`);
	createdStyleIds.push(style.id);
	await page.waitForTimeout(1000);

	const after = await readBlock(page, clientId);
	// The block keeps no style of its own
	expect(after.styleClass).toBe('');
	// The letter carries the new style
	expect(await styledText(page, clientId, style.id)).toBe('T');
	// The rest of the text looks as it did
	expect(await restOfTextWeight(page, clientId)).toBe(weightBefore);
	// The style was made from the letter's one set of values: no question
	expect(page.__dialogs).toEqual([]);
	// Focus stays in the panel, on the new style's badge, and Escape
	// closes the dialog from there
	await expect.poll(() => focusInModal(page)).toBe(true);
	await page.keyboard.press('Escape');
	await expect(modal).toHaveCount(0);
}

async function updateAndDetach(page, createdStyleIds) {
	await openNewPost(page);
	const clientId = await insertBlock(page, 'The quick brown fox');
	await selectFirstLetter(page, clientId);
	const modal = await openQuickFeatureToggles(page);
	await modal.getByLabel('Font Weight (for selected text)').selectOption('700');
	await expect.poll(async () => (await readBlock(page, clientId)).content).toContain('data-fontweight="700"');
	const style = await saveStyleFromPanel(page, modal, `ZZ #303 detach ${Date.now()}`);
	createdStyleIds.push(style.id);
	const badge = modal.locator('.typost-ps-badge-name');
	await expect(badge).toHaveText(style.name);

	// Change the styled letter, then Update Style
	await modal.getByRole('spinbutton', { name: 'Letter Spacing (for selected text)' }).fill('120');
	await expect(badge).toHaveText(`${style.name} (modified)`);
	await modal.getByRole('button', { name: 'Update Style' }).click();
	await expect(badge).toHaveText(style.name);
	// The style holds the change now, so the letter's own declaration is
	// cleared and a later change to the style reaches it
	await expect.poll(async () => (await readBlock(page, clientId)).content).not.toContain('data-letterspacing');
	expect(await styledText(page, clientId, style.id)).toBe('T');
	expect(page.__dialogs).toEqual([]);
	await expect.poll(() => focusInModal(page)).toBe(true);

	// Detach: the letter keeps the style's values as its own
	await modal.getByRole('button', { name: 'Detach Style' }).click();
	await expect.poll(async () => (await readBlock(page, clientId)).content).not.toContain('data-style-id');
	const letter = await page.evaluate((id) => {
		const holder = document.createElement('div');
		holder.innerHTML = String(wp.data.select('core/block-editor').getBlockAttributes(id).content);
		const span = holder.querySelector('span.typost-styled');
		return span ? { text: span.textContent, weight: span.getAttribute('data-fontweight'), style: span.getAttribute('style') } : null;
	}, clientId);
	expect(letter.text).toBe('T');
	expect(letter.weight).toBe('700');
	expect(letter.style).toContain('font-weight: 700');
	expect(letter.style).toContain('letter-spacing: 0.12em');
	await expect.poll(() => focusInModal(page)).toBe(true);
	// Escape closes the dialog from there
	await page.keyboard.press('Escape');
	await expect(modal).toHaveCount(0);
}

test.describe('#303 Paragraph Style panel in Quick Feature Toggles with a text selection', () => {
	const createdStyleIds = [];

	test.afterEach(async ({ page }) => {
		await cleanUp(page, createdStyleIds);
	});

	// @firefox: also run by the firefox-focus project (playwright.config.js)
	test('Save Current Settings as Style styles only the selected letter @firefox', async ({ page }) => {
		await saveFromOneLetter(page, createdStyleIds);
	});

	test('Saving from a selection with more than one set of values still asks', async ({ page }) => {
		await openNewPost(page);
		const clientId = await insertBlock(page, 'The quick brown fox');
		// Only the "T" is bold; "Th" is selected
		await page.evaluate((id) => wp.data.dispatch('core/block-editor').updateBlockAttributes(id, {
			content: '<span class="typost-styled" data-fontweight="700" style="font-weight: 700">T</span>he quick brown fox',
		}), clientId);
		await selectFirstLetter(page, clientId, 2);
		const modal = await openQuickFeatureToggles(page);

		const style = await saveStyleFromPanel(page, modal, `ZZ #303 mixed ${Date.now()}`);
		createdStyleIds.push(style.id);
		await expect.poll(() => page.__dialogs.length).toBe(1);
		expect(await styledText(page, clientId, style.id)).toBe('Th');
	});

	test('Update Style and Detach Style keep focus in the panel, and Detach keeps the look @firefox', async ({ page }) => {
		await updateAndDetach(page, createdStyleIds);
	});

	test('The block sidebar panel compares the block, not the selected text', async ({ page }) => {
		await openNewPost(page);
		const blockStyle = await page.evaluate((name) => wp.apiFetch({
			path: '/typost/v1/paragraph-styles',
			method: 'POST',
			data: { name, properties: { fontWeight: '300' } },
		}), `ZZ #303 block ${Date.now()}`);
		createdStyleIds.push(blockStyle.id);
		await openNewPost(page);
		// The sidebar panel reads the block's style when it mounts
		const clientId = await insertBlock(page, 'The quick brown fox', { styleClass: `typost-ps-${blockStyle.id}`, fontWeight: '300' });
		await selectFirstLetter(page, clientId);
		await page.evaluate(() => wp.data.dispatch('core/edit-post').openGeneralSidebar('edit-post/block'));
		const sidebarBadge = page.locator('[data-hook="typost_inspector_top"] .typost-ps-badge-name');
		await expect(sidebarBadge).toHaveText(blockStyle.name);

		const modal = await openQuickFeatureToggles(page);
		await modal.getByLabel('Font Weight (for selected text)').selectOption('700');
		await expect.poll(async () => (await readBlock(page, clientId)).content).toContain('data-fontweight="700"');
		await page.waitForTimeout(500);
		await expect(sidebarBadge).toHaveText(blockStyle.name);
	});

	test('Choosing a style in the panel select styles only the selected letter', async ({ page }) => {
		await openNewPost(page);
		const name = `ZZ #303 bold ${Date.now()}`;
		const style = await page.evaluate((styleName) => wp.apiFetch({
			path: '/typost/v1/paragraph-styles',
			method: 'POST',
			data: { name: styleName, properties: { fontWeight: '700' } },
		}), name);
		createdStyleIds.push(style.id);
		// The panel lists the styles localized at page load
		await openNewPost(page);

		const clientId = await insertBlock(page, 'Jumped over the lazy dog');
		const weightBefore = await restOfTextWeight(page, clientId);
		await selectFirstLetter(page, clientId);
		const modal = await openQuickFeatureToggles(page);

		const select = modal.getByRole('combobox', { name: 'Paragraph Style' });
		await select.selectOption({ label: await select.locator('option', { hasText: name }).first().textContent() });
		await page.waitForTimeout(1000);

		const after = await readBlock(page, clientId);
		expect(after.styleClass).toBe('');
		expect(await styledText(page, clientId, style.id)).toBe('J');
		expect(await restOfTextWeight(page, clientId)).toBe(weightBefore);
	});

	test('A style saved from one letter captures that letter, not the block', async ({ page }) => {
		await openNewPost(page);
		const clientId = await insertBlock(page, 'The quick brown fox');
		await selectFirstLetter(page, clientId);
		const modal = await openQuickFeatureToggles(page);

		// Letter spacing 80 (0.08em) and Swashes on the "T" only
		await modal.getByRole('spinbutton', { name: 'Letter Spacing (for selected text)' }).fill('80');
		await expect.poll(async () => (await readBlock(page, clientId)).content).toContain('data-letterspacing="80"');
		await modal.getByRole('button', { name: /Alternates|Swash/i }).first().click();
		await modal.locator('code', { hasText: /^swsh$/ }).first().locator('xpath=ancestor::div[2]')
			.locator('.typost-feature-apply-btn').click();
		await expect.poll(async () => (await readBlock(page, clientId)).content).toContain('data-features="swsh"');

		const style = await saveStyleFromPanel(page, modal, `ZZ #303 swash initial ${Date.now()}`);
		createdStyleIds.push(style.id);

		expect(style.properties.letterSpacing).toBe(80);
		expect(style.properties.features).toEqual(['swsh']);
	});
});
