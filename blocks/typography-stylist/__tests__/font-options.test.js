/**
 * Tests for the shared font picker option builder (assets/js/font-options.js)
 * used by both the inline editor and the Typography Stylist block.
 */

const {
	buildFontOptions,
	isWpLibraryValue,
	wpSlugFromValue,
	resolveFontIdFromFamily,
} = require('../../../assets/js/font-options.js');

describe('resolveFontIdFromFamily', () => {
	// Shape produced by buildFontOptions()
	const fontIdMap = {
		1: { family: 'bookmania', fallbacks: 'serif' },
		36: { family: 'Fraunces', fallbacks: 'serif' },
		37: { family: 'EB Garamond', fallbacks: 'serif' },
	};

	test('resolves a bare family name', () => {
		expect(resolveFontIdFromFamily('bookmania', fontIdMap)).toBe(1);
	});

	test('resolves the first known family in a stack, ignoring later fallbacks', () => {
		expect(resolveFontIdFromFamily('Fraunces, Georgia, serif', fontIdMap)).toBe(36);
	});

	test('skips leading families the plugin does not know', () => {
		expect(resolveFontIdFromFamily('Helvetica, "EB Garamond", serif', fontIdMap)).toBe(37);
	});

	test('ignores quotes and case, as browsers and authors both vary them', () => {
		expect(resolveFontIdFromFamily('"eb garamond"', fontIdMap)).toBe(37);
		expect(resolveFontIdFromFamily("'BOOKMANIA', serif", fontIdMap)).toBe(1);
	});

	test('a stack of only system fonts resolves to nothing', () => {
		expect(resolveFontIdFromFamily('-apple-system, Arial, sans-serif', fontIdMap)).toBe(0);
	});

	test('returns 0 for empty or missing input rather than guessing a font', () => {
		expect(resolveFontIdFromFamily('', fontIdMap)).toBe(0);
		expect(resolveFontIdFromFamily(null, fontIdMap)).toBe(0);
		expect(resolveFontIdFromFamily('bookmania', null)).toBe(0);
		expect(resolveFontIdFromFamily('bookmania', {})).toBe(0);
	});

	test('entries without a family are skipped, not thrown on', () => {
		expect(resolveFontIdFromFamily('Fraunces', { 5: null, 6: {}, 36: { family: 'Fraunces' } })).toBe(36);
	});

	test('returns a number, since block attributes are numeric font IDs', () => {
		expect(typeof resolveFontIdFromFamily('bookmania', fontIdMap)).toBe('number');
	});
});

describe('buildFontOptions', () => {
	const uploadedFont = {
		id: 'kit-1-playfair-display',
		name: 'Playfair Display',
		font_id: 7,
		fallbacks: 'serif',
		font_faces: [
			{ family: 'Playfair Display', weight: '400', style: 'normal' },
			{ family: 'Playfair Display', weight: '700', style: 'normal' },
		],
	};

	test('builds uploaded, adobe, and manual options with numeric values', () => {
		const { options, fontIdMap } = buildFontOptions({
			fonts: [uploadedFont],
			adobeFonts: [{ id: 'adobe-k-freight', name: 'Freight', font_id: 9, font_family: 'freight-text-pro' }],
			manualFonts: [{ id: 'manual-1', name: 'System Serif', font_id: 11, font_family: 'Georgia, serif' }],
		});

		expect(options).toHaveLength(3);
		expect(options[0]).toMatchObject({ value: '7', fontFamily: 'Playfair Display', fontId: 7 });
		expect(options[1]).toMatchObject({ value: '9', fontFamily: 'freight-text-pro' });
		expect(options[2]).toMatchObject({ value: '11', fontFamily: 'Georgia, serif' });
		expect(fontIdMap[7].availableWeights).toEqual([]);
		expect(fontIdMap[7].fallbacks).toBe('serif');
	});

	test('deduplicates repeated families within one kit entry', () => {
		const { options } = buildFontOptions({ fonts: [uploadedFont] });
		expect(options).toHaveLength(1);
	});

	test('unadopted WP Library fonts get wp:{slug} values', () => {
		const { options, fontIdMap } = buildFontOptions({
			wpFontLibraryFonts: [
				{ slug: 'inter', name: 'Inter', font_family: 'Inter, sans-serif' },
			],
		});

		expect(options).toHaveLength(1);
		expect(options[0]).toMatchObject({
			value: 'wp:inter',
			fontId: 0,
			wpSlug: 'inter',
			fontFamily: 'Inter, sans-serif',
		});
		expect(Object.keys(fontIdMap)).toHaveLength(0);
	});

	test('adopted WP Library fonts resolve to their numeric font_id', () => {
		const { options, fontIdMap } = buildFontOptions({
			wpFontLibraryFonts: [
				{ slug: 'inter', name: 'Inter', font_family: 'Inter, sans-serif' },
			],
			adoptedWpFonts: {
				inter: { id: 'wpl-inter', font_id: 21, font_family: 'Inter, sans-serif', fallbacks: '' },
			},
		});

		expect(options[0]).toMatchObject({ value: '21', fontId: 21, wpSlug: 'inter' });
		expect(fontIdMap[21].family).toBe('Inter, sans-serif');
	});

	test('adopted WP Library fonts carry detected available_weights', () => {
		const { fontIdMap } = buildFontOptions({
			wpFontLibraryFonts: [
				{ slug: 'inter', name: 'Inter', font_family: 'Inter, sans-serif' },
			],
			adoptedWpFonts: {
				inter: {
					id: 'wpl-inter',
					font_id: 21,
					font_family: 'Inter, sans-serif',
					fallbacks: '',
					available_weights: ['400', '600'],
				},
			},
		});

		expect(fontIdMap[21].availableWeights).toEqual(['400', '600']);
	});

	test('adopted WP Library fonts without detected weights default to all', () => {
		const { fontIdMap } = buildFontOptions({
			wpFontLibraryFonts: [
				{ slug: 'inter', name: 'Inter', font_family: 'Inter, sans-serif' },
			],
			adoptedWpFonts: {
				inter: { id: 'wpl-inter', font_id: 21, font_family: 'Inter, sans-serif', fallbacks: '' },
			},
		});

		expect(fontIdMap[21].availableWeights).toEqual([]);
	});

	test('library fonts registered by the plugin itself are not duplicated', () => {
		const { options } = buildFontOptions({
			fonts: [{ ...uploadedFont, wp_slug: 'playfair-display' }],
			wpFontLibraryFonts: [
				{ slug: 'playfair-display', name: 'Playfair Display', font_family: '"Playfair Display", serif' },
				{ slug: 'inter', name: 'Inter', font_family: 'Inter' },
			],
			pluginRegisteredSlugs: ['playfair-display'],
		});

		// One uploaded option + one library option (inter); playfair library
		// entry skipped because it IS the uploaded font
		expect(options).toHaveLength(2);
		expect(options.filter((o) => o.wpSlug === 'playfair-display')).toHaveLength(0);
	});

	test('fontOrder sorting includes wpl-{slug} keys', () => {
		const { options } = buildFontOptions({
			fonts: [uploadedFont],
			wpFontLibraryFonts: [{ slug: 'inter', name: 'Inter', font_family: 'Inter' }],
			fontOrder: ['wpl-inter', 'font-7'],
		});

		expect(options[0].wpSlug).toBe('inter');
		expect(options[1].fontId).toBe(7);
	});

	test('handles empty/missing data gracefully', () => {
		expect(buildFontOptions().options).toEqual([]);
		expect(buildFontOptions({}).fontIdMap).toEqual({});
	});
});

describe('wp library value helpers', () => {
	test('isWpLibraryValue detects prefixed values only', () => {
		expect(isWpLibraryValue('wp:inter')).toBe(true);
		expect(isWpLibraryValue('12')).toBe(false);
		expect(isWpLibraryValue(12)).toBe(false);
		expect(isWpLibraryValue('')).toBe(false);
	});

	test('wpSlugFromValue extracts the slug', () => {
		expect(wpSlugFromValue('wp:playfair-display')).toBe('playfair-display');
		expect(wpSlugFromValue('12')).toBe('');
	});
});

describe('resolveActiveFontFamily', () => {
	const { resolveActiveFontFamily } = require('../../../assets/js/font-options.js');
	const fontIdMap = {
		4: { family: 'Zeplin VF', availableWeights: [] },
		7: { family: 'Playfair Display', availableWeights: [] },
	};

	test('legacy data-font family wins when present', () => {
		expect(resolveActiveFontFamily('Bookmania', 7, fontIdMap)).toBe('Bookmania');
	});

	test('resolves family from data-font-id when data-font is absent (v1.1.6+ spans)', () => {
		expect(resolveActiveFontFamily('', 4, fontIdMap)).toBe('Zeplin VF');
		expect(resolveActiveFontFamily('', '7', fontIdMap)).toBe('Playfair Display');
	});

	test('returns empty string when nothing resolves', () => {
		expect(resolveActiveFontFamily('', 0, fontIdMap)).toBe('');
		expect(resolveActiveFontFamily('', 99, fontIdMap)).toBe('');
		expect(resolveActiveFontFamily('', 4, null)).toBe('');
		expect(resolveActiveFontFamily(null, null, fontIdMap)).toBe('');
	});
});
