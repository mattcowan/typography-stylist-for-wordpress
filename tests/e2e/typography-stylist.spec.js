/**
 * Quick Feature Toggles in the Typography Stylist block: each control styles
 * only the selected text, the styling stays after the dialog closes, and the
 * dialog reads it back when the same text is selected again.
 *
 * The controls apply as they change (debounced); there is no Apply button.
 * Results are read from the block's stored content, which is what gets
 * saved, rather than from the canvas DOM.
 *
 * Each test works on its own draft post and deletes it afterwards. The suite
 * needs only WordPress with this plugin active (WP_BASE_URL), so it runs on a
 * wp-env site (#189) as well as on a local development site.
 */
const { test, expect } = require('@playwright/test');
const { BASE, openNewPost, editable, select, deleteDraft } = require('./helpers');

test.setTimeout(90000);

const TEXT = 'Hello Beautiful World';
// Text offsets in TEXT
const BEAUTIFUL = [6, 15];
const WORLD = [16, 21];

async function insertBlock(page, text = TEXT) {
	const clientId = await page.evaluate((content) => {
		const block = wp.blocks.createBlock('typost/block', { content });
		wp.data.dispatch('core/block-editor').insertBlocks(block);
		return block.clientId;
	}, text);
	await editable(page, clientId).waitFor();
	return clientId;
}

async function openQuickFeatureToggles(page) {
	const button = page.getByRole('button', { name: 'Typography Stylist Features' });
	// After caret moves with no selection the editor keeps the block toolbar
	// hidden; Alt+F10 (the editor's "focus the block toolbar" shortcut)
	// shows it and leaves the caret where it is in the store
	if (!(await button.isVisible())) {
		await page.keyboard.press('Alt+F10');
	}
	await button.click();
	const modal = page.locator('.typost-block-modal');
	await expect(modal).toBeVisible();
	return modal;
}

async function closeQuickFeatureToggles(page, modal) {
	await modal.getByRole('button', { name: 'Close', exact: true }).first().click();
	await expect(modal).toHaveCount(0);
}

// The styled spans in the block's stored content, outermost first
function styledSpans(page, clientId) {
	return page.evaluate((id) => {
		const holder = document.createElement('div');
		holder.innerHTML = String(wp.data.select('core/block-editor').getBlockAttributes(id).content);
		return Array.from(holder.querySelectorAll('span.typost-styled')).map((span) => ({
			text: span.textContent,
			attrs: Object.fromEntries(Array.from(span.attributes).map((a) => [a.name, a.value])),
		}));
	}, clientId);
}

// Wait until the stored content holds a span with `text` whose attributes
// include every pair in `attrs`, and return it
async function expectSpan(page, clientId, text, attrs) {
	let found;
	await expect.poll(async () => {
		const spans = await styledSpans(page, clientId);
		found = spans.find((span) => span.text === text &&
			Object.entries(attrs).every(([name, value]) => span.attrs[name] === value));
		return !!found;
	}, { message: `span "${text}" with ${JSON.stringify(attrs)}` }).toBe(true);
	return found;
}

function spinbutton(modal, name) {
	return modal.getByRole('spinbutton', { name, exact: true });
}

async function applyResponsiveFontSize(modal, min, preferred, max) {
	await modal.getByLabel('Font Size (for selected text)').selectOption('responsive');
	await spinbutton(modal, 'Mobile (320px+)').fill(String(min));
	await spinbutton(modal, 'Intermediate').fill(String(preferred));
	await spinbutton(modal, 'Large (1920px)').fill(String(max));
}

test.describe('Typography Stylist block - Quick Feature Toggles on selected text', () => {
	let clientId;

	test.beforeEach(async ({ page }) => {
		await openNewPost(page);
		clientId = await insertBlock(page);
	});

	test.afterEach(async ({ page }) => {
		await deleteDraft(page);
	});

	test('responsive font size styles the selection and stays after closing', async ({ page }) => {
		await select(page, clientId, ...BEAUTIFUL);
		const modal = await openQuickFeatureToggles(page);
		await applyResponsiveFontSize(modal, 18, 24, 30);
		const span = await expectSpan(page, clientId, 'Beautiful', {
			'data-fontsize': 'responsive',
			'data-fontsize-min': '18',
			'data-fontsize-preferred': '24',
			'data-fontsize-max': '30',
		});
		expect(span.attrs.style).toContain('clamp(');
		await closeQuickFeatureToggles(page, modal);

		const spans = await styledSpans(page, clientId);
		expect(spans.map((s) => s.text)).toEqual(['Beautiful']);
	});

	test('font weight styles the selection and stays after closing', async ({ page }) => {
		await select(page, clientId, ...WORLD);
		const modal = await openQuickFeatureToggles(page);
		await modal.getByLabel('Font Weight (for selected text)').selectOption('700');
		const span = await expectSpan(page, clientId, 'World', { 'data-fontweight': '700' });
		expect(span.attrs.style).toContain('font-weight: 700');
		await closeQuickFeatureToggles(page, modal);

		const spans = await styledSpans(page, clientId);
		expect(spans.map((s) => s.text)).toEqual(['World']);
	});

	test('letter spacing styles the selection and stays after closing', async ({ page }) => {
		await select(page, clientId, ...BEAUTIFUL);
		const modal = await openQuickFeatureToggles(page);
		await spinbutton(modal, 'Letter Spacing (for selected text)').fill('50');
		const span = await expectSpan(page, clientId, 'Beautiful', { 'data-letterspacing': '50' });
		expect(span.attrs.style).toContain('letter-spacing: 0.05em');
		await closeQuickFeatureToggles(page, modal);

		const spans = await styledSpans(page, clientId);
		expect(spans.map((s) => s.text)).toEqual(['Beautiful']);
	});

	test('line height styles the selection and stays after closing', async ({ page }) => {
		await select(page, clientId, ...BEAUTIFUL);
		const modal = await openQuickFeatureToggles(page);
		await spinbutton(modal, 'Line Height (for selected text)').fill('2');
		const span = await expectSpan(page, clientId, 'Beautiful', { 'data-lineheight': '2' });
		expect(span.attrs.style).toContain('line-height: 2');
		await closeQuickFeatureToggles(page, modal);

		const spans = await styledSpans(page, clientId);
		expect(spans.map((s) => s.text)).toEqual(['Beautiful']);
	});

	test('styling two words one after the other keeps each word to its own property', async ({ page }) => {
		await select(page, clientId, ...BEAUTIFUL);
		let modal = await openQuickFeatureToggles(page);
		await spinbutton(modal, 'Line Height (for selected text)').fill('2');
		await expectSpan(page, clientId, 'Beautiful', { 'data-lineheight': '2' });
		await closeQuickFeatureToggles(page, modal);

		await select(page, clientId, ...WORLD);
		modal = await openQuickFeatureToggles(page);
		await spinbutton(modal, 'Letter Spacing (for selected text)').fill('50');
		await expectSpan(page, clientId, 'World', { 'data-letterspacing': '50' });
		await closeQuickFeatureToggles(page, modal);

		const spans = await styledSpans(page, clientId);
		expect(spans.map((s) => s.text)).toEqual(['Beautiful', 'World']);
		const [beautiful, world] = spans;
		expect(beautiful.attrs['data-lineheight']).toBe('2');
		expect(beautiful.attrs['data-letterspacing']).toBeUndefined();
		expect(beautiful.attrs.style).not.toContain('letter-spacing');
		expect(world.attrs['data-letterspacing']).toBe('50');
		expect(world.attrs['data-lineheight']).toBeUndefined();
		expect(world.attrs.style).not.toContain('line-height');
	});

	test('detection: letter spacing reads back when the text is selected again', async ({ page }) => {
		await select(page, clientId, ...BEAUTIFUL);
		let modal = await openQuickFeatureToggles(page);
		await spinbutton(modal, 'Letter Spacing (for selected text)').fill('150');
		await expectSpan(page, clientId, 'Beautiful', { 'data-letterspacing': '150' });
		await closeQuickFeatureToggles(page, modal);

		await select(page, clientId, ...BEAUTIFUL);
		modal = await openQuickFeatureToggles(page);
		await expect(spinbutton(modal, 'Letter Spacing (for selected text)')).toHaveValue('150');
	});

	test('detection: line height reads back when the text is selected again', async ({ page }) => {
		await select(page, clientId, ...BEAUTIFUL);
		let modal = await openQuickFeatureToggles(page);
		await spinbutton(modal, 'Line Height (for selected text)').fill('2');
		await expectSpan(page, clientId, 'Beautiful', { 'data-lineheight': '2' });
		await closeQuickFeatureToggles(page, modal);

		await select(page, clientId, ...BEAUTIFUL);
		modal = await openQuickFeatureToggles(page);
		await expect(spinbutton(modal, 'Line Height (for selected text)')).toHaveValue('2');
	});

	test('detection: font weight reads back when the text is selected again', async ({ page }) => {
		await select(page, clientId, ...WORLD);
		let modal = await openQuickFeatureToggles(page);
		await modal.getByLabel('Font Weight (for selected text)').selectOption('700');
		await expectSpan(page, clientId, 'World', { 'data-fontweight': '700' });
		await closeQuickFeatureToggles(page, modal);

		await select(page, clientId, ...WORLD);
		modal = await openQuickFeatureToggles(page);
		await expect(modal.getByLabel('Font Weight (for selected text)')).toHaveValue('700');
	});

	test('detection: a font size and an OpenType feature on the same text both read back', async ({ page }) => {
		await select(page, clientId, ...BEAUTIFUL);
		let modal = await openQuickFeatureToggles(page);
		await applyResponsiveFontSize(modal, 18, 24, 30);
		await expectSpan(page, clientId, 'Beautiful', { 'data-fontsize-max': '30' });
		await closeQuickFeatureToggles(page, modal);

		await select(page, clientId, ...BEAUTIFUL);
		modal = await openQuickFeatureToggles(page);
		await modal.getByRole('button', { name: 'Stylistic Sets', exact: true }).click();
		const ss01 = modal.locator('label')
			.filter({ has: page.locator('code', { hasText: /^ss01$/ }) })
			.locator('input[type="checkbox"]');
		await ss01.check();
		await expect.poll(async () => (await styledSpans(page, clientId))
			.some((span) => span.text === 'Beautiful' && (span.attrs['data-features'] || '').split(',').includes('ss01'))).toBe(true);
		await closeQuickFeatureToggles(page, modal);

		await select(page, clientId, ...BEAUTIFUL);
		modal = await openQuickFeatureToggles(page);
		await expect(modal.getByLabel('Font Size (for selected text)')).toHaveValue('responsive');
		await expect(spinbutton(modal, 'Mobile (320px+)')).toHaveValue('18');
		await expect(spinbutton(modal, 'Large (1920px)')).toHaveValue('30');
		// The category opens on its own when it holds an active feature
		await expect(ss01).toBeChecked();
	});

	test('collapsed caret: a new letter spacing updates the span around the caret in place', async ({ page }) => {
		await select(page, clientId, ...BEAUTIFUL);
		let modal = await openQuickFeatureToggles(page);
		await spinbutton(modal, 'Letter Spacing (for selected text)').fill('100');
		await expectSpan(page, clientId, 'Beautiful', { 'data-letterspacing': '100' });
		await closeQuickFeatureToggles(page, modal);

		// Caret inside "Beautiful", no selection
		await select(page, clientId, BEAUTIFUL[0] + 2);
		modal = await openQuickFeatureToggles(page);
		await spinbutton(modal, 'Letter Spacing (for selected text)').fill('200');
		await expectSpan(page, clientId, 'Beautiful', { 'data-letterspacing': '200' });

		// One span, not a nested or second one
		const spans = await styledSpans(page, clientId);
		expect(spans).toHaveLength(1);
	});

	test('partial selection: a new letter spacing on part of a span splits it into three', async ({ page }) => {
		await select(page, clientId, ...BEAUTIFUL);
		let modal = await openQuickFeatureToggles(page);
		await spinbutton(modal, 'Letter Spacing (for selected text)').fill('100');
		await expectSpan(page, clientId, 'Beautiful', { 'data-letterspacing': '100' });
		await closeQuickFeatureToggles(page, modal);

		// "eaut" inside "Beautiful"
		await select(page, clientId, BEAUTIFUL[0] + 1, BEAUTIFUL[0] + 5);
		modal = await openQuickFeatureToggles(page);
		await spinbutton(modal, 'Letter Spacing (for selected text)').fill('200');
		await expectSpan(page, clientId, 'eaut', { 'data-letterspacing': '200' });

		const spans = await styledSpans(page, clientId);
		expect(spans.map((s) => [s.text, s.attrs['data-letterspacing']])).toEqual([
			['B', '100'],
			['eaut', '200'],
			['iful', '100'],
		]);
	});
});

// The tests above read the editor store. This one goes through the parts of
// WordPress the store does not cover: serialization, block validation on
// reload and the frontend.
test.describe('Typography Stylist block - saved post', () => {
	let postId;

	test.afterEach(async ({ page }) => {
		if (postId) {
			await openNewPost(page);
			await page.evaluate((id) => wp.apiFetch({ path: `/wp/v2/posts/${id}?force=true`, method: 'DELETE' }).catch(() => {}), postId).catch(() => {});
		}
	});

	test('a styled block stays valid after a reload and the span reaches the frontend', async ({ page }) => {
		await openNewPost(page);
		const clientId = await insertBlock(page);
		await select(page, clientId, ...BEAUTIFUL);
		const modal = await openQuickFeatureToggles(page);
		await spinbutton(modal, 'Letter Spacing (for selected text)').fill('50');
		await expectSpan(page, clientId, 'Beautiful', { 'data-letterspacing': '50' });
		await closeQuickFeatureToggles(page, modal);

		const link = await page.evaluate(async () => {
			const editor = wp.data.dispatch('core/editor');
			await editor.editPost({ title: 'ZZ E2E saved post', status: 'publish' });
			await editor.savePost();
			return wp.data.select('core/editor').getCurrentPost().link;
		});
		postId = await page.evaluate(() => wp.data.select('core/editor').getCurrentPostId());

		await page.goto(`${BASE}/wp-admin/post.php?post=${postId}&action=edit`, { waitUntil: 'domcontentloaded' });
		await page.waitForFunction(() => window.wp && wp.data && wp.data.select('core/block-editor').getBlocks().length > 0);
		const reloaded = await page.evaluate(() => {
			const [block] = wp.data.select('core/block-editor').getBlocks();
			return {
				name: block.name,
				isValid: block.isValid,
				content: String(block.attributes.content),
				dirty: wp.data.select('core/editor').isEditedPostDirty(),
			};
		});
		expect(reloaded.name).toBe('typost/block');
		expect(reloaded.isValid).toBe(true);
		expect(reloaded.dirty).toBe(false);
		expect(reloaded.content).toContain('data-letterspacing="50"');

		await page.goto(link, { waitUntil: 'domcontentloaded' });
		const span = page.locator('.wp-block-typost [aria-hidden="true"] .typost-styled[data-letterspacing="50"]').first();
		await expect(span).toHaveText('Beautiful');
		// Computed, so a stylesheet or kses change that drops it fails here
		expect(await span.evaluate((el) => getComputedStyle(el).letterSpacing)).not.toBe('normal');
	});
});

test.describe('Typography Stylist block - inline font family', () => {
	let font;

	// A font definition for a system font, so no font file is needed
	test.beforeEach(async ({ page }) => {
		await openNewPost(page);
		font = await page.evaluate(() => wp.apiFetch({
			path: '/typost/v1/manual-fonts',
			method: 'POST',
			data: { name: `ZZ E2E Serif ${Date.now()}`, font_family: 'Georgia', fallbacks: 'serif' },
		}).then((response) => response.font));
		// The editor data is cached per user; adding a font clears that cache,
		// so a reload lists the new font
		await openNewPost(page);
	});

	test.afterEach(async ({ page }) => {
		await deleteDraft(page);
		if (font) {
			await page.evaluate((id) => wp.apiFetch({ path: `/typost/v1/manual-fonts/${id}`, method: 'DELETE' }).catch(() => {}), font.id).catch(() => {});
		}
	});

	test('font family styles the selection and stays after closing', async ({ page }) => {
		const clientId = await insertBlock(page);
		await select(page, clientId, ...BEAUTIFUL);
		const modal = await openQuickFeatureToggles(page);
		const picker = modal.getByRole('combobox', { name: 'Font Family (for selected text)' });
		await picker.fill(font.name);
		await page.getByRole('option', { name: font.name }).click();

		const span = await expectSpan(page, clientId, 'Beautiful', { 'data-font-id': String(font.font_id) });
		expect(span.attrs.style).toContain(`var(--font-${font.font_id})`);
		await closeQuickFeatureToggles(page, modal);

		const spans = await styledSpans(page, clientId);
		expect(spans.map((s) => s.text)).toEqual(['Beautiful']);
	});
});
