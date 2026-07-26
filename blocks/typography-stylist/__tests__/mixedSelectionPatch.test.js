/**
 * Tests for the mixed-selection per-run apply utilities: computing typost
 * formatting runs across a rich-text range, detecting mixed selections, and
 * patching a single property into a run without touching its other settings.
 *
 * These back the fix for "select all + change font wipes the inline settings
 * I just made" in the inline editor.
 */

import { computeTypostFormatRuns, isMixedFormatSelection, patchTypostFormatAttributes } from '../utils';

const TYPE = 'typost/features';

// Build a value.formats-like array: spec is an array of (attrs|null) per char
function formatsFrom(spec) {
	// Share one format object per run, like @wordpress/rich-text does
	const cache = new Map();
	return spec.map((attrs) => {
		if (attrs === null) return undefined;
		const key = JSON.stringify(attrs);
		if (!cache.has(key)) {
			cache.set(key, [{ type: TYPE, attributes: attrs }]);
		}
		return cache.get(key);
	});
}

const SS01 = { 'data-features': 'ss01', 'data-font-id': '4', style: "font-feature-settings: 'ss01' 1; font-family: var(--font-4); font-size: 40px", 'data-fontsize': '40px' };
const SWSH = { 'data-features': 'swsh', 'data-font-id': '4', style: "font-feature-settings: 'swsh' 1; font-family: var(--font-4)" };

describe('computeTypostFormatRuns', () => {
	test('splits a mixed range into runs including unformatted gaps', () => {
		// "El" ss01 | "eg" plain | "ant" swsh
		const formats = formatsFrom([SS01, SS01, null, null, SWSH, SWSH, SWSH]);
		const runs = computeTypostFormatRuns(formats, 0, 7, TYPE);
		expect(runs).toHaveLength(3);
		expect(runs[0]).toEqual({ start: 0, end: 2, attributes: SS01 });
		expect(runs[1]).toEqual({ start: 2, end: 4, attributes: null });
		expect(runs[2]).toEqual({ start: 4, end: 7, attributes: SWSH });
	});

	test('partial range respects boundaries', () => {
		const formats = formatsFrom([SS01, SS01, null, null, SWSH, SWSH, SWSH]);
		const runs = computeTypostFormatRuns(formats, 1, 5, TYPE);
		expect(runs).toEqual([
			{ start: 1, end: 2, attributes: SS01 },
			{ start: 2, end: 4, attributes: null },
			{ start: 4, end: 5, attributes: SWSH },
		]);
	});

	test('uniform and empty ranges', () => {
		const formats = formatsFrom([SS01, SS01, SS01]);
		expect(computeTypostFormatRuns(formats, 0, 3, TYPE)).toHaveLength(1);
		expect(computeTypostFormatRuns(formats, 2, 2, TYPE)).toHaveLength(0);
	});
});

describe('isMixedFormatSelection', () => {
	const formats = formatsFrom([SS01, SS01, null, null, SWSH, SWSH, SWSH]);

	test('true across differing runs, false within one run', () => {
		expect(isMixedFormatSelection(formats, 0, 7, TYPE)).toBe(true);
		expect(isMixedFormatSelection(formats, 0, 2, TYPE)).toBe(false);
		expect(isMixedFormatSelection(formats, 2, 4, TYPE)).toBe(false);
	});
});

describe('patchTypostFormatAttributes', () => {
	const fontPatch = {
		dataAttrs: { 'data-font': 'please-vf', 'data-font-id': '11', 'data-font-variation-settings': null },
		styleDecls: { 'font-family': 'var(--font-11)', 'font-variation-settings': null },
		featureToggles: [],
	};

	test('font change keeps the run\'s features and size (the reported bug)', () => {
		const patched = patchTypostFormatAttributes(SS01, fontPatch);
		expect(patched['data-font-id']).toBe('11');
		expect(patched['data-features']).toBe('ss01');
		expect(patched['data-fontsize']).toBe('40px');
		expect(patched.style).toContain('font-family: var(--font-11)');
		expect(patched.style).not.toContain('var(--font-4)');
		expect(patched.style).toContain("font-feature-settings: 'ss01' 1");
		expect(patched.style).toContain('font-size: 40px');
	});

	test('font change invalidates variation axis settings', () => {
		const vf = { 'data-font-id': '4', 'data-font-variation-settings': '"wght" 628', style: 'font-family: var(--font-4); font-variation-settings: "wght" 628' };
		const patched = patchTypostFormatAttributes(vf, fontPatch);
		expect(patched['data-font-variation-settings']).toBeUndefined();
		expect(patched.style).not.toContain('font-variation-settings');
	});

	test('unformatted run gets only the changed property', () => {
		const patched = patchTypostFormatAttributes(null, fontPatch);
		expect(patched).toEqual({
			'data-font': 'please-vf',
			'data-font-id': '11',
			style: 'font-family: var(--font-11)',
		});
	});

	test('property removal (null values) can dissolve the format entirely', () => {
		const sizeOnly = { 'data-fontsize': '40px', style: 'font-size: 40px' };
		const removeSize = { dataAttrs: { 'data-fontsize': null, 'data-fontsize-min': null, 'data-fontsize-preferred': null, 'data-fontsize-max': null }, styleDecls: { 'font-size': null }, featureToggles: [] };
		expect(patchTypostFormatAttributes(sizeOnly, removeSize)).toBeNull();
		// A run that still has other settings keeps them
		const patched = patchTypostFormatAttributes(SS01, removeSize);
		expect(patched['data-features']).toBe('ss01');
		expect(patched.style).not.toContain('font-size');
	});

	test('feature toggle adds to each run\'s own feature set', () => {
		const patch = { dataAttrs: {}, styleDecls: {}, featureToggles: [{ tag: 'liga', enabled: true }] };
		const patched = patchTypostFormatAttributes(SWSH, patch);
		expect(patched['data-features']).toBe('swsh,liga');
		expect(patched.style).toContain('font-feature-settings: "swsh" 1, "liga" 1');
		// Other declarations survive
		expect(patched.style).toContain('font-family: var(--font-4)');
	});

	test('feature toggle removes only the toggled tag', () => {
		const both = { 'data-features': 'swsh,liga', style: 'font-feature-settings: "swsh" 1, "liga" 1' };
		const patch = { dataAttrs: {}, styleDecls: {}, featureToggles: [{ tag: 'swsh', enabled: false }] };
		const patched = patchTypostFormatAttributes(both, patch);
		expect(patched['data-features']).toBe('liga');
		expect(patched.style).toBe('font-feature-settings: "liga" 1');
	});

	test('feature toggle respects raw indexed alternates (data-feature-settings)', () => {
		const indexed = { 'data-feature-settings': '"salt" 2', style: 'font-feature-settings: "salt" 2' };
		const patch = { dataAttrs: {}, styleDecls: {}, featureToggles: [{ tag: 'liga', enabled: true }] };
		const patched = patchTypostFormatAttributes(indexed, patch);
		expect(patched['data-feature-settings']).toBe('"salt" 2');
		expect(patched.style).toBe('font-feature-settings: "salt" 2, "liga" 1');
	});

	test('removing the last feature drops the declaration but keeps other props', () => {
		const patch = { dataAttrs: {}, styleDecls: {}, featureToggles: [{ tag: 'swsh', enabled: false }] };
		const patched = patchTypostFormatAttributes(SWSH, patch);
		expect(patched['data-features']).toBeUndefined();
		expect(patched.style).toBe('font-family: var(--font-4)');
	});
});
