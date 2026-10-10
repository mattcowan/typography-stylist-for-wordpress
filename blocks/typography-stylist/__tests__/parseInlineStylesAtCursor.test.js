/**
 * Test Suite: parseInlineStylesAtCursor() - Unified Inline Style Parser
 *
 * Tests for the comprehensive parser that detects ALL inline style properties
 * at cursor position: features, fontId, fontWeight, fontSize (+ breakpoints),
 * letterSpacing, lineHeight, plus span boundaries (spanText, spanStart, spanEnd).
 */

import { parseInlineStylesAtCursor, parseInlineFeaturesAtCursor } from '../utils';

describe('parseInlineFeaturesAtCursor — raw feature settings', () => {
	it('counts a raw-only indexed alternate as active and ignores "tag" 0', () => {
		const html = '<span class="typost-styled" data-features="dlig" data-feature-settings="&quot;salt&quot; 2, &quot;swsh&quot; 0, &quot;dlig&quot; 1" style="font-feature-settings: &quot;salt&quot; 2, &quot;swsh&quot; 0, &quot;dlig&quot; 1">W</span>onderful';
		expect(parseInlineFeaturesAtCursor(html, 0, 1)).toEqual(['dlig', 'salt']);
	});
});

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

	it('should report tags the span turns off via data-feature-settings as disabledFeatures', () => {
		// The Glyphs Panel base cell writes "swsh" 0 over a block-level swash
		const html = '<span class="typost-styled" data-features="dlig" data-feature-settings="&quot;swsh&quot; 0, &quot;dlig&quot; 1" style="font-feature-settings: &quot;swsh&quot; 0, &quot;dlig&quot; 1">W</span>onderful';
		const result = parseInlineStylesAtCursor(html, 0, 1);

		expect(result).not.toBeNull();
		expect(result.features).toEqual(['dlig']);
		expect(result.disabledFeatures).toEqual(['swsh']);
	});

	it('should report an empty disabledFeatures list when nothing is turned off', () => {
		const html = '<span class="typost-styled" data-features="liga" data-feature-settings="&quot;salt&quot; 2, &quot;liga&quot; 1" style="font-feature-settings: &quot;salt&quot; 2, &quot;liga&quot; 1">Text</span>';
		const result = parseInlineStylesAtCursor(html, 2, 2);

		expect(result.disabledFeatures).toEqual([]);
		// The indexed alternate is active even though data-features omits it
		expect(result.features).toEqual(['liga', 'salt']);
	});

	it('should count a raw-only indexed alternate as an active feature', () => {
		// The Glyphs Panel writes "salt" 2 to data-feature-settings alone when
		// no other feature is active — without this the toggle read "off"
		// while the alternate was visibly on
		const html = '<span class="typost-styled" data-feature-settings="&quot;salt&quot; 2" style="font-feature-settings: &quot;salt&quot; 2">a</span>bc';
		const result = parseInlineStylesAtCursor(html, 0, 1);

		expect(result.features).toEqual(['salt']);
		expect(result.disabledFeatures).toEqual([]);
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

	test('explicitFontStyle carries only the attribute, never the <em> fallback', () => {
		// Attribute-derived: both channels report it
		const attr = '<span class="typost-styled" data-fontstyle="italic" style="font-style: italic">Elegant</span>';
		expect(parseInlineStylesAtCursor(attr, 2, 2).explicitFontStyle).toBe('italic');

		// <em>-derived: rendered fontStyle says italic, explicit stays null —
		// persisting consumers (paragraph style capture) must not see it
		const em = '<em><span class="typost-styled" data-features="swsh" style=\'font-feature-settings: "swsh" 1\'>Elegant</span></em>';
		const result = parseInlineStylesAtCursor(em, 2, 2);
		expect(result.fontStyle).toBe('italic');
		expect(result.explicitFontStyle).toBeNull();
	});
});

describe('detectStrongBoldAtRange', () => {
	const { detectStrongBoldAtRange } = require('../utils');

	test('selection fully inside <strong> reports 700 (no typost span needed)', () => {
		// Core's Bold button leaves semantic markup and no weight span, so
		// without this the Glyphs panel drew and inserted glyphs at the
		// block's weight — light text dropped into a bold run.
		expect(detectStrongBoldAtRange('<strong>Elegant</strong> Caps', 0, 4)).toBe('700');
	});

	test('caret inside <b> reports 700', () => {
		expect(detectStrongBoldAtRange('ab<b>cd</b>', 3, 3)).toBe('700');
	});

	test('selection straddling the bold boundary reports null (mixed weights)', () => {
		expect(detectStrongBoldAtRange('<strong>Elegant</strong> Caps', 5, 10)).toBeNull();
	});

	test('plain text and empty input report null', () => {
		expect(detectStrongBoldAtRange('Elegant Caps', 0, 4)).toBeNull();
		expect(detectStrongBoldAtRange('', 0, 0)).toBeNull();
		expect(detectStrongBoldAtRange('<strong>x</strong>', undefined, undefined)).toBeNull();
	});

	test('strong wrapping a typost span still reports 700', () => {
		expect(detectStrongBoldAtRange('<strong><span class="typost-styled" data-font-id="1">A</span></strong>', 0, 1)).toBe('700');
	});

	test('italic markup alone is not bold', () => {
		expect(detectStrongBoldAtRange('<em>Elegant</em>', 0, 4)).toBeNull();
	});
});

describe('detectEmItalicAtRange', () => {
	const { detectEmItalicAtRange } = require('../utils');

	test('selection fully inside <em> reports italic (no typost span needed)', () => {
		expect(detectEmItalicAtRange('<em>Elegant</em> Caps', 0, 4)).toBe('italic');
	});

	test('caret inside <i> reports italic', () => {
		expect(detectEmItalicAtRange('ab<i>cd</i>', 3, 3)).toBe('italic');
	});

	test('selection straddling the emphasis boundary reports null (mixed faces)', () => {
		expect(detectEmItalicAtRange('<em>Elegant</em> Caps', 5, 10)).toBeNull();
	});

	test('plain text and empty input report null', () => {
		expect(detectEmItalicAtRange('Elegant Caps', 0, 4)).toBeNull();
		expect(detectEmItalicAtRange('', 0, 0)).toBeNull();
		expect(detectEmItalicAtRange('<em>x</em>', undefined, undefined)).toBeNull();
	});

	test('em wrapping a typost span still reports italic', () => {
		expect(detectEmItalicAtRange('<em><span class="typost-styled" data-font-id="1">A</span></em>', 0, 1)).toBe('italic');
	});
});

describe('parseInlineStylesAtCursor — size unit (#233, #234)', () => {
	const span = (style, extra = '') => `<span class="typost-styled" data-fontsize="responsive" data-fontsize-min="16" data-fontsize-preferred="16" data-fontsize-max="120"${extra} style="${style}">Word</span>`;

	it('reports px for an older span, so the zoom notice can say it fails', () => {
		expect(parseInlineStylesAtCursor(span('font-size: clamp(16px, 1rem + 6.5vw, 120px)'), 1, 1).fontSizeUnit).toBe('px');
	});

	it('reports rem for a span written since #233', () => {
		expect(parseInlineStylesAtCursor(span('font-size: clamp(1rem, 1rem + 2.5vw, 7.5rem)'), 1, 1).fontSizeUnit).toBe('rem');
	});

	it('reports null when the span has no size', () => {
		const html = '<span class="typost-styled" data-fontweight="700" style="font-weight: 700">Word</span>';
		expect(parseInlineStylesAtCursor(html, 1, 1).fontSizeUnit).toBeNull();
	});
});
