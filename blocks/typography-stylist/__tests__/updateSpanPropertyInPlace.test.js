/**
 * Test Suite: updateSpanPropertyInPlace() - Update Existing Span Properties
 *
 * Tests for the utility that updates a styled span's property in-place
 * when the cursor is collapsed (no selection) inside the span.
 */

import { updateSpanPropertyInPlace } from '../utils';

describe('Typography Stylist - updateSpanPropertyInPlace', () => {

	it('should update letter-spacing on a simple span', () => {
		const html = '<span class="typost-styled" data-letterspacing="100" style="letter-spacing: 0.1em">Beautiful</span>';
		const cursorAt = 3; // Inside "Beautiful"
		const result = updateSpanPropertyInPlace(
			html,
			cursorAt,
			'data-letterspacing',
			'150',
			'letter-spacing',
			'0.15em'
		);

		expect(result.success).toBe(true);
		expect(result.content).toContain('data-letterspacing="150"');
		expect(result.content).toContain('letter-spacing: 0.15em');
		expect(result.content).toContain('Beautiful'); // Text unchanged
	});

	it('should update property on parent span when cursor is inside inner span', () => {
		const html = '<span class="typost-styled" data-letterspacing="100" style="letter-spacing: 0.1em">Outer <span class="typost-styled" data-features="ss01" style="font-feature-settings: &quot;ss01&quot; 1">Inner</span> text</span>';
		const cursorAt = 8; // Inside "Inner"
		// Update letter-spacing - should walk up to the parent span that has it
		const result = updateSpanPropertyInPlace(
			html,
			cursorAt,
			'data-letterspacing',
			'200',
			'letter-spacing',
			'0.2em'
		);

		expect(result.success).toBe(true);
		expect(result.content).toContain('data-letterspacing="200"');
		expect(result.content).toContain('letter-spacing: 0.2em');
		// Inner span should remain unchanged
		expect(result.content).toContain('data-features="ss01"');
	});

	it('should remove a stale legacy data-font when the font changes', () => {
		const html = '<span class="typost-styled" data-font="Old Family" data-font-id="4" style="font-family: var(--font-4)">Beautiful</span>';
		const result = updateSpanPropertyInPlace(
			html,
			3,
			'data-font-id',
			'11',
			'font-family',
			'var(--font-11)'
		);

		expect(result.success).toBe(true);
		expect(result.content).toContain('data-font-id="11"');
		expect(result.content).not.toContain('data-font="Old Family"');
	});

	it('should keep data-font on a same-font re-apply', () => {
		const html = '<span class="typost-styled" data-font="Bookmania" data-font-id="4" style="font-family: var(--font-4)">Beautiful</span>';
		const result = updateSpanPropertyInPlace(
			html,
			3,
			'data-font-id',
			'4',
			'font-family',
			'var(--font-4)'
		);

		expect(result.success).toBe(true);
		expect(result.content).toContain('data-font="Bookmania"');
	});

	it('should keep data-font when a non-font property is updated', () => {
		const html = '<span class="typost-styled" data-font="Bookmania" data-letterspacing="100" style="letter-spacing: 0.1em">Beautiful</span>';
		const result = updateSpanPropertyInPlace(
			html,
			3,
			'data-letterspacing',
			'150',
			'letter-spacing',
			'0.15em'
		);

		expect(result.success).toBe(true);
		expect(result.content).toContain('data-font="Bookmania"');
	});

	it('should return success: false when no span at cursor', () => {
		const html = 'Plain text without any spans';
		const cursorAt = 5;
		const result = updateSpanPropertyInPlace(
			html,
			cursorAt,
			'data-letterspacing',
			'100',
			'letter-spacing',
			'0.1em'
		);

		expect(result.success).toBe(false);
	});

	it('should add property to span when span does not have it yet', () => {
		const html = '<span class="typost-styled" data-fontweight="700" style="font-weight: 700">Text</span>';
		const cursorAt = 2;
		// Add letter-spacing to span that only has font-weight
		const result = updateSpanPropertyInPlace(
			html,
			cursorAt,
			'data-letterspacing',
			'100',
			'letter-spacing',
			'0.1em'
		);

		expect(result.success).toBe(true);
		expect(result.content).toContain('data-letterspacing="100"');
		expect(result.content).toContain('letter-spacing: 0.1em');
		// Original property should be preserved
		expect(result.content).toContain('data-fontweight="700"');
		expect(result.content).toContain('font-weight: 700');
	});

	it('should update only the target property, preserving others', () => {
		const html = '<span class="typost-styled" data-letterspacing="100" data-fontweight="700" data-features="ss01" style="letter-spacing: 0.1em; font-weight: 700; font-feature-settings: &quot;ss01&quot; 1">Text</span>';
		const cursorAt = 2;
		const result = updateSpanPropertyInPlace(
			html,
			cursorAt,
			'data-letterspacing',
			'150',
			'letter-spacing',
			'0.15em'
		);

		expect(result.success).toBe(true);
		// Letter-spacing updated
		expect(result.content).toContain('data-letterspacing="150"');
		expect(result.content).toContain('letter-spacing: 0.15em');
		// Other properties preserved
		expect(result.content).toContain('data-fontweight="700"');
		expect(result.content).toContain('data-features="ss01"');
		expect(result.content).toContain('font-weight: 700');
		expect(result.content).toContain('font-feature-settings');
	});

	it('should handle updating line-height property', () => {
		const html = '<span class="typost-styled" data-lineheight="1.5" style="line-height: 1.5">Text</span>';
		const cursorAt = 2;
		const result = updateSpanPropertyInPlace(
			html,
			cursorAt,
			'data-lineheight',
			'2.0',
			'line-height',
			'2.0'
		);

		expect(result.success).toBe(true);
		expect(result.content).toContain('data-lineheight="2.0"');
		expect(result.content).toContain('line-height: 2.0');
	});

	it('should handle updating font-weight property', () => {
		const html = '<span class="typost-styled" data-fontweight="400" style="font-weight: 400">Text</span>';
		const cursorAt = 2;
		const result = updateSpanPropertyInPlace(
			html,
			cursorAt,
			'data-fontweight',
			'700',
			'font-weight',
			'700'
		);

		expect(result.success).toBe(true);
		expect(result.content).toContain('data-fontweight="700"');
		expect(result.content).toContain('font-weight: 700');
	});
});
