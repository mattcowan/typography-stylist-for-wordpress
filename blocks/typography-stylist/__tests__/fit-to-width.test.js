/**
 * Test Suite: Fit-to-width sizing utilities (fontSize: "fit")
 *
 * Pure helpers behind the third font-sizing mode: per-line splitting on
 * <br> boundaries, the ratio math, the cqi font-size strings, the shared
 * per-line wrapper composition, and the byte-identity of the extracted
 * responsive clamp() builder.
 */

import {
	splitContentIntoLines,
	computeFitRatio,
	buildFitFontSize,
	buildFitLinesHtml,
	buildResponsiveClamp,
	computeFitEditingFontSize
} from '../utils';

describe('Typography Stylist - fit-to-width utilities', () => {

	// ===== splitContentIntoLines =====

	describe('splitContentIntoLines', () => {
		it('should return a single line when there is no <br>', () => {
			expect(splitContentIntoLines('Hello world')).toEqual(['Hello world']);
		});

		it('should return N+1 lines for N <br> tags', () => {
			expect(splitContentIntoLines('one<br>two<br>three')).toEqual(['one', 'two', 'three']);
		});

		it('should handle self-closing and attributed br forms', () => {
			expect(splitContentIntoLines('one<br/>two')).toEqual(['one', 'two']);
			expect(splitContentIntoLines('one<br data-rich-text-line-break="true">two')).toEqual(['one', 'two']);
		});

		it('should produce empty strings for leading/trailing/consecutive brs', () => {
			expect(splitContentIntoLines('<br>two')).toEqual(['', 'two']);
			expect(splitContentIntoLines('one<br>')).toEqual(['one', '']);
			expect(splitContentIntoLines('one<br><br>three')).toEqual(['one', '', 'three']);
		});

		it('should return [""] for empty content', () => {
			expect(splitContentIntoLines('')).toEqual(['']);
		});

		it('should keep intact spans on their own lines with all attributes', () => {
			const html = '<span class="typost-styled" data-font-id="12" style="font-family: var(--font-12)">one</span><br><span class="typost-styled" data-fontweight="700" style="font-weight: 700">two</span>';
			const lines = splitContentIntoLines(html);

			expect(lines).toHaveLength(2);
			expect(lines[0]).toBe('<span class="typost-styled" data-font-id="12" style="font-family: var(--font-12)">one</span>');
			expect(lines[1]).toBe('<span class="typost-styled" data-fontweight="700" style="font-weight: 700">two</span>');
		});

		it('should clone a span CONTAINING a <br> into both lines with its attributes', () => {
			const html = '<span class="typost-styled" data-font-id="12" data-features="swsh" style="font-feature-settings: &quot;swsh&quot; 1; font-family: var(--font-12)">first<br>second</span>';
			const lines = splitContentIntoLines(html);

			expect(lines).toHaveLength(2);
			// Both halves keep the span wrapper with every attribute
			for (const [line, text] of [[lines[0], 'first'], [lines[1], 'second']]) {
				const div = document.createElement('div');
				div.innerHTML = line;
				const span = div.querySelector('span.typost-styled');
				expect(span).not.toBeNull();
				expect(span.getAttribute('data-font-id')).toBe('12');
				expect(span.getAttribute('data-features')).toBe('swsh');
				expect(span.getAttribute('style')).toContain('font-family: var(--font-12)');
				expect(div.textContent).toBe(text);
				expect(div.querySelector('br')).toBeNull();
			}
		});

		it('should handle deep nesting straddling a boundary', () => {
			const html = '<span class="typost-styled" data-font-id="12"><span class="typost-styled" data-fontweight="700">a<br>b</span></span>';
			const lines = splitContentIntoLines(html);

			expect(lines).toHaveLength(2);
			for (const [line, text] of [[lines[0], 'a'], [lines[1], 'b']]) {
				const div = document.createElement('div');
				div.innerHTML = line;
				const outer = div.querySelector('span[data-font-id="12"]');
				expect(outer).not.toBeNull();
				expect(outer.querySelector('span[data-fontweight="700"]')).not.toBeNull();
				expect(div.textContent).toBe(text);
			}
		});

		it('should preserve HTML entities across the round-trip', () => {
			const lines = splitContentIntoLines('April &amp; Andy<br>&lt;3');
			expect(lines).toEqual(['April &amp; Andy', '&lt;3']);
		});

		it('should preserve non-span markup like <strong> and <em>', () => {
			const lines = splitContentIntoLines('<strong>bold</strong> plain<br><em>italic</em>');
			expect(lines).toEqual(['<strong>bold</strong> plain', '<em>italic</em>']);
		});
	});

	// ===== computeFitRatio =====

	describe('computeFitRatio', () => {
		it('should compute referenceSize / measuredWidth rounded to 4 decimals', () => {
			expect(computeFitRatio(100, 800)).toBe(0.125);
			expect(computeFitRatio(100, 333)).toBe(0.3003); // 0.3003003... → 0.3003
			expect(computeFitRatio(100, 1234.5)).toBe(0.081); // 0.0810044... → 0.081
		});

		it('should return null for zero/negative/invalid widths', () => {
			expect(computeFitRatio(100, 0)).toBeNull();
			expect(computeFitRatio(100, -50)).toBeNull();
			expect(computeFitRatio(100, NaN)).toBeNull();
			expect(computeFitRatio(0, 500)).toBeNull();
		});
	});

	// ===== buildFitFontSize =====

	describe('buildFitFontSize', () => {
		it('should build the cqi expression without a cap', () => {
			expect(buildFitFontSize(0.125, 0)).toBe('calc(0.125 * 100cqi)');
		});

		it('should wrap in min() when a cap is set', () => {
			expect(buildFitFontSize(0.125, 96)).toBe('min(calc(0.125 * 100cqi), 96px)');
		});

		it('should emit the stored ratio verbatim (no float artifacts)', () => {
			expect(buildFitFontSize(0.3003, 0)).toBe('calc(0.3003 * 100cqi)');
		});

		it('should return empty string for missing/invalid ratios', () => {
			expect(buildFitFontSize(undefined, 0)).toBe('');
			expect(buildFitFontSize(null, 0)).toBe('');
			expect(buildFitFontSize(0, 0)).toBe('');
			expect(buildFitFontSize(-1, 0)).toBe('');
		});
	});

	// ===== buildFitLinesHtml =====

	describe('buildFitLinesHtml', () => {
		it('should wrap each line in span.typost-line with its font-size', () => {
			const html = buildFitLinesHtml('one<br>two', [0.5, 0.25], 0);
			expect(html).toBe(
				'<span class="typost-line" style="font-size:calc(0.5 * 100cqi)">one</span>' +
				'<span class="typost-line" style="font-size:calc(0.25 * 100cqi)">two</span>'
			);
		});

		it('should apply the cap to every line', () => {
			const html = buildFitLinesHtml('one<br>two', [0.5, 0.25], 120);
			expect(html).toContain('min(calc(0.5 * 100cqi), 120px)');
			expect(html).toContain('min(calc(0.25 * 100cqi), 120px)');
		});

		it('should omit font-size for lines without a valid ratio', () => {
			const html = buildFitLinesHtml('one<br>two', [0.5], 0);
			expect(html).toBe(
				'<span class="typost-line" style="font-size:calc(0.5 * 100cqi)">one</span>' +
				'<span class="typost-line">two</span>'
			);
		});

		it('should ignore stale trailing entries beyond the line count', () => {
			const html = buildFitLinesHtml('only line', [0.5, 0.9, 0.1], 0);
			expect(html).toBe('<span class="typost-line" style="font-size:calc(0.5 * 100cqi)">only line</span>');
		});

		it('should handle a missing/empty ratios array', () => {
			expect(buildFitLinesHtml('one<br>two', [], 0)).toBe(
				'<span class="typost-line">one</span><span class="typost-line">two</span>'
			);
			expect(buildFitLinesHtml('one', undefined, 0)).toBe('<span class="typost-line">one</span>');
		});

		it('should keep inner spans inside the line wrappers', () => {
			const html = buildFitLinesHtml(
				'<span class="typost-styled" data-font-id="12" style="font-family: var(--font-12)">one</span><br>two',
				[0.5, 0.25],
				0
			);
			expect(html).toBe(
				'<span class="typost-line" style="font-size:calc(0.5 * 100cqi)"><span class="typost-styled" data-font-id="12" style="font-family: var(--font-12)">one</span></span>' +
				'<span class="typost-line" style="font-size:calc(0.25 * 100cqi)">two</span>'
			);
		});
	});

	// ===== computeFitEditingFontSize =====

	describe('computeFitEditingFontSize', () => {
		it('should use the smallest ratio so the longest line fits without wrapping', () => {
			expect(computeFitEditingFontSize([0.0639, 0.1829, 0.0583])).toBe('calc(0.0583 * 100cqi)');
		});

		it('should ignore null/invalid entries from unmeasured lines', () => {
			expect(computeFitEditingFontSize([null, 0.25, 0])).toBe('calc(0.25 * 100cqi)');
		});

		it('should return empty string before any measurement exists', () => {
			expect(computeFitEditingFontSize([])).toBe('');
			expect(computeFitEditingFontSize(undefined)).toBe('');
			expect(computeFitEditingFontSize([null, 0])).toBe('');
		});
	});

	// ===== buildResponsiveClamp byte-identity =====

	describe('buildResponsiveClamp', () => {
		// The exact legacy template from save.js/edit.js — any drift here
		// would shift save output and invalidate published blocks.
		const legacyClamp = (min, preferred, max) =>
			`clamp(${min}px, ${preferred / 16}rem + ${((max - min) / (1920 - 320)) * 100}vw, ${max}px)`;

		it('should be byte-identical to the legacy expression over a value matrix', () => {
			const cases = [
				[16, 32, 64],
				[14, 20, 32],
				[18, 22, 29],
				[30, 81, 108],
				[13, 29, 42],   // float-ugly: 1.8124999999999998vw
				[8, 8, 8],      // zero slope
				[64, 32, 16],   // out-of-order (soft validation allows it)
				[120, 200, 400]
			];
			for (const [min, preferred, max] of cases) {
				expect(buildResponsiveClamp(min, preferred, max)).toBe(legacyClamp(min, preferred, max));
			}
		});

		it('should reproduce the known float artifact exactly', () => {
			expect(buildResponsiveClamp(13, 29, 42)).toBe('clamp(13px, 1.8125rem + 1.8124999999999998vw, 42px)');
		});
	});
});
