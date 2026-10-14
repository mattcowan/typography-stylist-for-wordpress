/**
 * Test Suite: buildInlineFontSizeSpan (QA finding E-6)
 *
 * The Quick Feature Toggles "Font Size (for selected text)" select now
 * applies as soon as "Responsive (fluid)" is chosen, with the value passed
 * in explicitly. The span attributes and style it writes are built here.
 *
 * #233: a span written now is new content, so its size is written in rem.
 * The intent is unchanged — applying from the select and applying from a
 * slider produce the same markup, through buildResponsiveClamp() — only
 * the expected unit moved from px to rem. The px expression keeps its
 * byte-identity test against the legacy template, because blocks saved
 * before #233 still write it.
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
			fontSize: 'clamp(1rem, 2rem + 3vw, 4rem)',
			styleString: 'font-size: clamp(1rem, 2rem + 3vw, 4rem)'
		});
	});

	it('should build the responsive span with custom sizes in rem, vw rounded to four decimals', () => {
		const result = buildInlineFontSizeSpan('responsive', 13, 29, 42);

		expect(result.attributes).toEqual({
			'data-fontsize': 'responsive',
			'data-fontsize-min': '13',
			'data-fontsize-preferred': '29',
			'data-fontsize-max': '42'
		});
		// The px form's float artifact (1.8124999999999998vw) is rounded away
		// in the rem form, as the paragraph style generators round it
		expect(result.fontSize).toBe('clamp(0.8125rem, 1.8125rem + 1.8125vw, 2.625rem)');
		expect(result.styleString).toBe('font-size: clamp(0.8125rem, 1.8125rem + 1.8125vw, 2.625rem)');
	});

	it('should keep the px clamp byte-identical to the legacy expression over a value matrix', () => {
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
			// Blocks saved before #233 (fontSizeUnit 'px', or unset) write this
			expect(buildResponsiveClamp(min, preferred, max)).toBe(legacyClamp(min, preferred, max));
			expect(buildResponsiveClamp(min, preferred, max, 'px')).toBe(legacyClamp(min, preferred, max));
			// New spans go through the same function in rem
			const result = buildInlineFontSizeSpan('responsive', min, preferred, max);
			expect(result.fontSize).toBe(buildResponsiveClamp(min, preferred, max, 'rem'));
			expect(result.styleString).toBe(`font-size: ${buildResponsiveClamp(min, preferred, max, 'rem')}`);
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

	it('should write a fixed px size in rem without breakpoint attributes', () => {
		// A px size detected from a paragraph style saved in the inline
		// editor. data-fontsize keeps the value as given.
		const result = buildInlineFontSizeSpan('24px', 16, 32, 64);

		expect(result).toEqual({
			attributes: { 'data-fontsize': '24px' },
			fontSize: '1.5rem',
			styleString: 'font-size: 1.5rem'
		});
	});

	it('should write a bare px number in rem, keeping decimals', () => {
		expect(buildInlineFontSizeSpan('36.5', 16, 32, 64)).toEqual({
			attributes: { 'data-fontsize': '36.5' },
			fontSize: '2.28125rem',
			styleString: 'font-size: 2.28125rem'
		});
	});

	it('should pass any other size string through as-is', () => {
		expect(buildInlineFontSizeSpan('2em', 16, 32, 64).styleString).toBe('font-size: 2em');
		// Zero is not a px size, so it is not converted
		expect(buildInlineFontSizeSpan('0', 16, 32, 64).fontSize).toBe('0');
	});
});
