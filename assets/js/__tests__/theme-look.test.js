/**
 * The theme's look for a Typography Stylist block (#411, #412):
 * assets/js/theme-look.js.
 *
 * The classification test reads block.json: every attribute the block can
 * store (its own attributes, and the ones its block supports add) must be
 * reset, kept or listed as not decided. An attribute added to block.json
 * later fails it until someone puts it in one of the lists.
 */

const blockJson = require('../../../blocks/typography-stylist/block.json');
const {
	THEME_LOOK_PLUGIN_ATTRIBUTES,
	THEME_LOOK_WORDPRESS_ATTRIBUTES,
	THEME_LOOK_KEPT_ATTRIBUTES,
	THEME_LOOK_UNDECIDED_ATTRIBUTES,
	buildThemeLookAttributes,
	isEmptyBlockContent,
	buildEmptySourceBlockAttributes,
} = require('../theme-look.js');

/**
 * The attributes WordPress adds for each `supports` key this test knows
 * (read in WordPress 7.1.3: the block-editor hooks color, style, font-size,
 * anchor, align, custom-class-name, lock and metadata). A key that is not in
 * this table fails the test, so a new support (`border.color` adds
 * `borderColor`, for example) has to be classified before it can ship.
 */
const SUPPORT_ATTRIBUTES = {
	html: [],
	align: ['align'],
	anchor: ['anchor'],
	customClassName: ['className'],
	className: [],
	'color.text': ['textColor', 'style'],
	'color.background': ['backgroundColor', 'style'],
	'color.gradients': ['gradient', 'style'],
	'color.link': ['style'],
	'spacing.margin': ['style'],
	'spacing.padding': ['style'],
	'typography.fontSize': ['fontSize', 'style'],
	'typography.lineHeight': ['style'],
	'typography.textIndent': ['style'],
	// The block declares its own textAlign attribute in block.json
	__experimentalTextAlign: [],
};

/**
 * Every leaf of a supports object, as a dotted path with its value. Arrays
 * (align: ['wide', 'full']) are leaves.
 *
 * @param {Object} supports block.json supports
 * @param {string} [prefix] Path so far
 * @return {Array} [path, value] pairs
 */
function supportLeaves(supports, prefix = '') {
	return Object.keys(supports).reduce((out, key) => {
		const value = supports[key];
		const path = prefix + key;
		if (value && typeof value === 'object' && !Array.isArray(value)) {
			return out.concat(supportLeaves(value, path + '.'));
		}
		return out.concat([[path, value]]);
	}, []);
}

/**
 * Attribute names WordPress adds for a block's supports, and the support
 * keys this test does not know.
 *
 * @param {Object} supports block.json supports
 * @return {{names: string[], unknown: string[]}} Attribute names and unknown keys
 */
function supportAttributes(supports) {
	const names = ['lock', 'metadata'];
	const unknown = [];
	if (supports.customClassName !== false) {
		names.push('className');
	}
	supportLeaves(supports).forEach(([path, value]) => {
		if (!Object.prototype.hasOwnProperty.call(SUPPORT_ATTRIBUTES, path)) {
			unknown.push(path);
			return;
		}
		if (value) {
			names.push(...SUPPORT_ATTRIBUTES[path]);
		}
	});
	return { names, unknown };
}
const supportAttributeNames = (supports) => supportAttributes(supports).names;

/**
 * Names that are in no list or in more than one.
 *
 * @param {string[]} names Attribute names the block can store
 * @param {Object}   lists The four lists
 * @return {string[]} Problems
 */
function classify(names, lists) {
	const problems = [];
	names.forEach((name) => {
		const where = Object.keys(lists).filter((list) => lists[list].includes(name));
		if (where.length === 0) problems.push(`${name} is not classified`);
		if (where.length > 1) problems.push(`${name} is in ${where.join(' and ')}`);
	});
	return problems;
}

const LISTS = {
	plugin: Object.keys(THEME_LOOK_PLUGIN_ATTRIBUTES),
	wordpress: THEME_LOOK_WORDPRESS_ATTRIBUTES,
	kept: THEME_LOOK_KEPT_ATTRIBUTES,
	undecided: THEME_LOOK_UNDECIDED_ATTRIBUTES,
};
const ALL_NAMES = [...new Set([...Object.keys(blockJson.attributes), ...supportAttributeNames(blockJson.supports)])];

describe('theme-look: every attribute is classified', () => {
	it('puts each attribute of block.json and of its supports in exactly one list', () => {
		expect(classify(ALL_NAMES, LISTS)).toEqual([]);
	});

	it('lists no attribute the block cannot store', () => {
		const all = [].concat(...Object.values(LISTS));
		expect(all.filter((name) => !ALL_NAMES.includes(name))).toEqual([]);
	});

	it('knows every supports key of block.json', () => {
		expect(supportAttributes(blockJson.supports).unknown).toEqual([]);
	});

	it('finds a supports key it does not know, at any depth (control)', () => {
		const supports = JSON.parse(JSON.stringify(blockJson.supports));
		supports.border = { color: true };
		supports.typography.letterSpacing = true;
		expect(supportAttributes(supports).unknown).toEqual(['typography.letterSpacing', 'border.color']);
	});

	it('finds a new block.json attribute that is in no list (control)', () => {
		const names = [...ALL_NAMES, 'brandNewSetting'];
		expect(classify(names, LISTS)).toEqual(['brandNewSetting is not classified']);
	});

	it('finds an attribute in two lists (control)', () => {
		expect(classify(['fontSize'], { ...LISTS, kept: [...LISTS.kept, 'fontSize'] })).toEqual(['fontSize is in plugin and kept']);
	});

	it('keeps the tag, the width, the anchor, the size unit and the screen reader class', () => {
		expect(THEME_LOOK_KEPT_ATTRIBUTES).toEqual(expect.arrayContaining(['content', 'tagName', 'align', 'anchor', 'fontSizeUnit', 'screenReaderClass']));
	});

	it('leaves the two extension attributes undecided', () => {
		expect(THEME_LOOK_UNDECIDED_ATTRIBUTES).toEqual(['layeredConfigId', 'animationConfigId']);
	});
});

describe('theme-look: the plugin values', () => {
	it('are the block.json defaults, except the weight', () => {
		Object.keys(THEME_LOOK_PLUGIN_ATTRIBUTES).forEach((key) => {
			if (key === 'fontWeight') return;
			expect([key, THEME_LOOK_PLUGIN_ATTRIBUTES[key]]).toEqual([key, blockJson.attributes[key].default]);
		});
	});

	it("use '' for the weight, which writes no font-weight, not the '400' default", () => {
		expect(blockJson.attributes.fontWeight.default).toBe('400');
		expect(THEME_LOOK_PLUGIN_ATTRIBUTES.fontWeight).toBe('');
	});

	it("write no size: 'inherit'", () => {
		expect(THEME_LOOK_PLUGIN_ATTRIBUTES.fontSize).toBe('inherit');
	});
});

describe('buildThemeLookAttributes', () => {
	it('returns the plugin values and removes the WordPress settings', () => {
		const attrs = buildThemeLookAttributes();
		expect(attrs).toMatchObject(THEME_LOOK_PLUGIN_ATTRIBUTES);
		THEME_LOOK_WORDPRESS_ATTRIBUTES.forEach((key) => {
			expect(Object.prototype.hasOwnProperty.call(attrs, key)).toBe(true);
			expect(attrs[key]).toBeUndefined();
		});
	});

	it('has no kept or undecided attribute', () => {
		const attrs = buildThemeLookAttributes();
		[...THEME_LOOK_KEPT_ATTRIBUTES, ...THEME_LOOK_UNDECIDED_ATTRIBUTES].forEach((key) => {
			expect(Object.prototype.hasOwnProperty.call(attrs, key)).toBe(false);
		});
	});

	it('gives new arrays on each call', () => {
		const a = buildThemeLookAttributes();
		const b = buildThemeLookAttributes();
		a.features.push('liga');
		expect(b.features).toEqual([]);
		expect(THEME_LOOK_PLUGIN_ATTRIBUTES.features).toEqual([]);
		expect(a.fitLineSizes).not.toBe(THEME_LOOK_PLUGIN_ATTRIBUTES.fitLineSizes);
	});
});

describe('isEmptyBlockContent (#412)', () => {
	it.each([
		['an empty string', ''],
		['undefined', undefined],
		['null', null],
		['spaces', '   '],
		['tabs and line feeds', '\t\n '],
		['non-breaking spaces as entities', '&nbsp;&nbsp;'],
		['a non-breaking space character', String.fromCharCode(0xa0)],
		['a numeric non-breaking space', '&#160;&#xa0;'],
		['zero-width characters', String.fromCharCode(0x200b, 0x200c, 0x200d, 0x2060, 0xfeff)],
		['a line break', '<br>'],
		['line breaks and spaces', ' <br/><br> '],
		['an empty typost span', '<span class="typost-styled"></span>'],
		['an empty styled span with a space and a line break', '<span class="typost-styled" style="font-weight: 700"> <br></span>'],
		['nested empty formats', '<strong><em> </em></strong>'],
		['an empty link', '<a href="https://example.com"></a>'],
		['a comment', '<!-- note -->'],
		['a RichTextData-like object', { toString: () => '<br>' }],
	])('%s is empty', (_, html) => {
		expect(isEmptyBlockContent(html)).toBe(true);
	});

	it.each([
		['text', 'A'],
		['text in a span', '<span class="typost-styled">A</span>'],
		['text after line breaks', '<br><br>x'],
		['an entity for a visible character', '&amp;'],
		['a digit zero', '0'],
		['an inline image', '<img src="a.png" alt="">'],
		['a formula', '<math><mi>x</mi></math>'],
		['a formula with no text', '<math><mspace width="1em"></mspace></math>'],
		['an svg with no text', '<svg viewBox="0 0 10 10"><rect width="10" height="10"></rect></svg>'],
		['a RichTextData-like object with text', { toString: () => 'Hi' }],
		['a tag with ">" in an attribute and text', '<span title="a>b">c</span>'],
	])('%s is not empty', (_, html) => {
		expect(isEmptyBlockContent(html)).toBe(false);
	});
});

describe('buildEmptySourceBlockAttributes (#412)', () => {
	it('gives the tag, the theme look and empty content', () => {
		const attrs = buildEmptySourceBlockAttributes('h3');
		expect(attrs).toEqual({ ...buildThemeLookAttributes(), content: '', tagName: 'h3' });
		expect(Object.prototype.hasOwnProperty.call(attrs, 'fontSizeUnit')).toBe(false);
	});

	it.each(['px', 'rem'])('stores the %s size unit (#248)', (unit) => {
		expect(buildEmptySourceBlockAttributes('p', unit).fontSizeUnit).toBe(unit);
	});

	it('ignores an unknown unit', () => {
		expect(Object.prototype.hasOwnProperty.call(buildEmptySourceBlockAttributes('p', 'em'), 'fontSizeUnit')).toBe(false);
	});

	it("stores no weight of '400' or of the source: the weight is ''", () => {
		expect(buildEmptySourceBlockAttributes('h2', 'rem').fontWeight).toBe('');
	});
});
