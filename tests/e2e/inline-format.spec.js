/**
 * The inline format on core blocks (#373): select a word in a core Heading
 * and in a core Paragraph with the keyboard, apply one OpenType feature and
 * one responsive size in the Typography Stylist Features dialog, and
 * compare the stored span with the expected string, character for
 * character: in the block's content, and in the post content a save
 * stores.
 *
 * The dialog applies each control as it changes, after a debounce; there
 * is no Apply button.
 *
 * New sizes are written in rem, or in px when the site has "Write new font
 * sizes in px" on. That option reaches the editor only as
 * typostData.newFontSizeUnit, which the dialog reads each time it writes a
 * size (getNewFontSizeUnit() in assets/js/font-size-units.js). So each test
 * runs twice, with that value set to 'rem' and to 'px' in the page before
 * the dialog opens: both forms are checked on every site, and the site's
 * option is never changed.
 *
 * Each test works on its own draft post. afterEach deletes it without the
 * test's page, so it goes also after a time-out.
 */
const { test, expect } = require('@playwright/test');
const { BASE, openNewPost, openPost, select, rest, deleteWithoutPage } = require('./helpers');

test.setTimeout(90000);

const TEXT = 'Moonlit garden party';
const GARDEN = [ 8, 14 ];

// The span the dialog writes for "garden" with Discretionary Ligatures and
// a responsive size of 16 / 24 / 48 (the dialog's 16 and 24, and 48 typed
// into Maximum Size)
const EXPECTED_SPAN = {
	rem: '<span data-features="dlig" data-fontsize="responsive" data-fontsize-min="16" data-fontsize-preferred="24" data-fontsize-max="48" style="font-feature-settings: &quot;dlig&quot; 1; font-size: clamp(1rem, 1.5rem + 2vw, 3rem)" class="typost-styled">garden</span>',
	px: '<span data-features="dlig" data-fontsize="responsive" data-fontsize-min="16" data-fontsize-preferred="24" data-fontsize-max="48" style="font-feature-settings: &quot;dlig&quot; 1; font-size: clamp(16px, 1.5rem + 2vw, 48px)" class="typost-styled">garden</span>',
};

const BLOCKS = [
	{ label: 'Heading', name: 'core/heading', attributes: { content: TEXT, level: 2 }, element: (inner) => `<h2 class="wp-block-heading">${inner}</h2>` },
	{ label: 'Paragraph', name: 'core/paragraph', attributes: { content: TEXT }, element: (inner) => `<p>${inner}</p>` },
];

function blockContent(page, clientId) {
	return page.evaluate((id) => String(wp.data.select('core/block-editor').getBlockAttributes(id).content), clientId);
}

// The draft of the running test, as a REST route to delete. A delete that
// fails also fails the test, so content left on the site is visible
let created = [];

test.beforeEach(() => {
	created = [];
});

test.afterEach(async ({ playwright }) => {
	const failures = await deleteWithoutPage(playwright, created.splice(0));
	failures.forEach((failure) => test.info().annotations.push({ type: 'cleanup failed', description: failure }));
	expect(failures, 'cleanup: delete what the test made').toEqual([]);
});

for (const block of BLOCKS) {
	for (const unit of [ 'rem', 'px' ]) {
		test(`Inline format on a core ${block.label}: one feature and one size write the expected span (${unit})`, async ({ page }) => {
			await openNewPost(page);
			// post-new.php made an auto-draft; the save below keeps its ID
			const postId = await page.evaluate(() => wp.data.select('core/editor').getCurrentPostId());
			created.push(`/wp/v2/posts/${postId}?force=true`);
			await page.evaluate((value) => {
				window.typostData.newFontSizeUnit = value;
			}, unit);
			const expected = `Moonlit ${EXPECTED_SPAN[unit]} party`;

			const clientId = await page.evaluate(({ name, attributes }) => {
				const block = wp.blocks.createBlock(name, attributes);
				wp.data.dispatch('core/block-editor').insertBlocks(block);
				return block.clientId;
			}, { name: block.name, attributes: block.attributes });
			await select(page, clientId, ...GARDEN);

			await page.getByRole('button', { name: 'Typography Stylist Features' }).click();
			const modal = page.locator('.components-modal__frame');
			await expect(modal).toBeVisible();

			await modal.getByRole('checkbox', { name: 'Discretionary Ligatures' }).check();
			await expect.poll(() => blockContent(page, clientId)).toContain('data-features="dlig"');

			await modal.getByRole('combobox', { name: 'Font Size' }).selectOption('responsive');
			await modal.getByRole('spinbutton', { name: 'Maximum Size (desktop)' }).fill('48');
			await expect.poll(() => blockContent(page, clientId)).toBe(expected);

			await modal.getByRole('button', { name: 'Close', exact: true }).first().click();
			await expect(modal).toHaveCount(0);
			expect(await blockContent(page, clientId)).toBe(expected);

			await page.evaluate(() => wp.data.dispatch('core/editor').savePost());
			expect(await page.evaluate(() => wp.data.select('core/editor').didPostSaveRequestSucceed())).toBe(true);
			expect(await page.evaluate(() => wp.data.select('core/editor').getCurrentPostId())).toBe(postId);
			const post = await rest(page, 'GET', `/wp/v2/posts/${postId}?context=edit`);
			expect(post.content.raw).toContain(block.element(expected));
		});
	}
}

/*
 * Text in a paragraph style span (#450). A change made in the dialog wins
 * over the style for that setting only: the span keeps its data-style-id
 * and gets an inline declaration for each changed key. The dialog reads a
 * style span's values from the style as it is now: the data attributes
 * that a style apply copied from the style count only where the span's
 * style attribute declares them.
 */

// A style span as a style apply writes it: copies of the style's values
function styleSpan(styleId, extra = '') {
	return `<span data-style-id="${styleId}" data-features="liga" data-letterspacing="50"${extra} class="typost-styled">garden</span>`;
}

// What the canvas renders for the text of the first element that matches
function computed(page, clientId, selector) {
	return page.frame({ name: 'editor-canvas' }).evaluate(({ id, sel }) => {
		const el = document.querySelector(`[data-block="${id}"] ${sel}`);
		if (!el) {
			return null;
		}
		const cs = getComputedStyle(el);
		return { weight: cs.fontWeight, spacing: cs.letterSpacing, features: cs.fontFeatureSettings, size: cs.fontSize };
	}, { id: clientId, sel: selector });
}

test('Text in a style span: a weight and a feature from the dialog show, and Inherit gives the text back to the style (#450)', async ({ page }) => {
	const style = await rest(page, 'POST', '/typost/v1/paragraph-styles', {
		name: `TEMP #450 light ${Date.now()}`,
		properties: { fontWeight: '300', letterSpacing: 50, features: [ 'liga' ] },
	});
	created.push(`/typost/v1/paragraph-styles/${style.id}`);
	await openNewPost(page);
	const postId = await page.evaluate(() => wp.data.select('core/editor').getCurrentPostId());
	created.push(`/wp/v2/posts/${postId}?force=true`);

	const clientId = await page.evaluate((content) => {
		const block = wp.blocks.createBlock('core/paragraph', { content });
		wp.data.dispatch('core/block-editor').insertBlocks(block);
		return block.clientId;
	}, `Moonlit ${styleSpan(style.id)} party`);
	const span = `[data-style-id="${style.id}"]`;
	await expect.poll(async () => (await computed(page, clientId, span) || {}).weight).toBe('300');
	const before = await computed(page, clientId, span);

	await select(page, clientId, ...GARDEN);
	await page.getByRole('button', { name: 'Typography Stylist Features' }).click();
	const modal = page.locator('.components-modal__frame');
	await expect(modal).toBeVisible();

	// Font Weight 700: the declaration is written, the span keeps its style
	await modal.getByRole('combobox', { name: 'Font Weight' }).selectOption('700');
	await expect.poll(() => blockContent(page, clientId)).toBe(`Moonlit <span data-style-id="${style.id}" data-features="liga" data-letterspacing="50" data-fontweight="700" style="font-weight: 700" class="typost-styled">garden</span> party`);
	await expect.poll(async () => (await computed(page, clientId, span)).weight).toBe('700');
	// The settings of the style that the author did not change still show
	expect((await computed(page, clientId, span)).spacing).toBe(before.spacing);

	// Discretionary Ligatures: the feature list starts from the style's
	await modal.getByRole('checkbox', { name: 'Discretionary Ligatures' }).check();
	await expect.poll(() => blockContent(page, clientId)).toContain('style="font-weight: 700; font-feature-settings: &quot;liga&quot; 1, &quot;dlig&quot; 1"');
	await expect.poll(async () => (await computed(page, clientId, span)).features).toMatch(/"dlig"/);
	expect(await blockContent(page, clientId)).toContain(`data-style-id="${style.id}"`);

	// Inherit removes the weight; the feature off removes the last
	// declaration, so the span has no style attribute again
	await modal.getByRole('combobox', { name: 'Font Weight' }).selectOption('');
	await expect.poll(() => blockContent(page, clientId)).not.toContain('font-weight');
	await modal.getByRole('checkbox', { name: 'Discretionary Ligatures' }).uncheck();
	await expect.poll(() => blockContent(page, clientId)).toBe(`Moonlit <span data-style-id="${style.id}" data-features="liga" data-letterspacing="50" class="typost-styled">garden</span> party`);
	await expect.poll(async () => (await computed(page, clientId, span)).weight).toBe('300');
});

test('After the style changes, a style span reads the new values and an override keeps its weight, in the editor and on the frontend (#450)', async ({ page }) => {
	const style = await rest(page, 'POST', '/typost/v1/paragraph-styles', {
		name: `TEMP #450 light ${Date.now()}`,
		properties: { fontWeight: '300', letterSpacing: 50, features: [ 'liga' ] },
	});
	created.push(`/typost/v1/paragraph-styles/${style.id}`);
	const content = [
		`<!-- wp:paragraph --><p>Moonlit ${styleSpan(style.id)} party</p><!-- /wp:paragraph -->`,
		`<!-- wp:paragraph --><p>Moonlit ${styleSpan(style.id, ' data-fontweight="700" style="font-weight: 700"')} party</p><!-- /wp:paragraph -->`,
	].join('\n\n');
	const post = await rest(page, 'POST', '/wp/v2/posts', { title: 'TEMP #450 style change', status: 'draft', content });
	created.push(`/wp/v2/posts/${post.id}?force=true`);
	// "Update Style" with a new size and letter spacing
	await rest(page, 'PATCH', `/typost/v1/paragraph-styles/${style.id}`, {
		properties: { fontWeight: '300', letterSpacing: 100, features: [ 'liga' ], fontSize: '40', fontSizeUnit: 'rem' },
	});

	await openPost(page, post.id);
	const [ untouched, override ] = await page.evaluate(() => wp.data.select('core/block-editor').getBlockOrder());
	const span = `[data-style-id="${style.id}"]`;
	await expect.poll(async () => (await computed(page, override, span) || {}).weight).toBe('700');
	const plain = await computed(page, untouched, span);
	const changed = await computed(page, override, span);
	expect(plain.weight).toBe('300');
	// The override takes the new size and spacing of the style
	expect(changed.size).toBe(plain.size);
	expect(changed.spacing).toBe(plain.spacing);
	expect(await page.evaluate(() => wp.data.select('core/editor').isEditedPostDirty())).toBe(false);

	// The untouched span is not "(modified)": its copies of the old values
	// do not count
	await select(page, untouched, ...GARDEN);
	await page.getByRole('button', { name: 'Typography Stylist Features' }).click();
	const modal = page.locator('.components-modal__frame');
	await expect(modal).toBeVisible();
	await expect(modal.locator('.typost-ps-badge-name')).toHaveText(style.name);
	await modal.getByRole('button', { name: 'Close', exact: true }).first().click();
	await expect(modal).toHaveCount(0);
	expect(await page.evaluate(() => wp.data.select('core/editor').isEditedPostDirty())).toBe(false);

	// The frontend prints the same rules
	await page.goto(`${BASE}/?p=${post.id}&preview=true`, { waitUntil: 'load' });
	const front = await page.evaluate((sel) => Array.from(document.querySelectorAll(sel)).map((el) => {
		const cs = getComputedStyle(el);
		return { weight: cs.fontWeight, size: cs.fontSize, spacing: cs.letterSpacing };
	}), span);
	expect(front.map((s) => s.weight)).toEqual([ '300', '700' ]);
	expect(front[1].size).toBe(front[0].size);
	expect(front[1].spacing).toBe(front[0].spacing);
});
