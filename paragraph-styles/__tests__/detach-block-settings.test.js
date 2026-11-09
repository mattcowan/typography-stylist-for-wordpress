/**
 * Detach keeps a style's color, spacing and indents in the block's own settings (#346).
 *
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');
const {
	buildDetachBlockSettings,
	measureBlockFontSize,
	readEditorPalette,
	canKeepTextIndent,
	blockCarriesStyle,
	readTextIndentSupport,
	readPreviousBlock,
	styleFontSizeCss,
	coreDetachEmBasis,
	buildStyleCssBlock,
} = require('../assets/js/lib/ps-utils');

const PALETTE = [
	{ slug: 'accent1', color: '#123456' },
	{ slug: 'ink', color: '#000000' },
];

describe('buildDetachBlockSettings', () => {
	describe('text color', () => {
		it('keeps a custom color in style.color.text', () => {
			const { attributes, removed } = buildDetachBlockSettings({ textColor: '#ff0000' }, {});
			expect(attributes).toEqual({ style: { color: { text: '#ff0000' } } });
			expect(removed).toEqual([]);
		});

		it('keeps a custom color with alpha', () => {
			const { attributes } = buildDetachBlockSettings({ textColor: '#ff000080' }, {});
			expect(attributes.style.color.text).toBe('#ff000080');
		});

		it('keeps a palette color as a palette color', () => {
			const { attributes } = buildDetachBlockSettings({ textColor: 'var:preset|color|ink|#000000' }, {}, { palette: PALETTE });
			expect(attributes).toEqual({ textColor: 'ink' });
		});

		it('uses the slug the palette has, since a style stores it kebab-cased', () => {
			const { attributes } = buildDetachBlockSettings({ textColor: 'var:preset|color|accent-1' }, {}, { palette: PALETTE });
			expect(attributes).toEqual({ textColor: 'accent1' });
		});

		it('falls back to the saved color when the theme removed the palette color', () => {
			const { attributes, removed } = buildDetachBlockSettings({ textColor: 'var:preset|color|gone|#abcdef' }, {}, { palette: PALETTE });
			expect(attributes).toEqual({ style: { color: { text: '#abcdef' } } });
			expect(removed).toEqual([]);
		});

		it('reports a removed palette color with no saved color', () => {
			const { attributes, removed } = buildDetachBlockSettings({ textColor: 'var:preset|color|gone' }, {}, { palette: PALETTE });
			expect(attributes).toEqual({});
			expect(removed).toEqual(['textColor']);
		});

		it('never keeps a transparent fill, because the outline that shows the text goes', () => {
			const { attributes, removed } = buildDetachBlockSettings(
				{ textColor: 'transparent', textStrokeWidth: 2, textStrokeColor: '#000000' },
				{}
			);
			expect(attributes).toEqual({});
			expect(removed).toEqual(['textColor', 'textStrokeWidth']);
		});

		it('never keeps a fully transparent custom color', () => {
			const { attributes, removed } = buildDetachBlockSettings({ textColor: '#ff000000' }, {});
			expect(attributes).toEqual({});
			expect(removed).toEqual(['textColor']);
		});

		it('never writes a fully transparent saved color, since the text would vanish', () => {
			const { attributes, removed } = buildDetachBlockSettings(
				{ textColor: 'var:preset|color|gone|#00000000', textStrokeWidth: 2, textStrokeColor: '#000000' },
				{},
				{ palette: [] }
			);
			expect(attributes).toEqual({});
			expect(removed).toEqual(['textColor', 'textStrokeWidth']);
		});

		it('never keeps a palette color that is fully transparent in the palette', () => {
			const { attributes, removed } = buildDetachBlockSettings(
				{ textColor: 'var:preset|color|clear' },
				{},
				{ palette: [{ slug: 'clear', color: '#ffffff00' }] }
			);
			expect(attributes).toEqual({});
			expect(removed).toEqual(['textColor']);
		});

		it('says nothing of a transparent fill the style never rendered', () => {
			const { removed } = buildDetachBlockSettings({ textColor: 'transparent' }, {});
			expect(removed).toEqual([]);
		});

		it.each([
			['a palette color', { textColor: 'ink' }],
			['a custom color', { style: { color: { text: '#111111' } } }],
		])('does not overwrite %s the block already has', (_, attrs) => {
			const { attributes, removed } = buildDetachBlockSettings({ textColor: '#ff0000' }, attrs, { palette: PALETTE });
			expect(attributes).toEqual({});
			expect(removed).toEqual([]);
		});
	});

	describe('spacing and indents', () => {
		it('writes space before and after to the margin, and indents to the padding', () => {
			const { attributes } = buildDetachBlockSettings(
				{ spaceBefore: '32px', spaceAfter: '16px', indentStart: '48px', indentEnd: '24px' },
				{}
			);
			expect(attributes.style.spacing).toEqual({
				margin: { top: '32px', bottom: '16px' },
				padding: { left: '48px', right: '24px' },
			});
		});

		it('writes the left indent to the right padding in right-to-left text', () => {
			const { attributes } = buildDetachBlockSettings({ indentStart: '48px', indentEnd: '24px' }, {}, { isRtl: true });
			expect(attributes.style.spacing.padding).toEqual({ right: '48px', left: '24px' });
		});

		it('converts em to px from the size the text renders at', () => {
			const { attributes, emConverted } = buildDetachBlockSettings(
				{ spaceBefore: '1.5em', indentStart: '3em' },
				{},
				{ fontSizePx: 20 }
			);
			expect(attributes.style.spacing).toEqual({ margin: { top: '30px' }, padding: { left: '60px' } });
			expect(emConverted).toBe(true);
		});

		it('keeps em margins as they are where the style wrote them on the same wrapper', () => {
			// A Typography Stylist block: the style's margins are on the wrapper, so em
			// reads the wrapper's size before and after. Its indents move from the
			// text element to the wrapper, so they still convert.
			const { attributes, emConverted } = buildDetachBlockSettings(
				{ spaceBefore: '1.5em', spaceAfter: '2em', indentStart: '1em' },
				{},
				{ fontSizePx: 48, keepMarginEm: true }
			);
			expect(attributes.style.spacing).toEqual({
				margin: { top: '1.5em', bottom: '2em' },
				padding: { left: '48px' },
			});
			expect(emConverted).toBe(true);
		});

		it('does not claim a conversion when only margins in em stay', () => {
			const { emConverted } = buildDetachBlockSettings({ spaceBefore: '1.5em' }, {}, { fontSizePx: 48, keepMarginEm: true });
			expect(emConverted).toBe(false);
		});

		it('rounds a converted value to three decimals', () => {
			const { attributes } = buildDetachBlockSettings({ spaceAfter: '1.333em' }, {}, { fontSizePx: 17.3 });
			expect(attributes.style.spacing.margin.bottom).toBe('23.061px');
		});

		it('keeps em when the size is unknown, and does not claim a conversion', () => {
			for (const fontSizePx of [undefined, null, 0, NaN]) {
				const { attributes, emConverted } = buildDetachBlockSettings({ spaceBefore: '1.5em' }, {}, { fontSizePx });
				expect(attributes.style.spacing.margin.top).toBe('1.5em');
				expect(emConverted).toBe(false);
			}
		});

		it('leaves px values alone and does not claim a conversion', () => {
			const { emConverted } = buildDetachBlockSettings({ spaceBefore: '10px' }, {}, { fontSizePx: 20 });
			expect(emConverted).toBe(false);
		});

		it('does not overwrite a side the block already sets, and keeps its other sides', () => {
			const { attributes } = buildDetachBlockSettings(
				{ spaceBefore: '32px', spaceAfter: '16px', indentStart: '48px' },
				{ style: { spacing: { margin: { top: '1px', left: '2px' }, padding: { left: '3px' } } } }
			);
			expect(attributes.style.spacing).toEqual({
				margin: { top: '1px', left: '2px', bottom: '16px' },
				padding: { left: '3px' },
			});
		});

		it('treats a side of 0 as set by the block', () => {
			const { attributes } = buildDetachBlockSettings({ spaceBefore: '32px' }, { style: { spacing: { margin: { top: '0' } } } });
			expect(attributes).toEqual({});
		});

		it('keeps every other style value the block has', () => {
			const { attributes } = buildDetachBlockSettings(
				{ spaceBefore: '32px', textColor: '#ff0000' },
				{ style: { typography: { lineHeight: 2 }, color: { background: '#eeeeee' }, spacing: { blockGap: '1px' } } }
			);
			expect(attributes.style).toEqual({
				typography: { lineHeight: 2 },
				color: { background: '#eeeeee', text: '#ff0000' },
				spacing: { blockGap: '1px', margin: { top: '32px' } },
			});
		});

		it('does not change the attributes it was given', () => {
			const attrs = { style: { spacing: { margin: { left: '2px' } } } };
			const before = JSON.stringify(attrs);
			buildDetachBlockSettings({ spaceBefore: '32px', textColor: '#ff0000' }, attrs);
			expect(JSON.stringify(attrs)).toBe(before);
		});

		it('ignores invalid lengths', () => {
			const { attributes } = buildDetachBlockSettings({ spaceBefore: 'wide', indentStart: '-5px', spaceAfter: 12 }, {});
			expect(attributes).toEqual({});
		});

		it('skips the indents on a fit block, where the style never wrote them, and keeps the spacing', () => {
			const onBlock = buildDetachBlockSettings({ indentStart: '48px', spaceAfter: '16px', firstLineIndent: '2em' }, {}, { isFit: true });
			expect(onBlock.attributes.style.spacing).toEqual({ margin: { bottom: '16px' } });
			expect(onBlock.removed).toEqual([]);
			const inStyle = buildDetachBlockSettings({ fontSize: 'fit', indentStart: '48px', spaceAfter: '16px' }, {});
			expect(inStyle.attributes.style.spacing).toEqual({ margin: { bottom: '16px' } });
		});
	});

	describe('values with no block setting', () => {
		it('reports each one', () => {
			const { removed } = buildDetachBlockSettings({
				textStrokeWidth: 2,
				firstLineIndent: '2em',
				indentAfterSame: true,
				wordSpacing: 50,
				textWrap: 'balance',
				alignment: 'justify',
				alignLast: 'center',
			}, {});
			expect(removed).toEqual(['textStrokeWidth', 'firstLineIndent', 'indentAfterSame', 'wordSpacing', 'textWrap', 'alignLast']);
		});

		it('reports GREP rules, which are on the style record and go with the class', () => {
			expect(buildDetachBlockSettings({}, {}, { hasGrepRules: true }).removed).toEqual(['grepRules']);
			expect(buildDetachBlockSettings({}, {}, { hasGrepRules: false }).removed).toEqual([]);
		});

		it('does not report GREP rules on a fit block, where they never matched', () => {
			expect(buildDetachBlockSettings({}, {}, { hasGrepRules: true, isFit: true }).removed).toEqual([]);
			expect(buildDetachBlockSettings({ fontSize: 'fit' }, {}, { hasGrepRules: true }).removed).toEqual([]);
			// Nested rules (#195) the same way
			expect(buildDetachBlockSettings({}, {}, { hasGrepRules: true, hasNestedRules: true }).removed).toEqual(['grepRules', 'nestedRules']);
			expect(buildDetachBlockSettings({ fontSize: 'fit' }, {}, { hasNestedRules: true }).removed).toEqual([]);
		});

		it('does not report what the style does not set', () => {
			const { removed } = buildDetachBlockSettings({
				textStrokeWidth: 0,
				firstLineIndent: '',
				indentAfterSame: true,
				wordSpacing: 0,
				textWrap: '',
				alignment: '',
			}, {});
			expect(removed).toEqual([]);
		});

		it('reports the same-style option only with an indent it applies to', () => {
			const { removed } = buildDetachBlockSettings({ firstLineIndent: '-2em', indentAfterSame: true }, {});
			expect(removed).toEqual(['firstLineIndent']);
		});

		it('reports the type settings a core block loses, and not on a Typography Stylist block', () => {
			const properties = {
				fontId: 12,
				fontWeight: '700',
				fontStyle: 'italic',
				fontSize: '24',
				letterSpacing: 10,
				lineHeight: 1.5,
				features: ['smcp'],
				fontVariationSettings: '"wght" 700',
				initialHang: 0.2,
				textCase: 'uppercase',
				alignment: 'justify',
			};
			expect(buildDetachBlockSettings(properties, {}).removed).toEqual([]);
			expect(buildDetachBlockSettings(properties, {}, { coreBlock: true }).removed).toEqual([
				'alignment', 'fontId', 'fontWeight', 'fontStyle', 'fontSize', 'letterSpacing', 'lineHeight',
				'features', 'fontVariationSettings', 'initialHang', 'textCase',
			]);
		});

		it('does not report defaults on a core block', () => {
			const { removed } = buildDetachBlockSettings({ fontId: 0, fontWeight: '', fontStyle: '', fontSize: 'inherit', features: [], letterSpacing: 0 }, {}, { coreBlock: true });
			expect(removed).toEqual([]);
		});
	});

	describe('first line indent (#348)', () => {
		it('keeps a positive indent in the block\'s Text indent when the block can hold one', () => {
			const { attributes, removed } = buildDetachBlockSettings({ firstLineIndent: '24px' }, {}, { textIndent: true });
			expect(attributes).toEqual({ style: { typography: { textIndent: '24px' } } });
			expect(removed).toEqual([]);
		});

		it('converts em to px from the size the text renders at', () => {
			const { attributes, emConverted } = buildDetachBlockSettings({ firstLineIndent: '1.5em' }, {}, { textIndent: true, fontSizePx: 20 });
			expect(attributes.style.typography.textIndent).toBe('30px');
			expect(emConverted).toBe(true);
		});

		it('converts the indent on a Typography Stylist block too, where it moves to the wrapper', () => {
			const { attributes } = buildDetachBlockSettings(
				{ firstLineIndent: '1em', spaceBefore: '2em' },
				{},
				{ textIndent: true, fontSizePx: 48, keepMarginEm: true }
			);
			expect(attributes.style).toEqual({ spacing: { margin: { top: '2em' } }, typography: { textIndent: '48px' } });
		});

		it('keeps em when the size is unknown, and does not claim a conversion', () => {
			const { attributes, emConverted } = buildDetachBlockSettings({ firstLineIndent: '2em' }, {}, { textIndent: true, fontSizePx: null });
			expect(attributes.style.typography.textIndent).toBe('2em');
			expect(emConverted).toBe(false);
		});

		it('does not overwrite the block\'s own Text indent, and names nothing, since the block\'s value showed', () => {
			const { attributes, removed, emConverted } = buildDetachBlockSettings(
				{ firstLineIndent: '2em' },
				{ style: { typography: { textIndent: '10px' } } },
				{ textIndent: true, fontSizePx: 20 }
			);
			expect(attributes).toEqual({});
			expect(removed).toEqual([]);
			expect(emConverted).toBe(false);
		});

		it('treats a Text indent of 0 as set by the block', () => {
			const { attributes } = buildDetachBlockSettings({ firstLineIndent: '24px' }, { style: { typography: { textIndent: '0' } } }, { textIndent: true });
			expect(attributes).toEqual({});
		});

		it('keeps the other typography values, such as an alignment Detach also keeps', () => {
			const { attributes } = buildDetachBlockSettings(
				{ firstLineIndent: '24px' },
				{ style: { typography: { textAlign: 'center', lineHeight: 2 }, color: { background: '#eeeeee' } } },
				{ textIndent: true }
			);
			expect(attributes.style).toEqual({
				typography: { textAlign: 'center', lineHeight: 2, textIndent: '24px' },
				color: { background: '#eeeeee' },
			});
		});

		it('removes the indent and names it on a block that cannot hold it (a Heading, or WordPress before 7.0)', () => {
			for (const options of [{}, { textIndent: false }]) {
				const { attributes, removed } = buildDetachBlockSettings({ firstLineIndent: '24px' }, {}, options);
				expect(attributes).toEqual({});
				expect(removed).toEqual(['firstLineIndent']);
			}
		});

		it('removes a hanging (negative) indent and names it, as before', () => {
			const { attributes, removed } = buildDetachBlockSettings({ firstLineIndent: '-2em' }, {}, { textIndent: true, fontSizePx: 20 });
			expect(attributes).toEqual({});
			expect(removed).toEqual(['firstLineIndent']);
		});

		describe('“Indent the first line only after a paragraph with the same style”', () => {
			const props = { firstLineIndent: '24px', indentAfterSame: true };

			it('keeps the indent when the block followed a block with the same style, so it was indented', () => {
				const { attributes, removed } = buildDetachBlockSettings(props, {}, { textIndent: true, followsSameStyle: true });
				expect(attributes).toEqual({ style: { typography: { textIndent: '24px' } } });
				expect(removed).toEqual([]);
			});

			it('writes and names nothing when the block was not indented', () => {
				const { attributes, removed } = buildDetachBlockSettings(props, {}, { textIndent: true, followsSameStyle: false });
				expect(attributes).toEqual({});
				expect(removed).toEqual([]);
			});

			it('names both on a block that cannot hold a Text indent, as before', () => {
				const { removed } = buildDetachBlockSettings(props, {}, { followsSameStyle: true });
				expect(removed).toEqual(['firstLineIndent', 'indentAfterSame']);
			});
		});

		it('writes and names nothing on a fit block, where the style never indented', () => {
			const { attributes, removed } = buildDetachBlockSettings({ firstLineIndent: '24px' }, {}, { textIndent: true, isFit: true });
			expect(attributes).toEqual({});
			expect(removed).toEqual([]);
		});
	});

	it('changes nothing for a style with none of these values', () => {
		expect(buildDetachBlockSettings({ fontId: 3, fontWeight: '700' }, { style: { spacing: {} } })).toEqual({
			attributes: {},
			removed: [],
			emConverted: false,
			followsTextSize: false,
		});
	});

	it.each([[undefined], [null], ['text']])('copes with properties of %p', (properties) => {
		expect(buildDetachBlockSettings(properties, undefined, undefined)).toEqual({ attributes: {}, removed: [], emConverted: false, followsTextSize: false });
	});
});

describe('the notice labels', () => {
	it('has a label for every key the function can report, so the notice never shows a raw key', () => {
		const everything = {
			textColor: '#ff000000',
			textStrokeWidth: 2,
			firstLineIndent: '2em',
			indentAfterSame: true,
			wordSpacing: 50,
			textWrap: 'balance',
			hyphens: 'auto',
			alignment: 'justify',
			alignLast: 'center',
			fontId: 12,
			fontWeight: '700',
			fontStyle: 'italic',
			fontSize: '24',
			letterSpacing: 10,
			lineHeight: 1.5,
			features: ['smcp'],
			fontVariationSettings: '"wght" 700',
			initialHang: 0.2,
			textCase: 'uppercase',
		};
		const { removed } = buildDetachBlockSettings(everything, {}, { coreBlock: true, hasGrepRules: true, hasNestedRules: true });
		// The control: every report in the function, so a new one fails here until it is listed
		const source = fs.readFileSync(path.join(__dirname, '../assets/js/lib/ps-utils.js'), 'utf8');
		const reported = [...new Set([...source.matchAll(/removed\.push\('([a-zA-Z]+)'\)/g)].map((m) => m[1]))];
		expect(reported.length).toBeGreaterThan(15);
		expect([...removed].sort()).toEqual([...reported].sort());

		const editor = fs.readFileSync(path.join(__dirname, '../assets/js/editor.js'), 'utf8');
		const labels = editor.slice(editor.indexOf('var labels = {'), editor.indexOf('var names ='));
		expect(labels.length).toBeGreaterThan(100);
		for (const key of removed) {
			expect(labels).toMatch(new RegExp(`\\b${key}: __\\(`));
		}
	});
});

describe('readEditorPalette', () => {
	const withSettings = (settings) => {
		window.wp = { data: { select: () => ({ getSettings: () => settings }) } };
	};
	const custom = [{ slug: 'mine', color: '#111111' }];
	const theme = [{ slug: 'accent', color: '#222222' }];
	const defaults = [{ slug: 'vivid-red', color: '#cf2e2e' }];
	const slugs = (palette) => palette.map((c) => c.slug);

	afterEach(() => {
		delete window.wp;
	});

	it('merges every origin, though core sets settings.colors to only one', () => {
		withSettings({ colors: theme, __experimentalFeatures: { color: { palette: { custom, theme, default: defaults } } } });
		expect(slugs(readEditorPalette())).toEqual(['mine', 'accent', 'vivid-red']);
	});

	it('finds a default palette color for a style that uses one', () => {
		withSettings({ colors: theme, __experimentalFeatures: { color: { palette: { theme, default: defaults } } } });
		const { attributes } = buildDetachBlockSettings({ textColor: 'var:preset|color|vivid-red' }, {}, { palette: readEditorPalette() });
		expect(attributes).toEqual({ textColor: 'vivid-red' });
	});

	it('leaves the default origin out when the theme turned it off, since it has no CSS then', () => {
		withSettings({ __experimentalFeatures: { color: { defaultPalette: false, palette: { theme, default: defaults } } } });
		expect(slugs(readEditorPalette())).toEqual(['accent']);
	});

	it('falls back to settings.colors with no features', () => {
		withSettings({ colors: theme });
		expect(slugs(readEditorPalette())).toEqual(['accent']);
	});

	it('returns an empty list outside the block editor', () => {
		expect(readEditorPalette()).toEqual([]);
		withSettings({});
		expect(readEditorPalette()).toEqual([]);
	});
});

describe('canKeepTextIndent (#348)', () => {
	const paragraph = { supports: { typography: { textIndent: true } } };
	const heading = { supports: { typography: { textAlign: true } } };
	// Core's style map knows textIndent from WordPress 7.0
	const map70 = { textIndent: { value: ['typography', 'textIndent'] } };

	it('is true for a block type with the support when core renders it', () => {
		expect(canKeepTextIndent(paragraph, map70, undefined, 'core/paragraph')).toBe(true);
	});

	it('is false for a block type without the support, such as core Heading', () => {
		expect(canKeepTextIndent(heading, map70, undefined, 'core/heading')).toBe(false);
		expect(canKeepTextIndent(null, map70, undefined, 'core/heading')).toBe(false);
	});

	it('is false when core does not know the support (before WordPress 7.0), though block.json declares it', () => {
		expect(canKeepTextIndent(paragraph, {}, undefined, 'typost/block')).toBe(false);
		expect(canKeepTextIndent(paragraph, undefined, undefined, 'typost/block')).toBe(false);
	});

	it('is false when the theme hides the control, since the author could not see or edit the value', () => {
		expect(canKeepTextIndent(paragraph, map70, { typography: { textIndent: false } }, 'core/paragraph')).toBe(false);
		expect(canKeepTextIndent(paragraph, map70, { blocks: { 'core/paragraph': { typography: { textIndent: false } } } }, 'core/paragraph')).toBe(false);
	});

	it('lets a block-level setting win over the global one', () => {
		const features = { typography: { textIndent: false }, blocks: { 'core/paragraph': { typography: { textIndent: 'all' } } } };
		expect(canKeepTextIndent(paragraph, map70, features, 'core/paragraph')).toBe(true);
		expect(canKeepTextIndent(paragraph, map70, { typography: { textIndent: 'subsequent' } }, 'core/paragraph')).toBe(true);
	});
});

describe('blockCarriesStyle (#348)', () => {
	const style = { id: 5 };

	it('matches a core block whose class carries the style, as the style CSS does', () => {
		expect(blockCarriesStyle({ name: 'core/paragraph', attributes: { className: 'is-style-x typost-styled typost-ps-5' } }, style)).toBe(true);
		expect(blockCarriesStyle({ name: 'core/heading', attributes: { className: 'typost-styled typost-ps-5' } }, style)).toBe(true);
	});

	it('needs typost-styled on a core block, like the generated selector', () => {
		expect(blockCarriesStyle({ name: 'core/paragraph', attributes: { className: 'typost-ps-5' } }, style)).toBe(false);
	});

	it('matches a Typography Stylist block by its styleClass, fit or not', () => {
		expect(blockCarriesStyle({ name: 'typost/block', attributes: { styleClass: 'typost-ps-5' } }, style)).toBe(true);
		expect(blockCarriesStyle({ name: 'typost/block', attributes: { styleClass: 'typost-ps-5', fontSize: 'fit' } }, style)).toBe(true);
		expect(blockCarriesStyle({ name: 'typost/block', attributes: { styleClass: '' } }, style)).toBe(false);
	});

	it('matches whole class names only, and another style does not count', () => {
		expect(blockCarriesStyle({ name: 'core/paragraph', attributes: { className: 'typost-styled typost-ps-50' } }, style)).toBe(false);
		expect(blockCarriesStyle({ name: 'core/paragraph', attributes: { className: 'typost-styled typost-ps-6' } }, style)).toBe(false);
	});

	it('matches the legacy id, which the style CSS lists with the numeric one', () => {
		const legacy = { id: 5, legacyId: 'ps_1709312345_123' };
		expect(blockCarriesStyle({ name: 'core/paragraph', attributes: { className: 'typost-styled typost-ps-ps_1709312345_123' } }, legacy)).toBe(true);
		expect(blockCarriesStyle({ name: 'typost/block', attributes: { styleClass: 'typost-ps-ps_1709312345_123' } }, legacy)).toBe(true);
	});

	it('is false with no block or no style', () => {
		expect(blockCarriesStyle(null, style)).toBe(false);
		expect(blockCarriesStyle({ name: 'core/paragraph', attributes: { className: 'typost-styled typost-ps-5' } }, null)).toBe(false);
		expect(blockCarriesStyle({ name: 'core/paragraph' }, style)).toBe(false);
	});
});

describe('readTextIndentSupport and readPreviousBlock (#348)', () => {
	afterEach(() => {
		delete window.wp;
	});

	const withEditor = ({ blockTypes = {}, styleProperty, features, blocks = {}, order = [] } = {}) => {
		window.wp = {
			blocks: {
				getBlockType: (name) => blockTypes[name] || null,
				__EXPERIMENTAL_STYLE_PROPERTY: styleProperty,
			},
			data: {
				select: () => ({
					getSettings: () => ({ __experimentalFeatures: features }),
					getPreviousBlockClientId: (id) => {
						const i = order.indexOf(id);
						return i > 0 ? order[i - 1] : null;
					},
					getBlockName: (id) => (blocks[id] ? blocks[id].name : null),
					getBlockAttributes: (id) => (blocks[id] ? blocks[id].attributes : null),
				}),
			},
		};
	};

	it('reads the support from the registered block type, core\'s style map and the theme settings', () => {
		withEditor({
			blockTypes: { 'core/paragraph': { supports: { typography: { textIndent: true } } } },
			styleProperty: { textIndent: {} },
			features: { typography: { textIndent: 'subsequent' } },
		});
		expect(readTextIndentSupport('core/paragraph')).toBe(true);
		expect(readTextIndentSupport('core/heading')).toBe(false);
	});

	it('is false before WordPress 7.0, when core\'s style map has no textIndent', () => {
		withEditor({ blockTypes: { 'typost/block': { supports: { typography: { textIndent: true } } } }, styleProperty: {} });
		expect(readTextIndentSupport('typost/block')).toBe(false);
	});

	it('is false outside the block editor', () => {
		expect(readTextIndentSupport('core/paragraph')).toBe(false);
	});

	it('reads the block before this one in the same parent', () => {
		withEditor({
			order: ['a', 'b'],
			blocks: { a: { name: 'core/paragraph', attributes: { className: 'typost-styled typost-ps-5' } }, b: { name: 'core/paragraph', attributes: {} } },
		});
		expect(readPreviousBlock('b')).toEqual({ name: 'core/paragraph', attributes: { className: 'typost-styled typost-ps-5' } });
		expect(readPreviousBlock('a')).toBeNull();
	});

	it('returns null outside the block editor', () => {
		expect(readPreviousBlock('b')).toBeNull();
	});
});

describe('em values follow the text size (#363)', () => {
	const STYLE = { spaceBefore: '1em', indentStart: '2em', firstLineIndent: '1.5em' };
	const CLAMP = 'clamp(1rem, 2rem + 3vw, 4rem)';

	it("'keep' leaves em values in em: the text keeps its size", () => {
		const result = buildDetachBlockSettings(STYLE, {}, { textIndent: true, fontSizePx: 20, emBasis: 'keep' });
		expect(result.attributes.style).toEqual({
			spacing: { margin: { top: '1em' }, padding: { left: '2em' } },
			typography: { textIndent: '1.5em' },
		});
		expect(result.emConverted).toBe(false);
		expect(result.followsTextSize).toBe(false);
	});

	it('a fixed px size multiplies, whatever the measured size', () => {
		const result = buildDetachBlockSettings(STYLE, {}, { textIndent: true, fontSizePx: 13, emBasis: '20px' });
		expect(result.attributes.style).toEqual({
			spacing: { margin: { top: '20px' }, padding: { left: '40px' } },
			typography: { textIndent: '30px' },
		});
		expect(result.emConverted).toBe(false);
		expect(result.followsTextSize).toBe(false);
	});

	it('a fixed rem size writes rem', () => {
		const { attributes } = buildDetachBlockSettings({ firstLineIndent: '1.5em', indentStart: '0.333em' }, {}, { textIndent: true, emBasis: '1.25rem' });
		expect(attributes.style.typography.textIndent).toBe('1.875rem');
		expect(attributes.style.spacing.padding.left).toBe('0.4163rem');
	});

	it('a responsive size writes calc() of the size, and says so', () => {
		const result = buildDetachBlockSettings(STYLE, {}, { textIndent: true, fontSizePx: 40.2, emBasis: CLAMP });
		expect(result.attributes.style).toEqual({
			spacing: { margin: { top: `calc(1 * ${CLAMP})` }, padding: { left: `calc(2 * ${CLAMP})` } },
			typography: { textIndent: `calc(1.5 * ${CLAMP})` },
		});
		expect(result.emConverted).toBe(false);
		expect(result.followsTextSize).toBe(true);
	});

	it('px values stay as they are, and alone do not report calc()', () => {
		const result = buildDetachBlockSettings({ indentStart: '12px' }, {}, { emBasis: CLAMP });
		expect(result.attributes.style.spacing.padding.left).toBe('12px');
		expect(result.followsTextSize).toBe(false);
	});

	it('margins on the wrapper still stay in em (keepMarginEm)', () => {
		const { attributes } = buildDetachBlockSettings({ spaceBefore: '1em', indentStart: '1em' }, {}, { emBasis: '20px', keepMarginEm: true });
		expect(attributes.style.spacing).toEqual({ margin: { top: '1em' }, padding: { left: '20px' } });
	});

	it.each([[''], [undefined], ['bogus'], ['0px'], ['-2px']])('basis %p falls back to the measured size', (emBasis) => {
		const result = buildDetachBlockSettings({ firstLineIndent: '1.5em' }, {}, { textIndent: true, fontSizePx: 20, emBasis });
		expect(result.attributes.style.typography.textIndent).toBe('30px');
		expect(result.emConverted).toBe(true);
	});
});

describe('styleFontSizeCss (#363)', () => {
	// The value buildStyleCssBlock() writes, so Detach multiplies by what rendered
	const rendered = (properties) => {
		const match = /font-size: ([^;}\n]+)/.exec(buildStyleCssBlock({ id: 9, properties }));
		return match ? match[1].trim() : '';
	};

	it.each([
		['no size', {}],
		['inherit', { fontSize: 'inherit' }],
		['a fixed px size (no unit key)', { fontSize: '24' }],
		['a fixed rem size', { fontSize: 24, fontSizeUnit: 'rem' }],
		['a responsive px size', { fontSize: 'responsive', fontSizeMin: 16, fontSizePreferred: 32, fontSizeMax: 64 }],
		['a responsive rem size', { fontSize: 'responsive', fontSizeMin: 16, fontSizePreferred: 16, fontSizeMax: 120, fontSizeUnit: 'rem' }],
		['a fit style (its fallback clamp)', { fontSize: 'fit', fontSizeMin: 16, fontSizePreferred: 32, fontSizeMax: 64, fontSizeUnit: 'rem' }],
	])('%s: the value the style CSS writes', (_, properties) => {
		expect(styleFontSizeCss(properties)).toBe(rendered(properties));
	});

	it('the control finds a size in the CSS', () => {
		expect(rendered({ fontSize: 24, fontSizeUnit: 'rem' })).toBe('1.5rem');
		expect(styleFontSizeCss({})).toBe('');
	});
});

describe('coreDetachEmBasis (#363)', () => {
	const RESPONSIVE = { fontSize: 'responsive', fontSizeMin: 16, fontSizePreferred: 32, fontSizeMax: 64, fontSizeUnit: 'rem' };

	it('a style with no size: the block keeps its size, so em stays em', () => {
		expect(coreDetachEmBasis({ firstLineIndent: '1em' }, {})).toBe('keep');
		expect(coreDetachEmBasis({ fontSize: 'inherit' }, {})).toBe('keep');
	});

	it('a block with its own size never had the style\'s size', () => {
		expect(coreDetachEmBasis(RESPONSIVE, { fontSize: 'large' })).toBe('keep');
		expect(coreDetachEmBasis(RESPONSIVE, { style: { typography: { fontSize: '2rem' } } })).toBe('keep');
	});

	it('otherwise the style\'s size, as its CSS writes it', () => {
		expect(coreDetachEmBasis({ fontSize: '24' }, {})).toBe('24px');
		expect(coreDetachEmBasis(RESPONSIVE, { style: { typography: { textIndent: '1em' } } })).toBe(styleFontSizeCss(RESPONSIVE));
		expect(coreDetachEmBasis(RESPONSIVE, {})).toMatch(/^clamp\(/);
	});
});

describe('the Detach routes (#348)', () => {
	// editor.js is an IIFE and edit.js a React component, so neither can be
	// called here; read the call each makes instead
	const callIn = (file) => {
		const source = fs.readFileSync(path.join(__dirname, file), 'utf8');
		// The call, not a mention in a comment
		const start = source.indexOf('.buildDetachBlockSettings(');
		expect(start).toBeGreaterThan(-1);
		return source.slice(start, source.indexOf(');', start));
	};

	it.each([
		['the core block route', '../assets/js/editor.js', /textIndent: utils\.readTextIndentSupport\(editor\.getBlockName\(clientId\)\)/],
		['the Typography Stylist block route', '../../blocks/typography-stylist/edit.js', /textIndent: !!\(psUtils\.readTextIndentSupport && psUtils\.readTextIndentSupport\('typost\/block'\)\)/],
	])('%s passes whether the block can hold a Text indent', (_, file, pattern) => {
		expect(callIn(file)).toMatch(pattern);
	});

	it.each([
		['the core block route', '../assets/js/editor.js', /followsSameStyle: utils\.blockCarriesStyle\(utils\.readPreviousBlock\(clientId\), detached\)/],
		['the Typography Stylist block route', '../../blocks/typography-stylist/edit.js', /followsSameStyle: !!\(psUtils\.blockCarriesStyle && psUtils\.blockCarriesStyle\(psUtils\.readPreviousBlock\(curClientId\), detachedStyle\)\)/],
	])('%s passes whether the block before carries the style', (_, file, pattern) => {
		expect(callIn(file)).toMatch(pattern);
	});

	it.each([
		['the core block route', '../assets/js/editor.js', /emBasis: utils\.coreDetachEmBasis\(detached\.properties, editor\.getBlockAttributes\(clientId\)\)/],
		['the Typography Stylist block route', '../../blocks/typography-stylist/edit.js', /emBasis: detachEmBasis/],
	])('%s passes the size the text has after Detach (#363)', (_, file, pattern) => {
		expect(callIn(file)).toMatch(pattern);
	});
});

describe('the Detach notice (#363)', () => {
	const editor = fs.readFileSync(path.join(__dirname, '../assets/js/editor.js'), 'utf8');
	const notice = editor.slice(editor.indexOf('function showDetachNotice('), editor.indexOf('// A Typography Stylist block keeps its values'));

	it('says when kept values follow the text size and show empty in the sidebar', () => {
		expect(notice).toMatch(/if \(result\.followsTextSize\) \{\s*parts\.push\(__\('[^']*follow the text size[^']*sidebar[^']*'/);
	});
});

describe('the block text color rule', () => {
	it('passes the block color to the text element, past a theme heading color', () => {
		const css = fs.readFileSync(path.join(__dirname, '../../blocks/typography-stylist/style.css'), 'utf8');
		expect(css).toMatch(/\.wp-block-typost\.has-text-color > :is\(\.typost-styled, \.typost-block-content\)\s*\{\s*color: inherit;/);
	});
});

describe('measureBlockFontSize', () => {
	afterEach(() => {
		document.body.innerHTML = '';
	});

	it('reads the visual heading of a Typography Stylist block', () => {
		document.body.innerHTML = '<div data-block="a" style="font-size: 10px"><h2 class="typost-block-content" style="font-size: 40px">x</h2></div>';
		expect(measureBlockFontSize('a')).toBe(40);
	});

	it('reads the block itself otherwise', () => {
		document.body.innerHTML = '<p data-block="b" style="font-size: 18px">x</p>';
		expect(measureBlockFontSize('b')).toBe(18);
	});

	it('returns null when the block is not rendered', () => {
		expect(measureBlockFontSize('missing')).toBeNull();
		expect(measureBlockFontSize('')).toBeNull();
	});
});
