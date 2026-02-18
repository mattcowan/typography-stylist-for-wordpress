/**
 * Test Suite: Font Weight Filtering Utilities
 *
 * Tests for getFilteredWeightOptions, getClosestWeight, and ALL_WEIGHT_OPTIONS
 * used for per-font weight restriction feature.
 */

import { getFilteredWeightOptions, getClosestWeight, ALL_WEIGHT_OPTIONS } from '../utils';

describe('Typography Stylist - ALL_WEIGHT_OPTIONS', () => {

	test('contains all 9 standard CSS font weights', () => {
		expect(ALL_WEIGHT_OPTIONS).toHaveLength(9);
		const values = ALL_WEIGHT_OPTIONS.map(w => w.value);
		expect(values).toEqual(['100', '200', '300', '400', '500', '600', '700', '800', '900']);
	});

	test('each option has label and value', () => {
		ALL_WEIGHT_OPTIONS.forEach(option => {
			expect(option).toHaveProperty('label');
			expect(option).toHaveProperty('value');
			expect(typeof option.label).toBe('string');
			expect(typeof option.value).toBe('string');
		});
	});
});

describe('Typography Stylist - getFilteredWeightOptions()', () => {

	const fontIdMap = {
		1: { family: 'Bookmania', fallbacks: 'serif', availableWeights: ['400', '700'] },
		2: { family: 'Open Sans', fallbacks: 'sans-serif', availableWeights: [] }, // All weights (variable)
		3: { family: 'Thin Only', fallbacks: 'serif', availableWeights: ['100'] },
		4: { family: 'No Weights Field', fallbacks: 'serif' }, // No availableWeights key at all
	};

	test('returns all 9 weights when no font selected (fontId = 0)', () => {
		const result = getFilteredWeightOptions(0, fontIdMap);
		expect(result).toHaveLength(9);
	});

	test('returns all 9 weights when no font selected (fontId = null)', () => {
		const result = getFilteredWeightOptions(null, fontIdMap);
		expect(result).toHaveLength(9);
	});

	test('returns all 9 weights when fontIdMap is null', () => {
		const result = getFilteredWeightOptions(1, null);
		expect(result).toHaveLength(9);
	});

	test('returns all 9 weights when font has empty availableWeights (variable font)', () => {
		const result = getFilteredWeightOptions(2, fontIdMap);
		expect(result).toHaveLength(9);
	});

	test('returns all 9 weights when font has no availableWeights property', () => {
		const result = getFilteredWeightOptions(4, fontIdMap);
		expect(result).toHaveLength(9);
	});

	test('returns all 9 weights when fontId not in map', () => {
		const result = getFilteredWeightOptions(999, fontIdMap);
		expect(result).toHaveLength(9);
	});

	test('filters to only available weights for restricted font', () => {
		const result = getFilteredWeightOptions(1, fontIdMap);
		expect(result).toHaveLength(2);
		expect(result.map(w => w.value)).toEqual(['400', '700']);
	});

	test('returns single weight for font with only one weight', () => {
		const result = getFilteredWeightOptions(3, fontIdMap);
		expect(result).toHaveLength(1);
		expect(result[0].value).toBe('100');
	});

	test('includes Inherit option when includeInherit is true', () => {
		const result = getFilteredWeightOptions(1, fontIdMap, true);
		expect(result).toHaveLength(3); // inherit + 400 + 700
		expect(result[0].value).toBe('inherit');
		expect(result[0].label).toBe('Inherit from block');
	});

	test('includes Inherit + all 9 weights when font not selected and includeInherit is true', () => {
		const result = getFilteredWeightOptions(null, fontIdMap, true);
		expect(result).toHaveLength(10); // inherit + 9 weights
		expect(result[0].value).toBe('inherit');
	});

	test('preserves label text from ALL_WEIGHT_OPTIONS', () => {
		const result = getFilteredWeightOptions(1, fontIdMap);
		const normalOption = result.find(w => w.value === '400');
		expect(normalOption.label).toContain('Normal');
		const boldOption = result.find(w => w.value === '700');
		expect(boldOption.label).toContain('Bold');
	});
});

describe('Typography Stylist - getClosestWeight()', () => {

	test('returns current weight if it is available', () => {
		expect(getClosestWeight('400', ['400', '700'])).toBe('400');
	});

	test('returns current weight if availableWeights is empty', () => {
		expect(getClosestWeight('400', [])).toBe('400');
	});

	test('returns current weight if availableWeights is null', () => {
		expect(getClosestWeight('400', null)).toBe('400');
	});

	test('returns current weight if availableWeights is undefined', () => {
		expect(getClosestWeight('400', undefined)).toBe('400');
	});

	test('returns closest weight (lower) when current is unavailable', () => {
		// Current: 300, available: 200, 700 → closest is 200 (diff 100 vs 400)
		expect(getClosestWeight('300', ['200', '700'])).toBe('200');
	});

	test('returns closest weight (higher) when current is unavailable', () => {
		// Current: 600, available: 200, 700 → closest is 700 (diff 100 vs 400)
		expect(getClosestWeight('600', ['200', '700'])).toBe('700');
	});

	test('returns closest weight when equidistant (picks first found)', () => {
		// Current: 500, available: 300, 700 → both diff 200, picks first (300)
		expect(getClosestWeight('500', ['300', '700'])).toBe('300');
	});

	test('works with single available weight', () => {
		expect(getClosestWeight('400', ['100'])).toBe('100');
	});

	test('works when current weight is at extreme low', () => {
		expect(getClosestWeight('100', ['400', '700', '900'])).toBe('400');
	});

	test('works when current weight is at extreme high', () => {
		expect(getClosestWeight('900', ['100', '200', '300'])).toBe('300');
	});

	test('handles all weights available (returns exact match)', () => {
		const allWeights = ['100', '200', '300', '400', '500', '600', '700', '800', '900'];
		expect(getClosestWeight('500', allWeights)).toBe('500');
	});
});
