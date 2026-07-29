/**
 * Test Suite: font-variation-settings through the inline span pipeline
 *
 * The QFT variable-font axis controls apply font-variation-settings to the
 * current selection as data-font-variation-settings on typost-styled spans
 * (see applyInlineFontVariationSettings in edit.js). These tests cover the
 * pure utils that pipeline rides on, with the quoted multi-axis values
 * ("wght" 700, "SOFT" 50) that make escaping the risky part.
 */

import {
	parseInlineStylesAtCursor,
	updateSpanPropertyInPlace,
	splitSpanAndApply,
	applyStylingSafeStringMethod,
	removePropertyFromSelection
} from '../utils';

const FVS = '"wght" 700, "SOFT" 50';
const FVS_ATTR = '&quot;wght&quot; 700, &quot;SOFT&quot; 50';

describe('Typography Stylist - font-variation-settings inline pipeline', () => {

	// ===== parseInlineStylesAtCursor =====

	describe('parseInlineStylesAtCursor', () => {
		it('should detect fontVariationSettings on the innermost span', () => {
			const html = `<span class="typost-styled" data-font-variation-settings="${FVS_ATTR}" style="font-variation-settings: ${FVS_ATTR}">Fraunces</span>`;
			const result = parseInlineStylesAtCursor(html, 3, 3);

			expect(result).not.toBeNull();
			expect(result.fontVariationSettings).toBe(FVS);
		});

		it('should inherit fontVariationSettings from an ancestor span', () => {
			const html = `<span class="typost-styled" data-font-variation-settings="${FVS_ATTR}"><span class="typost-styled" data-fontweight="400" style="font-weight: 400">Inner</span></span>`;
			const result = parseInlineStylesAtCursor(html, 2, 2);

			expect(result).not.toBeNull();
			expect(result.fontVariationSettings).toBe(FVS);
		});

		it('should prefer the innermost value over an ancestor value', () => {
			const html = '<span class="typost-styled" data-font-variation-settings="&quot;wght&quot; 900"><span class="typost-styled" data-font-variation-settings="&quot;wght&quot; 300">Inner</span></span>';
			const result = parseInlineStylesAtCursor(html, 2, 2);

			expect(result).not.toBeNull();
			expect(result.fontVariationSettings).toBe('"wght" 300');
		});

		it('should return null fontVariationSettings when absent', () => {
			const html = '<span class="typost-styled" data-fontweight="700" style="font-weight: 700">Plain</span>';
			const result = parseInlineStylesAtCursor(html, 2, 2);

			expect(result).not.toBeNull();
			expect(result.fontVariationSettings).toBeNull();
		});
	});

	// ===== updateSpanPropertyInPlace (collapsed caret) =====

	describe('updateSpanPropertyInPlace', () => {
		it('should set font-variation-settings on the span at a collapsed caret', () => {
			const html = '<span class="typost-styled" data-font-id="12" style="font-family: var(--font-12)">Fraunces</span>';
			const result = updateSpanPropertyInPlace(
				html,
				3,
				'data-font-variation-settings',
				FVS,
				'font-variation-settings',
				FVS
			);

			expect(result.success).toBe(true);
			expect(result.content).toContain(`data-font-variation-settings="${FVS_ATTR}"`);
			expect(result.content).toContain('font-variation-settings:');
			// Round-trip: the value must parse back out identically
			const reparsed = parseInlineStylesAtCursor(result.content, 3, 3);
			expect(reparsed.fontVariationSettings).toBe(FVS);
		});

		it('should update an existing font-variation-settings value', () => {
			const html = `<span class="typost-styled" data-font-variation-settings="${FVS_ATTR}" style="font-variation-settings: ${FVS_ATTR}">Fraunces</span>`;
			const result = updateSpanPropertyInPlace(
				html,
				3,
				'data-font-variation-settings',
				'"wght" 300',
				'font-variation-settings',
				'"wght" 300'
			);

			expect(result.success).toBe(true);
			expect(result.content).toContain('data-font-variation-settings="&quot;wght&quot; 300"');
			expect(result.content).not.toContain('SOFT');
		});

		it('should fail when the caret is not inside any styled span', () => {
			const html = 'Plain text with no <span class="typost-styled" data-fontweight="700">span</span>';
			const result = updateSpanPropertyInPlace(
				html,
				2,
				'data-font-variation-settings',
				FVS,
				'font-variation-settings',
				FVS
			);

			expect(result.success).toBe(false);
			expect(result.content).toBe(html);
		});
	});

	// ===== splitSpanAndApply (partial selection in a span with the property) =====

	describe('splitSpanAndApply', () => {
		it('should split a span carrying font-variation-settings and re-apply to the selection', () => {
			const html = `<span class="typost-styled" data-font-variation-settings="${FVS_ATTR}" style="font-variation-settings: ${FVS_ATTR}">Fraunces</span>`;
			const result = splitSpanAndApply(
				html,
				0,
				4,
				'data-font-variation-settings',
				{ 'data-font-variation-settings': '"wght" 300' },
				'font-variation-settings: "wght" 300'
			);

			expect(result.success).toBe(true);
			// Selection segment carries the new value
			expect(result.content).toContain('data-font-variation-settings="&quot;wght&quot; 300"');
			// Remainder keeps the original value (quotes intact after serialization)
			expect(result.content).toContain(`data-font-variation-settings="${FVS_ATTR}"`);
			// All text preserved
			const div = document.createElement('div');
			div.innerHTML = result.content;
			expect(div.textContent).toBe('Fraunces');
		});
	});

	// ===== applyStylingSafeStringMethod (string fallback path) =====

	describe('applyStylingSafeStringMethod', () => {
		it('should wrap a plain-text selection with a font-variation-settings span', () => {
			const html = 'Wedding invitation';
			const result = applyStylingSafeStringMethod(
				html,
				0,
				7,
				{ 'data-font-variation-settings': FVS },
				`font-variation-settings: ${FVS}`
			);

			expect(result.success).toBe(true);
			expect(result.content).toContain(`data-font-variation-settings="${FVS_ATTR}"`);
			expect(result.content).toContain('class="typost-styled"');
			// Quotes survive: parse back at a caret inside the new span
			const reparsed = parseInlineStylesAtCursor(result.content, 2, 2);
			expect(reparsed.fontVariationSettings).toBe(FVS);
		});

		it('should merge font-variation-settings into a fully-selected existing span', () => {
			const html = '<span class="typost-styled" data-font-id="12" style="font-family: var(--font-12)">Fraunces</span>';
			const result = applyStylingSafeStringMethod(
				html,
				0,
				8,
				{ 'data-font-variation-settings': FVS },
				`font-variation-settings: ${FVS}`
			);

			expect(result.success).toBe(true);
			expect(result.content).toContain(`data-font-variation-settings="${FVS_ATTR}"`);
			// Merged, not nested: still a single span
			const div = document.createElement('div');
			div.innerHTML = result.content;
			expect(div.querySelectorAll('span.typost-styled').length).toBe(1);
			expect(div.querySelector('span').getAttribute('data-font-id')).toBe('12');
		});
	});

	// ===== removePropertyFromSelection (reset path) =====

	describe('removePropertyFromSelection', () => {
		it('should remove font-variation-settings from spans in the selection', () => {
			const html = `<span class="typost-styled" data-font-id="12" data-font-variation-settings="${FVS_ATTR}" style="font-family: var(--font-12); font-variation-settings: ${FVS_ATTR}">Fraunces</span>`;
			const result = removePropertyFromSelection(
				html,
				0,
				8,
				'data-font-variation-settings',
				'font-variation-settings'
			);

			expect(result.success).toBe(true);
			expect(result.content).not.toContain('data-font-variation-settings');
			expect(result.content).not.toContain('font-variation-settings:');
			// Other properties survive
			expect(result.content).toContain('data-font-id="12"');
			expect(result.content).toContain('Fraunces');
		});

		it('should unwrap the span entirely when font-variation-settings was its only property', () => {
			const html = `<span class="typost-styled" data-font-variation-settings="${FVS_ATTR}" style="font-variation-settings: ${FVS_ATTR}">Fraunces</span>`;
			const result = removePropertyFromSelection(
				html,
				0,
				8,
				'data-font-variation-settings',
				'font-variation-settings'
			);

			expect(result.success).toBe(true);
			expect(result.content).not.toContain('typost-styled');
			expect(result.content).toContain('Fraunces');
		});
	});
});
