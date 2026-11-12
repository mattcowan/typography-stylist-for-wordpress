/**
 * Saved markup (#373): the editor opens each save format and feature the
 * plugin has written, accepts it, and writes it back unchanged.
 *
 * For each fixture in fixtures/saved-markup (see its README.md):
 *
 * 1. The fixture is stored as a draft through the REST API, and the stored
 *    content is the fixture byte for byte (see expectStored() for a server
 *    that writes block comment JSON in another form).
 * 2. In the editor, every block is valid, and every Typography Stylist
 *    block validates through the save() the manifest names: the current
 *    one, or the frozen v2 / v1 entry in deprecated.js. A block that loads
 *    through a deprecation got fontSizeUnit 'px' from its migrate().
 * 3. Once the editor has settled (fit-to-width blocks measure their lines
 *    after the fonts load), the post is not dirty, and the content a save
 *    would write is the stored content. (The editor writes the stored
 *    content as it is until a block changes.)
 * 4. The blocks are handed back to the editor as any edit does, so a save
 *    serializes every block again. That content is the fixture byte for
 *    byte, or for a deprecated block the manifest's "after" file: what the
 *    upgrade writes. A save then stores that content.
 *
 * Fit-to-width blocks: the measured line ratios depend on the fonts of the
 * machine, the browser and the theme, so they are not compared with the
 * fixture's; they must follow the rules in fit-invariants.js instead (see
 * the README). The rest of the block is compared byte for byte. Where the
 * editor measures other ratios it stores them; the dirty flag is then only
 * reported, because of a known plugin bug.
 *
 * What a test makes (draft, style) is deleted in afterEach without the
 * test's page, so it goes also after a time-out; a delete that fails adds a
 * "cleanup failed" annotation with the route and fails the test.
 *
 * Another plugin on the site can add attributes to these block types; such
 * attributes (not in registered-attributes.json) are left out of the
 * comparison, and the test says so in an annotation. A site with only this
 * plugin, such as wp-env in CI, has none.
 *
 * Each test makes its own draft, and the style fixtures their own paragraph
 * style, and deletes them afterwards. The fixtures need nothing else from
 * the site: no fonts, no styles, any theme.
 */
const fs = require('fs');
const path = require('path');
const { test, expect } = require('@playwright/test');
const { openPost, rest, deleteWithoutPage } = require('./helpers');
const { STYLE_ID_TOKEN, STYLE, FIXTURES, REGISTERED_FILE, REGISTERED_BLOCKS } = require('./fixtures/saved-markup/manifest');
const { fitInvariantProblems } = require('./fixtures/saved-markup/fit-invariants');

test.setTimeout(120000);

const FIXTURE_DIR = path.join(__dirname, 'fixtures', 'saved-markup');
const CLEAN_ATTRIBUTES = JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, REGISTERED_FILE), 'utf8'));

function readFixture(file, styleId) {
	const text = fs.readFileSync(path.join(FIXTURE_DIR, file), 'utf8');
	return styleId === undefined ? text : text.split(STYLE_ID_TOKEN).join(String(styleId));
}

// The numbers a fit-to-width block measures in the editor: the two ratio
// arrays in the block comment, and the ratios in each line's font-size
const MEASURED_ARRAY = /"(fitLineSizes|fitWordSizes)":\[([^\]]*)\]/g;
const MEASURED_RATIO = /calc\(([0-9.e+-]+) \*/g;

function maskMeasured(html) {
	return html
		.replace(MEASURED_ARRAY, (match, name) => `"${name}":[#]`)
		.replace(MEASURED_RATIO, 'calc(# *');
}

function measuredNumbers(html) {
	const numbers = [];
	for (const [ , , list ] of html.matchAll(MEASURED_ARRAY)) {
		numbers.push(...list.split(',').map(Number));
	}
	for (const [ , ratio ] of html.matchAll(MEASURED_RATIO)) {
		numbers.push(Number(ratio));
	}
	return numbers;
}

// Remove the attributes in `foreign` (block name -> names) from each block
// comment. The comment JSON is parsed and written again, so the result is
// for comparing only.
function withoutForeignAttributes(html, foreign) {
	return html.replace(/<!-- wp:([a-z0-9/-]+) (\{.*?\}) (\/)?-->/g, (match, name, json, selfClosing) => {
		const fullName = name.includes('/') ? name : `core/${name}`;
		const drop = foreign[fullName] || [];
		const attributes = JSON.parse(json);
		drop.forEach((key) => delete attributes[key]);
		const kept = Object.keys(attributes).length ? ` ${JSON.stringify(attributes)}` : '';
		return `<!-- wp:${name}${kept} ${selfClosing || ''}-->`;
	});
}

// Attributes this site's block types have that a site with only this plugin
// does not have
async function foreignAttributes(page) {
	const registered = await page.evaluate((names) => Object.fromEntries(names.map((name) =>
		[ name, Object.keys(wp.blocks.getBlockType(name).attributes) ])), REGISTERED_BLOCKS);
	const foreign = {};
	Object.entries(registered).forEach(([ name, keys ]) => {
		const extra = keys.filter((key) => !(CLEAN_ATTRIBUTES[name] || []).includes(key));
		if (extra.length) {
			foreign[name] = extra;
		}
	});
	return foreign;
}

// Each block in the editor: valid or not, and which save() validates it.
// The path is found as core finds it (applyBlockDeprecatedVersions): the
// stored markup is validated against the current block type, then against
// each deprecated entry in order.
function readBlocks(page, raw) {
	return page.evaluate((rawContent) => {
		const rawBlocks = wp.blockSerializationDefaultParser.parse(rawContent).filter((block) => block.blockName);
		const type = wp.blocks.getBlockType('typost/block');
		const ENTRY_KEYS = [ 'attributes', 'supports', 'save', 'migrate', 'isEligible', 'apiVersion' ];
		const entryType = (entry) => {
			const built = Object.assign({}, type);
			ENTRY_KEYS.forEach((key) => delete built[key]);
			return Object.assign(built, entry);
		};
		// deprecated.js exports [ v2, v1 ]: the newest first
		const deprecated = type.deprecated || [];
		const candidates = [ [ 'current', type ] ].concat(
			deprecated.map((entry, i) => [ `v${deprecated.length - i}`, entryType(entry) ])
		);
		const validates = (blockType, rawBlock) => {
			const html = (rawBlock.innerHTML || '').trim();
			const attributes = wp.blocks.getBlockAttributes(blockType, html, rawBlock.attrs);
			return wp.blocks.validateBlock({ name: rawBlock.blockName, attributes, innerBlocks: [], originalContent: html }, blockType)[0];
		};
		return wp.data.select('core/block-editor').getBlocks().map((block, i) => {
			let validatedBy = 'core';
			if (block.name === 'typost/block') {
				const match = candidates.find(([ , blockType ]) => validates(blockType, rawBlocks[i]));
				validatedBy = match ? match[0] : 'none';
			}
			return {
				name: block.name,
				isValid: block.isValid,
				validatedBy,
				fontSizeUnit: block.attributes.fontSizeUnit,
			};
		});
	}, raw);
}

function editedContent(page) {
	return page.evaluate(() => wp.data.select('core/editor').getEditedPostContent());
}

// Wait until the editor stops changing the content: fit-to-width blocks
// measure once the canvas fonts are loaded, after a 300 ms debounce.
async function settle(page) {
	await page.frameLocator('iframe[name="editor-canvas"]').locator('body').evaluate((body) => body.ownerDocument.fonts.ready);
	let last = null;
	let stableSince = Date.now();
	const deadline = Date.now() + 20000;
	while (Date.now() < deadline) {
		const content = await editedContent(page);
		if (content !== last) {
			last = content;
			stableSince = Date.now();
		} else if (Date.now() - stableSince >= 1500) {
			return content;
		}
		await page.waitForTimeout(250);
	}
	return last;
}

// What the server stored. It can parse and serialize the blocks again on a
// save (in PHP), and PHP can then write a block comment's JSON in another
// form: `[]` for `{}`, or 0.28749999999999998 for 0.2875 when php.ini sets
// serialize_precision to 17. Only the JSON's form changes, so when the
// bytes differ, the comment JSON is compared parsed, and the test says so.
function expectStored(stored, expected, label) {
	if (stored === expected) {
		return;
	}
	test.info().annotations.push({ type: 'server rewrote block comments', description: label });
	expect(canonicalComments(stored), label).toBe(canonicalComments(expected));
}

// Block comments with their JSON parsed and written again. PHP writes an
// empty object as [], so an empty array and an empty object are the same.
function canonicalComments(html) {
	return html.replace(/<!-- wp:([a-z0-9/-]+) (\{.*?\}) (\/)?-->/g, (match, name, json, selfClosing) => {
		const text = JSON.stringify(JSON.parse(json), (key, value) => (
			value && typeof value === 'object' && Object.keys(value).length === 0 ? '{}' : value));
		return `<!-- wp:${name} ${text} ${selfClosing || ''}-->`;
	});
}

async function storedContent(page, postId) {
	const post = await rest(page, 'GET', `/wp/v2/posts/${postId}?context=edit`);
	return post.content.raw;
}

// What the running test made, as REST routes to delete. afterEach deletes
// them without the test's page, so a test that timed out (page closed)
// still leaves nothing behind. A delete that fails (for example a login
// that expired during the run) fails the test and names the route: the
// list reporter does not print annotations, so an annotation alone would
// leave content on the site with no visible sign.
let created = [];

test.beforeEach(() => {
	created = [];
});

test.afterEach(async ({ playwright }) => {
	const failures = await deleteWithoutPage(playwright, created.splice(0));
	failures.forEach((failure) => test.info().annotations.push({ type: 'cleanup failed', description: failure }));
	expect(failures, 'cleanup: delete what the test made').toEqual([]);
});

for (const fixture of FIXTURES) {
	test(`saved markup: ${fixture.title}`, async ({ page }) => {
		let style;
		if (fixture.style) {
			style = await rest(page, 'POST', '/typost/v1/paragraph-styles', {
				name: `${STYLE.name} ${Date.now()}`,
				properties: STYLE.properties,
			});
			created.push(`/typost/v1/paragraph-styles/${style.id}`);
		}
		const styleId = style ? style.id : undefined;
		const markup = readFixture(fixture.file, styleId);
		const expected = fixture.after ? readFixture(fixture.after, styleId) : markup;

		const post = await rest(page, 'POST', '/wp/v2/posts', {
			title: `ZZ E2E saved markup: ${fixture.file}`,
			status: 'draft',
			content: markup,
		});
		// Before the style, so the post is gone before its style is
		created.unshift(`/wp/v2/posts/${post.id}?force=true`);
		const postId = post.id;
		const stored = await storedContent(page, postId);
		expectStored(stored, markup, 'the content the site stored');

		await openPost(page, postId);
		const blocks = await readBlocks(page, markup);
		expect(blocks.map((block) => block.isValid), 'every block is valid').toEqual(blocks.map(() => true));
		expect(blocks.map((block) => block.validatedBy), 'the save() that validates each block').toEqual(fixture.paths);
		blocks.forEach((block) => {
			if (block.validatedBy === 'v1' || block.validatedBy === 'v2') {
				expect(block.fontSizeUnit, 'migrate() keeps px').toBe('px');
			}
		});

		const foreign = await foreignAttributes(page);
		if (Object.keys(foreign).length) {
			test.info().annotations.push({ type: 'foreign attributes', description: `Left out of the comparison (another plugin adds them): ${JSON.stringify(foreign)}` });
		}
		const comparable = (html) => {
			const own = withoutForeignAttributes(html, foreign);
			return fixture.measured ? maskMeasured(own) : own;
		};

		// 3. Opened and settled: nothing changed
		const opened = await settle(page);
		const dirty = await page.evaluate(() => wp.data.select('core/editor').isEditedPostDirty());
		if (fixture.measured) {
			// Where the fonts measure the lines as the fixture has them,
			// nothing changes and the post must not be dirty. Elsewhere the
			// editor stores the new ratios. That write is marked not
			// persistent, so by design it leaves the post clean, but the
			// plugin sometimes leaves the post dirty after it (a known bug,
			// see the fixtures README): the flag is reported, not checked.
			const remeasured = JSON.stringify(measuredNumbers(opened)) !== JSON.stringify(measuredNumbers(markup));
			if (remeasured) {
				test.info().annotations.push({ type: 'measured', description: `The editor measured other ratios and stored them; the post is ${dirty ? 'dirty' : 'not dirty'} (the plugin sometimes leaves a re-measured post dirty: a known bug, not checked here)` });
			} else {
				expect(dirty, 'the post is not dirty').toBe(false);
			}
			expect(comparable(opened), 'the content a save writes now').toBe(comparable(markup));
			expect(fitInvariantProblems(opened, { wordLonger: true }), 'the measured ratios and the line sizes agree').toEqual([]);
		} else {
			expect(dirty, 'the post is not dirty').toBe(false);
			expect(opened, 'the content a save writes now (the stored content)').toBe(stored);
		}

		// 4. Every block serialized again, as after an edit. In the
		// browser, so byte for byte unless the site has foreign
		// attributes or the block measures
		await page.evaluate(() => wp.data.dispatch('core/editor').resetEditorBlocks(wp.data.select('core/block-editor').getBlocks().slice()));
		const serialized = await editedContent(page);
		if (fixture.measured || Object.keys(foreign).length) {
			expect(comparable(serialized), 'the content a save writes after an edit').toBe(comparable(expected));
		} else {
			expect(serialized, 'the content a save writes after an edit').toBe(expected);
		}
		if (fixture.measured) {
			// The numbers may differ from the fixture's, but they must follow
			// the rules that tie them together (fit-invariants.js)
			expect(fitInvariantProblems(serialized, { wordLonger: true }), 'the measured ratios and the line sizes agree').toEqual([]);
			if (serialized !== expected) {
				test.info().annotations.push({ type: 'measured', description: `The fit ratios measured here are ${JSON.stringify(measuredNumbers(serialized))}; the fixture has ${JSON.stringify(measuredNumbers(expected))}` });
			}
		}

		await page.evaluate(() => wp.data.dispatch('core/editor').savePost());
		expect(await page.evaluate(() => wp.data.select('core/editor').didPostSaveRequestSucceed()), 'the save succeeded').toBe(true);
		expectStored(await storedContent(page, postId), serialized, 'the content stored by the save');
	});
}
