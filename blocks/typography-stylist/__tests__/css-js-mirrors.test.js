/**
 * CSS and JS that mirror each other (#358).
 *
 * Each case reads the stylesheet rule a JS function mirrors and checks that
 * the two agree, or checks a value the block writes against the code that
 * reads it back (the fit line sizes, shared with PHP through
 * tests/fixtures/fit-line-sizes.json). docs/twins.md lists every twin.
 */

import { create } from 'react-test-renderer';
import { initialHangApplies, buildFitFontSize, resolveBlockFontFamilyStyle } from '../utils';

jest.mock('@wordpress/block-editor');

// Imported after the mock, as save.test.js does
import save from '../save';

const fs = require('fs');
const path = require('path');

const styleCss = fs.readFileSync(path.join(__dirname, '..', 'style.css'), 'utf8');

describe('First Letter Hang alignment guard (style.css and initialHangApplies)', () => {
	// The rules that set --typost-hang-on: 0 from the visual element's own
	// inline text-align, optionally for one direction:
	// .wp-block-typost > :is(…)[:dir(ltr)]:is([style*="text-align:right"], …) { --typost-hang-on: 0; }
	const RULE = /\.wp-block-typost > :is\(\.typost-styled, \.typost-block-content\)(:dir\((ltr|rtl)\))?:is\(\[style\*="text-align:([a-z]+)"\], \[style\*="text-align: \3"\]\) \{\s*--typost-hang-on: 0;/g;
	const offRules = Array.from(styleCss.matchAll(RULE), (m) => ({ dir: m[2] || 'any', align: m[3] }));

	const cssTurnsHangOff = (align, isRtl) => offRules.some((rule) => rule.align === align && (rule.dir === 'any' || rule.dir === (isRtl ? 'rtl' : 'ltr')));

	test('the stylesheet rules are found (control)', () => {
		expect(offRules).toEqual([
			{ dir: 'any', align: 'center' },
			{ dir: 'ltr', align: 'right' },
			{ dir: 'rtl', align: 'left' },
		]);
	});

	test.each(['', 'left', 'right', 'center', 'justify'])('text-align "%s" in both directions', (align) => {
		[false, true].forEach((isRtl) => {
			expect(initialHangApplies(align, isRtl)).toBe(!cssTurnsHangOff(align, isRtl));
		});
	});
});

describe('block font family (save.js and resolveBlockFontFamilyStyle)', () => {
	// save() writes the font family inline; the editor preview, the fit
	// measurement and the QFT previews call resolveBlockFontFamilyStyle().
	const savedFontFamily = (attributes) => {
		const tree = create(save({ attributes: Object.assign({ content: 'Text', tagName: 'h2', features: [], fontSize: 'inherit', fontWeight: '400', letterSpacing: 0 }, attributes) })).toJSON();
		// The visual copy (the second child) carries the style object
		const visual = tree.children[1];
		return (visual.props.style && visual.props.style.fontFamily) || '';
	};

	test.each([
		['a font id', { fontId: 12 }],
		['a font id and a family name (the id wins)', { fontId: 7, fontFamily: 'Georgia' }],
		['a family name only', { fontFamily: 'Georgia' }],
		['neither', {}],
	])('%s', (label, attributes) => {
		expect(savedFontFamily(attributes)).toBe(resolveBlockFontFamilyStyle(attributes.fontId, attributes.fontFamily));
	});
});

describe('fit lines that grow with zoom (style.css and buildFitFontSize)', () => {
	test('a rem line reads the custom property the stylesheet sets, and a px line does not', () => {
		const rule = styleCss.match(/\.typost-line\[style\*="(--typost-fit-width)"\]/);
		expect(rule).not.toBeNull();
		expect(styleCss).toMatch(new RegExp(rule[1] + ':\\s*32rem'));
		expect(buildFitFontSize(0.25, 0, 'rem', 0.4)).toContain('var(' + rule[1] + ', 100cqi)');
		expect(buildFitFontSize(0.25, 0, 'px')).not.toContain(rule[1]);
	});
});

describe('fit line sizes (shared fixture with the PHP render filter)', () => {
	const fixture = require('../../../tests/fixtures/fit-line-sizes.json');

	test('the fixture is read', () => {
		// A control: an empty list would let every case pass by never running
		expect(fixture.cases.length).toBeGreaterThanOrEqual(5);
	});

	test.each(fixture.cases.map((c) => [c.label, c]))('%s', (label, c) => {
		expect(buildFitFontSize(...c.args)).toBe(c.fontSize);
		// The ratio the PHP filter reads is the line ratio the block wrote
		expect(c.ratio).toBe(String(c.args[0]));
	});
});
