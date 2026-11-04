/**
 * Text color and outline in paragraph styles (#215).
 *
 * The CSS is held to the same fixture as the PHP generator
 * (tests/Unit/ParagraphStylesTextColorTest.php). The editors have no control
 * for these settings, so Update Style and Save as New keep them, and only
 * the admin Edit form compares them. The contrast check (WCAG 1.4.3) is
 * shown in the Edit form.
 *
 * @jest-environment jsdom
 */

const {
	buildStyleCssBlock,
	buildPropertiesFromState,
	buildPropertiesForStyleSave,
	buildStyleUpdateProperties,
	isStyleModified,
	normalizeApplyProperties,
	normalizeColor,
	normalizeHexColor,
	buildPaletteColor,
	paletteColorSlug,
	paletteColorFallback,
	colorCssValue,
	normalizeStrokeWidth,
	parseCssColor,
	contrastRatio,
	isLargeText,
	findContrastProblem,
	resolveStyleProperties,
	computeStyleOverrides,
} = require('../assets/js/lib/ps-utils');

const fixture = require('./fixtures/text-color-css.json');

describe('buildStyleCssBlock (shared fixture)', () => {
	test('the fixture is read', () => {
		expect(fixture.cases.length).toBeGreaterThanOrEqual(12);
	});

	fixture.cases.forEach(({ label, legacyId, properties, css }) => {
		test(label, () => {
			const style = { id: 8, properties };
			if (legacyId) style.legacyId = legacyId;
			expect(buildStyleCssBlock(style)).toBe(css);
		});
	});

	test('a style without the new properties writes what it wrote before', () => {
		expect(buildStyleCssBlock({ id: 8, properties: { fontWeight: '700' } })).toBe(
			'.typost-ps-8,\n.typost-styled.typost-ps-8.typost-ps-8.typost-ps-8.typost-ps-8.typost-ps-8,\n' +
			'.typost-styled[data-style-id="8"][data-style-id][data-style-id][data-style-id][data-style-id] {\n    font-weight: 700;\n}'
		);
	});

	describe('the block\'s own text color wins (acceptance criterion)', () => {
		const css = buildStyleCssBlock({ id: 8, properties: { textColor: '#336699' } });
		const rules = css.split('\n\n');
		const styleSelector = rules[0].split(' {')[0].split(',\n')[1];
		const blockSelector = rules[1].split(' {')[0];
		const render = (html) => {
			const host = document.createElement('div');
			host.innerHTML = html;
			return host.querySelector('.typost-ps-8');
		};

		test('the style colors a block with no color of its own', () => {
			const el = render('<div class="wp-block-typost"><h2 class="visually-hidden">x</h2><h2 class="typost-styled typost-ps-8" aria-hidden="true">x</h2></div>');
			expect(el.matches(styleSelector)).toBe(true);
			expect(el.matches(blockSelector)).toBe(false);
		});

		test('a block with its own color (preset class or inline) gets it back', () => {
			const el = render('<div class="wp-block-typost has-text-color has-accent-color"><h2 class="visually-hidden">x</h2><h2 class="typost-styled typost-ps-8" aria-hidden="true">x</h2></div>');
			expect(el.matches(blockSelector)).toBe(true);
		});

		test('the block rule is more specific than the style rule', () => {
			const count = (selector) => (selector.match(/\.[\w-]+/g) || []).length;
			expect(count(blockSelector)).toBeGreaterThan(count(styleSelector));
		});

		test('an inline span with the style inside a colored block keeps the style\'s color', () => {
			const el = render('<div class="wp-block-typost has-text-color"><h2 class="typost-styled" aria-hidden="true"><span class="typost-styled typost-ps-8" data-style-id="8">x</span></h2></div>');
			expect(el.matches(blockSelector)).toBe(false);
		});
	});
});

describe('colors', () => {
	test('hex colors are expanded and lowercased', () => {
		expect(normalizeHexColor('#ABC')).toBe('#aabbcc');
		expect(normalizeHexColor('#abcd')).toBe('#aabbccdd');
		expect(normalizeHexColor('#12345')).toBe('');
		expect(normalizeHexColor('red')).toBe('');
	});

	test('normalizeColor keeps the three stored forms and drops anything else', () => {
		expect(normalizeColor('var:preset|color|accent-1|#CC0000')).toBe('var:preset|color|accent-1|#cc0000');
		expect(normalizeColor('var:preset|color|accent-1')).toBe('var:preset|color|accent-1');
		expect(normalizeColor('transparent')).toBe('');
		expect(normalizeColor('transparent', true)).toBe('transparent');
		['red', 'var(--x)', 'var:preset|color|a b', 'var:preset|color|x|red', 'var:preset|color|x;color:red', null, 5, {}].forEach((bad) => {
			expect(normalizeColor(bad)).toBe('');
		});
	});

	test('a palette color stores its slug and, when it is hex, the color as the fallback', () => {
		expect(buildPaletteColor('accent-1', '#C00')).toBe('var:preset|color|accent-1|#cc0000');
		expect(buildPaletteColor('accent-1', 'oklch(60% 0.2 30)')).toBe('var:preset|color|accent-1');
		expect(buildPaletteColor('Bad Slug', '#c00')).toBe('');
		expect(paletteColorSlug('var:preset|color|accent-1|#cc0000')).toBe('accent-1');
		expect(paletteColorFallback('var:preset|color|accent-1|#cc0000')).toBe('#cc0000');
		expect(paletteColorSlug('#cc0000')).toBe('');
	});

	test('a palette color renders from the theme\'s CSS variable', () => {
		expect(colorCssValue('var:preset|color|accent-1|#cc0000')).toBe('var(--wp--preset--color--accent-1, #cc0000)');
		expect(colorCssValue('var:preset|color|accent-1')).toBe('var(--wp--preset--color--accent-1)');
		expect(colorCssValue('#cc000080')).toBe('#cc000080');
	});

	test('outline width: PHP is_numeric rules, capped, two decimals', () => {
		expect(normalizeStrokeWidth('2')).toBe(2);
		expect(normalizeStrokeWidth(1.255)).toBe(1.26);
		expect(normalizeStrokeWidth(99)).toBe(20);
		expect(normalizeStrokeWidth('0.004')).toBe(0);
		expect(normalizeStrokeWidth('2px')).toBe(0);
		expect(normalizeStrokeWidth(true)).toBe(0);
		expect(normalizeStrokeWidth('0x1A')).toBe(0);
	});
});

describe('Based On', () => {
	const parent = { id: 1, name: 'Display', properties: { textColor: '#111111', textStrokeWidth: 2, textStrokeColor: '#cc0000', textStrokePosition: 'behind' } };

	test('the outline inherits as a group', () => {
		const child = { id: 2, basedOn: 1, properties: { textStrokeWidth: 1 } };
		expect(resolveStyleProperties(child, [parent, child])).toEqual({ textColor: '#111111', textStrokeWidth: 1 });
	});

	test('empty values unset the parent\'s color and outline', () => {
		const child = { id: 3, basedOn: 1, properties: { textStrokeWidth: 0, textColor: '' } };
		expect(resolveStyleProperties(child, [parent, child])).toEqual({});
		expect(computeStyleOverrides({}, parent.properties)).toEqual({ textStrokeWidth: 0, textColor: '' });
	});

	test('values equal to the parent\'s become inherited', () => {
		expect(computeStyleOverrides({ textColor: '#111', textStrokeWidth: '2', textStrokeColor: '#CC0000', textStrokePosition: 'behind' }, parent.properties)).toEqual({});
	});
});

describe('editors (style-only properties)', () => {
	const style = { textColor: 'var:preset|color|accent-1|#cc0000', textStrokeWidth: 2, textStrokeColor: '#000000', textStrokePosition: 'behind' };

	test('an editor state without the keys does not show (modified)', () => {
		expect(isStyleModified({ fontWeight: '400' }, style)).toBe(false);
	});

	test('the Edit form\'s state is compared', () => {
		expect(isStyleModified(Object.assign({}, style), style)).toBe(false);
		expect(isStyleModified(Object.assign({}, style, { textColor: '#cc0000' }), style)).toBe(true);
		expect(isStyleModified(Object.assign({}, style, { textStrokePosition: '' }), style)).toBe(true);
		expect(isStyleModified(Object.assign({}, style, { textStrokeWidth: 0 }), style)).toBe(true);
	});

	test('Update Style and Save as New from an editor keep the style\'s color and outline', () => {
		expect(buildPropertiesForStyleSave({ fontWeight: '700' }, style, true)).toEqual(Object.assign({ fontWeight: '700' }, style));
		expect(buildPropertiesForStyleSave({ fontWeight: '700' }, style, false)).toEqual(Object.assign({ fontWeight: '700' }, style));
	});

	test('a form that reports the keys wins, none and 0 included', () => {
		expect(buildPropertiesForStyleSave({ textColor: '', textStrokeWidth: 0 }, style, true)).toEqual({});
	});

	test('capture stores the outline\'s color and position only with a width', () => {
		expect(buildPropertiesFromState({ textColor: '#ABC', textStrokeWidth: 0, textStrokeColor: '#000', textStrokePosition: 'behind' })).toEqual({ textColor: '#aabbcc' });
		expect(buildPropertiesFromState({ textColor: 'transparent', textStrokeWidth: '1.5', textStrokeColor: '#000', textStrokePosition: 'over' })).toEqual({ textColor: 'transparent', textStrokeWidth: 1.5, textStrokeColor: '#000000' });
	});

	test('a child style\'s Update Style keeps inheriting the parent\'s color', () => {
		const parentStyle = { id: 1, properties: { textColor: '#336699' } };
		const child = { id: 2, basedOn: 1, ownProperties: { fontWeight: '700' }, properties: { textColor: '#336699', fontWeight: '700' } };
		expect(buildStyleUpdateProperties({ fontWeight: '700' }, child, [parentStyle, child])).toEqual({ fontWeight: '700' });
	});

	test('apply adds no defaults for them (nothing to reset)', () => {
		const normalized = normalizeApplyProperties({});
		['textColor', 'textStrokeWidth', 'textStrokeColor', 'textStrokePosition'].forEach((key) => {
			expect(normalized).not.toHaveProperty(key);
		});
	});
});

describe('contrast (WCAG 1.4.3)', () => {
	const palette = [{ slug: 'accent-1', color: '#767676' }, { slug: 'pale', color: '#dddddd' }, { slug: 'fancy', color: 'oklch(60% 0.2 30)' }];
	const white = { palette, background: '#ffffff', text: '#111111' };

	test('ratios match the WCAG formula', () => {
		expect(contrastRatio(parseCssColor('#000'), parseCssColor('#fff'))).toBeCloseTo(21, 5);
		expect(contrastRatio(parseCssColor('#777777'), parseCssColor('#ffffff'))).toBeCloseTo(4.48, 2);
		expect(contrastRatio(parseCssColor('rgb(118, 118, 118)'), parseCssColor('#fff'))).toBeCloseTo(4.54, 2);
	});

	test('a color with transparency is checked as it shows over the background', () => {
		// 50% black (0x80) over white shows as #7f7f7f, 4.0:1
		expect(contrastRatio(parseCssColor('#00000080'), parseCssColor('#fff'))).toBeCloseTo(4.0, 1);
	});

	test('large text: 24px, or 18.66px bold; a fluid size counts by its smallest size', () => {
		expect(isLargeText({ fontSize: '24' })).toBe(true);
		expect(isLargeText({ fontSize: '19', fontWeight: '700' })).toBe(true);
		expect(isLargeText({ fontSize: '19' })).toBe(false);
		expect(isLargeText({ fontSize: 'responsive', fontSizeMin: 16, fontSizeMax: 64 })).toBe(false);
		expect(isLargeText({})).toBe(false);
	});

	test('a text color below 4.5:1 is flagged, 3:1 for large text', () => {
		expect(findContrastProblem({ textColor: '#777777' }, white)).toEqual({ ratio: 4.47, required: 4.5, pair: 'text' });
		expect(findContrastProblem({ textColor: '#777777', fontSize: '32' }, white)).toBeNull();
		expect(findContrastProblem({ textColor: '#000000' }, white)).toBeNull();
	});

	test('a palette color is checked as the palette has it now', () => {
		expect(findContrastProblem({ textColor: 'var:preset|color|accent-1|#000000' }, white)).toBeNull();
		expect(findContrastProblem({ textColor: 'var:preset|color|pale|#000000' }, white).pair).toBe('text');
		// Not in the palette: its saved color
		expect(findContrastProblem({ textColor: 'var:preset|color|gone|#eeeeee' }, white).pair).toBe('text');
	});

	test('a color the check cannot read is not flagged', () => {
		expect(findContrastProblem({ textColor: 'var:preset|color|fancy' }, white)).toBeNull();
		expect(findContrastProblem({ textColor: '#eeeeee' }, { background: 'var(--x)' })).toBeNull();
	});

	test('outline-only text checks the outline against the background', () => {
		expect(findContrastProblem({ textColor: 'transparent', textStrokeWidth: 2, textStrokeColor: '#dddddd' }, white)).toEqual(expect.objectContaining({ pair: 'outline' }));
		expect(findContrastProblem({ textColor: 'transparent', textStrokeWidth: 2, textStrokeColor: '#000000' }, white)).toBeNull();
	});

	test('a fill with an outline passes when it stands out from the background or from the outline', () => {
		// Pale fill on white with a dark halo: readable against the halo
		expect(findContrastProblem({ textColor: '#eeeeee', textStrokeWidth: 4, textStrokeColor: '#000000' }, white)).toBeNull();
		// Pale fill, pale outline: neither
		expect(findContrastProblem({ textColor: '#eeeeee', textStrokeWidth: 4, textStrokeColor: '#dddddd' }, white).pair).toBe('text-outline');
	});

	test('an outline with no color of its own uses the fill, and no fill uses the theme text color', () => {
		expect(findContrastProblem({ textStrokeWidth: 1 }, white)).toBeNull();
		expect(findContrastProblem({ textStrokeWidth: 1 }, { background: '#ffffff', text: '#eeeeee' }).pair).toBe('text-outline');
	});

	test('the background defaults to white', () => {
		expect(findContrastProblem({ textColor: '#eeeeee' }, {}).pair).toBe('text');
	});
});
