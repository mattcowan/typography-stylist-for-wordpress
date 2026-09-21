/**
 * Test Suite: buildInlineFontSizeSpan (QA finding E-6)
 *
 * The Quick Feature Toggles "Font Size (for selected text)" select now
 * applies as soon as "Responsive (fluid)" is chosen, with the value passed
 * in explicitly. The span attributes and style it writes are built here,
 * and the clamp() expression must stay byte-identical to the legacy inline
 * template (float artifacts included) so applying from the select and
 * applying from a slider produce the same markup.
 */

import { buildInlineFontSizeSpan, buildResponsiveClamp } from '../utils';

describe('Typography Stylist - buildInlineFontSizeSpan', () => {
	// The exact legacy template from applyInlineFontSize() in edit.js
	const legacyClamp = (min, preferred, max) =>
		`clamp(${min}px, ${preferred / 16}rem + ${((max - min) / (1920 - 320)) * 100}vw, ${max}px)`;

	it('should build the responsive span with the default sizes (16/32/64)', () => {
		const result = buildInlineFontSizeSpan('responsive', 16, 32, 64);

		expect(result).toEqual({
			attributes: {
				'data-fontsize': 'responsive',
				'data-fontsize-min': '16',
				'data-fontsize-preferred': '32',
				'data-fontsize-max': '64'
			},
			fontSize: 'clamp(16px, 2rem + 3vw, 64px)',
			styleString: 'font-size: clamp(16px, 2rem + 3vw, 64px)'
		});
	});

	it('should build the responsive span with custom sizes, byte-identical to the legacy expression', () => {
		const result = buildInlineFontSizeSpan('responsive', 13, 29, 42);

		expect(result.attributes).toEqual({
			'data-fontsize': 'responsive',
			'data-fontsize-min': '13',
			'data-fontsize-preferred': '29',
			'data-fontsize-max': '42'
		});
		// The known float artifact must survive: this is what the slider path
		// has always written, and the select path must match it
		expect(result.fontSize).toBe('clamp(13px, 1.8125rem + 1.8124999999999998vw, 42px)');
		expect(result.styleString).toBe(`font-size: ${legacyClamp(13, 29, 42)}`);
	});

	it('should stay byte-identical to the legacy expression over a value matrix', () => {
		const cases = [
			[16, 32, 64],
			[14, 20, 32],
			[18, 22, 29],
			[30, 81, 108],
			[8, 8, 8],
			[64, 32, 16], // out-of-order (soft validation allows it)
			[120, 200, 400]
		];
		for (const [min, preferred, max] of cases) {
			const result = buildInlineFontSizeSpan('responsive', min, preferred, max);
			expect(result.fontSize).toBe(legacyClamp(min, preferred, max));
			expect(result.fontSize).toBe(buildResponsiveClamp(min, preferred, max));
			expect(result.styleString).toBe(`font-size: ${legacyClamp(min, preferred, max)}`);
		}
	});

	it('should return null for inherit (nothing to apply)', () => {
		expect(buildInlineFontSizeSpan('inherit', 16, 32, 64)).toBeNull();
	});

	it('should return null for an empty or missing size', () => {
		expect(buildInlineFontSizeSpan('', 16, 32, 64)).toBeNull();
		expect(buildInlineFontSizeSpan(undefined, 16, 32, 64)).toBeNull();
		expect(buildInlineFontSizeSpan(null, 16, 32, 64)).toBeNull();
	});

	it('should pass a fixed size through without breakpoint attributes', () => {
		// A px size detected from a paragraph style saved in the inline editor
		const result = buildInlineFontSizeSpan('24px', 16, 32, 64);

		expect(result).toEqual({
			attributes: { 'data-fontsize': '24px' },
			fontSize: '24px',
			styleString: 'font-size: 24px'
		});
	});
});
