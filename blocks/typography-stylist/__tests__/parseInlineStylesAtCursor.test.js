/**
 * Test Suite: parseInlineStylesAtCursor() - Unified Inline Style Parser
 *
 * Tests for the comprehensive parser that detects ALL inline style properties
 * at cursor position: features, fontId, fontWeight, fontSize (+ breakpoints),
 * letterSpacing, lineHeight, plus span boundaries (spanText, spanStart, spanEnd).
 */

import { parseInlineStylesAtCursor } from '../utils';

describe('Typography Stylist - parseInlineStylesAtCursor', () => {

	// ===== BASIC DETECTION =====

	it('should return all properties from a fully-attributed span', () => {
		const html = '<span class="typost-styled" data-features="ss01,liga" data-font-id="12" data-fontweight="700" data-fontsize="responsive" data-fontsize-min="16" data-fontsize-preferred="32" data-fontsize-max="64" data-letterspacing="100" data-lineheight="1.5" style="font-feature-settings: &quot;ss01&quot; 1, &quot;liga&quot; 1; font-family: var(--font-12); font-weight: 700; font-size: clamp(16px, 2vw, 64px); letter-spacing: 0.1em; line-height: 1.5">Beautiful</span>';
		const result = parseInlineStylesAtCursor(html, 3, 3);

		expect(result).not.toBeNull();
		expect(result.features).toEqual(['ss01', 'liga']);
		expect(result.fontId).toBe('12');
		expect(result.fontWeight).toBe('700');
		expect(result.fontSize).toBe('responsive');
		expect(result.fontSizeMin).toBe(16);
		expect(result.fontSizePreferred).toBe(32);
		expect(result.fontSizeMax).toBe(64);
		expect(result.letterSpacing).toBe(100);
		expect(result.lineHeight).toBe(1.5);
		expect(result.spanText).toBe('Beautiful');
		expect(result.spanStart).toBe(0);
		expect(result.spanEnd).toBe(9);
	});

	it('should return null when cursor is outside any styled span', () => {
		const html = 'Plain text <span class="typost-styled" data-features="ss01">Styled</span> more plain';
		const cursorAt = 5; // In "Plain"
		const result = parseInlineStylesAtCursor(html, cursorAt, cursorAt);

		expect(result).toBeNull();
	});

	it('should return null for empty content', () => {
		expect(parseInlineStylesAtCursor('', 0, 0)).toBeNull();
	});

	it('should return null for undefined content', () => {
		expect(parseInlineStylesAtCursor(undefined, 0, 0)).toBeNull();
	});

	// ===== INDIVIDUAL PROPERTY DETECTION FROM DATA ATTRIBUTES =====

	it('should detect letterSpacing from data-letterspacing attribute', () => {
		const html = '<span class="typost-styled" data-letterspacing="100" style="letter-spacing: 0.1em">Text</span>';
		const result = parseInlineStylesAtCursor(html, 2, 2);

		expect(result).not.toBeNull();
		expect(result.letterSpacing).toBe(100);
	});

	it('should detect lineHeight from data-lineheight attribute', () => {
		const html = '<span class="typost-styled" data-lineheight="1.8" style="line-height: 1.8">Text</span>';
		const result = parseInlineStylesAtCursor(html, 2, 2);

		expect(result).not.toBeNull();
		expect(result.lineHeight).toBe(1.8);
	});

	it('should detect fontWeight from data-fontweight attribute', () => {
		const html = '<span class="typost-styled" data-fontweight="700" style="font-weight: 700">Text</span>';
		const result = parseInlineStylesAtCursor(html, 2, 2);

		expect(result).not.toBeNull();
		expect(result.fontWeight).toBe('700');
	});

	it('should detect fontSize and breakpoints from data-fontsize attributes', () => {
		const html = '<span class="typost-styled" data-fontsize="responsive" data-fontsize-min="20" data-fontsize-preferred="40" data-fontsize-max="80" style="font-size: clamp(20px, 2.5vw, 80px)">Text</span>';
		const result = parseInlineStylesAtCursor(html, 2, 2);

		expect(result).not.toBeNull();
		expect(result.fontSize).toBe('responsive');
		expect(result.fontSizeMin).toBe(20);
		expect(result.fontSizePreferred).toBe(40);
		expect(result.fontSizeMax).toBe(80);
	});

	it('should detect fontId from data-font-id attribute', () => {
		const html = '<span class="typost-styled" data-font-id="12" style="font-family: var(--font-12)">Text</span>';
		const result = parseInlineStylesAtCursor(html, 2, 2);

		expect(result).not.toBeNull();
		expect(result.fontId).toBe('12');
	});

	it('should detect features from data-features attribute', () => {
		const html = '<span class="typost-styled" data-features="ss01,liga,swsh" style="font-feature-settings: &quot;ss01&quot; 1, &quot;liga&quot; 1, &quot;swsh&quot; 1">Text</span>';
		const result = parseInlineStylesAtCursor(html, 2, 2);

		expect(result).not.toBeNull();
		expect(result.features).toEqual(['ss01', 'liga', 'swsh']);
	});

	// ===== STYLE FALLBACK (BACKWARD COMPATIBILITY) =====

	it('should detect letterSpacing from style attribute when no data attr (backward compat)', () => {
		const html = '<span class="typost-styled" style="letter-spacing: 0.15em">Text</span>';
		const result = parseInlineStylesAtCursor(html, 2, 2);

		expect(result).not.toBeNull();
		expect(result.letterSpacing).toBe(150); // 0.15 * 1000
	});

	it('should detect lineHeight from style attribute when no data attr (backward compat)', () => {
		const html = '<span class="typost-styled" style="line-height: 2.5">Text</span>';
		const result = parseInlineStylesAtCursor(html, 2, 2);

		expect(result).not.toBeNull();
		expect(result.lineHeight).toBe(2.5);
	});

	it('should prefer data attribute over style attribute', () => {
		// Data attr says 100, style says 0.15em (150) - data attr should win
		const html = '<span class="typost-styled" data-letterspacing="100" style="letter-spacing: 0.15em">Text</span>';
		const result = parseInlineStylesAtCursor(html, 2, 2);

		expect(result).not.toBeNull();
		expect(result.letterSpacing).toBe(100);
	});

	// ===== NESTED SPAN HANDLING =====

	it('should collect features from innermost span', () => {
		const html = '<span class="typost-styled" data-fontweight="700"><span class="typost-styled" data-features="ss01">Text</span></span>';
		const result = parseInlineStylesAtCursor(html, 2, 2);

		expect(result).not.toBeNull();
		expect(result.features).toEqual(['ss01']);
	});

	it('should inherit fontWeight from parent span when inner span lacks it', () => {
		const html = '<span class="typost-styled" data-fontweight="700" style="font-weight: 700"><span class="typost-styled" data-features="ss01" style="font-feature-settings: &quot;ss01&quot; 1">Text</span></span>';
		const result = parseInlineStylesAtCursor(html, 2, 2);

		expect(result).not.toBeNull();
		expect(result.fontWeight).toBe('700'); // Inherited from parent
		expect(result.features).toEqual(['ss01']); // From inner span
	});

	it('should inherit fontId from parent span when inner span lacks it', () => {
		const html = '<span class="typost-styled" data-font-id="12" style="font-family: var(--font-12)"><span class="typost-styled" data-fontweight="700" style="font-weight: 700">Text</span></span>';
		const result = parseInlineStylesAtCursor(html, 2, 2);

		expect(result).not.toBeNull();
		expect(result.fontId).toBe('12'); // Inherited from parent
		expect(result.fontWeight).toBe('700'); // From inner span
	});

	it('should NOT inherit features from parent (features are span-specific)', () => {
		const html = '<span class="typost-styled" data-features="liga" style="font-feature-settings: &quot;liga&quot; 1"><span class="typost-styled" data-fontweight="700" style="font-weight: 700">Text</span></span>';
		const result = parseInlineStylesAtCursor(html, 2, 2);

		expect(result).not.toBeNull();
		expect(result.features).toEqual([]); // Inner span has no features, and features aren't inherited
		expect(result.fontWeight).toBe('700');
	});

	it('should handle triple-nested spans (fontsize > fontweight > features)', () => {
		const html = '<span class="typost-styled" data-fontsize="responsive" data-fontsize-min="16" data-fontsize-preferred="32" data-fontsize-max="64"><span class="typost-styled" data-fontweight="700"><span class="typost-styled" data-features="ss01">Text</span></span></span>';
		const result = parseInlineStylesAtCursor(html, 2, 2);

		expect(result).not.toBeNull();
		expect(result.fontSize).toBe('responsive'); // From outermost
		expect(result.fontSizeMin).toBe(16);
		expect(result.fontWeight).toBe('700'); // From middle
		expect(result.features).toEqual(['ss01']); // From innermost
	});

	// ===== BOUNDARY CONDITIONS =====

	it('should detect at span start (cursor = spanStart)', () => {
		const html = 'Before <span class="typost-styled" data-features="ss01">Text</span> after';
		// "Before " is 7 chars, so span starts at offset 7
		const result = parseInlineStylesAtCursor(html, 7, 7);

		expect(result).not.toBeNull();
		expect(result.features).toEqual(['ss01']);
	});

	it('should NOT detect at span end (cursor = spanEnd)', () => {
		const html = 'Before <span class="typost-styled" data-features="ss01">Text</span> after';
		// "Before Text" is 11 chars, so span ends at offset 11
		// Cursor at position 11 is AFTER the span
		const result = parseInlineStylesAtCursor(html, 11, 11);

		expect(result).toBeNull(); // Consistent with existing boundary behavior
	});

	it('should handle selection range overlapping a span', () => {
		const html = 'Plain <span class="typost-styled" data-letterspacing="100">Styled</span> text';
		// "Plain " is 6 chars, "Styled" is 6 chars
		// Select from offset 8 to 10 ("yl" within "Styled")
		const result = parseInlineStylesAtCursor(html, 8, 10);

		expect(result).not.toBeNull();
		expect(result.letterSpacing).toBe(100);
	});

	// ===== SPAN TEXT AND OFFSET OUTPUT =====

	it('should return correct spanText, spanStart, spanEnd values', () => {
		const html = 'Hello <span class="typost-styled" data-features="ss01">World</span> there';
		// "Hello " is 6 chars, "World" starts at 6, ends at 11
		const result = parseInlineStylesAtCursor(html, 8, 8);

		expect(result).not.toBeNull();
		expect(result.spanText).toBe('World');
		expect(result.spanStart).toBe(6);
		expect(result.spanEnd).toBe(11);
	});

	it('should return innermost span text when nested', () => {
		const html = '<span class="typost-styled" data-fontweight="700">Outer <span class="typost-styled" data-features="ss01">Inner</span> text</span>';
		// Cursor in "Inner" - should return Inner's span boundaries
		const result = parseInlineStylesAtCursor(html, 8, 8); // "I" in "Inner"

		expect(result).not.toBeNull();
		expect(result.spanText).toBe('Inner');
		// spanStart/spanEnd are relative to the full text content
		// "Outer " is 6 chars, "Inner" starts at 6
		expect(result.spanStart).toBe(6);
		expect(result.spanEnd).toBe(11);
	});
});

describe('fontStyle detection (visual italic)', () => {
	const { parseInlineStylesAtCursor } = require('../utils');

	test('detects data-fontstyle on the span at the cursor', () => {
		const html = '<span class="typost-styled" data-fontstyle="italic" style="font-style: italic">Elegant</span>';
		expect(parseInlineStylesAtCursor(html, 2, 2).fontStyle).toBe('italic');
	});

	test('inherits data-fontstyle from an ancestor span', () => {
		const html = '<span class="typost-styled" data-fontstyle="italic" style="font-style: italic"><span class="typost-styled" data-features="swsh" style=\'font-feature-settings: "swsh" 1\'>El</span>egant</span>';
		expect(parseInlineStylesAtCursor(html, 1, 1).fontStyle).toBe('italic');
	});

	test('falls back to semantic <em> around the styled span', () => {
		const html = '<em><span class="typost-styled" data-features="swsh" style=\'font-feature-settings: "swsh" 1\'>Elegant</span></em>';
		expect(parseInlineStylesAtCursor(html, 2, 2).fontStyle).toBe('italic');
	});

	test('null when nothing italic is present', () => {
		const html = '<span class="typost-styled" data-fontsize="20px" style="font-size: 20px">Elegant</span>';
		expect(parseInlineStylesAtCursor(html, 2, 2).fontStyle).toBeNull();
	});
});
