/**
 * The block weight after a font pick (#411 review, round 2):
 * resolveFontPickWeight() in assets/js/font-weights.js.
 *
 * A block with fontWeight '' renders at the theme's (or a paragraph
 * style's, or a parent's) weight. Before, getClosestWeight('', …) returned
 * the font's lightest weight, so picking a font lightened a theme-bold
 * heading.
 */

const { getClosestWeight, normalizeRenderedWeight, resolveFontPickWeight } = require('../font-weights.js');

// The sidebar Font Family control's rule before round 2, for every weight
// other than ''
function legacyPick(fontWeight, available) {
	let next = fontWeight;
	if (available && available.length > 0) {
		if (!available.includes(fontWeight)) next = getClosestWeight(fontWeight, available);
		if (available.length === 1 && fontWeight !== available[0]) next = available[0];
	}
	return next;
}

const FONTS = [
	['300 to 900', ['300', '400', '500', '600', '700', '800', '900']],
	['300 and 400', ['300', '400']],
	['one weight 500', ['500']],
	['one weight 700', ['700']],
	['no weight list', []],
];

describe('resolveFontPickWeight: a block with no weight of its own', () => {
	it.each([
		['the font has the rendered weight: keep the theme', '700', ['300', '400', '700'], ''],
		['the font lacks it: the closest weight', '700', ['300', '400'], '400'],
		['the font lacks it, heavier is closer', '700', ['300', '800'], '800'],
		['a font with one weight that matches', '700', ['700'], ''],
		['a font with one other weight', '700', ['500'], '500'],
		['a keyword rendered weight', 'bold', ['300', '700'], ''],
		['a number', 400, ['400', '700'], ''],
	])('%s', (_, rendered, available, expected) => {
		expect(resolveFontPickWeight('', available, rendered)).toBe(expected);
	});

	it.each([undefined, null, '', 'inherit', 'abc'])("keeps '' when the rendered weight is unknown (%p), never the lightest", (rendered) => {
		expect(resolveFontPickWeight('', ['300', '400', '700'], rendered)).toBe('');
	});

	it("keeps '' for a font with no weight list", () => {
		expect(resolveFontPickWeight('', [], '700')).toBe('');
		expect(resolveFontPickWeight('', undefined, '700')).toBe('');
	});

	it("is the bug it fixes: getClosestWeight('') gives the lightest", () => {
		expect(getClosestWeight('', ['300', '700'])).toBe('300');
		expect(resolveFontPickWeight('', ['300', '700'], '700')).toBe('');
	});
});

describe('resolveFontPickWeight: every other weight as before', () => {
	const weights = ['100', '200', '300', '400', '500', '600', '700', '800', '900', '450'];
	FONTS.forEach(([name, available]) => {
		it.each(weights)(`%s with a font of ${name} gives what the control gave before`, (weight) => {
			expect(resolveFontPickWeight(weight, available, '700')).toBe(legacyPick(weight, available));
		});
	});
});

describe('normalizeRenderedWeight', () => {
	it.each([
		['700', '700'], [700, '700'], ['bold', '700'], ['normal', '400'], ['lighter', '300'], ['bolder', '700'],
		[' 600 ', '600'], ['', ''], [undefined, ''], [null, ''], ['inherit', ''], ['70x', ''],
	])('%p gives %p', (input, expected) => {
		expect(normalizeRenderedWeight(input)).toBe(expected);
	});
});
