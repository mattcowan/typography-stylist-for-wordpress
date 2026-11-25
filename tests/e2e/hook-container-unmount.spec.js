/**
 * Extension hook containers (#419): what an extension renders into a hook
 * container with wp.element.render() is unmounted when the container leaves
 * the page, and stays mounted while the container is on the page.
 *
 * Before the fix nothing unmounted it. The Paragraph Styles panel stayed
 * mounted after the inline dialog, the Quick Feature Toggles or the block
 * sidebar closed, and its wp.data subscription kept calling the
 * typost_current_editor_state filter on every store change, one more panel
 * at each open.
 *
 * The panel subscribes only while a style is active, so each test starts
 * from text that carries a paragraph style. The calls are counted with a
 * page script that wraps typostHooks.applyFilters and keeps the calls whose
 * stack is in the Paragraph Styles script.
 *
 * The Variable Fonts tests check the sidebar's axis session: a block in the
 * same font must not show the axis values set on the block shown before.
 * They need a variable font with an axis other than weight, and skip
 * without one.
 *
 * Each test works on its own draft post, and the first four on their own
 * paragraph style (named "ZZ #419 …"); afterEach deletes them without the
 * test's page, so they go also after a time-out.
 */
const { test, expect } = require('@playwright/test');
const { openNewPost, editable, select, rest, deleteWithoutPage } = require('./helpers');

test.setTimeout(120000);

const TEXT = 'Moonlit garden party';
// "garden" in TEXT
const GARDEN = [ 8, 14 ];

// REST routes of what the running test made, to delete
let created = [];

test.beforeEach(() => {
	created = [];
});

test.afterEach(async ({ playwright }) => {
	const failures = await deleteWithoutPage(playwright, created.splice(0));
	failures.forEach((failure) => test.info().annotations.push({ type: 'cleanup failed', description: failure }));
	expect(failures, 'cleanup: delete what the test made').toEqual([]);
});

// A paragraph style that exists before the editor loads (the panel lists the
// styles localized at page load)
async function createStyle(page, label) {
	const style = await rest(page, 'POST', '/typost/v1/paragraph-styles', {
		name: `ZZ #419 ${label} ${Date.now()}`,
		properties: { fontWeight: '700' },
	});
	created.push(`/typost/v1/paragraph-styles/${style.id}`);
	return style;
}

async function openDraft(page) {
	await openNewPost(page);
	const postId = await page.evaluate(() => wp.data.select('core/editor').getCurrentPostId());
	created.push(`/wp/v2/posts/${postId}?force=true`);
}

// TEXT with "garden" in the style
function styledContent(styleId) {
	return `Moonlit <span class="typost-styled" data-style-id="${styleId}">garden</span> party`;
}

async function insertBlock(page, name, attributes) {
	const clientId = await page.evaluate(({ blockName, attrs }) => {
		const block = wp.blocks.createBlock(blockName, attrs);
		wp.data.dispatch('core/block-editor').insertBlocks(block);
		return block.clientId;
	}, { blockName: name, attrs: attributes });
	await editable(page, clientId).waitFor();
	return clientId;
}

// Count the typost_current_editor_state calls made from the Paragraph
// Styles script, from now on
async function countPanelCalls(page) {
	await page.evaluate(() => {
		if (!window.__zz419) {
			const hooks = window.typostHooks;
			const original = hooks.applyFilters;
			window.__zz419 = { calls: 0 };
			hooks.applyFilters = function(name) {
				if (name === 'typost_current_editor_state' && /paragraph-styles\//.test(String(new Error().stack))) {
					window.__zz419.calls++;
				}
				return original.apply(this, arguments);
			};
		}
		window.__zz419.calls = 0;
	});
}

// Change the editor's stores `times` times (the post title; it moves no
// selection), let the subscribers run, and return the counted calls
async function callsAfterStoreChanges(page, times = 5) {
	await countPanelCalls(page);
	for (let i = 0; i < times; i++) {
		await page.evaluate((n) => wp.data.dispatch('core/editor').editPost({ title: `ZZ #419 title ${n}` }), i);
	}
	await page.waitForTimeout(300);
	return page.evaluate(() => window.__zz419.calls);
}

// The inline dialog (its heading names it), not another plugin modal
function inlineDialog(page) {
	return page.getByRole('dialog', { name: 'Typography Stylist', exact: true });
}

async function openInlineDialog(page, styleName) {
	await page.getByRole('button', { name: 'Typography Stylist Features' }).click();
	const dialog = inlineDialog(page);
	await expect(dialog).toBeVisible();
	await expect(dialog.locator('.typost-ps-badge-name')).toHaveText(styleName);
	return dialog;
}

async function closeDialog(page, dialog) {
	await dialog.getByRole('button', { name: 'Close', exact: true }).first().click();
	await expect(dialog).toHaveCount(0);
	// The unmount waits for the end of the close's commit
	await page.waitForTimeout(300);
}

async function openQuickFeatureToggles(page, styleName) {
	const button = page.getByRole('button', { name: 'Typography Stylist Features' });
	if (!(await button.isVisible())) {
		await page.keyboard.press('Alt+F10');
	}
	await button.click();
	const modal = page.locator('.typost-block-modal');
	await expect(modal).toBeVisible();
	await expect(modal.locator('.typost-ps-badge-name')).toHaveText(styleName);
	return modal;
}

// An extension that renders into hook containers with wp.element.render(),
// as HOOKS.md shows. Each root counts its mounts and unmounts. It uses
// containers that no bundled module renders into, so it replaces nothing.
async function plantExtension(page, hooks) {
	await page.evaluate((names) => {
		const counts = {};
		window.__zz419probe = counts;
		function Probe(props) {
			wp.element.useEffect(() => {
				counts[props.hook].mounted++;
				return () => {
					counts[props.hook].unmounted++;
				};
			}, []);
			return wp.element.createElement('p', { className: 'zz-419-probe' }, `ZZ 419 probe ${props.hook}`);
		}
		names.forEach((hook) => {
			counts[hook] = { fired: 0, mounted: 0, unmounted: 0 };
			window.typostHooks.addAction(hook, (container) => {
				counts[hook].fired++;
				wp.element.render(wp.element.createElement(Probe, { hook }), container);
			});
		});
	}, hooks);
}

function probeCounts(page) {
	return page.evaluate(() => JSON.parse(JSON.stringify(window.__zz419probe)));
}

test('The Paragraph Styles panel calls the state filter while the inline dialog is open, and not after it closes', async ({ page }) => {
	const style = await createStyle(page, 'inline');
	await openDraft(page);
	const clientId = await insertBlock(page, 'core/paragraph', { content: styledContent(style.id) });
	await select(page, clientId, ...GARDEN);
	const dialog = await openInlineDialog(page, style.name);

	// Open: the panel follows the store, and its "different from the style"
	// line updates (QA findings PS-1/PS-1b; the "(modified)" badge until #452)
	expect(await callsAfterStoreChanges(page)).toBeGreaterThan(0);
	await dialog.getByRole('checkbox', { name: 'Discretionary Ligatures' }).check();
	await expect(dialog.locator('.typost-ps-panel .typost-ps-status')).toHaveText('This text is different from the style.');

	await closeDialog(page, dialog);
	expect(await callsAfterStoreChanges(page)).toBe(0);
});

test('After 10 opens and closes of the inline dialog, one Paragraph Styles panel follows the store', async ({ page }) => {
	const style = await createStyle(page, 'ten');
	await openDraft(page);
	const clientId = await insertBlock(page, 'core/paragraph', { content: styledContent(style.id) });
	await select(page, clientId, ...GARDEN);

	let dialog = await openInlineDialog(page, style.name);
	// The panel checks once more 150 ms after it mounts: let that pass
	await page.waitForTimeout(500);
	const onePanel = await callsAfterStoreChanges(page);
	expect(onePanel).toBeGreaterThan(0);
	await closeDialog(page, dialog);
	for (let i = 0; i < 9; i++) {
		dialog = await openInlineDialog(page, style.name);
		await closeDialog(page, dialog);
	}
	expect(await callsAfterStoreChanges(page)).toBe(0);

	// Open again: no more calls than with one panel (each mounted panel
	// calls once per store change: 10 panels left mounted call 10 times)
	dialog = await openInlineDialog(page, style.name);
	await page.waitForTimeout(500);
	const reopened = await callsAfterStoreChanges(page);
	expect(reopened).toBeGreaterThan(0);
	expect(reopened).toBeLessThanOrEqual(onePanel);
});

test('The Paragraph Styles panel stops calling the state filter after the Quick Feature Toggles close', async ({ page }) => {
	const style = await createStyle(page, 'qft');
	await openDraft(page);
	const clientId = await insertBlock(page, 'typost/block', { content: styledContent(style.id) });
	await select(page, clientId, ...GARDEN);
	const modal = await openQuickFeatureToggles(page, style.name);
	expect(await callsAfterStoreChanges(page)).toBeGreaterThan(0);

	await closeDialog(page, modal);
	expect(await callsAfterStoreChanges(page)).toBe(0);
});

test('The sidebar\'s Paragraph Styles panel stops calling the state filter when the sidebar shows another block', async ({ page }) => {
	const style = await createStyle(page, 'sidebar');
	await openDraft(page);
	const other = await insertBlock(page, 'core/paragraph', { content: 'Another block' });
	const clientId = await insertBlock(page, 'typost/block', { content: TEXT, styleClass: `typost-ps-${style.id}`, fontWeight: '700' });
	await page.evaluate((id) => wp.data.dispatch('core/block-editor').selectBlock(id), clientId);
	await page.evaluate(() => wp.data.dispatch('core/edit-post').openGeneralSidebar('edit-post/block'));
	await expect(page.locator('[data-hook="typost_inspector_top"] .typost-ps-badge-name')).toHaveText(style.name);
	expect(await callsAfterStoreChanges(page)).toBeGreaterThan(0);

	await page.evaluate((id) => wp.data.dispatch('core/block-editor').selectBlock(id), other);
	await expect(page.locator('[data-hook="typost_inspector_top"]')).toHaveCount(0);
	await page.waitForTimeout(300);
	expect(await callsAfterStoreChanges(page)).toBe(0);
});

// A font with variable axes that has an axis other than weight (the Variable
// Fonts module renders that axis in the sidebar), or null
function variableFont(page) {
	return page.evaluate(() => {
		const axes = (window.typostData && window.typostData.variableFontAxes) || {};
		for (const id of Object.keys(axes)) {
			const axis = (axes[id] || []).find((a) => a.tag !== 'wght' && a.max > a.min);
			if (axis) {
				return { id: Number(id), axis };
			}
		}
		return null;
	});
}

// The sidebar's slider for `axis`
function sidebarAxis(page, axis) {
	return page.locator('[data-hook="typost_inspector_after_font_weight"] .typost-vf-axis')
		.filter({ hasText: axis.name || axis.tag });
}

// Set the axis on the selected block with a quick button, and return the
// value the slider shows then
async function setAxisInSidebar(page, clientId, font) {
	const slider = sidebarAxis(page, font.axis);
	await expect(slider.locator('input[type="number"]')).toHaveValue(String(font.axis.default));
	await slider.locator('.typost-vf-quick-btn:not(.is-active)').last().click();
	await expect.poll(() => page.evaluate((id) => wp.data.select('core/block-editor').getBlockAttributes(id).fontVariationSettings, clientId))
		.toContain(font.axis.tag);
	const value = await slider.locator('input[type="number"]').inputValue();
	expect(value).not.toBe(String(font.axis.default));
	return value;
}

async function showInSidebar(page, clientId) {
	await page.evaluate((id) => wp.data.dispatch('core/block-editor').selectBlock(id), clientId);
	await page.evaluate(() => wp.data.dispatch('core/edit-post').openGeneralSidebar('edit-post/block'));
}

test('The sidebar\'s Variable Fonts axes start from the selected block after the sidebar showed another block', async ({ page }) => {
	await openDraft(page);
	const font = await variableFont(page);
	test.skip(!font, 'This site has no variable font with an axis other than weight');
	const other = await insertBlock(page, 'core/paragraph', { content: 'Another block' });
	const first = await insertBlock(page, 'typost/block', { content: 'Alpha', fontId: font.id });
	const second = await insertBlock(page, 'typost/block', { content: 'Bravo', fontId: font.id });

	await showInSidebar(page, first);
	await setAxisInSidebar(page, first, font);

	// The sidebar shows a block without the axes: the axes panel leaves
	await showInSidebar(page, other);
	await expect(page.locator('[data-hook="typost_inspector_after_font_weight"]')).toHaveCount(0);
	await page.waitForTimeout(300);

	// A block in the same font with no axis settings shows the defaults, not
	// the values set on the first block
	await showInSidebar(page, second);
	await expect(sidebarAxis(page, font.axis).locator('input[type="number"]')).toHaveValue(String(font.axis.default));
});

test('The sidebar\'s Variable Fonts axes start from the selected block when the sidebar goes from one block to another in the same font', async ({ page }) => {
	await openDraft(page);
	const font = await variableFont(page);
	test.skip(!font, 'This site has no variable font with an axis other than weight');
	const first = await insertBlock(page, 'typost/block', { content: 'Alpha', fontId: font.id });
	const second = await insertBlock(page, 'typost/block', { content: 'Bravo', fontId: font.id });

	await showInSidebar(page, first);
	await setAxisInSidebar(page, first, font);

	// One store change: the first block's panel leaves and the second
	// block's panel mounts in the same commit
	await showInSidebar(page, second);
	await expect(sidebarAxis(page, font.axis).locator('input[type="number"]')).toHaveValue(String(font.axis.default));
	await page.waitForTimeout(500);
	await expect(sidebarAxis(page, font.axis).locator('input[type="number"]')).toHaveValue(String(font.axis.default));
});

test('An extension that renders into hook containers keeps working, and is unmounted only when the dialog closes', async ({ page }) => {
	const inlineHooks = [ 'typost_inline_after_features', 'typost_inline_modal_bottom' ];
	const qftHooks = [ 'typost_qft_after_features' ];
	await openDraft(page);
	await plantExtension(page, inlineHooks.concat(qftHooks));

	// The inline dialog
	const paragraph = await insertBlock(page, 'core/paragraph', { content: TEXT });
	await select(page, paragraph, ...GARDEN);
	await page.getByRole('button', { name: 'Typography Stylist Features' }).click();
	const dialog = inlineDialog(page);
	await expect(dialog).toBeVisible();
	for (const hook of inlineHooks) {
		await expect(dialog.locator(`[data-hook="${hook}"] .zz-419-probe`)).toHaveText(`ZZ 419 probe ${hook}`);
	}
	// A change re-renders the dialog: the containers stay, and so do the roots
	await dialog.getByRole('checkbox', { name: 'Discretionary Ligatures' }).check();
	await page.waitForTimeout(500);
	let counts = await probeCounts(page);
	for (const hook of inlineHooks) {
		expect(counts[hook], hook).toEqual({ fired: 1, mounted: 1, unmounted: 0 });
	}
	await closeDialog(page, dialog);
	counts = await probeCounts(page);
	for (const hook of inlineHooks) {
		expect(counts[hook], hook).toEqual({ fired: 1, mounted: 1, unmounted: 1 });
	}

	// The Quick Feature Toggles
	const block = await insertBlock(page, 'typost/block', { content: TEXT });
	await select(page, block, ...GARDEN);
	const button = page.getByRole('button', { name: 'Typography Stylist Features' });
	if (!(await button.isVisible())) {
		await page.keyboard.press('Alt+F10');
	}
	await button.click();
	const modal = page.locator('.typost-block-modal');
	await expect(modal).toBeVisible();
	await expect(modal.locator('[data-hook="typost_qft_after_features"] .zz-419-probe')).toHaveText('ZZ 419 probe typost_qft_after_features');
	await page.waitForTimeout(500);
	expect((await probeCounts(page)).typost_qft_after_features).toEqual({ fired: 1, mounted: 1, unmounted: 0 });
	await closeDialog(page, modal);
	expect((await probeCounts(page)).typost_qft_after_features).toEqual({ fired: 1, mounted: 1, unmounted: 1 });
});
