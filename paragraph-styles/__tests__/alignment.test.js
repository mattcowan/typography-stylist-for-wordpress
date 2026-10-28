/**
 * Alignment, word spacing and line breaking in paragraph styles (#207).
 *
 * The CSS is held to the same fixture as the PHP generator
 * (tests/Unit/ParagraphStylesAlignmentTest.php). The editors have no control
 * for these settings, so the rest of this file checks that Update Style and
 * Save as New keep them, and that only the admin Edit form compares them.
 */

const {
	buildStyleCssBlock,
	buildPropertiesFromState,
	buildPropertiesForStyleSave,
	buildStyleUpdateProperties,
	isStyleModified,
	normalizeApplyProperties,
	normalizeAlignment,
	normalizeAlignLast,
	normalizeTextWrap,
	alignmentToBlockAlign,
	buildCoreBlockAlignUpdate,
} = require('../assets/js/lib/ps-utils');

describe('Detach keeps the alignment on a core block (PR #329 review)', () => {
	// The three ways core stores a block's text alignment. The WordPress 7.1
	// Heading also has an `align` attribute: the block alignment (wide,
	// full) from supports.align, which must not be used (measured in the
	// editor: an earlier version set align: 'center' there)
	const WP71 = { attributes: { align: { type: 'string' } }, supports: { align: ['wide', 'full'], typography: { textAlign: true } } };
	const OLD_HEADING = { attributes: { textAlign: { type: 'string' } }, supports: {} };
	const OLD_PARAGRAPH = { attributes: { align: { type: 'string' } }, supports: {} };

	test('maps Start and End by text direction', () => {
		expect(alignmentToBlockAlign('start', false)).toBe('left');
		expect(alignmentToBlockAlign('end', false)).toBe('right');
		expect(alignmentToBlockAlign('start', true)).toBe('right');
		expect(alignmentToBlockAlign('end', true)).toBe('left');
		expect(alignmentToBlockAlign('center', false)).toBe('center');
		expect(alignmentToBlockAlign('', false)).toBe('');
		expect(alignmentToBlockAlign('left', false)).toBe('');
	});

	test('uses the typography support on WordPress 7.x, and keeps the rest of style', () => {
		const attrs = { style: { typography: { fontSize: '2rem' }, color: { text: '#000' } } };
		expect(buildCoreBlockAlignUpdate(WP71, attrs, 'center', false)).toEqual({
			style: { typography: { fontSize: '2rem', textAlign: 'center' }, color: { text: '#000' } },
		});
	});

	test('uses the textAlign or align attribute on older versions', () => {
		expect(buildCoreBlockAlignUpdate(OLD_HEADING, {}, 'end', false)).toEqual({ textAlign: 'right' });
		expect(buildCoreBlockAlignUpdate(OLD_PARAGRAPH, {}, 'start', true)).toEqual({ align: 'right' });
	});

	test('a wide block still gets its text alignment', () => {
		expect(buildCoreBlockAlignUpdate(WP71, { align: 'wide' }, 'center', false)).toEqual({
			style: { typography: { textAlign: 'center' } },
		});
	});

	test('align is not the text alignment on a block type with block alignment support', () => {
		const layoutOnly = { attributes: { align: { type: 'string' } }, supports: { align: ['wide', 'full'] } };
		expect(buildCoreBlockAlignUpdate(layoutOnly, {}, 'center', false)).toBeNull();
	});

	test('a block with its own alignment keeps it', () => {
		expect(buildCoreBlockAlignUpdate(WP71, { style: { typography: { textAlign: 'left' } } }, 'center', false)).toBeNull();
		expect(buildCoreBlockAlignUpdate(OLD_HEADING, { textAlign: 'left' }, 'center', false)).toBeNull();
	});

	test('Justify, no alignment, or an unknown block type change nothing', () => {
		// Core has no rule for has-text-align-justify
		expect(buildCoreBlockAlignUpdate(WP71, {}, 'justify', false)).toBeNull();
		expect(buildCoreBlockAlignUpdate(WP71, {}, '', false)).toBeNull();
		expect(buildCoreBlockAlignUpdate(null, {}, 'center', false)).toBeNull();
	});
});

const fixture = require('./fixtures/alignment-css.json');

describe('buildStyleCssBlock (shared fixture)', () => {
	test('the fixture is read', () => {
		expect(fixture.cases.length).toBeGreaterThanOrEqual(8);
	});

	fixture.cases.forEach(({ label, legacyId, properties, css }) => {
		test(label, () => {
			const style = { id: 8, properties };
			if (legacyId) style.legacyId = legacyId;
			expect(buildStyleCssBlock(style)).toBe(css);
		});
	});

	describe('the alignment guard matches the right elements (PR #329 review)', () => {
		// The first selector of the guarded rule, run against real elements
		const css = buildStyleCssBlock({ id: 8, properties: { alignment: 'center' } });
		const selector = css.split(',\n')[0];
		const el = (html) => {
			const host = document.createElement('div');
			host.innerHTML = html;
			return host.firstElementChild;
		};

		test.each([
			['plain styled text', '<p class="typost-ps-8">x</p>'],
			['text-align-last of its own only', '<p class="typost-ps-8" style="text-align-last: center">x</p>'],
			['a custom property with text-align in its name', '<p class="typost-ps-8" style="--x-text-align: 1">x</p>']
		])('applies to %s', (label, html) => {
			expect(el(html).matches(selector)).toBe(true);
		});

		test.each([
			['an inline text-align (saved form)', '<p class="typost-ps-8" style="font-weight:700;text-align:center">x</p>'],
			['an inline text-align (editor form)', '<p class="typost-ps-8" style="font-weight: 700; text-align: center">x</p>'],
			['an inline text-align first', '<p class="typost-ps-8" style="text-align: right">x</p>'],
			['a core alignment class', '<p class="typost-ps-8 has-text-align-center">x</p>'],
			['a fit-to-width block', '<h2 class="typost-styled typost-fit typost-ps-8">x</h2>']
		])('skips %s', (label, html) => {
			expect(el(html).matches(selector)).toBe(false);
		});
	});

	test('line breaking hands the wrap mode back to the parent (PR #329 review)', () => {
		const css = buildStyleCssBlock({ id: 8, properties: { textWrap: 'balance' } });
		expect(css).toContain('text-wrap: balance;\n    text-wrap-mode: inherit;');
	});

	test('no declaration uses !important (WCAG 1.4.12: user word spacing must still win)', () => {
		fixture.cases.forEach(({ css }) => {
			expect(css).not.toMatch(/!important/);
		});
	});

	test('a style without the new properties writes what it wrote before', () => {
		expect(buildStyleCssBlock({ id: 8, properties: { fontWeight: '700' } })).toBe(
			'.typost-ps-8,\n.typost-styled.typost-ps-8.typost-ps-8.typost-ps-8.typost-ps-8.typost-ps-8,\n' +
			'.typost-styled[data-style-id="8"][data-style-id][data-style-id][data-style-id][data-style-id] {\n    font-weight: 700;\n}'
		);
	});
});

describe('normalizers', () => {
	test('alignment keeps only the four values', () => {
		expect(normalizeAlignment('justify')).toBe('justify');
		expect(normalizeAlignment('left')).toBe('');
		expect(normalizeAlignment(undefined)).toBe('');
	});

	test('the last line only counts for justified text, and start is the default', () => {
		expect(normalizeAlignLast('justify', 'center')).toBe('center');
		expect(normalizeAlignLast('justify', 'start')).toBe('');
		expect(normalizeAlignLast('center', 'center')).toBe('');
	});

	test('line breaking keeps balance and pretty', () => {
		expect(normalizeTextWrap('balance')).toBe('balance');
		expect(normalizeTextWrap('pretty')).toBe('pretty');
		expect(normalizeTextWrap('stable')).toBe('');
	});
});

describe('buildPropertiesFromState (the admin Edit form reports the keys)', () => {
	test('stores what is set', () => {
		expect(buildPropertiesFromState({ alignment: 'justify', alignLast: 'end', wordSpacing: -25, textWrap: 'balance' })).toEqual({
			alignment: 'justify',
			alignLast: 'end',
			wordSpacing: -25,
			textWrap: 'balance',
		});
	});

	test('stores nothing for Default, Normal and 0, and no last line without justify', () => {
		expect(buildPropertiesFromState({ alignment: '', alignLast: 'center', wordSpacing: 0, textWrap: '' })).toEqual({});
		expect(buildPropertiesFromState({ alignment: 'center', alignLast: 'center' })).toEqual({ alignment: 'center' });
	});
});

describe('buildPropertiesForStyleSave (editors do not report the keys)', () => {
	const base = { fontWeight: '700', alignment: 'justify', alignLast: 'center', wordSpacing: 40, textWrap: 'pretty' };

	test('Update Style from an editor keeps the style\'s own values', () => {
		const props = buildPropertiesForStyleSave({ explicitFontWeight: '600' }, base, true);
		expect(props).toEqual({ fontWeight: '600', alignment: 'justify', alignLast: 'center', wordSpacing: 40, textWrap: 'pretty' });
	});

	test('a form that reports the keys wins, Default and 0 included', () => {
		const props = buildPropertiesForStyleSave({ explicitFontWeight: '700', alignment: '', wordSpacing: 0, textWrap: '' }, base, true);
		expect(props).toEqual({ fontWeight: '700' });
	});

	test('a child keeps inheriting the values its parent sets', () => {
		const styles = [
			{ id: 1, name: 'Body', properties: { alignment: 'justify', wordSpacing: 40 } },
			{ id: 2, name: 'Lead', basedOn: 1, properties: { fontWeight: '700', alignment: 'justify', wordSpacing: 40 }, ownProperties: { fontWeight: '700' } },
		];
		expect(buildStyleUpdateProperties({ explicitFontWeight: '700' }, styles[1], styles)).toEqual({ fontWeight: '700' });
	});
});

describe('isStyleModified', () => {
	const styleProps = { alignment: 'justify', alignLast: 'center', wordSpacing: 40, textWrap: 'pretty' };

	test('an editor state without the keys does not show (modified)', () => {
		expect(isStyleModified({}, styleProps)).toBe(false);
	});

	test('a state that reports them is compared', () => {
		const same = { alignment: 'justify', alignLast: 'center', wordSpacing: 40, textWrap: 'pretty' };
		expect(isStyleModified(same, styleProps)).toBe(false);
		expect(isStyleModified({ ...same, alignment: 'start' }, styleProps)).toBe(true);
		expect(isStyleModified({ ...same, alignLast: '' }, styleProps)).toBe(true);
		expect(isStyleModified({ ...same, wordSpacing: 0 }, styleProps)).toBe(true);
		expect(isStyleModified({ ...same, textWrap: 'balance' }, styleProps)).toBe(true);
	});
});

describe('normalizeApplyProperties', () => {
	test('adds no defaults for the style-only keys', () => {
		const normalized = normalizeApplyProperties({});
		['alignment', 'alignLast', 'wordSpacing', 'textWrap', 'textAlign'].forEach((key) => {
			expect(normalized).not.toHaveProperty(key);
		});
	});
});
