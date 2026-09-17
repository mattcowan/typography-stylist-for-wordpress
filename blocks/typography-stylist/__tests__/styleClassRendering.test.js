/**
 * Tests for class-based rendering of a styled block in the editor (PS-4, PS-5).
 */
import { findParagraphStyleByClass, stylePropertyOverrides, isOrphanStyleClass } from '../utils';

const styles = [
	{ id: 3, name: 'Body Garamond', properties: { fontId: 37, fontWeight: '400', fontSize: '16', lineHeight: 1.6000000000000001, features: ['onum', 'liga'] } },
	{ id: 4, name: 'Fluid Subhead', properties: { fontId: 36, fontWeight: '600', fontSize: 'responsive', fontSizeMin: 20, fontSizePreferred: 30, fontSizeMax: 48, features: ['ss01'] } },
	{ id: 9, legacyId: 'ps_1709312345_123', name: 'Migrated', properties: { fontId: 2 } },
];

describe('findParagraphStyleByClass', () => {
	test('resolves numeric and legacy ids and ignores unknown classes', () => {
		expect(findParagraphStyleByClass('typost-ps-4', styles).name).toBe('Fluid Subhead');
		expect(findParagraphStyleByClass('typost-ps-ps_1709312345_123', styles).name).toBe('Migrated');
		expect(findParagraphStyleByClass('typost-ps-999', styles)).toBeNull();
		expect(findParagraphStyleByClass('', styles)).toBeNull();
		expect(findParagraphStyleByClass('typost-ps-4', undefined)).toBeNull();
	});
});

describe('isOrphanStyleClass', () => {
	test('true only when the style list is known and the class names no style in it', () => {
		expect(isOrphanStyleClass('typost-ps-999', styles)).toBe(true);
		expect(isOrphanStyleClass('typost-ps-4', styles)).toBe(false);
		expect(isOrphanStyleClass('typost-ps-ps_1709312345_123', styles)).toBe(false);
	});

	test('never decides without a style list (module absent) or without a class', () => {
		expect(isOrphanStyleClass('typost-ps-999', undefined)).toBe(false);
		expect(isOrphanStyleClass('typost-ps-999', null)).toBe(false);
		expect(isOrphanStyleClass('', styles)).toBe(false);
		// An empty list is a real answer: every paragraph-style class is orphaned.
		expect(isOrphanStyleClass('typost-ps-4', [])).toBe(true);
	});

	test('a class from another extension is not a paragraph style and is never cleared', () => {
		expect(isOrphanStyleClass('my-extension-class', styles)).toBe(false);
		expect(isOrphanStyleClass('my-extension-class', [])).toBe(false);
		expect(isOrphanStyleClass('typost-layered-3', [])).toBe(false);
	});
});

describe('stylePropertyOverrides', () => {
	test('a block that still matches its style needs no inline declarations', () => {
		const attrs = { fontId: 4, fontFamily: 'x', fontWeight: '600', fontStyle: '', fontSize: 'responsive', fontSizeMin: 20, fontSizePreferred: 30, fontSizeMax: 48, letterSpacing: 0, lineHeight: 0, features: ['ss01'], fontVariationSettings: '' };
		expect(stylePropertyOverrides({ ...attrs, fontId: 36 }, styles[1].properties)).toEqual({});
	});

	test('a weight edited in the Inspector previews inline while the rest renders from the class', () => {
		const attrs = { fontId: 36, fontWeight: '400', fontSize: 'responsive', fontSizeMin: 20, fontSizePreferred: 30, fontSizeMax: 48, features: ['ss01'] };
		expect(stylePropertyOverrides(attrs, styles[1].properties)).toEqual({ fontWeight: true });
	});

	test('a fixed px size the block copied from the style is not an override (PS-4)', () => {
		const attrs = { fontId: 37, fontWeight: '400', fontSize: '16', lineHeight: 1.6, features: ['liga', 'onum'] };
		expect(stylePropertyOverrides(attrs, styles[0].properties)).toEqual({});
	});

	test('float artifacts in stored line-height do not count as edits (PS-8)', () => {
		expect(stylePropertyOverrides({ lineHeight: 1.6 }, { lineHeight: 1.6000000000000001 })).toEqual({});
		expect(stylePropertyOverrides({ lineHeight: 1.5 }, { lineHeight: 1.6 })).toEqual({ lineHeight: true });
	});

	test('responsive bounds and fit cap are compared only in their size mode', () => {
		const base = { fontId: 36, fontWeight: '600', fontSize: 'responsive', fontSizeMin: 20, fontSizePreferred: 30, fontSizeMax: 48, features: ['ss01'] };
		expect(stylePropertyOverrides({ ...base, fontSizeMax: 64 }, styles[1].properties)).toEqual({ fontSize: true });
		const fitStyle = { fontId: 1, fontSize: 'fit', fontSizeMin: 16, fontSizePreferred: 32, fontSizeMax: 64, fitMaxSize: 0 };
		expect(stylePropertyOverrides({ fontId: 1, fontSize: 'fit', fontSizeMin: 16, fontSizePreferred: 32, fontSizeMax: 64, fitMaxSize: 120 }, fitStyle)).toEqual({ fontSize: true });
		// A different size mode altogether
		expect(stylePropertyOverrides({ ...base, fontSize: 'inherit' }, styles[1].properties)).toEqual({ fontSize: true });
	});

	test('defaults match normalizeApplyProperties: missing weight is 400, missing features are none', () => {
		expect(stylePropertyOverrides({ fontId: 2, fontWeight: '400', features: [] }, styles[2].properties)).toEqual({});
		expect(stylePropertyOverrides({ fontId: 2, fontWeight: '700' }, styles[2].properties)).toEqual({ fontWeight: true });
		expect(stylePropertyOverrides({ fontId: 5 }, styles[2].properties)).toEqual({ fontId: true });
	});

	test('features compare as sets and variation settings as strings', () => {
		expect(stylePropertyOverrides({ fontId: 37, fontSize: '16', lineHeight: 1.6, features: ['liga', 'onum'] }, styles[0].properties)).toEqual({});
		expect(stylePropertyOverrides({ fontId: 37, fontSize: '16', lineHeight: 1.6, features: ['liga'] }, styles[0].properties)).toEqual({ features: true });
		expect(stylePropertyOverrides({ fontVariationSettings: '"wght" 650' }, {})).toEqual({ fontVariationSettings: true });
	});
});
