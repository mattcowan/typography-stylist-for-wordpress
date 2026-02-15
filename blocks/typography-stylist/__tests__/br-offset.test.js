/**
 * Test Suite: BR Line Break Offset Handling
 *
 * Tests that <br> elements (hard returns from Shift+Enter) are counted as
 * 1 character position in offset calculations, matching WordPress RichText's
 * offset system.
 *
 * Bug: When content contains <br> tags, styling applied to text after the
 * line break would target the wrong character (off by 1 per <br>).
 */

import {
	buildTextOffsetMap,
	getEffectiveTextLength,
	parseInlineFeaturesAtCursor,
	parseInlineStylesAtCursor,
	applyStylingSafeStringMethod
} from '../utils';

// Helper to create a parsed DOM container
function createContainer(html) {
	const parser = new DOMParser();
	const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
	return { container: doc.body.firstChild, doc };
}

describe('buildTextOffsetMap - BR handling', () => {

	it('should count BR as 1 character position', () => {
		const { container, doc } = createContainer('Line1<br>Line2');
		const map = buildTextOffsetMap(container, doc);

		expect(map).toHaveLength(2);
		expect(map[0]).toEqual(expect.objectContaining({ start: 0, end: 5, text: 'Line1' }));
		// BR at position 5, so Line2 starts at 6
		expect(map[1]).toEqual(expect.objectContaining({ start: 6, end: 11, text: 'Line2' }));
	});

	it('should handle multiple BRs cumulatively', () => {
		const { container, doc } = createContainer('A<br>B<br>C');
		const map = buildTextOffsetMap(container, doc);

		expect(map).toHaveLength(3);
		expect(map[0]).toEqual(expect.objectContaining({ start: 0, end: 1, text: 'A' }));
		expect(map[1]).toEqual(expect.objectContaining({ start: 2, end: 3, text: 'B' }));
		expect(map[2]).toEqual(expect.objectContaining({ start: 4, end: 5, text: 'C' }));
	});

	it('should handle BR inside styled spans', () => {
		const { container, doc } = createContainer(
			'M<span class="typost-styled">I</span>LANO<br>TEXT'
		);
		const map = buildTextOffsetMap(container, doc);

		// "M" (0-1), "I" (1-2), "LANO" (2-6), BR at 6, "TEXT" (7-11)
		expect(map).toHaveLength(4);
		expect(map[0]).toEqual(expect.objectContaining({ start: 0, end: 1, text: 'M' }));
		expect(map[1]).toEqual(expect.objectContaining({ start: 1, end: 2, text: 'I' }));
		expect(map[2]).toEqual(expect.objectContaining({ start: 2, end: 6, text: 'LANO' }));
		expect(map[3]).toEqual(expect.objectContaining({ start: 7, end: 11, text: 'TEXT' }));
	});

	it('should handle content with no BRs unchanged', () => {
		const { container, doc } = createContainer('Simple text');
		const map = buildTextOffsetMap(container, doc);

		expect(map).toHaveLength(1);
		expect(map[0]).toEqual(expect.objectContaining({ start: 0, end: 11, text: 'Simple text' }));
	});

	it('should handle BR with data-rich-text-line-break attribute', () => {
		const { container, doc } = createContainer(
			'Line1<br data-rich-text-line-break="true">Line2'
		);
		const map = buildTextOffsetMap(container, doc);

		expect(map).toHaveLength(2);
		expect(map[0]).toEqual(expect.objectContaining({ start: 0, end: 5, text: 'Line1' }));
		expect(map[1]).toEqual(expect.objectContaining({ start: 6, end: 11, text: 'Line2' }));
	});

	it('should not produce map entries for BR elements', () => {
		const { container, doc } = createContainer('A<br>B');
		const map = buildTextOffsetMap(container, doc);

		// Only text nodes should be in the map, not BR elements
		expect(map).toHaveLength(2);
		map.forEach(entry => {
			expect(entry.node.nodeType).toBe(Node.TEXT_NODE);
		});
	});

	it('should handle consecutive BRs', () => {
		const { container, doc } = createContainer('A<br><br>B');
		const map = buildTextOffsetMap(container, doc);

		expect(map).toHaveLength(2);
		expect(map[0]).toEqual(expect.objectContaining({ start: 0, end: 1, text: 'A' }));
		// Two BRs at positions 1 and 2, so B starts at 3
		expect(map[1]).toEqual(expect.objectContaining({ start: 3, end: 4, text: 'B' }));
	});
});

describe('getEffectiveTextLength - BR handling', () => {

	it('should return 1 for BR elements', () => {
		const br = document.createElement('br');
		expect(getEffectiveTextLength(br)).toBe(1);
	});

	it('should return text length for text nodes', () => {
		const text = document.createTextNode('Hello');
		expect(getEffectiveTextLength(text)).toBe(5);
	});

	it('should count BR inside element children', () => {
		const div = document.createElement('div');
		div.innerHTML = 'Hello<br>World';
		// "Hello" (5) + BR (1) + "World" (5) = 11
		expect(getEffectiveTextLength(div)).toBe(11);
	});

	it('should count nested BRs recursively', () => {
		const div = document.createElement('div');
		div.innerHTML = '<span>A<br>B</span>';
		// "A" (1) + BR (1) + "B" (1) = 3
		expect(getEffectiveTextLength(div)).toBe(3);
	});
});

describe('parseInlineFeaturesAtCursor - BR offset handling', () => {

	it('should correctly detect features after a BR', () => {
		const html = 'MILANO CORTINA<br><span class="typost-styled" data-features="ss01">M</span>ILANO CORTINA';
		// "MILANO CORTINA" (0-14), BR at 14, "M" span starts at 15
		const result = parseInlineFeaturesAtCursor(html, 15, 15);
		expect(result).toEqual(['ss01']);
	});

	it('should correctly detect features before a BR', () => {
		const html = '<span class="typost-styled" data-features="ss02">A</span><br>NEXT LINE';
		// "A" span at offset 0-1, cursor at 0
		const result = parseInlineFeaturesAtCursor(html, 0, 0);
		expect(result).toEqual(['ss02']);
	});

	it('should return empty array for unstyled text after BR', () => {
		const html = 'Line1<br>Line2';
		const result = parseInlineFeaturesAtCursor(html, 6, 6);
		expect(result).toEqual([]);
	});
});

describe('parseInlineStylesAtCursor - BR offset handling', () => {

	it('should detect inline styles after a BR', () => {
		const html = 'Line1<br><span class="typost-styled" data-features="liga" data-font-id="5" style="font-feature-settings: &quot;liga&quot; 1">Line2</span>';
		// "Line1" (0-5), BR at 5, "Line2" (6-11)
		const result = parseInlineStylesAtCursor(html, 6, 6);
		expect(result).not.toBeNull();
		expect(result.features).toEqual(['liga']);
		expect(result.fontId).toBe('5');
	});
});

describe('applyStylingSafeStringMethod - BR offset handling', () => {

	it('should apply styling to correct text after BR (the original bug)', () => {
		const html = '<span class="typost-styled" data-features="ss01" style="font-feature-settings: &quot;ss01&quot; 1">M</span>ILANO CORTIN<span class="typost-styled" data-features="ss02" style="font-feature-settings: &quot;ss02&quot; 1">A</span><br>MILANO CORTINA';
		// "M"(0-1) "ILANO CORTIN"(1-13) "A"(13-14) BR(14) "MILANO CORTINA"(15-29)
		// Select "M" on line 2 at offset 15-16
		const result = applyStylingSafeStringMethod(
			html, 15, 16,
			{ 'data-features': 'ss01' },
			'font-feature-settings: "ss01" 1'
		);

		expect(result.success).toBe(true);
		// The "M" after <br> should be wrapped, not the "I"
		expect(result.content).toMatch(/<br><span[^>]*data-features="ss01"[^>]*>M<\/span>ILANO CORTINA/);
	});

	it('should apply styling to correct text with multiple BRs', () => {
		const html = 'Line1<br>Line2<br>Line3';
		// "Line1"(0-5) BR(5) "Line2"(6-11) BR(11) "Line3"(12-17)
		const result = applyStylingSafeStringMethod(
			html, 12, 17,
			{ 'data-features': 'liga' },
			'font-feature-settings: "liga" 1'
		);

		expect(result.success).toBe(true);
		expect(result.content).toMatch(/<span[^>]*data-features="liga"[^>]*>Line3<\/span>/);
	});

	it('should apply styling to text on first line (no BR offset impact)', () => {
		const html = 'HELLO<br>WORLD';
		// Select "HELLO" at offset 0-5
		const result = applyStylingSafeStringMethod(
			html, 0, 5,
			{ 'data-features': 'ss01' },
			'font-feature-settings: "ss01" 1'
		);

		expect(result.success).toBe(true);
		expect(result.content).toMatch(/<span[^>]*data-features="ss01"[^>]*>HELLO<\/span><br>WORLD/);
	});

	it('should apply styling spanning across a BR', () => {
		const html = 'AB<br>CD';
		// "AB"(0-2) BR(2) "CD"(3-5)
		// Select from offset 1 to 4 ("B" + BR + "C")
		const result = applyStylingSafeStringMethod(
			html, 1, 4,
			{ 'data-features': 'ss01' },
			'font-feature-settings: "ss01" 1'
		);

		expect(result.success).toBe(true);
		// Should wrap both text portions around the BR
		expect(result.content).toContain('data-features="ss01"');
	});
});
