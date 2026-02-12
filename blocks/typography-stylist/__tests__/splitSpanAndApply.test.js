/**
 * Test Suite: splitSpanAndApply() - Split Parent Span Into Segments
 *
 * Tests for the utility that splits a parent span into [before][selection][after]
 * segments when applying the SAME property type to a partial selection.
 */

import { splitSpanAndApply } from '../utils';

describe('Typography Stylist - splitSpanAndApply', () => {

	it('should split middle: "Beautiful" with letter-spacing → select "eaut" → 3 segments', () => {
		const html = '<span class="typost-styled" data-letterspacing="100" style="letter-spacing: 0.1em">Beautiful</span>';
		// "Beautiful" is 9 chars total
		// "B" = offset 0
		// "eaut" = offsets 1-4 (inclusive)
		const result = splitSpanAndApply(
			html,
			1, // start at "e"
			5, // end after "t"
			'data-letterspacing',
			{ 'data-letterspacing': '200' },
			'letter-spacing: 0.2em'
		);

		expect(result.success).toBe(true);

		// Should have 3 spans
		const spanMatches = result.content.match(/<span[^>]*class="typost-styled"[^>]*>/g);
		expect(spanMatches).toHaveLength(3);

		// Before segment: "B" with original letter-spacing
		expect(result.content).toContain('data-letterspacing="100"');
		expect(result.content).toMatch(/letter-spacing:\s*0\.1em[^>]*>B</);

		// Selection segment: "eaut" with new letter-spacing
		expect(result.content).toContain('data-letterspacing="200"');
		expect(result.content).toMatch(/letter-spacing:\s*0\.2em[^>]*>eaut</);

		// After segment: "iful" with original letter-spacing
		expect(result.content).toMatch(/letter-spacing:\s*0\.1em[^>]*>iful</);
	});

	it('should split at start: select "Bea" → 2 segments (selection + after)', () => {
		const html = '<span class="typost-styled" data-letterspacing="100" style="letter-spacing: 0.1em">Beautiful</span>';
		// Select "Bea" (offsets 0-2)
		const result = splitSpanAndApply(
			html,
			0,
			3,
			'data-letterspacing',
			{ 'data-letterspacing': '200' },
			'letter-spacing: 0.2em'
		);

		expect(result.success).toBe(true);

		// Should have 2 spans (no "before" segment)
		const spanMatches = result.content.match(/<span[^>]*class="typost-styled"[^>]*>/g);
		expect(spanMatches).toHaveLength(2);

		// Selection segment: "Bea" with new letter-spacing
		expect(result.content).toContain('data-letterspacing="200"');
		expect(result.content).toMatch(/letter-spacing:\s*0\.2em[^>]*>Bea</);

		// After segment: "utiful" with original letter-spacing
		expect(result.content).toContain('data-letterspacing="100"');
		expect(result.content).toMatch(/letter-spacing:\s*0\.1em[^>]*>utiful</);
	});

	it('should split at end: select "ful" → 2 segments (before + selection)', () => {
		const html = '<span class="typost-styled" data-letterspacing="100" style="letter-spacing: 0.1em">Beautiful</span>';
		// "Beautiful" is 9 chars, "ful" is offsets 6-8
		const result = splitSpanAndApply(
			html,
			6,
			9,
			'data-letterspacing',
			{ 'data-letterspacing': '200' },
			'letter-spacing: 0.2em'
		);

		expect(result.success).toBe(true);

		// Should have 2 spans (no "after" segment)
		const spanMatches = result.content.match(/<span[^>]*class="typost-styled"[^>]*>/g);
		expect(spanMatches).toHaveLength(2);

		// Before segment: "Beauti" with original letter-spacing
		expect(result.content).toContain('data-letterspacing="100"');
		expect(result.content).toMatch(/letter-spacing:\s*0\.1em[^>]*>Beauti</);

		// Selection segment: "ful" with new letter-spacing
		expect(result.content).toContain('data-letterspacing="200"');
		expect(result.content).toMatch(/letter-spacing:\s*0\.2em[^>]*>ful</);
	});

	it('should return success: false when selection covers entire span (caller uses merge)', () => {
		const html = '<span class="typost-styled" data-letterspacing="100" style="letter-spacing: 0.1em">Beautiful</span>';
		// Select entire "Beautiful" (0-9)
		const result = splitSpanAndApply(
			html,
			0,
			9,
			'data-letterspacing',
			{ 'data-letterspacing': '200' },
			'letter-spacing: 0.2em'
		);

		// Should fail - caller should use merge logic instead
		expect(result.success).toBe(false);
	});

	it('should return success: false when no parent span with matching property', () => {
		const html = '<span class="typost-styled" data-fontweight="700" style="font-weight: 700">Beautiful</span>';
		// Try to split for letter-spacing, but parent only has font-weight
		const result = splitSpanAndApply(
			html,
			1,
			5,
			'data-letterspacing',
			{ 'data-letterspacing': '100' },
			'letter-spacing: 0.1em'
		);

		expect(result.success).toBe(false);
	});

	it('should copy all parent attrs to segments when parent has multiple attributes', () => {
		const html = '<span class="typost-styled" data-letterspacing="100" data-fontweight="700" style="letter-spacing: 0.1em; font-weight: 700">Beautiful</span>';
		// Split "eaut"
		const result = splitSpanAndApply(
			html,
			1,
			5,
			'data-letterspacing',
			{ 'data-letterspacing': '200' },
			'letter-spacing: 0.2em'
		);

		expect(result.success).toBe(true);

		// All 3 segments should have font-weight preserved
		const fontWeightMatches = result.content.match(/data-fontweight="700"/g);
		expect(fontWeightMatches).toHaveLength(3);

		// All 3 segments should have font-weight style
		const fontWeightStyleMatches = result.content.match(/font-weight:\s*700/g);
		expect(fontWeightStyleMatches).toHaveLength(3);

		// Letter-spacing varies: before and after = 100, selection = 200
		const letterSpacing100Matches = result.content.match(/data-letterspacing="100"/g);
		expect(letterSpacing100Matches).toHaveLength(2); // before + after

		const letterSpacing200Matches = result.content.match(/data-letterspacing="200"/g);
		expect(letterSpacing200Matches).toHaveLength(1); // selection
	});

	it('should return success: false when nested child spans cross split boundary', () => {
		const html = '<span class="typost-styled" data-letterspacing="100" style="letter-spacing: 0.1em">Bea<span class="typost-styled" data-features="ss01" style="font-feature-settings: &quot;ss01&quot; 1">uti</span>ful</span>';
		// "Bea" = 0-3, "uti" (styled) = 3-6, "ful" = 6-9
		// Try to split "eauti" (offsets 1-6) - selection END boundary crosses through "uti" span
		const result = splitSpanAndApply(
			html,
			1,
			5,
			'data-letterspacing',
			{ 'data-letterspacing': '200' },
			'letter-spacing: 0.2em'
		);

		// Should fail because split boundary crosses child span
		expect(result.success).toBe(false);
	});

	it('should preserve nested child spans entirely within one segment', () => {
		const html = '<span class="typost-styled" data-letterspacing="100" style="letter-spacing: 0.1em">Bea<span class="typost-styled" data-features="ss01" style="font-feature-settings: &quot;ss01&quot; 1">uti</span>ful</span>';
		// "Bea" = 0-2, "uti" (styled) = 3-5, "ful" = 6-8
		// Split "Bea" only (offsets 0-2) - child span "uti" is entirely in the "after" segment
		const result = splitSpanAndApply(
			html,
			0,
			3,
			'data-letterspacing',
			{ 'data-letterspacing': '200' },
			'letter-spacing: 0.2em'
		);

		expect(result.success).toBe(true);

		// Child span should be preserved in the "after" segment
		expect(result.content).toContain('data-features="ss01"');
		expect(result.content).toContain('>uti</span>');

		// Should have 3 spans total: selection "Bea", and the after segment which contains the child span + "ful"
		const spanMatches = result.content.match(/<span[^>]*class="typost-styled"[^>]*>/g);
		expect(spanMatches.length).toBeGreaterThanOrEqual(2);
	});

	it('should handle line-height splitting', () => {
		const html = '<span class="typost-styled" data-lineheight="1.5" style="line-height: 1.5">Beautiful</span>';
		const result = splitSpanAndApply(
			html,
			1,
			5,
			'data-lineheight',
			{ 'data-lineheight': '2.0' },
			'line-height: 2.0'
		);

		expect(result.success).toBe(true);
		expect(result.content).toContain('data-lineheight="1.5"'); // Before + after
		expect(result.content).toContain('data-lineheight="2.0"'); // Selection
	});

	it('should handle font-weight splitting', () => {
		const html = '<span class="typost-styled" data-fontweight="400" style="font-weight: 400">Beautiful</span>';
		const result = splitSpanAndApply(
			html,
			1,
			5,
			'data-fontweight',
			{ 'data-fontweight': '700' },
			'font-weight: 700'
		);

		expect(result.success).toBe(true);
		expect(result.content).toContain('data-fontweight="400"'); // Before + after
		expect(result.content).toContain('data-fontweight="700"'); // Selection
	});
});
