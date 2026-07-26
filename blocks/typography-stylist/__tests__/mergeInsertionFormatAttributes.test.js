/**
 * Tests for mergeInsertionFormatAttributes() — preserving the styling of the
 * typost format an extension insertion replaces (e.g. Glyphs Panel glyph
 * swaps keeping the parent span's font-size).
 */

import { mergeInsertionFormatAttributes } from '../utils';

describe('mergeInsertionFormatAttributes', () => {
	const glyphPayload = {
		'data-features': 'ss01',
		'data-font-id': '4',
		style: 'font-feature-settings: "ss01" 1; font-family: var(--font-4)',
	};

	test('returns incoming unchanged when there is nothing to merge', () => {
		expect(mergeInsertionFormatAttributes(glyphPayload, null)).toBe(glyphPayload);
		expect(mergeInsertionFormatAttributes(glyphPayload, undefined)).toBe(glyphPayload);
		expect(mergeInsertionFormatAttributes(null, { style: 'font-size: 20px' })).toBeNull();
	});

	test('carries font-size from the replaced span (the reported glyph-swap bug)', () => {
		const inherited = {
			'data-font-id': '4',
			'data-fontsize': '72px',
			style: 'font-family: var(--font-4); font-size: 72px',
		};
		const merged = mergeInsertionFormatAttributes(glyphPayload, inherited);
		expect(merged['data-fontsize']).toBe('72px');
		expect(merged.style).toContain('font-size: 72px');
		// Payload still owns features and font
		expect(merged['data-features']).toBe('ss01');
		expect(merged.style).toContain('font-feature-settings: "ss01" 1');
		expect(merged.style).toContain('font-family: var(--font-4)');
	});

	test('carries responsive font-size (clamp) and spacing attributes', () => {
		const inherited = {
			'data-fontsize': 'responsive',
			'data-fontsize-min': '35',
			'data-fontsize-preferred': '79',
			'data-fontsize-max': '132',
			'data-letterspacing': '2',
			'data-lineheight': '1.2',
			style: 'font-size: clamp(35px, 4.9375rem + 6.0625vw, 132px); letter-spacing: 2px; line-height: 1.2',
		};
		const merged = mergeInsertionFormatAttributes(glyphPayload, inherited);
		expect(merged['data-fontsize']).toBe('responsive');
		expect(merged['data-fontsize-min']).toBe('35');
		expect(merged['data-fontsize-preferred']).toBe('79');
		expect(merged['data-fontsize-max']).toBe('132');
		expect(merged['data-letterspacing']).toBe('2');
		expect(merged['data-lineheight']).toBe('1.2');
		expect(merged.style).toContain('font-size: clamp(35px, 4.9375rem + 6.0625vw, 132px)');
		expect(merged.style).toContain('letter-spacing: 2px');
		expect(merged.style).toContain('line-height: 1.2');
	});

	test('incoming attributes and style properties always win', () => {
		const payload = {
			'data-features': 'swsh',
			'data-fontweight': '700',
			style: 'font-feature-settings: "swsh" 1; font-weight: 700',
		};
		const inherited = {
			'data-fontweight': '300',
			'data-fontsize': '40px',
			style: 'font-weight: 300; font-size: 40px',
		};
		const merged = mergeInsertionFormatAttributes(payload, inherited);
		expect(merged['data-fontweight']).toBe('700');
		expect(merged.style).toContain('font-weight: 700');
		expect(merged.style).not.toContain('font-weight: 300');
		expect(merged.style).toContain('font-size: 40px');
	});

	test('never inherits identity or feature attributes', () => {
		const inherited = {
			'data-features': 'liga,dlig',
			'data-feature-settings': '"salt" 2',
			'data-font': 'Old Family',
			'data-font-id': '9',
			style: 'font-feature-settings: "liga" 1, "dlig" 1; font-family: var(--font-9)',
		};
		const merged = mergeInsertionFormatAttributes(glyphPayload, inherited);
		expect(merged['data-features']).toBe('ss01');
		expect(merged['data-feature-settings']).toBeUndefined();
		expect(merged['data-font']).toBeUndefined();
		expect(merged['data-font-id']).toBe('4');
		expect(merged.style).not.toContain('var(--font-9)');
	});

	test('font-variation-settings carries over only for the same font', () => {
		const sameFont = mergeInsertionFormatAttributes(glyphPayload, {
			'data-font-id': '4',
			style: 'font-variation-settings: "wght" 628',
		});
		expect(sameFont.style).toContain('font-variation-settings: "wght" 628');

		const crossFont = mergeInsertionFormatAttributes(glyphPayload, {
			'data-font-id': '11',
			style: 'font-variation-settings: "wght" 628; font-size: 40px',
		});
		expect(crossFont.style).not.toContain('font-variation-settings');
		expect(crossFont.style).toContain('font-size: 40px');
	});
});
