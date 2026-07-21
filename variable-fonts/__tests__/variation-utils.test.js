/**
 * Tests for the Variable Fonts module's pure variation-settings utilities
 * (variable-fonts/assets/js/lib/variation-utils.js).
 */

const {
	parseVariationSettings,
	buildVariationSettings,
	getQuickButtons,
	resolveWeightControlType,
	resolveWeightControlFontId,
	resolveAxesFontId,
	mapFvarAxes,
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

	test('custom axis snaps stops to round multiples, not offsets of min', () => {
		expect(getQuickButtons({ tag: 'CONY', min: 1, max: 1000, default: 400 }))
			.toEqual([1, 200, 400, 600, 800, 1000]);
	});

	test('custom axis drops stops that crowd min, max, or default', () => {
		expect(getQuickButtons({ tag: 'CONY', min: 1, max: 1000, default: 410 }))
			.toEqual([1, 200, 410, 600, 800, 1000]);
	});

	test('custom axis caps the row at 7 buttons and always keeps min/max/default', () => {
		const cases = [
			{ tag: 'AAAA', min: 0, max: 100, default: 50 },
			{ tag: 'BBBB', min: -200, max: 150, default: 0 },
			{ tag: 'CCCC', min: 0, max: 1, default: 0.5 },
			{ tag: 'DDDD', min: 13, max: 977, default: 250 },
		];
		for (const axis of cases) {
			const buttons = getQuickButtons(axis);
			expect(buttons.length).toBeLessThanOrEqual(7);
			expect(buttons[0]).toBe(axis.min);
			expect(buttons[buttons.length - 1]).toBe(axis.max);
			expect(buttons).toContain(axis.default);
			// strictly ascending, no duplicates
			for (let i = 1; i < buttons.length; i++) {
				expect(buttons[i]).toBeGreaterThan(buttons[i - 1]);
			}
		}
	});

	test('custom axis with fractional step rounds cleanly', () => {
		expect(getQuickButtons({ tag: 'CCCC', min: 0, max: 1, default: 0.5 }))
			.toEqual([0, 0.2, 0.4, 0.5, 0.6, 0.8, 1]);
	});

	test('zero-range axis returns single value', () => {
		expect(getQuickButtons({ tag: 'XXXX', min: 5, max: 5, default: 5 })).toEqual([5]);
	});
});

describe('resolveWeightControlType', () => {
	const wghtAxes = [{ tag: 'wght', name: 'Weight', min: 100, max: 900, default: 400 }];
	const customAxes = [
		{ tag: 'CONY', name: 'Counter Y', min: 1, max: 1000, default: 400 },
		{ tag: 'CONX', name: 'Counter X', min: 1, max: 1000, default: 400 },
	];

	test('wght axis → variable (slider replaces dropdown)', () => {
		expect(resolveWeightControlType('default', wghtAxes, null)).toBe('variable');
	});

	test('no wght axis + hideWeights flag → hidden', () => {
		expect(resolveWeightControlType('default', customAxes, { isVariable: true, hideWeights: true }))
			.toBe('hidden');
		expect(resolveWeightControlType('default', null, { isVariable: true, hideWeights: true }))
			.toBe('hidden');
	});

	test('wght axis wins over hideWeights', () => {
		expect(resolveWeightControlType('default', wghtAxes, { isVariable: true, hideWeights: true }))
			.toBe('variable');
	});

	test('isVariable without hideWeights → passthrough (dropdown kept)', () => {
		expect(resolveWeightControlType('default', customAxes, { isVariable: true, hideWeights: false }))
			.toBe('default');
	});

	test('null axes and flags → passthrough', () => {
		expect(resolveWeightControlType('default', null, null)).toBe('default');
	});

	test('preserves another extension\'s override when not variable', () => {
		expect(resolveWeightControlType('custom-thing', null, null)).toBe('custom-thing');
	});
});

describe('resolveWeightControlFontId / resolveAxesFontId', () => {
	test('inline editor state uses selectedFontId', () => {
		expect(resolveWeightControlFontId({ selectedFontId: 4 })).toBe(4);
		expect(resolveAxesFontId({ selectedFontId: 4 })).toBe(4);
	});

	test('QFT state: inline font at selection beats block font', () => {
		const state = { fontId: 7, inlineFontFamilyAtSelection: 4 };
		expect(resolveWeightControlFontId(state)).toBe(4);
		expect(resolveAxesFontId(state)).toBe(4);
	});

	test('inspector state falls back to fontId', () => {
		expect(resolveWeightControlFontId({ fontId: 7, fontWeight: '400' })).toBe(7);
	});

	test('axes resolver also accepts inlineFontFamily', () => {
		expect(resolveAxesFontId({ fontId: 7, inlineFontFamily: 4 })).toBe(4);
	});

	test('empty or missing state', () => {
		expect(resolveWeightControlFontId({})).toBeUndefined();
		expect(resolveWeightControlFontId(null)).toBeUndefined();
		expect(resolveAxesFontId({})).toBeUndefined();
		expect(resolveAxesFontId(null)).toBeUndefined();
	});
});

describe('mapFvarAxes', () => {
	const registered = { wght: 'Weight', wdth: 'Width' };

	test('registered tag gets the registered display name', () => {
		expect(mapFvarAxes(
			[{ tag: 'wght', minValue: 100, defaultValue: 400, maxValue: 900, name: { en: 'Gewicht' } }],
			registered
		)).toEqual([{ tag: 'wght', name: 'Weight', min: 100, max: 900, default: 400 }]);
	});

	test('unregistered tag uses the fvar name record', () => {
		expect(mapFvarAxes(
			[{ tag: 'CONY', minValue: 1, defaultValue: 400, maxValue: 1000, name: { en: 'Counter Y' } }],
			registered
		)).toEqual([{ tag: 'CONY', name: 'Counter Y', min: 1, max: 1000, default: 400 }]);
	});

	test('no name record falls back to uppercased tag', () => {
		expect(mapFvarAxes([{ tag: 'grad', minValue: 0, defaultValue: 0, maxValue: 100 }], registered))
			.toEqual([{ tag: 'grad', name: 'GRAD', min: 0, max: 100, default: 0 }]);
	});

	test('values rounded to 2dp and default clamped into range', () => {
		expect(mapFvarAxes(
			[{ tag: 'opsz', minValue: 7.99999, defaultValue: 200, maxValue: 144.0001 }],
			{}
		)).toEqual([{ tag: 'opsz', name: 'OPSZ', min: 8, max: 144, default: 144 }]);
	});

	test('min > max is swapped', () => {
		expect(mapFvarAxes([{ tag: 'XXXX', minValue: 900, defaultValue: 400, maxValue: 100 }], {}))
			.toEqual([{ tag: 'XXXX', name: 'XXXX', min: 100, max: 900, default: 400 }]);
	});

	test('duplicate tags deduped, malformed records skipped', () => {
		expect(mapFvarAxes([
			{ tag: 'wght', minValue: 100, defaultValue: 400, maxValue: 900 },
			{ tag: 'wght', minValue: 200, defaultValue: 500, maxValue: 800 },
			{ minValue: 1, defaultValue: 2, maxValue: 3 },
			{ tag: 'BADX', minValue: 'nope', defaultValue: 1, maxValue: 2 },
			null,
		], registered)).toEqual([{ tag: 'wght', name: 'Weight', min: 100, max: 900, default: 400 }]);
	});

	test('null/empty input returns empty array', () => {
		expect(mapFvarAxes(null, registered)).toEqual([]);
		expect(mapFvarAxes([], registered)).toEqual([]);
		expect(mapFvarAxes(undefined, undefined)).toEqual([]);
	});
});
