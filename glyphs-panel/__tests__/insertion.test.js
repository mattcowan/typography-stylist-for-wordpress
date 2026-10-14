/**
 * Tests for buildInsertionPayload() — the typost-insert-content payload rules.
 */

const { buildInsertionPayload, buildFeatureSettingsCSS, dispatchInsert, resolveInsertionFontWeight } = require('../assets/js/lib/insertion.js');

describe('buildFeatureSettingsCSS', () => {
	test('formats tags as "tag" 1, comma-separated', () => {
		expect(buildFeatureSettingsCSS(['liga', 'ss01'])).toBe('"liga" 1, "ss01" 1');
		expect(buildFeatureSettingsCSS([])).toBe('');
	});
});

describe('buildInsertionPayload', () => {
	test('plain glyph, same font as context → plain text insertion', () => {
		const payload = buildInsertionPayload({
			text: 'A',
			featureTag: null,
			panelFontId: 12,
			contextFontId: 12,
			contextFeatures: [],
			contextFontWeight: '400'
		});
		expect(payload).toEqual({ text: 'A', attributes: null });
	});

	test('plain glyph, no fonts involved → plain text insertion', () => {
		const payload = buildInsertionPayload({ text: '—' });
		expect(payload).toEqual({ text: '—', attributes: null });
	});

	test('feature alternate → span with data-features and style', () => {
		const payload = buildInsertionPayload({
			text: 'A',
			featureTag: 'ss01',
			panelFontId: 12,
			contextFontId: 12,
			contextFeatures: [],
			contextFontWeight: ''
		});
		expect(payload.attributes['data-features']).toBe('ss01');
		expect(payload.attributes['data-font-id']).toBe('12');
		expect(payload.attributes.style).toBe('font-feature-settings: "ss01" 1; font-family: var(--font-12)');
	});

	test('feature merges with context features (replacement semantics)', () => {
		const payload = buildInsertionPayload({
			text: 'A',
			featureTag: 'ss01',
			panelFontId: 0,
			contextFontId: 5,
			contextFeatures: ['liga', 'ss01', 'kern'],
			contextFontWeight: ''
		});
		// Deduped, featureTag first
		expect(payload.attributes['data-features']).toBe('ss01,liga,kern');
		expect(payload.attributes.style).toContain('font-feature-settings: "ss01" 1, "liga" 1, "kern" 1');
	});

	test('cross-font insertion carries panel font id', () => {
		const payload = buildInsertionPayload({
			text: 'A',
			featureTag: null,
			panelFontId: 20,
			contextFontId: 5,
			contextFeatures: [],
			contextFontWeight: ''
		});
		expect(payload.attributes['data-font-id']).toBe('20');
		expect(payload.attributes.style).toBe('font-family: var(--font-20)');
	});

	test('context font preserved when feature requires a span but fonts match', () => {
		const payload = buildInsertionPayload({
			text: 'fi',
			featureTag: 'dlig',
			panelFontId: 5,
			contextFontId: 5,
			contextFeatures: [],
			contextFontWeight: ''
		});
		expect(payload.attributes['data-font-id']).toBe('5');
	});

	test('context font weight preserved on span', () => {
		const payload = buildInsertionPayload({
			text: 'A',
			featureTag: 'swsh',
			panelFontId: 12,
			contextFontId: 12,
			contextFeatures: [],
			contextFontWeight: '700'
		});
		expect(payload.attributes['data-fontweight']).toBe('700');
		expect(payload.attributes.style).toContain('font-weight: 700');
	});

	test('inherit weight is not written to the span', () => {
		const payload = buildInsertionPayload({
			text: 'A',
			featureTag: 'swsh',
			panelFontId: 12,
			contextFontId: 12,
			contextFeatures: [],
			contextFontWeight: 'inherit'
		});
		expect(payload.attributes['data-fontweight']).toBeUndefined();
	});

	describe('indexed alternates (featureIndex > 1)', () => {
		test('indexed alternate goes to data-feature-settings, not data-features', () => {
			const payload = buildInsertionPayload({
				text: 'A',
				featureTag: 'salt',
				featureIndex: 2,
				panelFontId: 12,
				contextFontId: 12,
				contextFeatures: [],
				contextFontWeight: ''
			});
			expect(payload.attributes['data-feature-settings']).toBe('"salt" 2');
			expect(payload.attributes['data-features']).toBeUndefined();
			expect(payload.attributes.style).toContain('font-feature-settings: "salt" 2');
		});

		test('context features ride along as "tag" 1 in the raw value AND data-features', () => {
			const payload = buildInsertionPayload({
				text: 'A',
				featureTag: 'salt',
				featureIndex: 3,
				panelFontId: 12,
				contextFontId: 12,
				contextFeatures: ['liga', 'kern'],
				contextFontWeight: ''
			});
			expect(payload.attributes['data-feature-settings']).toBe('"salt" 3, "liga" 1, "kern" 1');
			expect(payload.attributes['data-features']).toBe('liga,kern');
		});

		test('featureIndex 1 behaves like a plain feature tag', () => {
			const payload = buildInsertionPayload({
				text: 'A',
				featureTag: 'salt',
				featureIndex: 1,
				panelFontId: 12,
				contextFontId: 12,
				contextFeatures: [],
				contextFontWeight: ''
			});
			expect(payload.attributes['data-feature-settings']).toBeUndefined();
			expect(payload.attributes['data-features']).toBe('salt');
		});

		test('indexed tag is not duplicated when also present in context features', () => {
			const payload = buildInsertionPayload({
				text: 'A',
				featureTag: 'salt',
				featureIndex: 2,
				panelFontId: 0,
				contextFontId: 5,
				contextFeatures: ['salt', 'liga'],
				contextFontWeight: ''
			});
			expect(payload.attributes['data-feature-settings']).toBe('"salt" 2, "liga" 1');
			expect(payload.attributes['data-features']).toBe('liga');
		});
	});

	describe('base glyph of the alternates view (isBaseGlyph)', () => {
		test('forces a span even when rule 1 would send plain text, so the inherited alternate is cleared', () => {
			const payload = buildInsertionPayload({
				text: '&',
				featureTag: null,
				isBaseGlyph: true,
				panelFontId: 40,
				contextFontId: 40,
				contextFeatures: [],
				contextFontWeight: ''
			});
			expect(payload.attributes).not.toBeNull();
			// No feature keys: the core merge treats them as payload-owned,
			// so the replaced span's "aalt" N does not survive
			expect(payload.attributes['data-features']).toBeUndefined();
			expect(payload.attributes['data-feature-settings']).toBeUndefined();
			expect(payload.attributes['data-font-id']).toBe('40');
			expect(payload.attributes.style).toBe('font-family: var(--font-40)');
		});

		test('context features and weight still ride along', () => {
			const payload = buildInsertionPayload({
				text: '&',
				featureTag: null,
				isBaseGlyph: true,
				panelFontId: 40,
				contextFontId: 40,
				contextFeatures: ['liga'],
				contextFontWeight: '700'
			});
			expect(payload.attributes['data-features']).toBe('liga');
			expect(payload.attributes['data-fontweight']).toBe('700');
			expect(payload.attributes.style).toContain('font-feature-settings: "liga" 1');
		});

		test('no font, no features, no weight → bare span with no style attribute', () => {
			const payload = buildInsertionPayload({
				text: '&',
				featureTag: null,
				isBaseGlyph: true,
				panelFontId: 0,
				contextFontId: 0,
				contextFeatures: [],
				contextFontWeight: ''
			});
			expect(payload.attributes).toEqual({});
		});

		test('false/omitted keeps rule 1 (plain insertion) unchanged', () => {
			const payload = buildInsertionPayload({
				text: '&',
				featureTag: null,
				isBaseGlyph: false,
				panelFontId: 40,
				contextFontId: 40,
				contextFeatures: [],
				contextFontWeight: ''
			});
			expect(payload).toEqual({ text: '&', attributes: null });
		});

		describe('block-level alternate features (clearTags)', () => {
			test('alternate tag active in context is explicitly disabled ("tag" 0)', () => {
				// Bug (2026-09-09): a typost/block with features [swsh, dlig]
				// re-declared swsh on the base-cell span, so the W stayed swashed.
				// Rule 5 only clears an INLINE format; a block-level feature
				// (or one inherited through CSS) must be turned off explicitly.
				const payload = buildInsertionPayload({
					text: 'W',
					featureTag: null,
					isBaseGlyph: true,
					clearTags: ['swsh'],
					panelFontId: 1,
					contextFontId: 1,
					contextFeatures: ['swsh'],
					contextFontWeight: ''
				});
				expect(payload.attributes['data-features']).toBeUndefined();
				expect(payload.attributes['data-feature-settings']).toBe('"swsh" 0');
				expect(payload.attributes['data-font-id']).toBe('1');
				expect(payload.attributes.style).toBe('font-feature-settings: "swsh" 0; font-family: var(--font-1)');
			});

			test('other context features are kept at 1 while the alternate tags go to 0', () => {
				const payload = buildInsertionPayload({
					text: 'W',
					featureTag: null,
					isBaseGlyph: true,
					clearTags: ['swsh', 'ss01'],
					panelFontId: 1,
					contextFontId: 1,
					contextFeatures: ['swsh', 'dlig'],
					contextFontWeight: '700'
				});
				// data-features lists only the kept tags, so the popover's
				// toggles do not show swsh as on
				expect(payload.attributes['data-features']).toBe('dlig');
				expect(payload.attributes['data-feature-settings']).toBe('"swsh" 0, "dlig" 1');
				expect(payload.attributes['data-fontweight']).toBe('700');
				expect(payload.attributes.style).toBe('font-feature-settings: "swsh" 0, "dlig" 1; font-family: var(--font-1); font-weight: 700');
			});

			test('an indexed alternate (salt N) in context is zeroed by its tag', () => {
				// The alternates view lists salt as a tag regardless of index;
				// the base cell turns the whole feature off, not one index
				const payload = buildInsertionPayload({
					text: 'a',
					featureTag: null,
					isBaseGlyph: true,
					clearTags: ['salt', 'swsh'],
					panelFontId: 40,
					contextFontId: 40,
					contextFeatures: ['salt', 'liga'],
					contextFontWeight: ''
				});
				expect(payload.attributes['data-features']).toBe('liga');
				expect(payload.attributes['data-feature-settings']).toBe('"salt" 0, "liga" 1');
				expect(payload.attributes.style).toContain('font-feature-settings: "salt" 0, "liga" 1');
			});

			test('clearTags not active in context are not written (no needless 0 values)', () => {
				const payload = buildInsertionPayload({
					text: 'W',
					featureTag: null,
					isBaseGlyph: true,
					clearTags: ['swsh', 'ss01'],
					panelFontId: 40,
					contextFontId: 40,
					contextFeatures: ['liga'],
					contextFontWeight: ''
				});
				expect(payload.attributes['data-features']).toBe('liga');
				expect(payload.attributes['data-feature-settings']).toBeUndefined();
				expect(payload.attributes.style).toBe('font-feature-settings: "liga" 1; font-family: var(--font-40)');
			});

			test('clearTags is ignored for non-base insertions', () => {
				const payload = buildInsertionPayload({
					text: 'W',
					featureTag: 'swsh',
					isBaseGlyph: false,
					clearTags: ['swsh'],
					panelFontId: 40,
					contextFontId: 40,
					contextFeatures: ['dlig'],
					contextFontWeight: ''
				});
				expect(payload.attributes['data-features']).toBe('swsh,dlig');
				expect(payload.attributes['data-feature-settings']).toBeUndefined();
			});
		});
	});

	describe('WP Font Library fonts (panelFontFamily, no numeric id)', () => {
		test('cross-font insertion uses raw font-family and data-font', () => {
			const payload = buildInsertionPayload({
				text: 'A',
				featureTag: null,
				panelFontId: 0,
				panelFontFamily: '"Inter", sans-serif',
				contextFontId: 5,
				contextFeatures: [],
				contextFontWeight: ''
			});
			expect(payload.attributes['data-font']).toBe('"Inter", sans-serif');
			expect(payload.attributes['data-font-id']).toBeUndefined();
			expect(payload.attributes.style).toContain('font-family: "Inter", sans-serif');
		});

		test('panelFontFamily alone (no context font) still creates a span', () => {
			const payload = buildInsertionPayload({
				text: 'A',
				featureTag: null,
				panelFontId: 0,
				panelFontFamily: '"Inter"',
				contextFontId: 0,
				contextFeatures: [],
				contextFontWeight: ''
			});
			expect(payload.attributes).not.toBeNull();
			expect(payload.attributes['data-font']).toBe('"Inter"');
		});
	});
});

describe('dispatchInsert', () => {
	function captureDetail(dispatch) {
		let detail = null;
		const listener = (e) => { detail = e.detail; };
		document.addEventListener('typost-insert-content', listener);
		dispatch();
		document.removeEventListener('typost-insert-content', listener);
		return detail;
	}

	test('forwards swap: true for alternates-view payloads', () => {
		const detail = captureDetail(() =>
			dispatchInsert('qft', { text: '&', attributes: null, swap: true }, { clientId: 'abc' })
		);
		expect(detail.swap).toBe(true);
		expect(detail.clientId).toBe('abc');
	});

	test('omits swap for sequence insertions', () => {
		const detail = captureDetail(() =>
			dispatchInsert('qft', { text: '&', attributes: null }, {})
		);
		expect(detail.swap).toBeUndefined();
	});
});

describe('resolveInsertionFontWeight (#254)', () => {
	test('uses the weight stored on the selected text', () => {
		expect(resolveInsertionFontWeight({ fontWeight: '700', selectionFontWeight: '700' })).toBe('700');
	});

	test('writes no weight when the selection inherits it', () => {
		// Paragraph style 400 in a 700 block: fontWeight is the rendered
		// 400, but nothing is stored on the text, so nothing is written
		expect(resolveInsertionFontWeight({ fontWeight: '400', selectionFontWeight: '' })).toBe('');
		expect(resolveInsertionFontWeight({ fontWeight: '700', selectionFontWeight: null })).toBe('');
	});

	test('a host without selectionFontWeight keeps the old behavior', () => {
		expect(resolveInsertionFontWeight({ fontWeight: '700' })).toBe('700');
		expect(resolveInsertionFontWeight({})).toBe('');
		expect(resolveInsertionFontWeight(null)).toBe('');
	});

	test('an inherited weight gives a span with no weight', () => {
		const payload = buildInsertionPayload({
			text: 'r',
			featureTag: 'swsh',
			panelFontId: 12,
			contextFontId: 12,
			contextFeatures: [],
			contextFontWeight: resolveInsertionFontWeight({ fontWeight: '400', selectionFontWeight: '' })
		});
		expect(payload.attributes['data-fontweight']).toBeUndefined();
		expect(payload.attributes.style).not.toContain('font-weight');
	});
});
