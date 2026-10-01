/**
 * Tests for assets/js/editor-font-kits.js (#230): which fonts a block tree
 * uses, replacement chains, and the kit loader that serves the editor page
 * and the canvas iframe. The editor wiring is inert here: no wp global.
 */

const {
	adobeCssUrlsForFontId,
	referencesFromHtml,
	attributeText,
	collectFontIdsFromBlocks,
	collectFontIdsFromAttributes,
	listsDiffer,
	withReplacements,
	createKitLoader,
} = require('../editor-font-kits.js');

global.jQuery = jest.fn(() => ({ ready: jest.fn(), on: jest.fn() }));
const adminPage = require('../admin-page.js');

const ADOBE = [
	{ id: 'adobe-a', font_id: 5, css_url: 'https://use.typekit.net/abc.css' },
	{ id: 'adobe-b', font_id: '6', css_url: 'https://use.typekit.net/abc.css' },
	{ id: 'adobe-c', font_id: 6, css_url: 'https://use.typekit.net/xyz.css' },
	{ id: 'adobe-d', font_id: 7, css_url: 'http://use.typekit.net/insecure.css' },
	{ id: 'adobe-e', font_id: 29, css_url: 'https://use.typekit.net/rep.css' },
];

const STYLES = [
	{ id: 3, properties: { fontId: 5 } },
	{ id: 4, legacyId: 'ps_old', properties: { fontId: 6 } },
	{ id: 8, properties: {} },
];

describe('adobeCssUrlsForFontId', () => {
	test('matches the settings page twin for every case', () => {
		[5, '6', 6, 7, 29, 0, 'abc', null, 99].forEach((id) => {
			expect(adobeCssUrlsForFontId(ADOBE, id)).toEqual(adminPage.adobeCssUrlsForFontId(ADOBE, id));
		});
		expect(adobeCssUrlsForFontId(null, 5)).toEqual(adminPage.adobeCssUrlsForFontId(null, 5));
	});
});

describe('referencesFromHtml', () => {
	test('finds font IDs in spans and CSS variables', () => {
		const html = '<span class="typost-styled" data-font-id="12" style="font-family: var(--font-12)">a</span>' +
			'<span style="font-family: var(--font-40), serif">b</span>';
		expect(referencesFromHtml(html).fontIds).toEqual([12, 40]);
	});

	test('accepts escaped quotes from serialized attributes', () => {
		expect(referencesFromHtml('data-font-id=\\"33\\"').fontIds).toEqual([33]);
	});

	test('finds paragraph style references, legacy IDs included', () => {
		const html = '<span data-style-id="4">x</span><p class="typost-ps-3 other">y</p><span data-style-id="ps_old">z</span>';
		expect(referencesFromHtml(html).styleRefs).toEqual(['4', 'ps_old', '3']);
	});

	test('returns nothing for empty or non-string input', () => {
		expect(referencesFromHtml('')).toEqual({ fontIds: [], styleRefs: [] });
		expect(referencesFromHtml(null)).toEqual({ fontIds: [], styleRefs: [] });
		expect(referencesFromHtml('<p>plain</p>')).toEqual({ fontIds: [], styleRefs: [] });
	});
});

describe('attributeText', () => {
	test('returns strings as they are', () => {
		expect(attributeText('<b>x</b>')).toBe('<b>x</b>');
	});

	test('reads RichTextData-like objects through toString()', () => {
		const richText = { toString: () => '<span data-font-id="9">x</span>' };
		expect(attributeText(richText)).toBe('<span data-font-id="9">x</span>');
	});

	test('reads plain objects and arrays as JSON', () => {
		expect(attributeText({ typography: { fontFamily: 'var(--font-12)' } })).toBe('{"typography":{"fontFamily":"var(--font-12)"}}');
		expect(attributeText([1, 2])).toBe('[1,2]');
	});

	test('returns nothing for numbers, a throwing toString() and a circular object', () => {
		const circular = {};
		circular.self = circular;
		expect(attributeText(42)).toBe('');
		expect(attributeText({ toString: () => { throw new Error('x'); } })).toBe('');
		expect(attributeText(circular)).toBe('');
	});
});

describe('collectFontIdsFromAttributes', () => {
	test('reads a flat list of attribute objects, style objects included', () => {
		const list = [
			{ fontId: 5 },
			{ content: '<span data-font-id="12">x</span>' },
			{ style: { typography: { fontFamily: 'var(--font-40)' } } },
			null,
			'not an object',
		];
		expect(collectFontIdsFromAttributes(list, STYLES)).toEqual([5, 12, 40]);
	});

	test('handles missing input', () => {
		expect(collectFontIdsFromAttributes(null, null)).toEqual([]);
	});
});

describe('listsDiffer', () => {
	const a = { fontId: 1 };
	const b = { fontId: 2 };

	test('is true on the first tick and on a length change', () => {
		expect(listsDiffer(null, [a])).toBe(true);
		expect(listsDiffer([a], [a, b])).toBe(true);
	});

	test('compares items by reference', () => {
		expect(listsDiffer([a, b], [a, b])).toBe(false);
		expect(listsDiffer([a, b], [a, { fontId: 2 }])).toBe(true);
	});
});

describe('editor wiring', () => {
	afterEach(() => {
		jest.useRealTimers();
		delete global.wp;
		delete global.typostData;
		delete window.typostFontKits;
		delete window.typostAdminFonts;
		document.head.innerHTML = '';
	});

	test('loads the kit for a font inside a synced pattern, which getBlocks() does not include', () => {
		jest.useFakeTimers();
		// The post holds one synced pattern. Its child uses font 6. getBlocks()
		// shows the pattern with no inner blocks (it manages its own children);
		// getClientIdsWithDescendants() includes the child.
		const attributes = { pattern: { ref: 13 }, child: { content: '<span data-font-id="6">x</span>' } };
		let listener = null;
		const editor = {
			getBlocks: () => [{ clientId: 'pattern', name: 'core/block', attributes: attributes.pattern, innerBlocks: [] }],
			getClientIdsWithDescendants: () => ['pattern', 'child'],
			getBlockAttributes: (id) => attributes[id],
		};
		global.wp = { data: { select: () => editor, subscribe: (fn) => { listener = fn; } } };
		global.typostData = { adobeFonts: ADOBE, paragraphStyles: [], fontReplacements: {} };

		jest.isolateModules(() => {
			require('../editor-font-kits.js');
		});
		listener();
		jest.advanceTimersByTime(300);

		const links = Array.from(document.head.querySelectorAll('link[rel="stylesheet"]')).map((l) => l.getAttribute('href'));
		expect(links).toEqual(['https://use.typekit.net/abc.css', 'https://use.typekit.net/xyz.css']);
		expect(typeof window.typostFontKits.ensureFontId).toBe('function');
		expect(typeof window.typostAdminFonts.ensureFontId).toBe('function');
	});

	test('reads block attributes at most once per 250 ms, and a dispatch stream cannot postpone it', () => {
		jest.useFakeTimers();
		const attributes = { a: { content: 'plain' }, b: { content: 'plain' } };
		let listener = null;
		let reads = 0;
		const editor = {
			getBlocks: () => [],
			getClientIdsWithDescendants: () => ['a', 'b'],
			getBlockAttributes: (id) => { reads++; return attributes[id]; },
		};
		global.wp = { data: { select: () => editor, subscribe: (fn) => { listener = fn; } } };
		global.typostData = { adobeFonts: ADOBE, paragraphStyles: [], fontReplacements: {} };

		jest.isolateModules(() => {
			require('../editor-font-kits.js');
		});

		// 50 dispatches, 10 ms apart (500 ms): unrelated store updates
		for (let i = 0; i < 50; i++) {
			listener();
			jest.advanceTimersByTime(10);
		}
		// Two scans (at 250 and 500 ms), two blocks each: not 50 x 2
		expect(reads).toBe(4);

		// A font applied mid-stream is picked up by the next scan
		attributes.b = { content: '<span data-font-id="5">x</span>' };
		listener();
		jest.advanceTimersByTime(250);
		const links = Array.from(document.head.querySelectorAll('link[rel="stylesheet"]')).map((l) => l.getAttribute('href'));
		expect(links).toEqual(['https://use.typekit.net/abc.css']);
	});

	test('rescans when a block inside a pattern changes', () => {
		jest.useFakeTimers();
		const attributes = { pattern: { ref: 13 }, child: { content: 'plain' } };
		let listener = null;
		const editor = {
			getBlocks: () => [],
			getClientIdsWithDescendants: () => ['pattern', 'child'],
			getBlockAttributes: (id) => attributes[id],
		};
		global.wp = { data: { select: () => editor, subscribe: (fn) => { listener = fn; } } };
		global.typostData = { adobeFonts: ADOBE, paragraphStyles: [], fontReplacements: { 16: 29 } };

		jest.isolateModules(() => {
			require('../editor-font-kits.js');
		});
		listener();
		jest.advanceTimersByTime(300);
		expect(document.head.querySelectorAll('link').length).toBe(0);

		// Only the child's attributes object changes (a new reference)
		attributes.child = { content: '<span style="font-family: var(--font-16)">x</span>' };
		listener();
		jest.advanceTimersByTime(300);

		const links = Array.from(document.head.querySelectorAll('link[rel="stylesheet"]')).map((l) => l.getAttribute('href'));
		expect(links).toEqual(['https://use.typekit.net/rep.css']);
	});
});

describe('collectFontIdsFromBlocks', () => {
	test('reads block fontId, inline spans and inner blocks', () => {
		const blocks = [
			{ name: 'typost/block', attributes: { fontId: 5, content: '<span data-font-id="12">x</span>' }, innerBlocks: [] },
			{
				name: 'core/group',
				attributes: {},
				innerBlocks: [
					{ name: 'core/heading', attributes: { content: { toString: () => '<span style="font-family: var(--font-40)">y</span>' } }, innerBlocks: [] },
				],
			},
		];
		expect(collectFontIdsFromBlocks(blocks, STYLES)).toEqual([5, 12, 40]);
	});

	test('resolves paragraph styles by ID, class and legacy ID', () => {
		const blocks = [
			{ name: 'typost/block', attributes: { paragraphStyleId: 3 }, innerBlocks: [] },
			{ name: 'typost/block', attributes: { styleClass: 'typost-ps-4' }, innerBlocks: [] },
			{ name: 'core/paragraph', attributes: { content: '<span data-style-id="ps_old">z</span>' }, innerBlocks: [] },
		];
		expect(collectFontIdsFromBlocks(blocks, STYLES).sort()).toEqual([5, 6]);
	});

	test('ignores a style with no font and a zero or missing style ID', () => {
		const blocks = [
			{ name: 'typost/block', attributes: { paragraphStyleId: 8 }, innerBlocks: [] },
			{ name: 'typost/block', attributes: { paragraphStyleId: 0, fontId: 0 }, innerBlocks: [] },
		];
		expect(collectFontIdsFromBlocks(blocks, STYLES)).toEqual([]);
	});

	test('handles missing input', () => {
		expect(collectFontIdsFromBlocks(null, null)).toEqual([]);
		expect(collectFontIdsFromBlocks([null, { attributes: null }], undefined)).toEqual([]);
	});
});

describe('withReplacements', () => {
	test('adds the replacement chain', () => {
		expect(withReplacements([16, 5], { 16: 29, 29: 31 })).toEqual([16, 29, 31, 5]);
	});

	test('stops on a cyclic mapping', () => {
		expect(withReplacements([1], { 1: 2, 2: 1 })).toEqual([1, 2]);
	});

	test('returns the IDs when there are no mappings', () => {
		expect(withReplacements([5, 6], undefined)).toEqual([5, 6]);
		expect(withReplacements(null, {})).toEqual([]);
	});
});

describe('createKitLoader', () => {
	function makeDocs() {
		const canvas = document.implementation.createHTMLDocument('canvas');
		return { editor: document, canvas };
	}

	function kitLinks(doc) {
		return Array.from(doc.head.querySelectorAll('link[rel="stylesheet"]')).map((l) => l.getAttribute('href'));
	}

	afterEach(() => {
		document.head.innerHTML = '';
	});

	test('adds each wanted kit once to every document', () => {
		const docs = makeDocs();
		const loader = createKitLoader({ getDocuments: () => [docs.editor, docs.canvas], getAdobeFonts: () => ADOBE });

		expect(loader.ensureFontIds([5, 6])).toBe(4);
		expect(kitLinks(docs.editor)).toEqual(['https://use.typekit.net/abc.css', 'https://use.typekit.net/xyz.css']);
		expect(kitLinks(docs.canvas)).toEqual(['https://use.typekit.net/abc.css', 'https://use.typekit.net/xyz.css']);

		expect(loader.ensureFontIds([5])).toBe(0);
		expect(kitLinks(docs.canvas)).toHaveLength(2);
	});

	test('treats a kit PHP enqueued with a ?ver= query as present', () => {
		document.head.innerHTML = '<link rel="stylesheet" href="https://use.typekit.net/abc.css?ver=abc">';
		const loader = createKitLoader({ getDocuments: () => [document], getAdobeFonts: () => ADOBE });

		expect(loader.ensureFontIds([5])).toBe(0);
		expect(kitLinks(document)).toHaveLength(1);
	});

	test('adds the wanted kits to a rebuilt canvas on sync', () => {
		let canvas = document.implementation.createHTMLDocument('first');
		const loader = createKitLoader({ getDocuments: () => [canvas], getAdobeFonts: () => ADOBE });
		loader.ensureFontIds([5]);

		canvas = document.implementation.createHTMLDocument('rebuilt');
		expect(loader.sync()).toBe(1);
		expect(kitLinks(canvas)).toEqual(['https://use.typekit.net/abc.css']);
		// Up to date: nothing to add on the next tick
		expect(loader.sync()).toBe(0);
	});

	test('ignores fonts that are not Adobe fonts and insecure kit URLs', () => {
		const loader = createKitLoader({ getDocuments: () => [document], getAdobeFonts: () => ADOBE });
		expect(loader.ensureFontIds([36, 7])).toBe(0);
		expect(loader.wantedUrls()).toEqual([]);
	});

	test('skips a document without a head and missing adobeFonts data', () => {
		const loader = createKitLoader({ getDocuments: () => [null, {}], getAdobeFonts: () => null });
		expect(loader.ensureFontIds(5)).toBe(0);
	});
});
