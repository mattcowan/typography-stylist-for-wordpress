/**
 * Tests for the Variable Fonts module's pure variation-settings utilities
 * (variable-fonts/assets/js/lib/variation-utils.js).
 */

const {
	parseVariationSettings,
	buildVariationSettings,
	getQuickButtons,
} = require('../assets/js/lib/variation-utils.js');

describe('parseVariationSettings', () => {
	test('parses a multi-axis string', () => {
		expect(parseVariationSettings('"wght" 650, "wdth" 87.5')).toEqual({
			wght: 650,
			wdth: 87.5,
		});
	});

	test('parses single-quoted tags and negative values', () => {
		expect(parseVariationSettings("'slnt' -12")).toEqual({ slnt: -12 });
	});

	test('returns empty object for empty/undefined input', () => {
		expect(parseVariationSettings('')).toEqual({});
		expect(parseVariationSettings(undefined)).toEqual({});
	});

	test('ignores malformed segments', () => {
		expect(parseVariationSettings('"wght" 400, nonsense, "opsz"')).toEqual({ wght: 400 });
	});
});

describe('buildVariationSettings', () => {
	test('builds a string with integer formatting for whole numbers', () => {
		expect(buildVariationSettings({ wght: 650, wdth: 87.5 })).toBe('"wght" 650, "wdth" 87.5');
	});

	test('round-trips through parse', () => {
		const obj = { wght: 425, slnt: -8.5, GRAD: 88 };
		expect(parseVariationSettings(buildVariationSettings(obj))).toEqual(obj);
	});

	test('returns empty string for empty object', () => {
		expect(buildVariationSettings({})).toBe('');
	});
});

describe('getQuickButtons', () => {
	test('wght: hundreds clamped to the axis range', () => {
		expect(getQuickButtons({ tag: 'wght', min: 300, max: 700, default: 400 }))
			.toEqual([300, 400, 500, 600, 700]);
	});

	test('wdth: meaningful stops within range', () => {
		expect(getQuickButtons({ tag: 'wdth', min: 75, max: 125, default: 100 }))
			.toEqual([75, 87.5, 100, 112.5, 125]);
	});

	test('ital is binary', () => {
		expect(getQuickButtons({ tag: 'ital', min: 0, max: 1, default: 0 })).toEqual([0, 1]);
	});

	test('custom axis includes min, max, and default', () => {
		const buttons = getQuickButtons({ tag: 'GRAD', min: -200, max: 150, default: 0 });
		expect(buttons[0]).toBe(-200);
		expect(buttons).toContain(0);
		expect(buttons[buttons.length - 1]).toBe(150);
	});

	test('zero-range axis returns single value', () => {
		expect(getQuickButtons({ tag: 'XXXX', min: 5, max: 5, default: 5 })).toEqual([5]);
	});
});
