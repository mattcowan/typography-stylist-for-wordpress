#!/usr/bin/env node
/**
 * Writes the saved-markup fixtures (#373) from the real editor.
 *
 * Usage, from the plugin folder, with WordPress and this plugin running (a
 * fresh wp-env site is best, see README.md):
 *
 *   npm run build
 *   WP_BASE_URL=http://localhost:8888 WP_USERNAME=admin WP_PASSWORD=password \
 *     node tests/e2e/fixtures/saved-markup/generate.js [--without-inline | file …]
 *
 * With file names, only those fixtures are written. With --without-inline,
 * every file except the two that a site with SCRIPT_DEBUG on (wp-env)
 * cannot generate (README.md, "A known limit"). Nothing is written unless
 * every requested file was generated, so a failed run leaves the fixtures
 * as they were. Every file is the
 * content the editor saves, read from the editor (getEditedPostContent())
 * after the editor has settled; no markup is typed by hand:
 *
 * - v1 / v2: the frozen save() of the deprecated entry in
 *   blocks/typography-stylist/deprecated.js, run in the editor page, and
 *   serialized with core's own serializer. The ".after" files are what the
 *   editor writes back after it opens the old markup.
 * - Typography Stylist blocks: the block is inserted with its attributes,
 *   the values the Inspector controls set, and the editor's save() writes
 *   it. Fit to width: the editor measures the lines.
 * - Paragraph styles, Detach and inline spans: through the editor's own
 *   controls (the sidebar Paragraph Style select, Detach Style, the inline
 *   Typography Stylist Features dialog, and the style browser of the block
 *   toolbar's Paragraph Styles button).
 * - The px inline span is written with the "Write new font sizes in px"
 *   setting simulated in the page (typostData.newFontSizeUnit = 'px', the
 *   value that setting sends to the editor), so the site's option is never
 *   changed.
 *
 * The script makes drafts and paragraph styles named "ZZ E2E fixture …"
 * and deletes each by its ID. A style's ID is written as {{STYLE_ID}}.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { chromium } = require('@playwright/test');
const { STYLE_ID_TOKEN, STYLE, FIXTURES, REGISTERED_FILE, REGISTERED_BLOCKS } = require('./manifest');

const BASE = process.env.WP_BASE_URL;
const DIR = __dirname;
const TEXT = 'Moonlit garden party';
// "garden" and "party" in TEXT
const GARDEN = [ 8, 14 ];
const PARTY = [ 15, 20 ];

// A style with a fixed size, for the fixed-size inline span: Detach writes
// the style's size onto the text
const FIXED_SIZE_STYLE = { name: 'ZZ E2E fixture fixed size', properties: { fontSize: '64', fontSizeUnit: 'rem' } };

function fail(message) {
	throw new Error(message);
}

async function apiFetch(page, options) {
	return page.evaluate((o) => wp.apiFetch(o), options);
}

async function openEditor(page, postId) {
	const url = postId ? `${BASE}/wp-admin/post.php?post=${postId}&action=edit` : `${BASE}/wp-admin/post-new.php`;
	await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 180000 });
	await page.waitForFunction(() => window.wp && wp.data && window.typostHooks && wp.data.select('core/editor') &&
		wp.data.select('core/editor').__unstableIsEditorReady(), null, { timeout: 180000 });
	await page.evaluate(() => wp.data.dispatch('core/preferences').set('core/edit-post', 'welcomeGuide', false));
	const guide = page.locator('.edit-post-welcome-guide');
	if (await guide.count()) {
		await guide.getByRole('button', { name: 'Close' }).first().click();
	}
	await page.waitForSelector('iframe[name="editor-canvas"]');
}

// Delete the post the editor holds (post-new.php makes an auto-draft)
async function deleteCurrentPost(page) {
	const postId = await page.evaluate(() => wp.data.select('core/editor').getCurrentPostId()).catch(() => null);
	if (postId) {
		await apiFetch(page, { path: `/wp/v2/posts/${postId}?force=true`, method: 'DELETE' }).catch(() => {});
	}
}

// The content once the editor stops changing it (fit blocks measure after
// the fonts load)
async function settledContent(page) {
	await page.frameLocator('iframe[name="editor-canvas"]').locator('body').evaluate((body) => body.ownerDocument.fonts.ready);
	let last = null;
	let stableSince = Date.now();
	const deadline = Date.now() + 30000;
	while (Date.now() < deadline) {
		const content = await page.evaluate(() => wp.data.select('core/editor').getEditedPostContent());
		if (content !== last) {
			last = content;
			stableSince = Date.now();
		} else if (Date.now() - stableSince >= 2000) {
			return content;
		}
		await page.waitForTimeout(250);
	}
	fail('The editor content did not settle');
}

function insertBlocks(page, blocks) {
	return page.evaluate((list) => {
		const created = list.map(([ name, attributes ]) => wp.blocks.createBlock(name, attributes));
		wp.data.dispatch('core/block-editor').insertBlocks(created);
		return created.map((block) => block.clientId);
	}, blocks);
}

function editable(page, clientId) {
	return page.frameLocator('iframe[name="editor-canvas"]')
		.locator(`[data-block="${clientId}"][contenteditable="true"], [data-block="${clientId}"] [contenteditable="true"]`)
		.first();
}

function selectionOffsets(page) {
	return page.evaluate(() => {
		const s = wp.data.select('core/block-editor');
		return [ s.getSelectionStart().offset, s.getSelectionEnd().offset ];
	});
}

// Press `key` until the store reports `done(offsets)`. At the edge of a
// styled span the first press only crosses the format boundary, so the
// number of presses is not the number of characters.
async function pressUntil(page, key, done, maxPresses) {
	for (let i = 0; i < maxPresses; i++) {
		const before = await selectionOffsets(page);
		if (done(before)) {
			return;
		}
		await page.keyboard.press(key);
		for (let tries = 0; tries < 50; tries++) {
			const after = await selectionOffsets(page);
			if (after[0] !== before[0] || after[1] !== before[1]) {
				break;
			}
			await page.waitForTimeout(20);
		}
	}
}

// Select [start, end) with the keyboard and check the store has it
async function selectText(page, clientId, [ start, end ]) {
	await editable(page, clientId).click();
	await page.keyboard.press('Home');
	await page.waitForTimeout(200);
	await pressUntil(page, 'ArrowRight', ([ caret ]) => caret >= start, start * 2 + 2);
	await pressUntil(page, 'Shift+ArrowRight', ([ , focus ]) => focus >= end, (end - start) * 2 + 2);
	await page.waitForTimeout(300);
	const offsets = await selectionOffsets(page);
	if (offsets[0] !== start || offsets[1] !== end) {
		fail(`Selection is ${offsets}, not ${[ start, end ]}`);
	}
}

function blockContent(page, clientId) {
	return page.evaluate((id) => String(wp.data.select('core/block-editor').getBlockAttributes(id).content), clientId);
}

async function waitForContent(page, clientId, test, what) {
	const deadline = Date.now() + 15000;
	let content = '';
	while (Date.now() < deadline) {
		content = await blockContent(page, clientId);
		if (test(content)) {
			// Let the debounced applies finish
			await page.waitForTimeout(1500);
			return blockContent(page, clientId);
		}
		await page.waitForTimeout(200);
	}
	fail(`${what}: the block content is ${content}`);
}

async function openInlineDialog(page) {
	await page.getByRole('button', { name: 'Typography Stylist Features' }).click();
	const modal = page.locator('.components-modal__frame').first();
	await modal.waitFor();
	return modal;
}

async function closeInlineDialog(page, modal) {
	await modal.getByRole('button', { name: 'Close', exact: true }).first().click();
	await page.locator('.components-modal__frame').waitFor({ state: 'detached' });
}

// Apply a style to the selected text with the inline dialog open: the event
// the style browser sends, built by the module's own function
// (typostPSUtils.buildApplyEventDetail). The style browser itself is not
// used: on a fresh wp-env site, a style picked in it from the inline dialog
// or from the block toolbar applied nothing when this was written (#373).
async function applyStyleToSelection(page, style) {
	const modal = await openInlineDialog(page);
	await page.evaluate((id) => {
		const resolved = window.typostData.paragraphStyles.find((s) => String(s.id) === String(id));
		if (!resolved) {
			throw new Error(`The editor does not know style ${id}`);
		}
		document.dispatchEvent(new CustomEvent('typost-apply-block-properties', {
			detail: window.typostPSUtils.buildApplyEventDetail(resolved, 'inline'),
		}));
	}, style.id);
	return modal;
}

async function createStyle(page, definition) {
	const style = await apiFetch(page, {
		path: '/typost/v1/paragraph-styles',
		method: 'POST',
		data: { name: `${definition.name} ${Date.now()}`, properties: definition.properties },
	});
	return style;
}

async function deleteStyle(page, style) {
	await apiFetch(page, { path: `/typost/v1/paragraph-styles/${style.id}`, method: 'DELETE' });
}

function tokenize(content, style) {
	const out = content
		.split(`typost-ps-${style.id}`).join(`typost-ps-${STYLE_ID_TOKEN}`)
		.split(`data-style-id="${style.id}"`).join(`data-style-id="${STYLE_ID_TOKEN}"`);
	if (!out.includes(STYLE_ID_TOKEN)) {
		fail('The content does not refer to the style');
	}
	return out;
}

// Old markup: the deprecated entry's own save(), and core's serializer for
// the block comment (an invalid block serializes its originalContent)
function oldMarkup(page, entryIndex, attributes) {
	return page.evaluate(({ index, attrs }) => {
		const type = wp.blocks.getBlockType('typost/block');
		const entry = type.deprecated[index];
		const built = Object.assign({}, type);
		[ 'attributes', 'supports', 'save', 'migrate', 'isEligible', 'apiVersion' ].forEach((key) => delete built[key]);
		Object.assign(built, entry);
		const full = {};
		Object.entries(entry.attributes).forEach(([ key, schema ]) => {
			if ('default' in schema) {
				full[key] = schema.default;
			}
		});
		Object.assign(full, attrs);
		const unknown = Object.keys(attrs).filter((key) => !(key in entry.attributes));
		if (unknown.length) {
			throw new Error(`Not in the entry's schema: ${unknown}`);
		}
		const block = wp.blocks.createBlock('typost/block', attrs);
		block.isValid = false;
		block.originalContent = wp.blocks.getSaveContent(built, full);
		return wp.blocks.serialize(block);
	}, { index: entryIndex, attrs: attributes });
}

// What the editor writes back for `markup` once anything in the post is
// edited: store it, open it, and hand the blocks back to the editor as an
// edit does (until then the editor keeps the stored content as it is)
async function writtenBack(page, markup) {
	const post = await apiFetch(page, { path: '/wp/v2/posts', method: 'POST', data: { title: 'ZZ E2E fixture', status: 'draft', content: markup } });
	try {
		await openEditor(page, post.id);
		await settledContent(page);
		await page.evaluate(() => wp.data.dispatch('core/editor').resetEditorBlocks(wp.data.select('core/block-editor').getBlocks().slice()));
		return await settledContent(page);
	} finally {
		await apiFetch(page, { path: `/wp/v2/posts/${post.id}?force=true`, method: 'DELETE' });
	}
}

// One block with attributes, saved by the current save()
async function currentBlock(page, attributes) {
	await openEditor(page);
	try {
		await insertBlocks(page, [ [ 'typost/block', Object.assign({ content: TEXT }, attributes) ] ]);
		return await settledContent(page);
	} finally {
		await deleteCurrentPost(page);
	}
}

const V2 = 0;
const V1 = 1;
const V1_ATTRIBUTES = { content: TEXT, fontSize: '24', features: [ 'dlig' ], letterSpacing: 20 };
const V2_ATTRIBUTES = { content: TEXT, fontSize: 'responsive', fontSizeMin: 20, fontSizePreferred: 32, fontSizeMax: 72 };

const GENERATORS = {
	'v1-fixed-px.html': (page) => oldMarkup(page, V1, V1_ATTRIBUTES),
	'v1-fixed-px.after.html': async (page) => writtenBack(page, await oldMarkup(page, V1, V1_ATTRIBUTES)),
	'v2-responsive-px.html': (page) => oldMarkup(page, V2, V2_ATTRIBUTES),
	'v2-responsive-px.after.html': async (page) => writtenBack(page, await oldMarkup(page, V2, V2_ATTRIBUTES)),
	// 16/16/120: the slope is limited so the text doubles at 500% zoom
	'responsive-rem.html': (page) => currentBlock(page, { fontSize: 'responsive', fontSizeMin: 16, fontSizePreferred: 16, fontSizeMax: 120 }),
	'fit-rem-word-sizes.html': async (page) => {
		const content = await currentBlock(page, { content: 'Moonlit garden<br>party tonight', fontSize: 'fit' });
		if (!/"fitWordSizes":\[[^\]]/.test(content)) {
			fail('The fit block has no word sizes');
		}
		return content;
	},
	'first-letter-hang.html': (page) => currentBlock(page, { initialHang: 0.12 }),
	'case.html': (page) => currentBlock(page, { textCase: 'small-caps', fakeSmallCaps: false }),
	// The block under a style, then the same block after Detach Style
	'style-class.html': (page) => styledBlock(page, false),
	'after-detach.html': (page) => styledBlock(page, true),
	'inline-spans.html': inlineSpans,
	'inline-style-id.html': inlineStyleId,
};

// These apply a paragraph style to selected text, which the inline editor
// does not do on a site with SCRIPT_DEBUG on (README.md, "A known limit")
const NEEDS_SCRIPT_DEBUG_OFF = [ 'inline-spans.html', 'inline-style-id.html' ];
const WITHOUT_INLINE = '--without-inline';

async function styledBlock(page, detach) {
	const style = await createStyle(page, STYLE);
	try {
		await openEditor(page);
		const [ clientId ] = await insertBlocks(page, [ [ 'typost/block', { content: TEXT } ] ]);
		await editable(page, clientId).click();
		await page.getByRole('combobox', { name: 'Paragraph Style' }).selectOption(String(style.id));
		let content = await settledContent(page);
		if (!content.includes(`typost-ps-${style.id}`)) {
			fail('The style was not applied');
		}
		if (!detach) {
			return tokenize(content, style);
		}
		await page.getByRole('button', { name: 'Detach Style' }).first().click();
		content = await settledContent(page);
		if (content.includes('typost-ps-')) {
			fail('Detach left the style class');
		}
		return content;
	} finally {
		await deleteCurrentPost(page);
		await deleteStyle(page, style);
	}
}

async function applyResponsiveSize(page, modal) {
	await modal.getByRole('combobox', { name: 'Font Size' }).selectOption('responsive');
	await modal.getByRole('spinbutton', { name: 'Maximum Size (desktop)' }).fill('48');
}

// A heading with a rem size span and a case span, a paragraph with a px
// size span, and a paragraph with a fixed size span
async function inlineSpans(page) {
	const fixedStyle = await createStyle(page, FIXED_SIZE_STYLE);
	try {
		await openEditor(page);
		const [ heading, pxParagraph, fixedParagraph ] = await insertBlocks(page, [
			[ 'core/heading', { content: TEXT, level: 2 } ],
			[ 'core/paragraph', { content: TEXT } ],
			[ 'core/paragraph', { content: TEXT } ],
		]);

		await selectText(page, heading, GARDEN);
		let modal = await openInlineDialog(page);
		await applyResponsiveSize(page, modal);
		await waitForContent(page, heading, (c) => c.includes('data-fontsize-max="48"'), 'rem size');
		await closeInlineDialog(page, modal);

		await selectText(page, heading, PARTY);
		modal = await openInlineDialog(page);
		await modal.getByRole('combobox', { name: 'Case' }).selectOption('small-caps');
		await waitForContent(page, heading, (c) => c.includes('data-textcase="small-caps"'), 'case');
		await closeInlineDialog(page, modal);

		await page.evaluate(() => { window.typostData.newFontSizeUnit = 'px'; });
		await selectText(page, pxParagraph, GARDEN);
		modal = await openInlineDialog(page);
		await applyResponsiveSize(page, modal);
		const px = await waitForContent(page, pxParagraph, (c) => c.includes('data-fontsize-max="48"'), 'px size');
		await closeInlineDialog(page, modal);
		await page.evaluate(() => { window.typostData.newFontSizeUnit = 'rem'; });
		if (!px.includes('48px')) {
			fail(`The px span is not in px: ${px}`);
		}

		await selectText(page, fixedParagraph, GARDEN);
		modal = await applyStyleToSelection(page, fixedStyle);
		await waitForContent(page, fixedParagraph, (c) => c.includes(`data-style-id="${fixedStyle.id}"`), 'fixed size style');
		await closeInlineDialog(page, modal);
		await selectText(page, fixedParagraph, GARDEN);
		modal = await openInlineDialog(page);
		await modal.getByRole('button', { name: 'Detach Style' }).click();
		const fixed = await waitForContent(page, fixedParagraph, (c) => !c.includes('data-style-id') && c.includes('font-size'), 'Detach');
		await closeInlineDialog(page, modal);
		if (!fixed.includes('data-fontsize="64"')) {
			fail(`The detached span has no fixed size: ${fixed}`);
		}

		return await settledContent(page);
	} finally {
		await deleteCurrentPost(page);
		await deleteStyle(page, fixedStyle);
	}
}

async function inlineStyleId(page) {
	const style = await createStyle(page, STYLE);
	try {
		await openEditor(page);
		const [ paragraph ] = await insertBlocks(page, [ [ 'core/paragraph', { content: TEXT } ] ]);
		await selectText(page, paragraph, GARDEN);
		const modal = await applyStyleToSelection(page, style);
		await waitForContent(page, paragraph, (c) => c.includes(`data-style-id="${style.id}"`), 'style');
		await closeInlineDialog(page, modal);
		return tokenize(await settledContent(page), style);
	} finally {
		await deleteCurrentPost(page);
		await deleteStyle(page, style);
	}
}

(async () => {
	if (!BASE) {
		fail('Set WP_BASE_URL, WP_USERNAME and WP_PASSWORD');
	}
	const args = process.argv.slice(2);
	const withoutInline = args.includes(WITHOUT_INLINE);
	const only = args.filter((arg) => arg !== WITHOUT_INLINE);
	if (withoutInline && only.length) {
		fail(`Give ${WITHOUT_INLINE} or file names, not both`);
	}
	const files = only.length
		? only
		: Object.keys(GENERATORS).filter((file) => !withoutInline || !NEEDS_SCRIPT_DEBUG_OFF.includes(file));
	files.forEach((file) => {
		if (!GENERATORS[file]) {
			fail(`No generator for ${file}`);
		}
	});
	const missing = FIXTURES.map((f) => f.file).filter((file) => !GENERATORS[file]);
	if (missing.length) {
		fail(`No generator for ${missing}`);
	}

	const browser = await chromium.launch();
	const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
	page.on('dialog', (dialog) => dialog.accept());
	try {
		await page.goto(`${BASE}/wp-login.php`, { timeout: 180000 });
		await page.fill('#user_login', process.env.WP_USERNAME);
		await page.fill('#user_pass', process.env.WP_PASSWORD);
		await page.click('#wp-submit');
		await page.waitForURL(`${BASE}/wp-admin/**`, { timeout: 180000 });
		await openEditor(page);
		const unit = await page.evaluate(() => window.typostData.newFontSizeUnit);
		// The attributes each block type has here. The spec leaves out of
		// its comparison any attribute that another plugin adds on its site
		// (see README.md), so this must be a site with this plugin only.
		const registered = await page.evaluate((names) => Object.fromEntries(names.map((name) =>
			[ name, Object.keys(wp.blocks.getBlockType(name).attributes) ])), REGISTERED_BLOCKS);
		await deleteCurrentPost(page);
		if (unit !== 'rem') {
			fail('This site writes new font sizes in px. The fixtures are for the default setting (rem).');
		}
		// Generate every file first and write only when all are ready: a
		// failure part of the way must not leave a set that is half new.
		const generated = [];
		if (!only.length) {
			generated.push([ REGISTERED_FILE, `${JSON.stringify(registered, null, '\t')}\n` ]);
		}
		for (const file of files) {
			let content;
			try {
				content = await GENERATORS[file](page);
			} catch (error) {
				const hint = NEEDS_SCRIPT_DEBUG_OFF.includes(file)
					? ` A site with SCRIPT_DEBUG on (wp-env) cannot generate this file: run with ${WITHOUT_INLINE} there, and see "A known limit" in README.md.`
					: '';
				fail(`${file} was not generated, and no file was written.${hint}\n${error.stack || error}`);
			}
			generated.push([ file, content ]);
			process.stdout.write(`generated ${file}\n`);
		}
		generated.forEach(([ file, content ]) => {
			fs.writeFileSync(path.join(DIR, file), content);
			process.stdout.write(`wrote ${file}\n`);
		});
	} finally {
		await page.close({ runBeforeUnload: false });
		await browser.close();
	}
})().catch((error) => {
	process.stderr.write(`${error.stack || error}\n`);
	process.exit(1);
});
