/**
 * Detach keeps a style's color, spacing and indents in the block's own settings (#346).
 *
 * @jest-environment jsdom
 */

const fs = require('fs');
const path = require('path');
const { buildDetachBlockSettings, measureBlockFontSize, readEditorPalette } = require('../assets/js/lib/ps-utils');

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

	it('changes nothing for a style with none of these values', () => {
		expect(buildDetachBlockSettings({ fontId: 3, fontWeight: '700' }, { style: { spacing: {} } })).toEqual({
			attributes: {},
			removed: [],
			emConverted: false,
		});
	});

	it.each([[undefined], [null], ['text']])('copes with properties of %p', (properties) => {
		expect(buildDetachBlockSettings(properties, undefined, undefined)).toEqual({ attributes: {}, removed: [], emConverted: false });
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
		const { removed } = buildDetachBlockSettings(everything, {}, { coreBlock: true, hasGrepRules: true });
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
