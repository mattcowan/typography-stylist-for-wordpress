/**
 * Hyphenation in paragraph styles (#208).
 *
 * The CSS is held to the same fixture as the PHP generator
 * (tests/Unit/ParagraphStylesHyphenationTest.php). Like the #207 settings,
 * no editor has a control for hyphenation, so the rest of this file checks
 * that Update Style and Save as New keep it, that only the admin Edit form
 * compares it, and that Based On treats it as one group.
 */

const fixture = require('./fixtures/hyphenation-css.json');
const {
	buildStyleCssBlock,
	buildPropertiesFromState,
	buildPropertiesForStyleSave,
	buildStyleUpdateProperties,
	buildDetachBlockSettings,
	isStyleModified,
	normalizeApplyProperties,
	normalizeHyphens,
	normalizeHyphenateLimit,
	normalizeHyphenateCharacter,
	hyphenationProperties,
	resolveStyleProperties,
	computeStyleOverrides,
	HYPHENATE_LIMIT_MAX,
} = require('../assets/js/lib/ps-utils');

describe('CSS (shared fixture)', () => {
	test('the fixture is read', () => {
		// A control: an empty list would let every case pass by never running
		expect(fixture.cases.length).toBeGreaterThanOrEqual(10);
	});

	test.each(fixture.cases.map((c) => [c.label, c]))('%s', (label, c) => {
		expect(buildStyleCssBlock({ id: 9, properties: c.properties })).toBe(c.css);
	});

	test('a fit line and its measuring probe never hyphenate under a style that does', () => {
		// A fit block can keep a non-fit style's class, so its hyphens: auto is inherited
		const fs = require('fs');
		const path = require('path');
		const block = path.join(__dirname, '../../blocks/typography-stylist');
		const lineRule = fs.readFileSync(path.join(block, 'style.css'), 'utf8').match(/\.wp-block-typost \.typost-fit \.typost-line \{[^}]*white-space: nowrap[^}]*\}/);
		expect(lineRule).not.toBeNull();
		expect(lineRule[0]).toMatch(/-webkit-hyphens: manual;/);
		expect(lineRule[0]).toMatch(/\bhyphens: manual;/);
		const edit = fs.readFileSync(path.join(block, 'hooks', 'use-fit-measurement.js'), 'utf8');
		expect(edit).toMatch(/node\.style\.hyphens = 'manual';/);
		expect(edit).toMatch(/node\.style\.webkitHyphens = 'manual';/);
	});

	test('a styled span inside a fit line does not hyphenate either, whatever its style says', () => {
		// A style's span selector is (0,6,0), so only !important on the descendants beats it
		const fs = require('fs');
		const path = require('path');
		const block = path.join(__dirname, '../../blocks/typography-stylist');
		const css = fs.readFileSync(path.join(block, 'style.css'), 'utf8');
		const rule = css.match(/\.wp-block-typost \.typost-fit \.typost-line \* \{[^}]*\}/);
		expect(rule).not.toBeNull();
		expect(rule[0]).toMatch(/-webkit-hyphens: manual !important;/);
		expect(rule[0]).toMatch(/\bhyphens: manual !important;/);
		// The probe holds the same spans
		const edit = fs.readFileSync(path.join(block, 'hooks', 'use-fit-measurement.js'), 'utf8');
		expect(edit).toMatch(/node\.querySelectorAll\('\*'\)\.forEach\(\(s\) => \{\s*s\.style\.setProperty\('-webkit-hyphens', 'manual', 'important'\);\s*s\.style\.setProperty\('hyphens', 'manual', 'important'\);/);
	});

	test('a style without hyphenation writes the same CSS as before', () => {
		const props = { fontWeight: '700', textWrap: 'balance', wordSpacing: 20 };
		expect(buildStyleCssBlock({ id: 9, properties: props })).not.toMatch(/hyphen/);
	});

	test('off writes nothing, so the browser default (manual) keeps soft hyphens working', () => {
		expect(buildStyleCssBlock({ id: 9, properties: { hyphens: '' } })).toBe('');
		expect(buildStyleCssBlock({ id: 9, properties: { hyphens: false } })).toBe('');
	});
});

describe('normalizers', () => {
	test('hyphens is on only for auto', () => {
		expect(normalizeHyphens('auto')).toBe('auto');
		['', 'manual', 'none', true, 1, null, undefined].forEach((v) => expect(normalizeHyphens(v)).toBe(''));
	});

	test('limits: numbers and numeric strings, 0 = auto, capped, floored', () => {
		expect(normalizeHyphenateLimit(6)).toBe(6);
		expect(normalizeHyphenateLimit('6')).toBe(6);
		expect(normalizeHyphenateLimit(' 4 ')).toBe(4);
		expect(normalizeHyphenateLimit(5.9)).toBe(5);
		expect(normalizeHyphenateLimit(HYPHENATE_LIMIT_MAX + 5)).toBe(HYPHENATE_LIMIT_MAX);
		expect(normalizeHyphenateLimit('1e1')).toBe(10);
		[0, 0.5, -3, '', 'abc', '0x1A', true, null, undefined, NaN, Infinity].forEach((v) => {
			expect(normalizeHyphenateLimit(v)).toBe(v === Infinity ? HYPHENATE_LIMIT_MAX : 0);
		});
	});

	test('character: up to four code points, nothing that could end the CSS string', () => {
		expect(normalizeHyphenateCharacter('=')).toBe('=');
		expect(normalizeHyphenateCharacter(' ‐ ')).toBe('‐');
		expect(normalizeHyphenateCharacter('😀😀😀😀')).toBe('😀😀😀😀');
		expect(normalizeHyphenateCharacter('-----')).toBe('');
		['"', "'", '\\', '<', '>', '{', '}', ';', 'a\nb', '\u0085', ' ', '\ud800', '', '   ', 5, null].forEach((v) => {
			expect(normalizeHyphenateCharacter(v)).toBe('');
		});
	});

	test('the group: limits and character only with hyphenation on', () => {
		expect(hyphenationProperties({ hyphenateLimitWord: 6, hyphenateCharacter: '=' })).toEqual({});
		expect(hyphenationProperties({ hyphens: 'auto', hyphenateLimitWord: 0, hyphenateLimitBefore: '2', hyphenateCharacter: '"' })).toEqual({
			hyphens: 'auto',
			hyphenateLimitBefore: 2,
		});
	});
});

describe('the editors keep it (no editor control)', () => {
	const base = { fontWeight: '700', hyphens: 'auto', hyphenateLimitWord: 6, hyphenateLimitAfter: 3, hyphenateCharacter: '=' };

	test('buildPropertiesFromState stores it only when on', () => {
		expect(buildPropertiesFromState({ hyphens: 'auto', hyphenateLimitWord: 6, hyphenateLimitBefore: 0 })).toEqual({ hyphens: 'auto', hyphenateLimitWord: 6 });
		expect(buildPropertiesFromState({ hyphens: '', hyphenateLimitWord: 6, hyphenateCharacter: '=' })).toEqual({});
	});

	test('Update Style and Save as New carry the style’s own hyphenation', () => {
		expect(buildPropertiesForStyleSave({ explicitFontWeight: '600' }, base, true)).toEqual({
			fontWeight: '600', hyphens: 'auto', hyphenateLimitWord: 6, hyphenateLimitAfter: 3, hyphenateCharacter: '=',
		});
		expect(buildPropertiesForStyleSave({ explicitFontWeight: '600' }, base, false)).toMatchObject({ hyphens: 'auto' });
	});

	test('the Edit form reports it, so turning it off removes it', () => {
		const props = buildPropertiesForStyleSave({ explicitFontWeight: '700', hyphens: '', hyphenateLimitWord: 6 }, base, true);
		expect(props).toEqual({ fontWeight: '700' });
	});

	test('the (modified) badge compares it only when the state reports it', () => {
		expect(isStyleModified({ explicitFontWeight: '700' }, base)).toBe(false);
		const same = { explicitFontWeight: '700', hyphens: 'auto', hyphenateLimitWord: 6, hyphenateLimitBefore: 0, hyphenateLimitAfter: '3', hyphenateCharacter: '=' };
		expect(isStyleModified(same, base)).toBe(false);
		expect(isStyleModified({ ...same, hyphens: '' }, base)).toBe(true);
		expect(isStyleModified({ ...same, hyphenateLimitWord: 7 }, base)).toBe(true);
		expect(isStyleModified({ ...same, hyphenateCharacter: '' }, base)).toBe(true);
		// Limits left in the form while off do not count
		expect(isStyleModified({ explicitFontWeight: '700', hyphens: '', hyphenateLimitWord: 9 }, { fontWeight: '700' })).toBe(false);
	});

	test('applying a style adds no hyphenation defaults (nothing in an editor to reset)', () => {
		const normalized = normalizeApplyProperties({ fontWeight: '700' });
		expect(Object.keys(normalized).filter((k) => /hyphen/i.test(k))).toEqual([]);
	});
});

describe('Based On: one group', () => {
	const parent = { id: 1, name: 'Body', properties: { hyphens: 'auto', hyphenateLimitWord: 6, hyphenateCharacter: '=' } };

	test('a child inherits the whole group', () => {
		const child = { id: 2, name: 'Body – Justified', basedOn: 1, properties: { alignment: 'justify' } };
		expect(resolveStyleProperties(child, [parent, child])).toEqual({ alignment: 'justify', hyphens: 'auto', hyphenateLimitWord: 6, hyphenateCharacter: '=' });
	});

	test('a child with its own limits does not keep the parent’s character', () => {
		const child = { id: 2, name: 'Narrow', basedOn: 1, properties: { hyphens: 'auto', hyphenateLimitBefore: 3 } };
		expect(resolveStyleProperties(child, [parent, child])).toEqual({ hyphens: 'auto', hyphenateLimitBefore: 3 });
	});

	test('a child turns it off with hyphens: ""', () => {
		const child = { id: 2, name: 'Plain', basedOn: 1, properties: { hyphens: '' } };
		expect(resolveStyleProperties(child, [parent, child])).toEqual({});
	});

	test('overrides: equal to the parent inherits, off stores the empty value', () => {
		expect(computeStyleOverrides({ hyphens: 'auto', hyphenateLimitWord: 6, hyphenateCharacter: '=' }, parent.properties)).toEqual({});
		expect(computeStyleOverrides({}, parent.properties)).toEqual({ hyphens: '' });
		expect(computeStyleOverrides({ hyphens: 'auto' }, parent.properties)).toEqual({ hyphens: 'auto' });
	});

	test('Update Style on a child keeps it inherited', () => {
		const child = { id: 2, name: 'Lead', basedOn: 1, properties: { fontWeight: '700', hyphens: 'auto', hyphenateLimitWord: 6, hyphenateCharacter: '=' }, ownProperties: { fontWeight: '700' } };
		expect(buildStyleUpdateProperties({ explicitFontWeight: '700' }, child, [parent, child])).toEqual({ fontWeight: '700' });
	});
});

describe('Detach', () => {
	test('names hyphenation, which no block setting can hold', () => {
		expect(buildDetachBlockSettings({ hyphens: 'auto' }, {}).removed).toEqual(['hyphens']);
		expect(buildDetachBlockSettings({ hyphens: '' }, {}).removed).toEqual([]);
	});

	test('not on a fit style, which never wrote it', () => {
		expect(buildDetachBlockSettings({ fontSize: 'fit', hyphens: 'auto' }, {}).removed).toEqual([]);
	});
});
