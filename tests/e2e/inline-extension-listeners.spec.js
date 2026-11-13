/**
 * The inline editor's side of the extension API on a core Paragraph (#386):
 * the typost-apply-block-properties and typost-insert-content events, the
 * panel-closed action that opens the dialog again, the
 * typost_current_editor_state filter and the toolbar refresh.
 *
 * The inline editor added its listeners in its constructor. With
 * SCRIPT_DEBUG on (wp-env turns it on), WordPress loads the development
 * build of React, and StrictMode constructs the component twice and mounts,
 * unmounts and mounts again the instance it keeps: the listeners stayed on
 * an instance that was never mounted, and the mounted one had none. These
 * tests fail there for that reason; on a site with SCRIPT_DEBUG off they
 * passed before the fix too.
 *
 * Each test works on its own draft post (and the first on its own paragraph
 * style, named "ZZ #386 …"). afterEach deletes them without the test's
 * page, so they go also after a time-out.
 */
const { test, expect } = require('@playwright/test');
const { openNewPost, select, rest, deleteWithoutPage } = require('./helpers');

test.setTimeout(90000);

const TEXT = 'Moonlit garden party';
// "garden" in TEXT
const GARDEN = [ 8, 14 ];

function blockContent(page, clientId) {
	return page.evaluate((id) => String(wp.data.select('core/block-editor').getBlockAttributes(id).content), clientId);
}

// The text inside the element with data-style-id="N" in the block content
function styledText(page, clientId, styleId) {
	return page.evaluate(({ id, sid }) => {
		const holder = document.createElement('div');
		holder.innerHTML = String(wp.data.select('core/block-editor').getBlockAttributes(id).content);
		const el = holder.querySelector(`[data-style-id="${sid}"]`);
		return el ? el.textContent : null;
	}, { id: clientId, sid: styleId });
}

// A new draft with one core Paragraph; "garden" selected with the keyboard
async function paragraphWithSelection(page) {
	await openNewPost(page);
	const postId = await page.evaluate(() => wp.data.select('core/editor').getCurrentPostId());
	created.push(`/wp/v2/posts/${postId}?force=true`);
	const clientId = await page.evaluate((content) => {
		const block = wp.blocks.createBlock('core/paragraph', { content });
		wp.data.dispatch('core/block-editor').insertBlocks(block);
		return block.clientId;
	}, TEXT);
	await select(page, clientId, ...GARDEN);
	return clientId;
}

// The inline dialog (its heading names it), not another plugin modal
function inlineDialog(page) {
	return page.getByRole('dialog', { name: 'Typography Stylist', exact: true });
}

async function openInlineDialog(page) {
	await page.getByRole('button', { name: 'Typography Stylist Features' }).click();
	const dialog = inlineDialog(page);
	await expect(dialog).toBeVisible();
	return dialog;
}

// REST routes of what the running test made, to delete. A delete that fails
// also fails the test, so content left on the site is visible
let created = [];

test.beforeEach(() => {
	created = [];
});

test.afterEach(async ({ playwright }) => {
	const failures = await deleteWithoutPage(playwright, created.splice(0));
	failures.forEach((failure) => test.info().annotations.push({ type: 'cleanup failed', description: failure }));
	expect(failures, 'cleanup: delete what the test made').toEqual([]);
});

test('A style picked in the style browser styles the selected text in a core Paragraph, and the dialog opens again', async ({ page }) => {
	const dialogs = [];
	page.on('dialog', (dialog) => {
		dialogs.push(dialog.message());
		dialog.accept();
	});
	// The editor lists the styles that exist when it loads
	const style = await rest(page, 'POST', '/typost/v1/paragraph-styles', {
		name: `ZZ #386 bold ${Date.now()}`,
		properties: { fontWeight: '700' },
	});
	created.push(`/typost/v1/paragraph-styles/${style.id}`);

	const clientId = await paragraphWithSelection(page);
	const dialog = await openInlineDialog(page);

	// "Browse styles…" opens the style browser, a second modal: WordPress
	// closes the inline dialog when it opens
	await dialog.getByRole('button', { name: 'Browse styles…' }).click();
	// The browser shows the first styles only; a site can have many
	await page.getByRole('searchbox', { name: 'Search styles' }).fill(style.name);
	const row = page.getByRole('option', { name: new RegExp(style.name) });
	await expect(row).toBeVisible();
	await expect(inlineDialog(page)).toHaveCount(0);
	await row.click();

	// The browser sends typost-apply-block-properties with source 'inline'
	await expect.poll(() => styledText(page, clientId, style.id)).toBe('garden');
	expect(await blockContent(page, clientId)).toMatch(new RegExp(`^Moonlit <span [^>]*data-style-id="${style.id}"[^>]*>garden</span> party$`));
	// Plain text carries no styling of its own, so nothing asked first
	expect(dialogs).toEqual([]);

	// Closing the browser fires typost_extension_panel_closed, which opens
	// the inline dialog again
	await expect(inlineDialog(page)).toBeVisible();
	await expect(page.getByRole('option', { name: new RegExp(style.name) })).toHaveCount(0);
});

test('typost-insert-content inserts at the selection in a core Paragraph', async ({ page }) => {
	const clientId = await paragraphWithSelection(page);

	// What the Glyphs panel sends (HOOKS.md): the text replaces the selection
	await page.evaluate(() => {
		document.dispatchEvent(new CustomEvent('typost-insert-content', { detail: { text: 'secret', source: 'inline' } }));
	});
	await expect.poll(() => blockContent(page, clientId)).toBe('Moonlit secret party');
	// The caret follows the inserted text
	await expect.poll(() => page.evaluate(() => {
		const s = wp.data.select('core/block-editor');
		return [ s.getSelectionStart().offset, s.getSelectionEnd().offset ];
	})).toEqual([ 14, 14 ]);
});

test('The dialog opens again when the Glyphs panel closes', async ({ page }) => {
	await paragraphWithSelection(page);
	const dialog = await openInlineDialog(page);
	await dialog.getByRole('button', { name: 'Close', exact: true }).first().click();
	await expect(inlineDialog(page)).toHaveCount(0);

	// What the Glyphs panel fires when it closes (HOOKS.md)
	await page.evaluate(() => window.typostHooks.doAction('typost_glyphs_panel_closed', 'inline', { range: { start: 8, end: 14 } }));
	await expect(inlineDialog(page)).toBeVisible();
});

test('typost_current_editor_state returns the open dialog\'s state after a feature is turned on', async ({ page }) => {
	const clientId = await paragraphWithSelection(page);
	const dialog = await openInlineDialog(page);
	await dialog.getByRole('checkbox', { name: 'Discretionary Ligatures' }).check();
	await expect.poll(() => blockContent(page, clientId)).toContain('data-features="dlig"');

	const state = await page.evaluate(() => window.typostHooks.applyFilters('typost_current_editor_state', {}, 'inline'));
	expect(state.editorType).toBe('inline');
	expect(state.features).toEqual([ 'dlig' ]);
});

test('typost-convert-to-block converts the core Paragraph', async ({ page }) => {
	await paragraphWithSelection(page);

	// What an extension's word-boundary notice sends (HOOKS.md)
	await page.evaluate(() => document.dispatchEvent(new CustomEvent('typost-convert-to-block')));
	await expect.poll(() => page.evaluate(() => wp.data.select('core/block-editor').getBlocks().map((block) => block.name))).toEqual([ 'typost/block' ]);
	const content = await page.evaluate(() => String(wp.data.select('core/block-editor').getBlocks()[0].attributes.content));
	expect(content).toMatch(/^Moonlit <span [^>]*>garden<\/span> party$/);
});

test('A toolbar button that an extension adds later shows in the toolbar', async ({ page }) => {
	await paragraphWithSelection(page);
	await expect(page.getByRole('button', { name: 'Typography Stylist Features' })).toBeVisible();

	// An extension that loads after the toolbar rendered: it adds its button
	// with the filter, then fires the action so the toolbar renders again
	await page.evaluate(() => {
		window.typostHooks.addFilter('typost_editor_toolbar_buttons', (buttons) => buttons.concat([ {
			id: 'zz-386-late',
			icon: 'admin-generic',
			label: 'ZZ 386 late button',
			onClick: () => {},
		} ]));
		window.typostHooks.doAction('typost_editor_toolbar_buttons_changed');
	});
	await expect(page.getByRole('button', { name: 'ZZ 386 late button' })).toBeVisible();
});
