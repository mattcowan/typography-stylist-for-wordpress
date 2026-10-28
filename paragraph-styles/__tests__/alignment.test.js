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
} = require('../assets/js/lib/ps-utils');

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
