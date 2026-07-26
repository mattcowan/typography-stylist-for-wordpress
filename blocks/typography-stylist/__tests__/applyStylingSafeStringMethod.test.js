/**
 * Test Suite: applyStylingSafeStringMethod() - Multi-Node Selection Handling
 *
 * Tests for the fallback utility that handles multi-node selections while
 * preserving nested span structure (fixes font-size wiping features bug).
 */

import { applyStylingSafeStringMethod, validateNestingDepth } from '../utils';

describe('Typography Stylist - applyStylingSafeStringMethod Multi-Node Handling', () => {

	it('should preserve nested feature span when wrapping parent selection', () => {
		const html = 'M<span class="typost-styled" data-features="ss01">a</span>gic';
		const result = applyStylingSafeStringMethod(
			html,
			0, 2, // "Ma" - spans from plain text "M" to feature span "a"
			{ 'data-fontsize': '20px' },
			'font-size: 20px'
		);

		expect(result.success).toBe(true);
		expect(result.content).toContain('data-features="ss01"');
		// The structure should be: <span data-fontsize="20px">M<span data-features="ss01">a</span></span>gic
		expect(result.content).toMatch(/<span[^>]*data-fontsize="20px"[^>]*>M<span[^>]*data-features="ss01"[^>]*>a<\/span><\/span>gic/);
	});

	it('should handle double-nested spans', () => {
		const html = '<span class="typost-styled" data-fontsize="20px"><span class="typost-styled" data-features="ss01">Text</span></span>';
		const result = applyStylingSafeStringMethod(
			html,
			0, 4, // "Text"
			{ 'data-fontweight': '700' },
			'font-weight: 700'
		);

		expect(result.success).toBe(true);
		// Should preserve both fontsize and features
		expect(result.content).toContain('data-fontsize="20px"');
		expect(result.content).toContain('data-features="ss01"');
	});

	it('should handle triple-nested spans', () => {
		const html = '<span class="typost-styled" data-fontsize="20px"><span class="typost-styled" data-fontweight="700"><span class="typost-styled" data-features="ss01">Text</span></span></span>';
		const result = applyStylingSafeStringMethod(
			html,
			0, 4, // "Text"
			{ 'data-letterspacing': '100' },
			'letter-spacing: 0.1em'
		);

		expect(result.success).toBe(true);
		// Should preserve all three layers
		expect(result.content).toContain('data-fontsize="20px"');
		expect(result.content).toContain('data-fontweight="700"');
		expect(result.content).toContain('data-features="ss01"');
	});

	it('should handle multi-node selection with multiple feature spans', () => {
		const html = '<span class="typost-styled" data-features="ss01">F</span>ire <span class="typost-styled" data-features="ss02">Truck</span>';
		const result = applyStylingSafeStringMethod(
			html,
			0, 10, // "Fire Truck" - entire text
			{ 'data-fontsize': '24px' },
			'font-size: 24px'
		);

		expect(result.success).toBe(true);
		// Both feature spans should be preserved inside the new font-size span
		expect(result.content).toContain('data-features="ss01"');
		expect(result.content).toContain('data-features="ss02"');
		expect(result.content).toContain('data-fontsize="24px"');
	});

	it('should handle selection starting in feature span and extending to plain text', () => {
		const html = 'Magic <span class="typost-styled" data-features="dlig">Word</span> text';
		const result = applyStylingSafeStringMethod(
			html,
			6, 14, // "Word te" - from feature span through plain text
			{ 'data-fontweight': '700' },
			'font-weight: 700'
		);

		expect(result.success).toBe(true);
		expect(result.content).toContain('data-features="dlig"');
		expect(result.content).toContain('data-fontweight="700"');
	});

	it('should handle selection entirely within nested spans', () => {
		const html = 'Before<span class="typost-styled" data-fontsize="20px">Outer <span class="typost-styled" data-features="ss01">Inner</span> text</span>After';
		const result = applyStylingSafeStringMethod(
			html,
			12, 17, // "Inner" - entirely within nested spans
			{ 'data-fontweight': '700' },
			'font-weight: 700'
		);

		expect(result.success).toBe(true);
		expect(result.content).toContain('data-fontsize="20px"');
		expect(result.content).toContain('data-features="ss01"');
		expect(result.content).toContain('data-fontweight="700"');
	});

	it('should preserve attributes when wrapping plain text adjacent to feature span', () => {
		const html = 'M<span class="typost-styled" data-features="ss01">a</span>gic';
		const result = applyStylingSafeStringMethod(
			html,
			0, 1, // "M" - just the plain text before feature span
			{ 'data-letterspacing': '100' },
			'letter-spacing: 0.1em'
		);

		expect(result.success).toBe(true);
		// Original feature span should be preserved, letter-spacing applied to "M"
		expect(result.content).toContain('data-features="ss01"');
		expect(result.content).toContain('data-letterspacing="100"');
	});

	it('should handle empty attributes object', () => {
		const html = 'M<span class="typost-styled" data-features="ss01">a</span>gic';
		const result = applyStylingSafeStringMethod(
			html,
			0, 2, // "Ma"
			{},
			'font-size: 20px'
		);

		expect(result.success).toBe(true);
		// Even with no attributes, should preserve nested structure
		expect(result.content).toContain('data-features="ss01"');
	});

	it('should handle null and undefined attribute values', () => {
		const html = 'M<span class="typost-styled" data-features="ss01">a</span>gic';
		const result = applyStylingSafeStringMethod(
			html,
			0, 2, // "Ma"
			{ 'data-fontsize': '20px', 'data-invalid': null, 'data-undefined': undefined, 'data-empty': '' },
			'font-size: 20px'
		);

		expect(result.success).toBe(true);
		// Should only apply valid attributes
		expect(result.content).toContain('data-fontsize="20px"');
		expect(result.content).not.toContain('data-invalid');
		expect(result.content).not.toContain('data-undefined');
		expect(result.content).not.toContain('data-empty');
	});

	it('should handle broad selection across block elements', () => {
		// This tests multi-node handling across complex structures
		const html = '<div>Text1</div><div>Text2</div>';
		const result = applyStylingSafeStringMethod(
			html,
			0, 10, // "Text1Text2"
			{ 'data-fontsize': '20px' },
			'font-size: 20px'
		);

		// Should handle multi-node selections successfully
		expect(result.success).toBe(true);
		expect(result.content).toContain('data-fontsize="20px"');
	});
});

describe('Typography Stylist - validateNestingDepth', () => {

	// Create a helper to build nested DOM structure for testing
	const createNestedSpans = (depth) => {
		const doc = new DOMParser().parseFromString('<div></div>', 'text/html');
		let container = doc.body.firstChild;
		let currentElement = container;

		for (let i = 0; i < depth; i++) {
			const span = doc.createElement('span');
			span.className = 'typost-styled';
			span.setAttribute('data-level', i.toString());
			currentElement.appendChild(span);
			currentElement = span;
		}

		// Add text content to innermost span
		currentElement.textContent = 'Text';

		// Return the innermost span
		return currentElement;
	};

	it('should validate depth of 1 level as valid', () => {
		const innermost = createNestedSpans(1);
		const result = validateNestingDepth(innermost);

		expect(result.valid).toBe(true);
		expect(result.depth).toBe(1);
		expect(result.error).toBeNull();
	});

	it('should validate depth of 2 levels as valid', () => {
		const innermost = createNestedSpans(2);
		const result = validateNestingDepth(innermost);

		expect(result.valid).toBe(true);
		expect(result.depth).toBe(2);
		expect(result.error).toBeNull();
	});

	it('should validate depth of 3 levels as valid (at limit)', () => {
		const innermost = createNestedSpans(3);
		const result = validateNestingDepth(innermost);

		expect(result.valid).toBe(true);
		expect(result.depth).toBe(3);
		expect(result.error).toBeNull();
	});

	it('should reject depth of 4 levels (exceeds limit)', () => {
		const innermost = createNestedSpans(4);
		const result = validateNestingDepth(innermost);

		expect(result.valid).toBe(false);
		expect(result.depth).toBe(4);
		expect(result.error).toContain('Maximum nesting depth');
		expect(result.error).toContain('3');
	});

	it('should reject depth of 5+ levels', () => {
		const innermost = createNestedSpans(5);
		const result = validateNestingDepth(innermost);

		expect(result.valid).toBe(false);
		expect(result.depth).toBe(4); // Stops counting at first exceeding level
		expect(result.error).toContain('exceeded');
	});

	it('should return valid with depth 0 for non-typost-styled element', () => {
		const doc = new DOMParser().parseFromString('<div><p>Text</p></div>', 'text/html');
		const paragraph = doc.querySelector('p');
		const result = validateNestingDepth(paragraph);

		expect(result.valid).toBe(true);
		expect(result.depth).toBe(0);
		expect(result.error).toBeNull();
	});

	it('should handle null element gracefully', () => {
		const result = validateNestingDepth(null);

		expect(result.valid).toBe(true);
		expect(result.depth).toBe(0);
		expect(result.error).toBeNull();
	});

	it('should handle element without classList', () => {
		const doc = new DOMParser().parseFromString('<div>Text</div>', 'text/html');
		const textNode = doc.body.firstChild.firstChild; // Text node
		const result = validateNestingDepth(textNode);

		expect(result.valid).toBe(true);
		expect(result.depth).toBe(0);
	});
});

describe('nesting depth guard (canCreateNestedSpan integration)', () => {
	const { applyStylingSafeStringMethod: apply } = require('../utils');

	const tripleNested =
		'<span class="typost-styled" data-fontsize="40px" style="font-size: 40px">' +
		'<span class="typost-styled" data-fontweight="700" style="font-weight: 700">' +
		'<span class="typost-styled" data-features="liga" style=\'font-feature-settings: "liga" 1\'>Elegant</span>' +
		'</span></span>';

	test('partial selection inside a 3-deep chain refuses a 4th level, content unchanged', () => {
		const result = apply(tripleNested, 1, 3, { 'data-letterspacing': '2' }, 'letter-spacing: 0.002em');
		expect(result.success).toBe(false);
		expect(result.content).toBe(tripleNested);
		expect(result.error).toContain('nesting depth');
	});

	test('entire-span selection at depth 3 still merges (no new level created)', () => {
		const result = apply(tripleNested, 0, 7, { 'data-letterspacing': '2' }, 'letter-spacing: 0.002em');
		expect(result.success).toBe(true);
		expect(result.content).toContain('letter-spacing');
	});

	test('depth-2 partial selection still nests successfully', () => {
		const doubleNested =
			'<span class="typost-styled" data-fontsize="40px" style="font-size: 40px">' +
			'<span class="typost-styled" data-fontweight="700" style="font-weight: 700">Elegant</span>' +
			'</span>';
		const result = apply(doubleNested, 1, 3, { 'data-letterspacing': '2' }, 'letter-spacing: 0.002em');
		expect(result.success).toBe(true);
	});

	test('entire-span detection does not merge when the span has element children (D3)', () => {
		const withChild =
			'<span class="typost-styled" data-fontsize="40px" style="font-size: 40px">AB' +
			'<span class="typost-styled" data-features="liga" style=\'font-feature-settings: "liga" 1\'>C</span>' +
			'</span>';
		// Selecting "AB" — before/after are empty for that text node, but the
		// span's full text is "ABC"; merging would style "C" too
		const result = apply(withChild, 0, 2, { 'data-fontweight': '700' }, 'font-weight: 700');
		expect(result.success).toBe(true);
		const doc = new DOMParser().parseFromString('<div>' + result.content + '</div>', 'text/html');
		const outer = doc.querySelector('[data-fontsize]');
		// The outer span itself must NOT have gained the weight
		expect(outer.getAttribute('data-fontweight')).toBeNull();
		// The new weight span wraps only "AB"
		const weightSpan = doc.querySelector('[data-fontweight]');
		expect(weightSpan.textContent).toBe('AB');
	});
});
