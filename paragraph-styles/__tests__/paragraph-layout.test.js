/**
 * Indents and paragraph spacing in paragraph styles (#199).
 *
 * The CSS is held to the same fixture as the PHP generator
 * (tests/Unit/ParagraphStylesLayoutTest.php). The editors have no control
 * for these settings, so the rest of this file checks that Update Style and
 * Save as New keep them, that only the admin Edit form compares them, and
 * that a style based on another can unset each of them.
 */

const fixture = require('./fixtures/paragraph-layout-css.json');
const {
	buildStyleCssBlock,
	buildPropertiesFromState,
	buildPropertiesForStyleSave,
	buildStyleUpdateProperties,
	buildStylePreviewStyle,
	isStyleModified,
	normalizeApplyProperties,
	normalizeLength,
	indentAfterSameApplies,
	resolveStyleProperties,
	resolveStyleList,
	computeStyleOverrides,
	SPACING_PROPERTIES,
} = require('../assets/js/lib/ps-utils');

describe('CSS matches the shared fixture', () => {
	test.each(fixture.cases.map((c) => [c.label, c]))('%s', (label, c) => {
		const style = { id: 8, properties: c.properties };
		if (c.legacyId) {
			style.legacyId = c.legacyId;
		}
		expect(buildStyleCssBlock(style)).toBe(c.css);
	});

	test('no indent or spacing rule reaches the inline-span selector', () => {
		fixture.cases.forEach((c) => {
			// Each layout rule block starts after the span selector's own
			// rule; none of them lists a [data-style-id] selector
			c.css.split('\n\n').filter((block) => /padding-inline|text-indent: -?\d|margin-block/.test(block)).forEach((block) => {
				expect(block).not.toContain('[data-style-id');
			});
		});
	});

	test('a style without the new keys writes the same CSS as before', () => {
		const props = { fontWeight: '700', letterSpacing: 20, alignment: 'center', initialHang: 0.1 };
		const css = buildStyleCssBlock({ id: 3, properties: props });
		expect(css).not.toMatch(/padding-inline|margin-block|wp-block-typost:has/);
	});
});

describe('normalizeLength', () => {
	test.each([
		['1.5em', false, '1.5em'],
		[' 1.50EM ', false, '1.5em'],
		['24px', false, '24px'],
		['.5em', false, '0.5em'],
		['1.0005em', false, '1.001em'],
		['2000px', false, '1000px'],
		['80em', false, '50em'],
		['-1.5em', true, '-1.5em'],
		['-1.5em', false, ''],
		['0em', false, ''],
		['0.0004px', false, ''],
		['1.5', false, ''],
		['1.5rem', false, ''],
		['1e2px', false, ''],
		[12, false, ''],
		[null, false, ''],
		[undefined, true, ''],
	])('%p (negative %p) → %p', (value, allowNegative, expected) => {
		expect(normalizeLength(value, allowNegative)).toBe(expected);
	});

	test('"only after the same style" needs a positive first line indent and true', () => {
		expect(indentAfterSameApplies({ firstLineIndent: '1em', indentAfterSame: true })).toBe(true);
		expect(indentAfterSameApplies({ firstLineIndent: '-1em', indentAfterSame: true })).toBe(false);
		expect(indentAfterSameApplies({ firstLineIndent: '1em', indentAfterSame: 'true' })).toBe(false);
		expect(indentAfterSameApplies({ indentAfterSame: true })).toBe(false);
	});
});

describe('capture, compare and carry', () => {
	const STYLE = {
		fontWeight: '400',
		indentStart: '1em',
		indentEnd: '20px',
		firstLineIndent: '1.5em',
		indentAfterSame: true,
		spaceBefore: '0.5em',
		spaceAfter: '1em',
	};

	test('an editor state without the keys never reads as modified', () => {
		expect(isStyleModified({ explicitFontWeight: '400' }, STYLE)).toBe(false);
	});

	test('the Edit form state compares each value, and the option', () => {
		const state = Object.assign({ explicitFontWeight: '400' }, STYLE);
		expect(isStyleModified(state, STYLE)).toBe(false);
		SPACING_PROPERTIES.forEach((key) => {
			expect(isStyleModified(Object.assign({}, state, { [key]: '' }), STYLE)).toBe(true);
		});
		expect(isStyleModified(Object.assign({}, state, { firstLineIndent: '2em' }), STYLE)).toBe(true);
		expect(isStyleModified(Object.assign({}, state, { indentAfterSame: false }), STYLE)).toBe(true);
		// The same value written another way is not a change
		expect(isStyleModified(Object.assign({}, state, { indentStart: '1.0EM' }), STYLE)).toBe(false);
	});

	test('buildPropertiesFromState stores normalized values and drops none', () => {
		expect(buildPropertiesFromState({ indentStart: ' 2EM', indentEnd: '0px', spaceAfter: '', firstLineIndent: '-1em', indentAfterSame: true })).toEqual({
			indentStart: '2em',
			firstLineIndent: '-1em',
		});
	});

	test('Update Style and Save as New from an editor keep the style\'s values (#199 review)', () => {
		const editorState = { explicitFontWeight: '700', features: ['liga'] };
		const expected = Object.assign({}, STYLE, { fontWeight: '700', features: ['liga'] });
		expect(buildPropertiesForStyleSave(editorState, STYLE, true)).toEqual(expected);
		expect(buildPropertiesForStyleSave(editorState, STYLE, false)).toEqual(expected);
	});

	test('a state that reports a key wins, empty included', () => {
		const formState = Object.assign({}, STYLE, { explicitFontWeight: '400', spaceBefore: '', firstLineIndent: '' });
		const props = buildPropertiesForStyleSave(formState, STYLE, true);
		expect(props).not.toHaveProperty('spaceBefore');
		expect(props).not.toHaveProperty('firstLineIndent');
		expect(props).not.toHaveProperty('indentAfterSame');
		expect(props.spaceAfter).toBe('1em');
	});

	test('the apply payload adds no defaults for them', () => {
		const normalized = normalizeApplyProperties({ fontWeight: '400' });
		['indentStart', 'indentEnd', 'firstLineIndent', 'indentAfterSame', 'spaceBefore', 'spaceAfter'].forEach((key) => {
			expect(normalized).not.toHaveProperty(key);
		});
	});

	test('the style browser row resets them; a style without them keeps the plain preview', () => {
		expect(buildStylePreviewStyle(STYLE).style).toMatchObject({
			paddingInlineStart: 0,
			paddingInlineEnd: 0,
			textIndent: 0,
			marginBlockStart: 0,
			marginBlockEnd: 0,
		});
		expect(Object.keys(buildStylePreviewStyle({ fontSize: '24' }).style).sort()).toEqual(['fontSize', 'lineHeight']);
	});
});

describe('Based On', () => {
	const styles = resolveStyleList([
		{ id: 1, name: 'Body', properties: { spaceAfter: '1em', indentStart: '2em', firstLineIndent: '1.5em', indentAfterSame: true } },
		{ id: 2, name: 'Body – First', basedOn: 1, properties: { firstLineIndent: '', spaceAfter: '' } },
		{ id: 3, name: 'Body – Wide', basedOn: 1, properties: { firstLineIndent: '3em' } },
	]);

	test('a child unsets the first line indent and spacing, and keeps the rest', () => {
		expect(resolveStyleProperties(styles[1], styles)).toEqual({ indentStart: '2em' });
	});

	test('the first line indent inherits as a group: its own indent drops the parent\'s option', () => {
		expect(resolveStyleProperties(styles[2], styles)).toEqual({ spaceAfter: '1em', indentStart: '2em', firstLineIndent: '3em' });
	});

	test('overrides store the empty value of what the look drops', () => {
		const parent = resolveStyleProperties(styles[0], styles);
		expect(computeStyleOverrides({ indentStart: '2em' }, parent)).toEqual({ firstLineIndent: '', spaceAfter: '' });
		expect(computeStyleOverrides(Object.assign({}, parent, { firstLineIndent: '1.5em', indentAfterSame: undefined }), parent)).toEqual({ firstLineIndent: '1.5em' });
	});

	test('Update Style from an editor on a child keeps it inheriting', () => {
		expect(buildStyleUpdateProperties({ explicitFontWeight: '' }, styles[2], styles)).toEqual({ firstLineIndent: '3em' });
	});
});
