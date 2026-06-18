/**
 * Tests for buildInsertionPayload() — the typost-insert-content payload rules.
 */

const { buildInsertionPayload, buildFeatureSettingsCSS } = require('../assets/js/lib/insertion.js');

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
