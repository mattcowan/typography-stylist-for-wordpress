/**
 * The bundled modules render with wp.element.createRoot() where WordPress
 * has it, and with wp.element.render() where it does not (#456).
 *
 * React 19 removes ReactDOM.render() and unmountComponentAtNode(), and the
 * React 18 development build logs "ReactDOM.render is no longer supported"
 * for each call. Core unmounts only a render() root in a hook container
 * (#419), so each module unmounts its own createRoot() roots when their
 * container leaves the page.
 *
 * A page script runs before the page's scripts. It replaces wp.element, when
 * WordPress sets it, with a copy that records each root a module makes with
 * createRoot() and whether it was unmounted, and it records the React
 * messages about render() and unmountComponentAtNode() with the module whose
 * call caused them. The first test also removes render() and
 * unmountComponentAtNode() from the copy, as React 19 does, before any
 * module runs.
 *
 * Each test walks the inline dialog (with the Glyphs panel, whose close
 * opens the dialog again), the Quick Feature Toggles and the block sidebar,
 * and counts the Paragraph Styles panel's calls to the
 * typost_current_editor_state filter, as hook-container-unmount.spec.js
 * does: the panel follows the store while it is on the page, and stops
 * when it leaves. The messages are logged only by React's development build
 * (SCRIPT_DEBUG, which wp-env turns on).
 *
 * Each test works on its own draft post and paragraph style ("ZZ #456 …");
 * afterEach deletes them without the test's page.
 */
const { test, expect } = require('@playwright/test');
const { openNewPost, editable, select, rest, deleteWithoutPage } = require('./helpers');

test.setTimeout(180000);

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

// Runs in the page before its scripts (page.addInitScript)
function pageScript(removeLegacy) {
	Error.stackTraceLimit = 80;
	const record = { roots: [], messages: [], skippedActions: 0 };
	window.__zz456 = record;
	const MODULE = /\/(paragraph-styles|variable-fonts|glyphs-panel)\/assets\/js\//;
	const moduleOf = (stack) => {
		const match = MODULE.exec(stack);
		return match ? match[1] : null;
	};

	const consoleError = console.error;
	console.error = function(...args) {
		const text = args.map(String).join(' ');
		if (/ReactDOM\.render is no longer supported|unmountComponentAtNode is deprecated|synchronously unmount a root/.test(text)) {
			record.messages.push({ text: text.slice(0, 100), module: moduleOf(String(new Error().stack)) });
		}
		return consoleError.apply(this, args);
	};

	// A copy of wp.element: its exports are getters that cannot be changed
	function wrap(element) {
		const copy = {};
		Object.keys(element).forEach((key) => {
			copy[key] = element[key];
		});
		const createRoot = element.createRoot;
		if (typeof createRoot === 'function') {
			copy.createRoot = function(container, options) {
				const root = createRoot(container, options);
				const module = moduleOf(String(new Error().stack));
				if (module) {
					const entry = { module, container, unmounted: false };
					record.roots.push(entry);
					const unmount = root.unmount.bind(root);
					root.unmount = function() {
						entry.unmounted = true;
						return unmount();
					};
				}
				return root;
			};
		}
		if (removeLegacy) {
			copy.render = undefined;
			copy.unmountComponentAtNode = undefined;
		}
		return copy;
	}

	// Another extension active on the site may still render with render(),
	// and its error would stop the dialog: with render() removed, only this
	// plugin's scripts add hook actions (wp-env has no other extension)
	if (removeLegacy) {
		const OWN = /\/(paragraph-styles|variable-fonts|glyphs-panel)\/assets\/js\/|\/assets\/js\/block-editor(\.min)?\.js|\/blocks\/typography-stylist\/build\//;
		let hooks;
		Object.defineProperty(window, 'typostHooks', {
			configurable: true,
			enumerable: true,
			get: () => hooks,
			set(value) {
				hooks = value;
				if (hooks && typeof hooks.addAction === 'function' && !hooks.addAction.zz456) {
					const addAction = hooks.addAction;
					hooks.addAction = function() {
						if (!OWN.test(String(new Error().stack))) {
							record.skippedActions++;
							return undefined;
						}
						return addAction.apply(this, arguments);
					};
					hooks.addAction.zz456 = true;
				}
			},
		});
	}

	// wp-element runs `(window.wp ||= {}).element = …`
	let wp;
	Object.defineProperty(window, 'wp', {
		configurable: true,
		enumerable: true,
		get: () => wp,
		set(value) {
			wp = value;
			if (wp && !Object.prototype.hasOwnProperty.call(wp, '__zz456')) {
				Object.defineProperty(wp, '__zz456', { value: true });
				let element;
				Object.defineProperty(wp, 'element', {
					configurable: true,
					enumerable: true,
					get: () => element,
					set(next) {
						element = next ? wrap(next) : next;
					},
				});
			}
		},
	});
}

// The roots and messages the page script recorded
function recorded(page) {
	return page.evaluate(() => ({
		roots: window.__zz456.roots.map((entry) => {
			const hook = entry.container.closest('[data-hook]');
			return {
				module: entry.module,
				where: hook ? hook.getAttribute('data-hook') : entry.container.className,
				connected: entry.container.isConnected,
				unmounted: entry.unmounted,
			};
		}),
		messages: window.__zz456.messages,
		skippedActions: window.__zz456.skippedActions,
	}));
}

// A paragraph style that exists before the editor loads
async function createStyle(page, label) {
	const style = await rest(page, 'POST', '/typost/v1/paragraph-styles', {
		name: `ZZ #456 ${label} ${Date.now()}`,
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
		if (!window.__zz456calls) {
			const hooks = window.typostHooks;
			const original = hooks.applyFilters;
			window.__zz456calls = { calls: 0 };
			hooks.applyFilters = function(name) {
				if (name === 'typost_current_editor_state' && /paragraph-styles\//.test(String(new Error().stack))) {
					window.__zz456calls.calls++;
				}
				return original.apply(this, arguments);
			};
		}
		window.__zz456calls.calls = 0;
	});
}

// Change the editor's stores five times (the post title; it moves no
// selection), and return the counted calls
async function callsAfterStoreChanges(page) {
	await countPanelCalls(page);
	for (let i = 0; i < 5; i++) {
		await page.evaluate((n) => wp.data.dispatch('core/editor').editPost({ title: `ZZ #456 title ${n}` }), i);
	}
	await page.waitForTimeout(300);
	return page.evaluate(() => window.__zz456calls.calls);
}

// The inline dialog (its heading names it), not another plugin modal
function inlineDialog(page) {
	return page.getByRole('dialog', { name: 'Typography Stylist', exact: true });
}

async function closeDialog(page, dialog) {
	await dialog.getByRole('button', { name: 'Close', exact: true }).first().click();
	await expect(dialog).toHaveCount(0);
	// The unmount waits for the end of the close's commit
	await page.waitForTimeout(300);
}

async function showInSidebar(page, clientId) {
	await page.evaluate((id) => wp.data.dispatch('core/block-editor').selectBlock(id), clientId);
	await page.evaluate(() => wp.data.dispatch('core/edit-post').openGeneralSidebar('edit-post/block'));
}

// The inline dialog, the Glyphs panel, the Quick Feature Toggles and the
// sidebar, each opened and closed, with the Paragraph Styles panel checked
// on each
async function walkThroughEditors(page, style) {
	// The inline dialog on a core Paragraph
	const paragraph = await insertBlock(page, 'core/paragraph', { content: styledContent(style.id) });
	await select(page, paragraph, ...GARDEN);
	const openButton = page.getByRole('button', { name: 'Typography Stylist Features' });
	await openButton.click();
	let dialog = inlineDialog(page);
	await expect(dialog.locator('.typost-ps-badge-name')).toHaveText(style.name);
	expect(await callsAfterStoreChanges(page), 'inline dialog open').toBeGreaterThan(0);
	await closeDialog(page, dialog);
	expect(await callsAfterStoreChanges(page), 'inline dialog closed').toBe(0);

	// The Glyphs panel takes the dialog's place, and its close opens the
	// dialog again, which fires typost_inline_modal_opened: the Paragraph
	// Styles panel renders into the new dialog's container, once
	await openButton.click();
	dialog = inlineDialog(page);
	await dialog.locator('.typost-glyphs-open-button').click();
	const glyphs = page.locator('.typost-glyphs-modal');
	await expect(glyphs).toBeVisible();
	await glyphs.getByRole('button', { name: 'Close', exact: true }).first().click();
	await expect(page.locator('.typost-glyphs-modal-root')).toHaveCount(0);
	await expect(dialog.locator('.typost-ps-panel')).toHaveCount(1);
	await closeDialog(page, dialog);

	// The Quick Feature Toggles of a Typography Stylist block
	const block = await insertBlock(page, 'typost/block', { content: styledContent(style.id) });
	await select(page, block, ...GARDEN);
	const button = page.getByRole('button', { name: 'Typography Stylist Features' });
	if (!(await button.isVisible())) {
		await page.keyboard.press('Alt+F10');
	}
	await button.click();
	const modal = page.locator('.typost-block-modal');
	await expect(modal.locator('.typost-ps-badge-name')).toHaveText(style.name);
	await expect(modal.locator('.typost-glyphs-open-button')).toBeVisible();
	expect(await callsAfterStoreChanges(page), 'Quick Feature Toggles open').toBeGreaterThan(0);
	await closeDialog(page, modal);

	// The block sidebar, then another block in it
	const styled = await insertBlock(page, 'typost/block', { content: TEXT, styleClass: `typost-ps-${style.id}`, fontWeight: '700' });
	await showInSidebar(page, styled);
	await expect(page.locator('[data-hook="typost_inspector_top"] .typost-ps-badge-name')).toHaveText(style.name);
	expect(await callsAfterStoreChanges(page), 'sidebar').toBeGreaterThan(0);
	await showInSidebar(page, paragraph);
	await expect(page.locator('[data-hook="typost_inspector_top"]')).toHaveCount(0);
	await page.waitForTimeout(300);
	expect(await callsAfterStoreChanges(page), 'every panel left').toBe(0);
}

// A font with variable axes that has an axis other than weight, or null
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

// Every module root whose container left the page was unmounted, and
// every module that rendered made its roots with createRoot()
function expectRootsReleased(roots, modules) {
	expect(roots.filter((root) => !root.connected && !root.unmounted), 'roots left mounted').toEqual([]);
	modules.forEach((module) => {
		expect(roots.filter((root) => root.module === module).length, `${module} roots`).toBeGreaterThan(0);
	});
}

test('With no render() and no unmountComponentAtNode() (React 19), the modules show their panels and the Glyphs button, and unmount them', async ({ page }) => {
	const errors = [];
	page.on('pageerror', (error) => errors.push(error.message));
	await page.addInitScript(pageScript, true);
	const style = await createStyle(page, 'react 19');
	await openDraft(page);
	expect(await page.evaluate(() => [ typeof wp.element.render, typeof wp.element.unmountComponentAtNode, typeof wp.element.createRoot ]))
		.toEqual([ 'undefined', 'undefined', 'function' ]);

	await walkThroughEditors(page, style);

	// The Variable Fonts axes in the sidebar, when the site has a font with
	// an axis other than weight
	const font = await variableFont(page);
	if (font) {
		const block = await insertBlock(page, 'typost/block', { content: 'Alpha', fontId: font.id });
		await showInSidebar(page, block);
		await expect(page.locator('[data-hook="typost_inspector_after_font_weight"] .typost-vf-axis')
			.filter({ hasText: font.axis.name || font.axis.tag })).toBeVisible();
		const other = await insertBlock(page, 'core/paragraph', { content: 'Another block' });
		await showInSidebar(page, other);
		await expect(page.locator('[data-hook="typost_inspector_after_font_weight"]')).toHaveCount(0);
		await page.waitForTimeout(300);
	}

	const { roots, skippedActions } = await recorded(page);
	if (skippedActions) {
		test.info().annotations.push({ type: 'other extensions', description: `${skippedActions} hook actions of other scripts left out` });
	}
	expectRootsReleased(roots, font ? [ 'paragraph-styles', 'glyphs-panel', 'variable-fonts' ] : [ 'paragraph-styles', 'glyphs-panel' ]);
	expect(errors).toEqual([]);
});

test('With React 18, the modules render with createRoot() and the development build logs no render() deprecation from them', async ({ page }) => {
	await page.addInitScript(pageScript, false);
	const style = await createStyle(page, 'react 18');
	await openDraft(page);
	test.skip(await page.evaluate(() => typeof wp.element.createRoot !== 'function'), 'This WordPress has no createRoot() (before 6.2)');

	await walkThroughEditors(page, style);

	const { roots, messages } = await recorded(page);
	expectRootsReleased(roots, [ 'paragraph-styles', 'glyphs-panel' ]);
	expect(messages.filter((message) => message.module), 'React messages caused by a module').toEqual([]);
});
