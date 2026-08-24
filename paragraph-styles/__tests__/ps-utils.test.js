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
	buildStyleCssBlock,
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

	test('detects fontStyle changes, treating empty (inherit) as the default', () => {
		expect(isStyleModified(
			{ fontId: 12, fontWeight: '700', features: ['liga', 'ss01'], fontStyle: 'italic' },
			baseProps
		)).toBe(true);
		expect(isStyleModified(
			{ fontId: 12, fontWeight: '700', features: ['liga', 'ss01'], fontStyle: 'italic' },
			Object.assign({}, baseProps, { fontStyle: 'italic' })
		)).toBe(false);
		expect(isStyleModified(
			{ fontId: 12, fontWeight: '700', features: ['liga', 'ss01'], fontStyle: '' },
			Object.assign({}, baseProps, { fontStyle: 'italic' })
		)).toBe(true);
		// '' (inherit) and forced 'normal' are different declarations
		expect(isStyleModified(
			{ fontId: 12, fontWeight: '700', features: ['liga', 'ss01'], fontStyle: 'normal' },
			baseProps
		)).toBe(true);
	});

	test('rendered <em>-italic does not flag "(modified)" — explicit state wins', () => {
		// Caret inside <em>: fontStyle reports rendered italic, explicit is unset
		expect(isStyleModified(
			{ fontId: 12, fontWeight: '700', features: ['liga', 'ss01'], fontStyle: 'italic', explicitFontStyle: '' },
			baseProps
		)).toBe(false);
		// A real explicit italic against a style without one still flags
		expect(isStyleModified(
			{ fontId: 12, fontWeight: '700', features: ['liga', 'ss01'], fontStyle: 'italic', explicitFontStyle: 'italic' },
			baseProps
		)).toBe(true);
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

	test('captures fontStyle when set, skips inherit', () => {
		expect(buildPropertiesFromState({ fontStyle: 'italic' })).toEqual({ fontStyle: 'italic' });
		// Forced upright is a real choice, distinct from inherit
		expect(buildPropertiesFromState({ fontStyle: 'normal' })).toEqual({ fontStyle: 'normal' });
		expect(buildPropertiesFromState({ fontStyle: '' })).toEqual({});
	});

	test('prefers explicitFontStyle: rendered <em>-italic is never captured', () => {
		// Caret inside <em>: rendered fontStyle is 'italic' but nothing was
		// explicitly set — the style must not bake that italic in.
		expect(buildPropertiesFromState({ fontStyle: 'italic', explicitFontStyle: '' })).toEqual({});
		// An explicit choice rides through
		expect(buildPropertiesFromState({ fontStyle: 'italic', explicitFontStyle: 'italic' }))
			.toEqual({ fontStyle: 'italic' });
		// Providers without the key (extensions, older states) keep old behavior
		expect(buildPropertiesFromState({ fontStyle: 'italic' })).toEqual({ fontStyle: 'italic' });
	});
});

describe('normalizeApplyProperties', () => {
	test('fills defaults for omitted style-owned keys so stale editor state is reset', () => {
		expect(normalizeApplyProperties({ fontId: 12, fontWeight: '700' })).toEqual({
			fontId: 12,
			fontWeight: '700',
			fontStyle: '',
			fontSize: 'inherit',
			letterSpacing: 0,
			lineHeight: 0,
			features: [],
			fontVariationSettings: '',
		});
	});

	test('fontStyle is style-owned: a stored italic rides through, an omitted one resets', () => {
		expect(normalizeApplyProperties({ fontStyle: 'italic' }).fontStyle).toBe('italic');
		// A style saved without fontStyle must reset a lingering italic on
		// apply — the applied result has to look like the style.
		expect(normalizeApplyProperties({ fontId: 12 }).fontStyle).toBe('');
	});

	test('stored values always win over defaults', () => {
		expect(normalizeApplyProperties({
			fontId: 15,
			fontWeight: 'bold',
			fontStyle: 'italic',
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
			fontStyle: 'italic',
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

	test('never introduces keys styles cannot express (fit/extension keys)', () => {
		const normalized = normalizeApplyProperties({});
		expect(normalized).not.toHaveProperty('fitMaxSize');
		expect(normalized).not.toHaveProperty('layeredConfigId');
		expect(normalized).not.toHaveProperty('animationConfigId');
	});

	test('handles null/undefined input as all-defaults', () => {
		expect(normalizeApplyProperties(null)).toEqual({
			fontId: 0,
			fontWeight: '400',
			fontStyle: '',
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
				fontStyle: '',
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

	test('omits applyTo by default, so a style stays block-level', () => {
		expect(buildApplyEventDetail(style, 'inspector')).not.toHaveProperty('applyTo');
		expect(buildApplyEventDetail(null, 'inspector', {})).not.toHaveProperty('applyTo');
	});

	test('applyTo "selection" scopes the style to the selected text', () => {
		expect(buildApplyEventDetail(style, 'inspector', undefined, 'selection').applyTo).toBe('selection');
		expect(buildApplyEventDetail(null, 'inspector', {}, 'selection').applyTo).toBe('selection');
	});

	test('an unrecognized scope is ignored rather than passed through', () => {
		// Guards against a typo silently reaching the host as an unknown mode
		expect(buildApplyEventDetail(style, 'inspector', undefined, 'block')).not.toHaveProperty('applyTo');
		expect(buildApplyEventDetail(style, 'inspector', undefined, 'whatever')).not.toHaveProperty('applyTo');
	});

	test('scoping does not disturb the rest of the payload', () => {
		const detail = buildApplyEventDetail(style, 'inspector', undefined, 'selection');
		expect(detail.paragraphStyleId).toBe(style.id);
		expect(detail.styleClass).toBe('typost-ps-' + style.id);
		expect(detail.source).toBe('inspector');
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

	describe('size labels are translatable', () => {
		afterEach(() => {
			delete global.wp;
		});

		test('falls back to English when no wp.i18n is present (as under test)', () => {
			expect(global.wp).toBeUndefined();
			expect(buildStylePreviewStyle({ fontSize: '64' }).sizeLabel).toBe('64px');
		});

		test('runs labels through wp.i18n when WordPress is present', () => {
			const translations = {
				'Fluid %1$s–%2$s': 'Fluide %1$s–%2$s',
				'Fit ≤ %spx': 'Ajusté ≤ %spx',
				Fit: 'Ajusté',
				'%spx': '%spx',
			};
			global.wp = {
				i18n: {
					__: (text, domain) => {
						expect(domain).toBe('typost-paragraph-styles');
						return translations[text] || text;
					},
					// Stand-in for the real sprintf, covering the forms used here
					sprintf: (template, ...args) => {
						let index = 0;
						return template.replace(/%(\d+\$)?s/g, (m, pos) =>
							String(pos ? args[parseInt(pos, 10) - 1] : args[index++]));
					},
				},
			};

			expect(buildStylePreviewStyle({
				fontSize: 'responsive', fontSizeMin: 20, fontSizeMax: 48, fontSizePreferred: 30,
			}).sizeLabel).toBe('Fluide 20–48');
			expect(buildStylePreviewStyle({ fontSize: 'fit', fitMaxSize: 120 }).sizeLabel).toBe('Ajusté ≤ 120px');
			expect(buildStylePreviewStyle({ fontSize: 'fit', fitMaxSize: 0 }).sizeLabel).toBe('Ajusté');
			expect(buildStylePreviewStyle({ fontSize: '64' }).sizeLabel).toBe('64px');
		});

		test('placeholders are ordered, not positional-by-accident', () => {
			// A translation that swaps the two placeholders must still map to
			// the right numbers — that is the point of %1$s / %2$s.
			global.wp = {
				i18n: {
					__: () => '%2$s down to %1$s',
					sprintf: (template, ...args) =>
						template.replace(/%(\d+\$)?s/g, (m, pos) => String(args[parseInt(pos, 10) - 1])),
				},
			};
			expect(buildStylePreviewStyle({
				fontSize: 'responsive', fontSizeMin: 20, fontSizeMax: 48, fontSizePreferred: 30,
			}).sizeLabel).toBe('48 down to 20');
		});
	});
});

describe('buildStyleCssBlock', () => {
	// The JS twin of PHP generate_style_css(): the editor injects this for
	// styles created/updated in-session, so its output must match what the
	// server will print on the next full load.

	test('emits the dual selector and all set properties, PHP-formatted', () => {
		expect(buildStyleCssBlock({
			id: 3,
			properties: {
				fontId: 12,
				fontWeight: '700',
				fontStyle: 'italic',
				features: ['liga', 'ss01'],
				letterSpacing: 50,
				lineHeight: 1.4,
				fontSize: '24',
			},
		})).toBe(
			'.typost-ps-3,\n.typost-styled[data-style-id="3"] {\n' +
			'    font-family: var(--font-12);\n' +
			'    font-weight: 700;\n' +
			'    font-style: italic;\n' +
			'    font-feature-settings: "liga" 1, "ss01" 1;\n' +
			'    letter-spacing: 0.05em;\n' +
			'    line-height: 1.4;\n' +
			'    font-size: 24px;\n' +
			'}'
		);
	});

	test('responsive sizes emit the same clamp() the server does', () => {
		const css = buildStyleCssBlock({
			id: 7,
			properties: { fontSize: 'responsive', fontSizeMin: 16, fontSizePreferred: 24, fontSizeMax: 64 },
		});
		expect(css).toContain('font-size: clamp(16px, 1.5rem + 3vw, 64px)');
	});

	test('fit styles emit the fallback clamp, like the server', () => {
		const css = buildStyleCssBlock({
			id: 7,
			properties: { fontSize: 'fit', fontSizeMin: 16, fontSizePreferred: 24, fontSizeMax: 64, fitMaxSize: 120 },
		});
		expect(css).toContain('font-size: clamp(16px, 1.5rem + 3vw, 64px)');
	});

	test('keyword weights pass, invalid weights are dropped', () => {
		expect(buildStyleCssBlock({ id: 1, properties: { fontWeight: 'bold' } }))
			.toContain('font-weight: bold');
		expect(buildStyleCssBlock({ id: 1, properties: { fontWeight: '5000', fontId: 2 } }))
			.not.toContain('font-weight');
	});

	test('only whitelisted font-style values are emitted', () => {
		expect(buildStyleCssBlock({ id: 1, properties: { fontStyle: 'normal' } }))
			.toContain('font-style: normal');
		expect(buildStyleCssBlock({ id: 1, properties: { fontStyle: 'oblique' } }))
			.toContain('font-style: oblique');
		expect(buildStyleCssBlock({ id: 1, properties: { fontStyle: 'expression(alert(1))', fontId: 2 } }))
			.not.toContain('font-style');
	});

	test('font-variation-settings pairs are re-validated like the server regex', () => {
		expect(buildStyleCssBlock({ id: 1, properties: { fontVariationSettings: '"wght" 650, "opsz" 14.5' } }))
			.toContain('font-variation-settings: "wght" 650, "opsz" 14.5');
		expect(buildStyleCssBlock({ id: 1, properties: { fontVariationSettings: 'url(x); "wght" 650' } }))
			.not.toContain('font-variation-settings');
	});

	test('feature tags that fail sanitize_key-style validation are dropped', () => {
		expect(buildStyleCssBlock({ id: 1, properties: { features: ['liga', 'bad"tag'] } }))
			.toBe('.typost-ps-1,\n.typost-styled[data-style-id="1"] {\n    font-feature-settings: "liga" 1;\n}');
	});

	test('legacy IDs get their selector variants', () => {
		const css = buildStyleCssBlock({
			id: 4,
			legacyId: 'ps_1709312345_123',
			properties: { fontId: 2 },
		});
		expect(css).toContain('.typost-ps-4,');
		expect(css).toContain('.typost-ps-ps_1709312345_123,');
		expect(css).toContain('.typost-styled[data-style-id="ps_1709312345_123"]');
	});

	test('returns empty string for empty or invalid styles', () => {
		expect(buildStyleCssBlock({ id: 5, properties: {} })).toBe('');
		expect(buildStyleCssBlock({ id: 5 })).toBe('');
		expect(buildStyleCssBlock(null)).toBe('');
	});

	test('exponent-notation numerics cast like PHP intval, not parseInt', () => {
		// PHP intval('1e2') is 100; parseInt('1e2') is 1 — the server would
		// print 100px, so the injected CSS must too
		expect(buildStyleCssBlock({ id: 1, properties: { fontSize: '1e2' } }))
			.toContain('font-size: 100px');
		expect(buildStyleCssBlock({ id: 1, properties: { letterSpacing: '1e2' } }))
			.toContain('letter-spacing: 0.1em');
	});

	test('suffixed numerics parse their leading number like PHP intval', () => {
		// intval('50px') is 50 (verified against PHP 8.4) — Number() would
		// say NaN and silently drop the rule the server will print
		expect(buildStyleCssBlock({ id: 1, properties: { letterSpacing: '50px' } }))
			.toContain('letter-spacing: 0.05em');
		expect(buildStyleCssBlock({ id: 1, properties: { fontId: '12abc' } }))
			.toContain('font-family: var(--font-12)');
		expect(buildStyleCssBlock({
			id: 1,
			properties: { fontSize: 'responsive', fontSizeMin: '16px', fontSizePreferred: '24px', fontSizeMax: '64px' },
		})).toContain('font-size: clamp(16px, 1.5rem + 3vw, 64px)');
		// The px branch is guarded by is_numeric() in PHP, which rejects
		// suffixes — neither side emits for a suffixed fontSize
		expect(buildStyleCssBlock({ id: 1, properties: { fontSize: '50px', fontId: 2 } }))
			.not.toContain('font-size');
	});

	test('PHP !empty guard semantics: garbage emits zero-valued rules, "0" is empty', () => {
		// PHP guards these with !empty only, then casts — so the server prints
		// letter-spacing: 0em / line-height: 0 for junk, and an explicit 0
		// resets inherited values where absence would not. Match it.
		expect(buildStyleCssBlock({ id: 1, properties: { letterSpacing: 'abc' } }))
			.toContain('letter-spacing: 0em');
		expect(buildStyleCssBlock({ id: 1, properties: { lineHeight: 'abc' } }))
			.toContain('line-height: 0;');
		// absint() also abs()es: the server prints var(--font-5) and, for
		// junk, the harmless var(--font-0)
		expect(buildStyleCssBlock({ id: 1, properties: { fontId: '-5' } }))
			.toContain('font-family: var(--font-5)');
		expect(buildStyleCssBlock({ id: 1, properties: { fontId: 'abc' } }))
			.toContain('font-family: var(--font-0)');
		// empty('0') is true in PHP — the string '0' must not emit
		expect(buildStyleCssBlock({ id: 1, properties: { letterSpacing: '0', fontId: 2 } }))
			.not.toContain('letter-spacing');
		expect(buildStyleCssBlock({ id: 1, properties: { lineHeight: '0', fontId: 2 } }))
			.not.toContain('line-height');
	});

	test('floats print at PHP precision (14 significant digits)', () => {
		// PHP echoes floats at precision=14; JS at up to 17 — the long tail
		// must be trimmed identically
		expect(buildStyleCssBlock({ id: 1, properties: { lineHeight: 1.2345678901234567 } }))
			.toContain('line-height: 1.2345678901235;');
		expect(buildStyleCssBlock({ id: 1, properties: { lineHeight: 1.4 } }))
			.toContain('line-height: 1.4;');
		expect(buildStyleCssBlock({ id: 1, properties: { fontVariationSettings: '"opsz" 14.5' } }))
			.toContain('font-variation-settings: "opsz" 14.5');
	});
});
