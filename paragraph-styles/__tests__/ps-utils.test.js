/**
 * Tests for the Paragraph Styles module's pure utilities
 * (paragraph-styles/assets/js/lib/ps-utils.js).
 */

const {
	findFontName,
	isStyleModified,
	buildPropertiesFromState,
	buildApplyEventDetail,
	normalizeApplyProperties,
} = require('../assets/js/lib/ps-utils.js');

describe('findFontName', () => {
	const fonts = [
		{ id: 12, name: 'Fraunces' },
		{ id: '15', name: 'EB Garamond' },
	];

	test('finds a font by numeric id', () => {
		expect(findFontName(12, fonts)).toBe('Fraunces');
	});

	test('matches loosely across string/number ids', () => {
		expect(findFontName('12', fonts)).toBe('Fraunces');
		expect(findFontName(15, fonts)).toBe('EB Garamond');
	});

	test('returns null for missing id or empty fonts', () => {
		expect(findFontName(99, fonts)).toBeNull();
		expect(findFontName(0, fonts)).toBeNull();
		expect(findFontName(12, undefined)).toBeNull();
	});
});

describe('isStyleModified', () => {
	const baseProps = {
		fontId: 12,
		fontWeight: '700',
		features: ['liga', 'ss01'],
	};

	test('returns false when state matches the style', () => {
		expect(isStyleModified(
			{ fontId: 12, fontWeight: '700', features: ['ss01', 'liga'] },
			baseProps
		)).toBe(false);
	});

	test('returns false for missing state or props', () => {
		expect(isStyleModified(null, baseProps)).toBe(false);
		expect(isStyleModified({ fontId: 12 }, null)).toBe(false);
	});

	test('detects a changed font', () => {
		expect(isStyleModified(
			{ fontId: 15, fontWeight: '700', features: ['liga', 'ss01'] },
			baseProps
		)).toBe(true);
	});

	test('detects a changed weight, treating 400 as the default', () => {
		expect(isStyleModified({ fontId: 12, fontWeight: '400', features: ['liga', 'ss01'] }, baseProps)).toBe(true);
		expect(isStyleModified({ fontId: 0, fontWeight: '400' }, {})).toBe(false);
		expect(isStyleModified({}, {})).toBe(false);
	});

	test('reads legacy selectedFontId/selectedFontWeight/selectedFeatures state keys', () => {
		expect(isStyleModified(
			{ selectedFontId: 12, selectedFontWeight: '700', selectedFeatures: ['liga', 'ss01'] },
			baseProps
		)).toBe(false);
	});

	test('detects added/removed features regardless of order', () => {
		expect(isStyleModified({ fontId: 12, fontWeight: '700', features: ['liga'] }, baseProps)).toBe(true);
		expect(isStyleModified({ fontId: 12, fontWeight: '700', features: ['liga', 'ss01', 'dlig'] }, baseProps)).toBe(true);
	});

	test('compares responsive sizes only in responsive mode', () => {
		const responsive = {
			fontId: 12, fontWeight: '700', features: ['liga', 'ss01'],
			fontSize: 'responsive', fontSizeMin: 16, fontSizePreferred: 24, fontSizeMax: 32,
		};
		const props = Object.assign({}, baseProps, {
			fontSize: 'responsive', fontSizeMin: 16, fontSizePreferred: 24, fontSizeMax: 32,
		});
		expect(isStyleModified(responsive, props)).toBe(false);
		expect(isStyleModified(Object.assign({}, responsive, { fontSizeMax: 64 }), props)).toBe(true);
	});

	test('detects letterSpacing, lineHeight and fontVariationSettings changes', () => {
		expect(isStyleModified({ fontId: 12, fontWeight: '700', features: ['liga', 'ss01'], letterSpacing: 50 }, baseProps)).toBe(true);
		expect(isStyleModified({ fontId: 12, fontWeight: '700', features: ['liga', 'ss01'], lineHeight: 1.4 }, baseProps)).toBe(true);
		expect(isStyleModified({ fontId: 12, fontWeight: '700', features: ['liga', 'ss01'], fontVariationSettings: '"wght" 650' }, baseProps)).toBe(true);
	});
});

describe('buildPropertiesFromState', () => {
	test('returns empty object for empty/missing state', () => {
		expect(buildPropertiesFromState({})).toEqual({});
		expect(buildPropertiesFromState(null)).toEqual({});
	});

	test('collects set properties and skips unset ones', () => {
		expect(buildPropertiesFromState({
			fontId: 12,
			fontWeight: '700',
			letterSpacing: 50,
			lineHeight: 1.4,
			features: ['liga'],
			fontVariationSettings: '"wght" 650',
		})).toEqual({
			fontId: 12,
			fontWeight: '700',
			letterSpacing: 50,
			lineHeight: 1.4,
			features: ['liga'],
			fontVariationSettings: '"wght" 650',
		});
	});

	test('skips fontSize when inherit, keeps explicit and responsive sizes', () => {
		expect(buildPropertiesFromState({ fontSize: 'inherit' })).toEqual({});
		expect(buildPropertiesFromState({ fontSize: '24' })).toEqual({ fontSize: '24' });
		expect(buildPropertiesFromState({
			fontSize: 'responsive', fontSizeMin: 16, fontSizePreferred: 24, fontSizeMax: 64,
		})).toEqual({
			fontSize: 'responsive', fontSizeMin: 16, fontSizePreferred: 24, fontSizeMax: 64,
		});
	});

	test('falls back to legacy selected* state keys', () => {
		expect(buildPropertiesFromState({
			selectedFontId: 12,
			selectedFontWeight: '700',
			selectedFeatures: ['liga'],
		})).toEqual({ fontId: 12, fontWeight: '700', features: ['liga'] });
	});

	test('prefers features over selectedFeatures when both set', () => {
		expect(buildPropertiesFromState({
			features: ['dlig'],
			selectedFeatures: ['liga'],
		})).toEqual({ features: ['dlig'] });
	});
});

describe('normalizeApplyProperties', () => {
	test('fills defaults for omitted style-owned keys so stale editor state is reset', () => {
		expect(normalizeApplyProperties({ fontId: 12, fontWeight: '700' })).toEqual({
			fontId: 12,
			fontWeight: '700',
			fontSize: 'inherit',
			letterSpacing: 0,
			lineHeight: 0,
			features: [],
			fontVariationSettings: '',
		});
	});

	test('stored values always win over defaults', () => {
		expect(normalizeApplyProperties({
			fontId: 15,
			fontWeight: 'bold',
			fontSize: 'responsive',
			fontSizeMin: 16,
			fontSizePreferred: 24,
			fontSizeMax: 64,
			letterSpacing: 50,
			lineHeight: 1.4,
			features: ['liga', 'ss01'],
			fontVariationSettings: '"wght" 650',
		})).toEqual({
			fontId: 15,
			fontWeight: 'bold',
			fontSize: 'responsive',
			fontSizeMin: 16,
			fontSizePreferred: 24,
			fontSizeMax: 64,
			letterSpacing: 50,
			lineHeight: 1.4,
			features: ['liga', 'ss01'],
			fontVariationSettings: '"wght" 650',
		});
	});

	test('never introduces keys styles cannot express (fontStyle, fit/extension keys)', () => {
		const normalized = normalizeApplyProperties({});
		expect(normalized).not.toHaveProperty('fontStyle');
		expect(normalized).not.toHaveProperty('fitMaxSize');
		expect(normalized).not.toHaveProperty('layeredConfigId');
		expect(normalized).not.toHaveProperty('animationConfigId');
	});

	test('handles null/undefined input as all-defaults', () => {
		expect(normalizeApplyProperties(null)).toEqual({
			fontId: 0,
			fontWeight: '400',
			fontSize: 'inherit',
			letterSpacing: 0,
			lineHeight: 0,
			features: [],
			fontVariationSettings: '',
		});
	});

	test('returns a fresh features array each call (no shared mutable default)', () => {
		const a = normalizeApplyProperties({});
		const b = normalizeApplyProperties({});
		expect(a.features).not.toBe(b.features);
	});
});

describe('buildApplyEventDetail', () => {
	const style = { id: 3, properties: { fontId: 12, fontWeight: '700' } };

	test('builds a normalized apply payload with class + style id', () => {
		expect(buildApplyEventDetail(style, 'inline')).toEqual({
			properties: {
				fontId: 12,
				fontWeight: '700',
				fontSize: 'inherit',
				letterSpacing: 0,
				lineHeight: 0,
				features: [],
				fontVariationSettings: '',
			},
			paragraphStyleId: 3,
			styleClass: 'typost-ps-3',
			source: 'inline',
		});
	});

	test('passes stored responsive sizes through in the normalized payload', () => {
		const responsive = {
			id: 7,
			properties: { fontSize: 'responsive', fontSizeMin: 16, fontSizePreferred: 24, fontSizeMax: 64 },
		};
		const detail = buildApplyEventDetail(responsive, 'qft');
		expect(detail.properties.fontSize).toBe('responsive');
		expect(detail.properties.fontSizeMin).toBe(16);
		expect(detail.properties.fontSizePreferred).toBe(24);
		expect(detail.properties.fontSizeMax).toBe(64);
	});

	test('maps inspector source through unchanged (inspector applies block-level)', () => {
		expect(buildApplyEventDetail(style, 'inspector').source).toBe('inspector');
		expect(buildApplyEventDetail(style, 'qft').source).toBe('qft');
	});

	test('builds a detach payload without normalization (re-applies current state as-is)', () => {
		expect(buildApplyEventDetail(null, 'qft', { fontId: 12 })).toEqual({
			properties: { fontId: 12 },
			paragraphStyleId: 0,
			styleClass: '',
			source: 'qft',
		});
	});

	test('detach payload defaults properties to empty object', () => {
		expect(buildApplyEventDetail(null, 'inline').properties).toEqual({});
	});
});
