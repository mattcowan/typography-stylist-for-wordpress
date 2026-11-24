/**
 * #451: a Typography Stylist block with a paragraph style keeps the settings
 * the author changes in the sidebar on top of the style. They are listed in
 * the block's overrideKeys, saved inline and shown on the frontend, they stay
 * when another block runs "Update Style", and "Reset to style" gives the
 * setting back to the style. A block saved before its style changed (an
 * old copy, not an override) follows the style when the post opens, without
 * marking the post as changed, and again after an undo.
 *
 * The test creates its own style ("TEMP #451 …") and draft, and afterEach
 * deletes both, without the page.
 */
const { test, expect } = require('@playwright/test');
const { BASE, canvas, openNewPost, openPost, rest, deleteWithoutPage } = require('./helpers');

test.setTimeout(180000);

let created = [];

test.beforeEach(() => {
	created = [];
});

test.afterEach(async ({ playwright }) => {
	const failures = await deleteWithoutPage(playwright, created.splice(0));
	failures.forEach((failure) => test.info().annotations.push({ type: 'cleanup failed', description: failure }));
	expect(failures, 'cleanup: delete what the test made').toEqual([]);
});

function attributes(page, clientId) {
	return page.evaluate((id) => wp.data.select('core/block-editor').getBlockAttributes(id), clientId);
}

function weightInCanvas(page, clientId) {
	return canvas(page).locator(`[data-block="${clientId}"] [contenteditable="true"]`).first()
		.evaluate((el) => el.ownerDocument.defaultView.getComputedStyle(el).fontWeight);
}

async function selectBlock(page, clientId) {
	// Through the store: a click can land on the toolbar of the block above
	await page.evaluate((id) => wp.data.dispatch('core/block-editor').selectBlock(id), clientId);
	await expect.poll(() => page.evaluate(() => wp.data.select('core/block-editor').getSelectedBlockClientId())).toBe(clientId);
}

async function openPanel(page, title) {
	const toggle = page.getByRole('button', { name: title, exact: true }).first();
	if ((await toggle.getAttribute('aria-expanded')) !== 'true') {
		await toggle.click();
	}
}

// Pick a style in the sidebar's Paragraph Style field. The field is a
// <select>, or a combobox that searches by name (#453): type the name, then
// click the row by its name (ArrowDown can land on another match).
async function pickParagraphStyle(page, style) {
	const field = page.getByRole('combobox', { name: 'Paragraph Style' });
	if (await field.evaluate((el) => el.tagName === 'SELECT')) {
		await field.selectOption(String(style.id));
		return;
	}
	await field.fill(style.name);
	await page.getByRole('option', { name: style.name }).click();
}

test('A sidebar change on a styled block is saved, survives Update Style from another block, and Reset to style removes it (#451)', async ({ page }) => {
	const style = await rest(page, 'POST', '/typost/v1/paragraph-styles', {
		name: `TEMP #451 light ${Date.now()}`,
		properties: { fontWeight: '300', letterSpacing: 20 },
	});
	created.push(`/typost/v1/paragraph-styles/${style.id}`);
	// After the style exists, so the editor knows it
	await openNewPost(page);
	const postId = await page.evaluate(() => wp.data.select('core/editor').getCurrentPostId());
	created.push(`/wp/v2/posts/${postId}?force=true`);

	const [ first, second, fit ] = await page.evaluate((id) => {
		const blocks = [
			wp.blocks.createBlock('typost/block', { content: 'Alpha headline' }),
			wp.blocks.createBlock('typost/block', { content: 'Beta headline' }),
			// A fit block under the style that does not list its size, as a
			// block saved before #451: the style has no size (round 2, A)
			wp.blocks.createBlock('typost/block', { content: 'Fit line one<br>Fit two', styleClass: `typost-ps-${id}`, fontSize: 'fit', fontWeight: '300', letterSpacing: 20 }),
		];
		wp.data.dispatch('core/block-editor').insertBlocks(blocks);
		return blocks.map((block) => block.clientId);
	}, style.id);
	for (const clientId of [ first, second ]) {
		await selectBlock(page, clientId);
		await pickParagraphStyle(page, style);
		await expect.poll(async () => (await attributes(page, clientId)).styleClass).toBe(`typost-ps-${style.id}`);
	}

	// First block: Font Weight 700 in the sidebar
	await selectBlock(page, first);
	await openPanel(page, 'Font Weight');
	await page.getByRole('combobox', { name: 'Font Weight' }).selectOption('700');
	await expect.poll(async () => (await attributes(page, first)).overrideKeys).toEqual([ 'fontWeight' ]);
	await expect.poll(() => weightInCanvas(page, first)).toBe('700');

	// Second block: letter spacing 100, then Update Style from it
	await selectBlock(page, second);
	await openPanel(page, 'Letter Spacing');
	const spacing = page.locator('.components-panel__body').filter({ has: page.getByRole('button', { name: 'Letter Spacing', exact: true }) })
		.locator('input[type="number"]').first();
	await spacing.fill('100');
	await spacing.press('Tab');
	await expect.poll(async () => (await attributes(page, second)).overrideKeys).toEqual([ 'letterSpacing' ]);
	await page.getByRole('button', { name: /^Update Style/ }).first().click();
	// A confirmation, where the module asks first
	const yes = page.getByRole('button', { name: 'Yes, Update Style' });
	if (await yes.isVisible({ timeout: 3000 }).catch(() => false)) {
		await yes.click();
	}
	await expect.poll(() => page.evaluate((id) => {
		const updated = window.typostData.paragraphStyles.find((s) => String(s.id) === String(id));
		return updated ? Number(updated.properties.letterSpacing) : null;
	}, style.id)).toBe(100);

	// The block that ran Update Style follows the style again; the other
	// keeps its weight and takes the new letter spacing
	await expect.poll(async () => (await attributes(page, second)).overrideKeys).toEqual([]);
	const firstAfter = await attributes(page, first);
	expect(firstAfter.overrideKeys).toEqual([ 'fontWeight' ]);
	expect(firstAfter.fontWeight).toBe('700');
	expect(firstAfter.letterSpacing).toBe(100);
	// The fit block stays fit: Update Style never turns it into a non-fit block
	const fitAfter = await attributes(page, fit);
	expect(fitAfter.fontSize).toBe('fit');
	expect(fitAfter.letterSpacing).toBe(100);

	// Saved markup: the weight inline on the first block only, under the class
	const content = await page.evaluate(() => wp.data.select('core/editor').getEditedPostContent());
	expect(content).toContain(`<h2 style="font-weight:700" class="typost-styled typost-ps-${style.id}" aria-hidden="true" data-style-id="${style.id}">Alpha headline</h2>`);
	expect(content).toContain(`<h2 class="typost-styled typost-ps-${style.id}" aria-hidden="true" data-style-id="${style.id}">Beta headline</h2>`);
	expect(content).toContain(`class="typost-styled typost-fit typost-ps-${style.id}"`);

	// The frontend shows what the editor shows
	await page.evaluate(() => wp.data.dispatch('core/editor').savePost());
	await expect.poll(() => page.evaluate(() => !wp.data.select('core/editor').isSavingPost() && !wp.data.select('core/editor').isEditedPostDirty())).toBe(true);
	const front = await page.context().newPage();
	await front.goto(`${BASE}/?p=${postId}&preview=true`, { waitUntil: 'load' });
	// By text: a theme can show other Typography Stylist blocks on the page
	const frontWeights = await front.evaluate(() => Array.from(document.querySelectorAll('.wp-block-typost > .typost-styled[aria-hidden="true"]'))
		.filter((el) => /^(Alpha|Beta) headline$/.test(el.textContent))
		.map((el) => `${el.textContent}: ${getComputedStyle(el).fontWeight}`));
	await front.close({ runBeforeUnload: false });
	expect(frontWeights).toEqual([ 'Alpha headline: 700', 'Beta headline: 300' ]);

	// Reset to style: the weight follows the style again, and focus goes to
	// the weight select, as the button removes itself
	await selectBlock(page, first);
	await openPanel(page, 'Font Weight');
	await page.getByRole('button', { name: 'Reset to style: Font Weight' }).click();
	await expect.poll(async () => (await attributes(page, first)).overrideKeys).toEqual([]);
	expect((await attributes(page, first)).fontWeight).toBe('300');
	await expect.poll(() => weightInCanvas(page, first)).toBe('300');
	await expect(page.getByRole('combobox', { name: 'Font Weight' })).toBeFocused();
	expect(await page.evaluate(() => wp.data.select('core/editor').getEditedPostContent())).not.toContain('font-weight:');
});

test('A block saved before its style changed follows the style without marking the post as changed, also after an undo (#451)', async ({ page }) => {
	const style = await rest(page, 'POST', '/typost/v1/paragraph-styles', {
		name: `TEMP #451 light ${Date.now()}`,
		properties: { fontWeight: '300', letterSpacing: 20 },
	});
	created.push(`/typost/v1/paragraph-styles/${style.id}`);
	// The block's copy says 700: the style was 700 when it was applied
	const content = `<!-- wp:typost/block {"content":"Stale headline","fontWeight":"700","letterSpacing":20,"styleClass":"typost-ps-${style.id}"} -->\n<div class="wp-block-typost"><h2 class="visually-hidden">Stale headline</h2><h2 class="typost-styled typost-ps-${style.id}" aria-hidden="true" data-style-id="${style.id}">Stale headline</h2></div>\n<!-- /wp:typost/block -->`;
	const post = await rest(page, 'POST', '/wp/v2/posts', { title: 'TEMP #451 stale copy', status: 'draft', content });
	created.push(`/wp/v2/posts/${post.id}?force=true`);

	await openPost(page, post.id);
	const [ block ] = await page.evaluate(() => wp.data.select('core/block-editor').getBlockOrder());
	// The copy follows the style: the sidebar, "(modified)", Detach and Update Style read 300.
	// The block runs it when it renders in the canvas, which can take a while.
	await expect.poll(async () => (await attributes(page, block)).fontWeight, { timeout: 60000 }).toBe('300');
	expect((await attributes(page, block)).overrideKeys).toEqual([]);
	await expect.poll(() => weightInCanvas(page, block)).toBe('300');
	expect(await page.evaluate(() => wp.data.select('core/editor').isEditedPostDirty())).toBe(false);
	// The markup is the stored markup, byte for byte. Only the copy in the
	// block comment follows the style; the post stores it with the next
	// real edit, as the measured fit ratios (#388)
	const edited = await page.evaluate(() => wp.data.select('core/editor').getEditedPostContent());
	const markup = (html) => html.replace(/<!-- \/?wp:[^>]*-->/g, '');
	expect(markup(edited)).toBe(markup(content));
	expect(edited).toBe(content.replace('"fontWeight":"700"', '"fontWeight":"300"'));
	await selectBlock(page, block);
	await expect(page.locator('.typost-ps-badge-name').first()).toHaveText(style.name);
	await expect(page.getByRole('button', { name: /^Update Style/ })).toHaveCount(0);

	// Undo after Update Style: the weight change is undone, and the
	// block follows the style's new weight
	await openPanel(page, 'Font Weight');
	await page.getByRole('combobox', { name: 'Font Weight' }).selectOption('600');
	await expect.poll(async () => (await attributes(page, block)).overrideKeys).toEqual([ 'fontWeight' ]);
	await page.getByRole('button', { name: /^Update Style/ }).first().click();
	const yes = page.getByRole('button', { name: 'Yes, Update Style' });
	if (await yes.isVisible({ timeout: 3000 }).catch(() => false)) {
		await yes.click();
	}
	await expect.poll(() => page.evaluate((id) => {
		const updated = window.typostData.paragraphStyles.find((s) => String(s.id) === String(id));
		return updated ? String(updated.properties.fontWeight) : null;
	}, style.id), { timeout: 30000 }).toBe('600');
	await page.evaluate(() => wp.data.dispatch('core/editor').undo());
	await expect.poll(async () => (await attributes(page, block)).fontWeight).toBe('600');
	expect((await attributes(page, block)).overrideKeys).toEqual([]);
	await expect.poll(() => weightInCanvas(page, block)).toBe('600');
});
