/**
 * Tests for filterFeaturesByVisibility utility.
 *
 * @since 2.0.0
 */
import { filterFeaturesByVisibility } from '../utils';

const ALL_FEATURES = [
	{ id: 'liga', name: 'Standard Ligatures', category: 'ligatures' },
	{ id: 'dlig', name: 'Discretionary Ligatures', category: 'ligatures' },
	{ id: 'ss01', name: 'Stylistic Set 1', category: 'stylistic-sets' },
	{ id: 'ss15', name: 'Stylistic Set 15', category: 'stylistic-sets' },
	{ id: 'ornm', name: 'Ornaments', category: 'decorative' },
	{ id: 'smcp', name: 'Small Caps', category: 'capitals' },
];

describe('filterFeaturesByVisibility', () => {
	test('returns all features when fontId is 0 (falsy)', () => {
		const result = filterFeaturesByVisibility(ALL_FEATURES, 0, { 12: { disabled_features: ['ss15'] } });
		expect(result).toHaveLength(6);
	});

	test('returns all features when fontId is null', () => {
		const result = filterFeaturesByVisibility(ALL_FEATURES, null, { 12: { disabled_features: ['ss15'] } });
		expect(result).toHaveLength(6);
	});

	test('returns all features when visibilityMap is null', () => {
		const result = filterFeaturesByVisibility(ALL_FEATURES, 12, null);
		expect(result).toHaveLength(6);
	});

	test('returns all features when visibilityMap is empty object', () => {
		const result = filterFeaturesByVisibility(ALL_FEATURES, 12, {});
		expect(result).toHaveLength(6);
	});

	test('returns all features when font has no entry in visibilityMap', () => {
		const result = filterFeaturesByVisibility(ALL_FEATURES, 99, { 12: { disabled_features: ['ss15'] } });
		expect(result).toHaveLength(6);
	});

	test('returns all features when font entry has empty disabled_features array', () => {
		const result = filterFeaturesByVisibility(ALL_FEATURES, 12, { 12: { disabled_features: [] } });
		expect(result).toHaveLength(6);
	});

	test('filters out a single disabled feature', () => {
		const result = filterFeaturesByVisibility(ALL_FEATURES, 12, { 12: { disabled_features: ['ss15'] } });
		expect(result).toHaveLength(5);
		expect(result.map(f => f.id)).not.toContain('ss15');
	});

	test('filters out multiple disabled features', () => {
		const result = filterFeaturesByVisibility(ALL_FEATURES, 12, { 12: { disabled_features: ['ss15', 'ornm', 'dlig'] } });
		expect(result).toHaveLength(3);
		expect(result.map(f => f.id)).toEqual(['liga', 'ss01', 'smcp']);
	});

	test('ignores unknown feature IDs in disabled_features', () => {
		const result = filterFeaturesByVisibility(ALL_FEATURES, 12, { 12: { disabled_features: ['nonexistent', 'ss15'] } });
		expect(result).toHaveLength(5);
		expect(result.map(f => f.id)).not.toContain('ss15');
	});

	test('can disable all features', () => {
		const allIds = ALL_FEATURES.map(f => f.id);
		const result = filterFeaturesByVisibility(ALL_FEATURES, 12, { 12: { disabled_features: allIds } });
		expect(result).toHaveLength(0);
	});

	test('only filters for the matching fontId, not other fonts', () => {
		const map = {
			12: { disabled_features: ['ss15', 'ornm'] },
			34: { disabled_features: ['liga'] },
		};
		const result12 = filterFeaturesByVisibility(ALL_FEATURES, 12, map);
		expect(result12.map(f => f.id)).not.toContain('ss15');
		expect(result12.map(f => f.id)).not.toContain('ornm');
		expect(result12.map(f => f.id)).toContain('liga');

		const result34 = filterFeaturesByVisibility(ALL_FEATURES, 34, map);
		expect(result34.map(f => f.id)).not.toContain('liga');
		expect(result34.map(f => f.id)).toContain('ss15');
	});

	test('returns same object references (not copies)', () => {
		const result = filterFeaturesByVisibility(ALL_FEATURES, 12, { 12: { disabled_features: ['ss15'] } });
		expect(result[0]).toBe(ALL_FEATURES[0]);
	});
});
