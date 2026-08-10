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
	buildStylePreviewStyle,
} = require('../assets/js/lib/ps-utils.js');

describe('findFontName', () => {
	const fonts = [
		{ id: 12, name: 'Fraunces' },
		{ id: '15', name: 'EB Garamond' },
	];

	test('finds a font by numeric id', () => {
		expect(findFontName(12, fonts)).toBe('Fraunces');
	});

	test('matches the canonical numeric font_id, which is what styles store', () => {
		// Shape of window.typostData.fonts / adobeFonts: `id` is the string
		// kit/project slug, `font_id` is the numeric identity.
		const localized = [
			{ id: 'kit-1785099086-nviis0sm-fraunces', font_id: 36, name: 'Fraunces' },
			{ id: 'adobe-wkp4oav-bookmania', font_id: 1, name: 'bookmania' },
		];
		expect(findFontName(36, localized)).toBe('Fraunces');
		expect(findFontName(1, localized)).toBe('bookmania');
		expect(findFontName(99, localized)).toBeNull();
	});

	test('does not confuse a string slug for a numeric id', () => {
		const localized = [{ id: 'kit-abc', font_id: 7, name: 'Kit Font' }];
		expect(findFontName('kit-abc', localized)).toBe('Kit Font');
		expect(findFontName(7, localized)).toBe('Kit Font');
	});

	test('skips null entries', () => {
		expect(findFontName(7, [null, { font_id: 7, name: 'Kit Font' }])).toBe('Kit Font');
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

	test('compares fallback sizes and fitMaxSize in fit mode', () => {
		const fit = {
			fontId: 12, fontWeight: '700', features: ['liga', 'ss01'],
			fontSize: 'fit', fontSizeMin: 16, fontSizePreferred: 24, fontSizeMax: 32,
			fitMaxSize: 120,
		};
		const props = Object.assign({}, baseProps, {
			fontSize: 'fit', fontSizeMin: 16, fontSizePreferred: 24, fontSizeMax: 32,
			fitMaxSize: 120,
		});
		expect(isStyleModified(fit, props)).toBe(false);
		expect(isStyleModified(Object.assign({}, fit, { fontSizeMax: 64 }), props)).toBe(true);
		expect(isStyleModified(Object.assign({}, fit, { fitMaxSize: 200 }), props)).toBe(true);
		// 0 and absent both mean uncapped
		expect(isStyleModified(
			Object.assign({}, fit, { fitMaxSize: 0 }),
			Object.assign({}, props, { fitMaxSize: undefined })
		)).toBe(false);
	});

	test('ignores fitMaxSize outside fit mode', () => {
		expect(isStyleModified(
			{ fontId: 12, fontWeight: '700', features: ['liga', 'ss01'], fitMaxSize: 90 },
			baseProps
		)).toBe(false);
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

	test('keeps fit mode with its fallback sizes and fitMaxSize cap', () => {
		expect(buildPropertiesFromState({
			fontSize: 'fit', fontSizeMin: 16, fontSizePreferred: 24, fontSizeMax: 64,
			fitMaxSize: 120,
		})).toEqual({
			fontSize: 'fit', fontSizeMin: 16, fontSizePreferred: 24, fontSizeMax: 64,
			fitMaxSize: 120,
		});
	});

	test('stores fitMaxSize as 0 (uncapped) when unset in fit mode', () => {
		expect(buildPropertiesFromState({ fontSize: 'fit' })).toEqual({
			fontSize: 'fit', fitMaxSize: 0,
		});
	});

	test('does not store fitMaxSize outside fit mode', () => {
		expect(buildPropertiesFromState({
			fontSize: 'responsive', fontSizeMin: 16, fontSizePreferred: 24, fontSizeMax: 64,
			fitMaxSize: 120,
		})).not.toHaveProperty('fitMaxSize');
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

describe('buildStylePreviewStyle', () => {
	const size = (properties, bounds) => parseFloat(buildStylePreviewStyle(properties, bounds).style.fontSize);

	test('clamps an oversized display style into the preview band', () => {
		expect(size({ fontSize: '64' })).toBe(40);
	});

	test('raises a tiny style to the band floor', () => {
		expect(size({ fontSize: '8' })).toBe(12);
	});

	test('keeps a size that already sits inside the band', () => {
		expect(size({ fontSize: '24' })).toBe(24);
	});

	test('preserves relative order between styles, which is the point of the band', () => {
		expect(size({ fontSize: '18' })).toBeLessThan(size({ fontSize: '30' }));
	});

	test('honours a custom band', () => {
		expect(size({ fontSize: '64' }, { min: 10, max: 20 })).toBe(20);
		expect(size({ fontSize: '4' }, { min: 10, max: 20 })).toBe(10);
	});

	test('responsive styles preview at their preferred size and label the range', () => {
		const result = buildStylePreviewStyle({
			fontSize: 'responsive',
			fontSizeMin: 16,
			fontSizePreferred: 32,
			fontSizeMax: 64,
		});
		expect(parseFloat(result.style.fontSize)).toBe(32);
		expect(result.sizeLabel).toBe('Fluid 16–64');
	});

	test('fit styles preview at their cap and say so', () => {
		const capped = buildStylePreviewStyle({ fontSize: 'fit', fitMaxSize: 120 });
		expect(parseFloat(capped.style.fontSize)).toBe(40);
		expect(capped.sizeLabel).toBe('Fit ≤ 120px');

		// 0 means uncapped, so there is no number to show
		expect(buildStylePreviewStyle({ fontSize: 'fit', fitMaxSize: 0 }).sizeLabel).toBe('Fit');
	});

	test('a style with no size of its own previews mid-band with no label', () => {
		const result = buildStylePreviewStyle({ fontSize: 'inherit' });
		expect(parseFloat(result.style.fontSize)).toBe(26);
		expect(result.sizeLabel).toBe('');
	});

	test('tolerates missing or unparseable properties', () => {
		expect(parseFloat(buildStylePreviewStyle(undefined).style.fontSize)).toBe(26);
		expect(parseFloat(buildStylePreviewStyle({ fontSize: 'wat' }).style.fontSize)).toBe(26);
	});

	test('neutralizes line-height so a tall style cannot stretch its row', () => {
		expect(buildStylePreviewStyle({ fontSize: '64', lineHeight: 3 }).style.lineHeight).toBe(1.25);
	});

	test('sets only size properties, leaving family/weight/features to the style class', () => {
		expect(Object.keys(buildStylePreviewStyle({ fontSize: '24' }).style).sort())
			.toEqual(['fontSize', 'lineHeight']);
	});
});
