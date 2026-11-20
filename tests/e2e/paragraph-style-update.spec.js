/**
 * #452: "Update Style…" in the Paragraph Style panel, and the lock on style
 * changes in the editor.
 *
 * - The block sidebar: "Update Style…" opens a confirmation that names the
 *   style; "Cancel" sends nothing and gives focus back; "Yes, Update Style"
 *   sends one request, shows and speaks the result, and focuses the badge.
 * - A refused save (429) keeps the confirmation, the error and the focus,
 *   and the block keeps its change.
 * - The sidebar follows a style applied while it is open.
 * - With the lock flag on, the panel has no button that changes a style,
 *   and Detach leaves focus on the panel's heading.
 * - A core Paragraph block: its own weight and line height go into the
 *   style and leave the block; a preset size stays. They leave the block
 *   also when the author selects another block while the request runs
 *   (the panel unmounts then).
 *
 * Each test makes its own style (named "ZZ #452 …") and draft post, and
 * deletes both. The lock is set in the page only (the site option is not
 * changed).
 */
const { test, expect } = require('@playwright/test');
const { openNewPost, deleteDraft } = require('./helpers');

test.setTimeout(120000);

const createdStyleIds = [];

async function createStyle(page, name, properties) {
	const style = await page.evaluate(async ({ styleName, props }) => {
		const created = await wp.apiFetch({ path: '/typost/v1/paragraph-styles', method: 'POST', data: { name: styleName, properties: props } });
		window.typostData.paragraphStyles = await wp.apiFetch({ path: '/typost/v1/paragraph-styles' });
		document.dispatchEvent(new CustomEvent('typost-paragraph-styles-updated'));
		return created;
	}, { styleName: `ZZ #452 ${name} ${Date.now()}`, props: properties });
	createdStyleIds.push(style.id);
	return style;
}

function storedStyle(page, id) {
	return page.evaluate(async (styleId) => (await wp.apiFetch({ path: '/typost/v1/paragraph-styles' })).find((s) => String(s.id) === String(styleId)), id);
}

// A Typography Stylist block with the style, its attributes a copy of the
// style's values, as an apply leaves them
async function insertStyledBlock(page, style, text) {
	const clientId = await page.evaluate(({ id, content, weight, spacing }) => {
		const block = wp.blocks.createBlock('typost/block', { content, styleClass: `typost-ps-${id}`, fontWeight: weight, letterSpacing: spacing });
		wp.data.dispatch('core/block-editor').insertBlocks(block);
		return block.clientId;
	}, { id: style.id, content: text, weight: style.properties.fontWeight || '', spacing: style.properties.letterSpacing || 0 });
	await page.evaluate((id) => {
		wp.data.dispatch('core/block-editor').selectBlock(id);
		wp.data.dispatch('core/edit-post').openGeneralSidebar('edit-post/block');
	}, clientId);
	return clientId;
}

function sidebarPanel(page) {
	return page.locator('[data-hook="typost_inspector_top"] .typost-ps-panel');
}

function focused(page) {
	return page.evaluate(() => {
		const el = document.activeElement;
		return el ? String(el.className) : '';
	});
}

// Write requests to the style routes
function trackWrites(page) {
	const writes = [];
	page.on('request', (request) => {
		const url = decodeURIComponent(request.url());
		if (/typost\/v1\/paragraph-styles\/\d+/.test(url) && request.method() !== 'GET') {
			writes.push(request.method());
		}
	});
	return writes;
}

test.afterEach(async ({ page }) => {
	// A test that failed before its unroute() must not refuse the cleanup
	await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => {});
	for (const id of createdStyleIds.splice(0)) {
		await page.evaluate((styleId) => wp.apiFetch({ path: `/typost/v1/paragraph-styles/${styleId}`, method: 'DELETE' }).catch(() => {}), id).catch(() => {});
	}
	await deleteDraft(page);
});

test('Update Style… asks first; Cancel sends nothing; Yes sends one request and says so @firefox', async ({ page }) => {
	await openNewPost(page);
	const style = await createStyle(page, 'sidebar', { fontWeight: '300', letterSpacing: 20, textColor: '#aa0000' });
	const clientId = await insertStyledBlock(page, style, 'Sidebar block');
	const panel = sidebarPanel(page);
	await expect(panel.locator('.typost-ps-badge-name')).toHaveText(style.name);
	await expect(panel).not.toContainText('.typost-ps-');
	await expect(panel.locator('.typost-ps-help')).toHaveText('To change this style on all pages, change this block. Then click “Update Style”.');

	// What the sidebar's Letter Spacing control does
	await page.evaluate((id) => wp.data.dispatch('core/block-editor').updateBlockAttributes(id, { letterSpacing: 60 }), clientId);
	await expect(panel.locator('.typost-ps-status')).toHaveText('This block is different from the style.');

	const writes = trackWrites(page);
	await panel.getByRole('button', { name: 'Update Style…' }).click();
	await expect.poll(() => focused(page)).toContain('typost-ps-confirm-cancel');
	const question = await page.evaluate(() => document.getElementById(document.activeElement.getAttribute('aria-describedby')).textContent);
	expect(question).toBe(`Update “${style.name}” on all pages? The style changes to match this block. All text and blocks that use the style change. You cannot undo this.`);
	await page.keyboard.press('Enter');
	await expect.poll(() => focused(page)).toContain('typost-ps-update-btn');
	expect(writes).toEqual([]);

	await panel.getByRole('button', { name: 'Update Style…' }).click();
	await panel.getByRole('button', { name: 'Yes, Update Style' }).click();
	const result = `“${style.name}” is updated. All text that uses this style changed.`;
	await expect(panel.locator('.typost-ps-status')).toHaveText(result);
	await expect.poll(() => page.evaluate(() => document.getElementById('a11y-speak-polite').textContent)).toContain(result);
	await expect.poll(() => focused(page)).toContain('typost-ps-badge');
	expect(writes).toHaveLength(1);

	const stored = await storedStyle(page, style.id);
	expect(stored.properties.letterSpacing).toBe(60);
	// A setting no editor control has stays
	expect(stored.properties.textColor).toBe('#aa0000');
});

test('A refused update keeps the confirmation, the error, the focus and the change @firefox', async ({ page }) => {
	await openNewPost(page);
	const style = await createStyle(page, 'refused', { fontWeight: '300' });
	const clientId = await insertStyledBlock(page, style, 'Refused block');
	const panel = sidebarPanel(page);
	await page.evaluate((id) => wp.data.dispatch('core/block-editor').updateBlockAttributes(id, { lineHeight: 2.4 }), clientId);
	// Only the update is refused (apiFetch sends PATCH as POST with an
	// override header)
	await page.route(/paragraph-styles(%2F|\/)\d+/, (route) => {
		const request = route.request();
		const method = (request.headers()['x-http-method-override'] || request.method()).toUpperCase();
		return method === 'PATCH'
			? route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ code: 'rate_limit_exceeded', message: 'Too many requests. Please try again later.', data: { status: 429 } }) })
			: route.continue();
	});

	await panel.getByRole('button', { name: 'Update Style…' }).click();
	const yes = panel.getByRole('button', { name: 'Yes, Update Style' });
	await yes.focus();
	await page.keyboard.press('Enter');
	const error = `“${style.name}” did not change. Too many requests. Please try again later. Your changes stay.`;
	await expect(panel.locator('.typost-ps-confirm-error')).toHaveText(error);
	await expect.poll(() => page.evaluate(() => document.getElementById('a11y-speak-assertive').textContent)).toContain(error);
	await expect.poll(() => focused(page)).toContain('typost-ps-confirm-yes');
	await expect(yes).toBeEnabled();
	expect(await page.evaluate((id) => wp.data.select('core/block-editor').getBlockAttributes(id).lineHeight, clientId)).toBe(2.4);
	await page.unroute(/paragraph-styles(%2F|\/)\d+/);
});

test('The block sidebar follows a style applied while it is open', async ({ page }) => {
	await openNewPost(page);
	const style = await createStyle(page, 'follow', { fontWeight: '300' });
	const clientId = await page.evaluate(() => {
		const block = wp.blocks.createBlock('typost/block', { content: 'Plain block' });
		wp.data.dispatch('core/block-editor').insertBlocks(block);
		wp.data.dispatch('core/block-editor').selectBlock(block.clientId);
		wp.data.dispatch('core/edit-post').openGeneralSidebar('edit-post/block');
		return block.clientId;
	});
	const panel = sidebarPanel(page);
	await expect(panel.locator('.typost-ps-save-btn')).toBeVisible();
	// The toolbar's style browser applies through this event
	await page.evaluate((id) => {
		const picked = window.typostData.paragraphStyles.find((s) => String(s.id) === String(id));
		document.dispatchEvent(new CustomEvent('typost-apply-block-properties', { detail: window.typostPSUtils.buildApplyEventDetail(picked, 'inspector') }));
	}, style.id);
	await expect.poll(() => page.evaluate((id) => wp.data.select('core/block-editor').getBlockAttributes(id).styleClass, clientId)).toBe(`typost-ps-${style.id}`);
	await expect(panel.locator('.typost-ps-badge-name')).toHaveText(style.name);
});

test('With the lock on, nothing in the panel changes a style, and Detach keeps focus in the panel @firefox', async ({ page }) => {
	await openNewPost(page);
	const style = await createStyle(page, 'lock', { fontWeight: '300' });
	await page.evaluate(() => {
		window.typostData.paragraphStylesOptions.styleChangesLocked = true;
	});
	const clientId = await insertStyledBlock(page, style, 'Locked block');
	const panel = sidebarPanel(page);
	await expect(panel.locator('.typost-ps-badge-name')).toHaveText(style.name);
	await expect(panel.locator('.typost-ps-help')).toHaveCount(0);
	await page.evaluate((id) => wp.data.dispatch('core/block-editor').updateBlockAttributes(id, { fontWeight: '700' }), clientId);
	await expect(panel).toContainText('Only an administrator can change this style.');
	await expect(panel.getByRole('button', { name: /Update Style|Save as New/ })).toHaveCount(0);

	await panel.getByRole('button', { name: 'Detach Style' }).click();
	await expect.poll(() => focused(page)).toContain('typost-ps-panel-label');
	await expect(panel.getByRole('button', { name: 'Save Current Settings as Style' })).toHaveCount(0);
});

test('A core block loses its copied settings also when another block is selected while the update runs', async ({ page }) => {
	await openNewPost(page);
	const style = await createStyle(page, 'core away', { fontWeight: '300' });
	const ids = await page.evaluate((id) => {
		const styled = wp.blocks.createBlock('core/paragraph', {
			content: 'Core block with its own weight',
			className: `typost-styled typost-ps-${id}`,
			style: { typography: { fontWeight: '700' } },
		});
		const other = wp.blocks.createBlock('core/paragraph', { content: 'Another block' });
		wp.data.dispatch('core/block-editor').insertBlocks([styled, other]);
		wp.data.dispatch('core/block-editor').selectBlock(styled.clientId);
		wp.data.dispatch('core/edit-post').openGeneralSidebar('edit-post/block');
		return [styled.clientId, other.clientId];
	}, style.id);
	// The update takes 2.5 s, time for the author to select another block
	await page.route(/paragraph-styles(%2F|\/)\d+/, async (route) => {
		const request = route.request();
		const method = (request.headers()['x-http-method-override'] || request.method()).toUpperCase();
		if (method === 'PATCH') {
			await new Promise((resolve) => setTimeout(resolve, 2500));
		}
		return route.continue();
	});
	const panel = page.locator('.typost-ps-core-panel');
	await expect(panel).toContainText('This block has its own settings: font weight.');
	const saved = page.waitForResponse((response) => /paragraph-styles(%2F|\/)\d+/.test(response.url()) && response.request().method() !== 'GET');
	await panel.getByRole('button', { name: 'Update Style…' }).click();
	await panel.getByRole('button', { name: 'Yes, Update Style' }).click();
	// The panel of the first block unmounts while the request runs
	await page.evaluate((id) => wp.data.dispatch('core/block-editor').selectBlock(id), ids[1]);
	await saved;

	await expect.poll(async () => (await storedStyle(page, style.id)).properties.fontWeight).toBe('700');
	await expect.poll(() => page.evaluate((id) => {
		const attributes = wp.data.select('core/block-editor').getBlockAttributes(id);
		return !!(attributes.style && attributes.style.typography && attributes.style.typography.fontWeight);
	}, ids[0])).toBe(false);
	// The result is still announced
	await expect.poll(() => page.evaluate(() => document.getElementById('a11y-speak-polite').textContent)).toContain(`“${style.name}” is updated.`);
});

test('A core Paragraph block gives its own weight and line height to its style', async ({ page }) => {
	await openNewPost(page);
	const style = await createStyle(page, 'core', { fontWeight: '300', alignment: 'center' });
	const clientId = await page.evaluate((id) => {
		const block = wp.blocks.createBlock('core/paragraph', {
			content: 'Core block with its own settings',
			className: `typost-styled typost-ps-${id}`,
			fontSize: 'large',
			style: { typography: { fontWeight: '700', lineHeight: '1.9' } },
		});
		wp.data.dispatch('core/block-editor').insertBlocks(block);
		wp.data.dispatch('core/block-editor').selectBlock(block.clientId);
		wp.data.dispatch('core/edit-post').openGeneralSidebar('edit-post/block');
		return block.clientId;
	}, style.id);
	const panel = page.locator('.typost-ps-core-panel');
	await expect(panel).toContainText('This block has its own settings: font weight, line height.');
	await expect(panel).toContainText('“Update Style” does not copy these settings: font size. They stay on the block.');

	const writes = trackWrites(page);
	await panel.getByRole('button', { name: 'Update Style…' }).click();
	await panel.getByRole('button', { name: 'Yes, Update Style' }).click();
	await expect(panel.locator('.typost-ps-status').first()).toHaveText(`“${style.name}” is updated. All text that uses this style changed.`);
	expect(writes).toHaveLength(1);

	const stored = await storedStyle(page, style.id);
	expect(stored.properties.fontWeight).toBe('700');
	expect(stored.properties.lineHeight).toBe(1.9);
	expect(stored.properties.alignment).toBe('center');
	const attributes = await page.evaluate((id) => wp.data.select('core/block-editor').getBlockAttributes(id), clientId);
	expect(attributes.fontSize).toBe('large');
	expect(attributes.style && attributes.style.typography && attributes.style.typography.fontWeight).toBeFalsy();
	expect(attributes.style && attributes.style.typography && attributes.style.typography.lineHeight).toBeFalsy();
});
