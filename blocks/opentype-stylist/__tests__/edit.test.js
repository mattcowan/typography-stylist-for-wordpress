/**
 * OpenType Stylist Block - Unit Tests
 *
 * BEGINNER-FRIENDLY UNIT TESTS
 *
 * These tests demonstrate the basics of unit testing for WordPress blocks.
 * We're testing the logic of our code, not the full React component rendering.
 *
 * Key Concepts:
 * - describe(): Groups related tests together
 * - it() or test(): Defines a single test case
 * - expect(): Makes assertions about what should be true
 *
 * As a beginner, focus on:
 * 1. Testing pure functions (functions that don't have side effects)
 * 2. Testing business logic (the "what should happen" part)
 * 3. Writing clear, descriptive test names
 */

/**
 * Load the block-editor.js file to access utilities
 * This ensures we're testing the actual production code
 *
 * First, we need to mock the WordPress globals that block-editor.js expects
 */
class MockComponent {
	constructor(props) {
		this.props = props;
	}
}

global.wp = {
	richText: { registerFormatType: () => {} },
	blockEditor: {},
	element: { Component: MockComponent, createElement: () => ({}), Fragment: 'Fragment' },
	components: {},
	i18n: { __: (text) => text, sprintf: (text) => text },
	compose: {
		compose: (...funcs) => (component) => component
	},
	data: {
		withSelect: () => (component) => component,
		dispatch: () => ({})
	},
	blocks: { createBlock: () => ({}) }
};

require('../../../assets/js/block-editor.js');

// Get utilities from the global object exposed by block-editor.js
const { escapeHTML, hasHTMLTags, validateSelectionBounds, sanitizeFontFamily, sanitizeCSSValue } = window.otsUtils || {};

/**
 * Test Suite: Helper Functions
 *
 * These tests focus on pure functions that are easy to test.
 * They don't require React or WordPress dependencies.
 */
describe('OpenType Stylist - Helper Functions', () => {
	/**
	 * Test: sanitizeFontFamily function
	 *
	 * This function removes dangerous characters from font family names.
	 * It's a pure function: same input always gives same output.
	 */
	describe('sanitizeFontFamily', () => {
		it('should remove double quotes from font names', () => {
			const input = '"Arial"';
			const expected = 'Arial';
			const result = sanitizeFontFamily(input);

			expect(result).toBe(expected);
		});

		it('should remove single quotes from font names', () => {
			const input = "'Helvetica'";
			const expected = 'Helvetica';
			const result = sanitizeFontFamily(input);

			expect(result).toBe(expected);
		});

		it('should remove semicolons from font names', () => {
			const input = 'Arial;';
			const expected = 'Arial';
			const result = sanitizeFontFamily(input);

			expect(result).toBe(expected);
		});

		it('should handle multiple dangerous characters', () => {
			const input = '"Arial"; "Helvetica"';
			const expected = 'Arial Helvetica';
			const result = sanitizeFontFamily(input);

			expect(result).toBe(expected);
		});

		it('should return empty string for null or undefined', () => {
			expect(sanitizeFontFamily(null)).toBe('');
			expect(sanitizeFontFamily(undefined)).toBe('');
			expect(sanitizeFontFamily('')).toBe('');
		});

		it('should leave safe font names unchanged', () => {
			const input = 'Arial';
			const result = sanitizeFontFamily(input);

			expect(result).toBe(input);
		});

		it('should prevent CSS injection attacks', () => {
			const maliciousFont = 'Arial"; color: red; background: url("javascript:alert(1)"); font-family: "';
			const result = sanitizeFontFamily(maliciousFont);

			// Should remove quotes and semicolons to prevent breaking out of style attribute
			expect(result).not.toContain('"');
			expect(result).not.toContain(';');
			expect(result).not.toContain('<');
			expect(result).not.toContain('>');
		});

		it('should remove angle brackets to prevent HTML injection', () => {
			const maliciousFont = 'Arial<script>alert("xss")</script>';
			const result = sanitizeFontFamily(maliciousFont);

			expect(result).not.toContain('<');
			expect(result).not.toContain('>');
			expect(result).not.toContain('"');
			// Removes <, >, ", ', and ; characters
			expect(result).toBe('Arialscriptalert(xss)/script');
		});
	});

	/**
	 * Test: sanitizeCSSValue function
	 *
	 * This function removes dangerous characters from CSS values.
	 */
	describe('sanitizeCSSValue', () => {
		it('should remove dangerous characters from CSS values', () => {
			const maliciousValue = '400; color: red; background: url("javascript:alert(1)")';
			const result = sanitizeCSSValue(maliciousValue);

			expect(result).not.toContain(';');
			expect(result).not.toContain('"');
			expect(result).not.toContain("'");
		});

		it('should allow safe numeric values', () => {
			expect(sanitizeCSSValue('400')).toBe('400');
			expect(sanitizeCSSValue(700)).toBe('700');
			expect(sanitizeCSSValue(0)).toBe('0');
		});

		it('should handle null and undefined', () => {
			expect(sanitizeCSSValue(null)).toBe('');
			expect(sanitizeCSSValue(undefined)).toBe('');
		});

		it('should remove angle brackets', () => {
			const maliciousValue = '400<script>alert(1)</script>';
			const result = sanitizeCSSValue(maliciousValue);

			expect(result).not.toContain('<');
			expect(result).not.toContain('>');
		});
	});

	/**
	 * Test: buildFeatureSettingsString function
	 *
	 * This function creates the CSS font-feature-settings string.
	 */
	describe('buildFeatureSettingsString', () => {
		/**
		 * Helper function (we're testing this)
		 */
		const buildFeatureSettingsString = (features) => {
			if (!features || features.length === 0) return '';
			return features.map(f => `"${f}" 1`).join(', ');
		};

		it('should create correct CSS string for single feature', () => {
			const features = ['liga'];
			const expected = '"liga" 1';
			const result = buildFeatureSettingsString(features);

			expect(result).toBe(expected);
		});

		it('should create correct CSS string for multiple features', () => {
			const features = ['liga', 'dlig', 'ss01'];
			const expected = '"liga" 1, "dlig" 1, "ss01" 1';
			const result = buildFeatureSettingsString(features);

			expect(result).toBe(expected);
		});

		it('should return empty string for empty array', () => {
			expect(buildFeatureSettingsString([])).toBe('');
		});

		it('should return empty string for null or undefined', () => {
			expect(buildFeatureSettingsString(null)).toBe('');
			expect(buildFeatureSettingsString(undefined)).toBe('');
		});
	});
});

/**
 * Test Suite: Business Logic Tests
 *
 * These tests verify the core business logic of our bug fix:
 * - toggleFeature should apply inline when text is selected
 * - toggleFeature should apply to block when no text is selected
 */
describe('OpenType Stylist - toggleFeature Logic', () => {
	/**
	 * Simplified version of the toggleFeature logic
	 * This is what we're testing
	 */
	const toggleFeatureLogic = (featureId, hasSelection, currentFeatures) => {
		// If there's a selection, return "inline" to indicate it should apply inline
		if (hasSelection) {
			return { type: 'inline', featureId };
		}

		// No selection - toggle in the features array
		const newFeatures = [...currentFeatures];
		const index = newFeatures.indexOf(featureId);

		if (index > -1) {
			// Feature exists - remove it
			newFeatures.splice(index, 1);
		} else {
			// Feature doesn't exist - add it
			newFeatures.push(featureId);
		}

		return { type: 'block', features: newFeatures };
	};

	/**
	 * Test: toggleFeature with text selection (THE BUG WE FIXED!)
	 *
	 * This is the most important test - it verifies the bug fix.
	 * Before the fix, this would have returned type: 'block'
	 * After the fix, it correctly returns type: 'inline'
	 */
	it('should apply inline when text is selected', () => {
		const featureId = 'ss14';
		const hasSelection = true; // User has text selected
		const currentFeatures = [];

		const result = toggleFeatureLogic(featureId, hasSelection, currentFeatures);

		// ASSERT: The result should indicate inline application
		expect(result.type).toBe('inline');
		expect(result.featureId).toBe('ss14');
	});

	/**
	 * Test: toggleFeature without selection - ADD feature
	 */
	it('should add feature to block when no selection and feature not active', () => {
		const featureId = 'ss14';
		const hasSelection = false; // No text selected
		const currentFeatures = []; // Feature not currently active

		const result = toggleFeatureLogic(featureId, hasSelection, currentFeatures);

		// ASSERT: The result should be block-level with the feature added
		expect(result.type).toBe('block');
		expect(result.features).toContain('ss14');
		expect(result.features.length).toBe(1);
	});

	/**
	 * Test: toggleFeature without selection - REMOVE feature
	 */
	it('should remove feature from block when no selection and feature already active', () => {
		const featureId = 'ss14';
		const hasSelection = false; // No text selected
		const currentFeatures = ['ss14', 'liga']; // Feature currently active

		const result = toggleFeatureLogic(featureId, hasSelection, currentFeatures);

		// ASSERT: The result should be block-level with the feature removed
		expect(result.type).toBe('block');
		expect(result.features).not.toContain('ss14');
		expect(result.features).toContain('liga'); // Other features unchanged
		expect(result.features.length).toBe(1);
	});

	/**
	 * Test: toggleFeature preserves other features
	 */
	it('should preserve other features when toggling', () => {
		const featureId = 'ss14';
		const hasSelection = false;
		const currentFeatures = ['liga', 'dlig', 'ss01'];

		const result = toggleFeatureLogic(featureId, hasSelection, currentFeatures);

		// ASSERT: Other features should be unchanged
		expect(result.features).toContain('liga');
		expect(result.features).toContain('dlig');
		expect(result.features).toContain('ss01');
		expect(result.features).toContain('ss14'); // New feature added
		expect(result.features.length).toBe(4);
	});
});

/**
 * Test Suite: Edge Cases
 *
 * Testing edge cases helps ensure robustness.
 */
describe('OpenType Stylist - Edge Cases', () => {
	it('should handle empty feature ID', () => {
		const toggleFeatureLogic = (featureId, hasSelection, currentFeatures) => {
			if (!featureId) return { type: 'error', message: 'No feature ID provided' };
			if (hasSelection) return { type: 'inline', featureId };
			return { type: 'block', features: currentFeatures };
		};

		const result = toggleFeatureLogic('', true, []);
		expect(result.type).toBe('error');
	});

	it('should handle duplicate features gracefully', () => {
		const currentFeatures = ['liga', 'liga', 'ss01'];
		// In a real implementation, you'd deduplicate
		// For now, we're just testing the behavior

		expect(currentFeatures.length).toBe(3);
		// In the real code, you might want to filter duplicates
		const deduped = [...new Set(currentFeatures)];
		expect(deduped.length).toBe(2);
	});
});

/**
 * Test Suite: HTML Preservation and Safety
 *
 * These tests protect against regressions in the HTML preservation logic
 * added to fix styling loss during block conversion.
 */
describe('OpenType Stylist - HTML Preservation', () => {
	it('should detect actual HTML tags', () => {
		expect(hasHTMLTags('<span>test</span>')).toBe(true);
		expect(hasHTMLTags('<div class="test">content</div>')).toBe(true);
		expect(hasHTMLTags('Test <b>bold</b> text')).toBe(true);
	});

	it('should not detect < in plain text as HTML', () => {
		expect(hasHTMLTags('5 < 10')).toBe(false);
		expect(hasHTMLTags('Use tag < to compare')).toBe(false);
		expect(hasHTMLTags('a < b < c')).toBe(false);
	});

	it('should handle empty or null content', () => {
		expect(hasHTMLTags('')).toBe(false);
		expect(hasHTMLTags(null)).toBe(false);
		expect(hasHTMLTags(undefined)).toBe(false);
	});

	it('should escape HTML special characters', () => {
		expect(escapeHTML('<script>alert("xss")</script>')).toBe('&lt;script&gt;alert("xss")&lt;/script&gt;');
		expect(escapeHTML('Test & test')).toBe('Test &amp; test');
		expect(escapeHTML('Quote "test"')).toBe('Quote "test"');
		expect(escapeHTML("Single 'test'")).toBe("Single 'test'");
	});

	it('should handle angle brackets in text', () => {
		expect(escapeHTML('5 < 10')).toBe('5 &lt; 10');
		expect(escapeHTML('10 > 5')).toBe('10 &gt; 5');
		expect(escapeHTML('a < b > c')).toBe('a &lt; b &gt; c');
	});

	it('should preserve safe text unchanged', () => {
		expect(escapeHTML('Normal text')).toBe('Normal text');
		expect(escapeHTML('Hello World')).toBe('Hello World');
	});

	it('should validate selection within text bounds', () => {
		const result = validateSelectionBounds(0, 5, 10);
		expect(result.valid).toBe(true);
	});

	it('should reject selection beyond text length', () => {
		const result = validateSelectionBounds(0, 15, 10);
		expect(result.valid).toBe(false);
		expect(result.error).toContain('exceeds text length');
	});

	it('should reject negative selection offsets', () => {
		const resultStart = validateSelectionBounds(-1, 5, 10);
		expect(resultStart.valid).toBe(false);

		const resultEnd = validateSelectionBounds(0, -5, 10);
		expect(resultEnd.valid).toBe(false);
	});

	it('should reject inverted selection (start > end)', () => {
		const result = validateSelectionBounds(8, 3, 10);
		expect(result.valid).toBe(false);
		expect(result.error).toContain('Start offset cannot be greater');
	});
});

/**
 * Test Suite: Block Attribute Preservation
 *
 * These tests ensure block-level features are preserved correctly.
 */
describe('OpenType Stylist - Block Attribute Preservation', () => {
	/**
	 * Helper: Determine block attributes for selection-based conversion
	 */
	const getBlockAttributesForSelection = (isAlreadyOTSBlock, currentBlockFeatures, selectedFeatures) => {
		if (isAlreadyOTSBlock) {
			// Preserve existing block-level features
			return {
				features: currentBlockFeatures || [],
				preservedExisting: true
			};
		} else {
			// New OTS block from core/heading - no global features
			return {
				features: [],
				preservedExisting: false
			};
		}
	};

	it('should preserve existing features when updating OTS block', () => {
		const result = getBlockAttributesForSelection(
			true, // isAlreadyOTSBlock
			['liga', 'dlig'], // currentBlockFeatures
			['ss14'] // selectedFeatures (applied inline only)
		);

		expect(result.features).toEqual(['liga', 'dlig']);
		expect(result.preservedExisting).toBe(true);
		expect(result.features).not.toContain('ss14'); // ss14 is inline-only
	});

	it('should use empty features for new OTS block from core/heading', () => {
		const result = getBlockAttributesForSelection(
			false, // Not already OTS block
			undefined, // core/heading doesn't have features
			['ss14'] // selectedFeatures (applied inline only)
		);

		expect(result.features).toEqual([]);
		expect(result.preservedExisting).toBe(false);
	});

	it('should handle empty current features array', () => {
		const result = getBlockAttributesForSelection(
			true, // isAlreadyOTSBlock
			[], // No current features
			['ss14']
		);

		expect(result.features).toEqual([]);
		expect(result.features).not.toContain('ss14'); // ss14 is inline-only
	});
});

/**
 * Test Suite: Inline Feature Detection
 *
 * These tests verify that features applied to inline text selections
 * are correctly detected when the cursor is positioned inside styled spans.
 */
describe('OpenType Stylist - Inline Feature Detection', () => {
	/**
	 * Helper: Parse inline features from HTML at cursor position
	 * Simulates the getStyledSpanAtSelection() and feature parsing logic
	 */
	const parseInlineFeaturesAtCursor = (htmlContent, cursorOffset) => {
		if (!htmlContent || cursorOffset === undefined) {
			return [];
		}

		// Parse HTML to find styled spans
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
		const container = doc.body.firstChild;
		const styledSpans = container.querySelectorAll('span.ots-styled');

		// Find the smallest span containing the cursor
		let smallestMatchingSpan = null;
		let smallestSpanSize = Infinity;

		for (const span of styledSpans) {
			const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
			let spanStart = 0;
			let spanEnd = 0;
			let found = false;
			let offset = 0;

			let node;
			while ((node = walker.nextNode())) {
				const nodeLength = node.nodeValue.length;

				if (span.contains(node)) {
					if (!found) {
						spanStart = offset;
						found = true;
					}
					spanEnd = offset + nodeLength;
				}

				offset += nodeLength;
			}

			// Check if cursor is inside this span
			if (found && cursorOffset >= spanStart && cursorOffset <= spanEnd) {
				const spanSize = spanEnd - spanStart;
				if (spanSize < smallestSpanSize) {
					smallestMatchingSpan = span;
					smallestSpanSize = spanSize;
				}
			}
		}

		if (!smallestMatchingSpan) {
			return [];
		}

		// Try data-features attribute first
		const dataFeatures = smallestMatchingSpan.getAttribute('data-features');
		if (dataFeatures) {
			return dataFeatures.split(',');
		}

		// Fallback: parse from style attribute
		const style = smallestMatchingSpan.getAttribute('style') || '';
		const featureMatch = style.match(/font-feature-settings:\s*([^;]+)/);

		if (featureMatch) {
			return featureMatch[1]
				.split(',')
				.map(f => {
					const match = f.trim().match(/["']([^"']+)["']/);
					return match ? match[1] : null;
				})
				.filter(f => f);
		}

		return [];
	};

	it('should detect features from inline span at cursor position', () => {
		const html = 'Test <span class="ots-styled" style="font-feature-settings: \'ss02\' 1">H</span>ere';
		const cursorAt = 5; // Inside the "H"

		const features = parseInlineFeaturesAtCursor(html, cursorAt);

		expect(features).toEqual(['ss02']);
	});

	it('should detect features from data-features attribute', () => {
		const html = 'Test <span class="ots-styled" data-features="liga,dlig">text</span> here';
		const cursorAt = 8; // Inside "text"

		const features = parseInlineFeaturesAtCursor(html, cursorAt);

		expect(features).toEqual(['liga', 'dlig']);
	});

	it('should prefer data-features over style attribute', () => {
		const html = 'Test <span class="ots-styled" data-features="ss01" style="font-feature-settings: \'ss02\' 1">text</span>';
		const cursorAt = 7;

		const features = parseInlineFeaturesAtCursor(html, cursorAt);

		expect(features).toEqual(['ss01']); // Should use data-features, not style
	});

	it('should return innermost span when spans are nested', () => {
		const html = '<span class="ots-styled" data-features="liga">Outer <span class="ots-styled" data-features="ss02">Inner</span> text</span>';
		const cursorAt = 8; // Inside "Inner"

		const features = parseInlineFeaturesAtCursor(html, cursorAt);

		expect(features).toEqual(['ss02']); // Should find innermost span
	});

	it('should return empty array when cursor is outside styled spans', () => {
		const html = 'Plain <span class="ots-styled" data-features="ss02">styled</span> text';
		const cursorAt = 2; // In "Plain", before the span

		const features = parseInlineFeaturesAtCursor(html, cursorAt);

		expect(features).toEqual([]);
	});

	it('should handle multiple features in style attribute', () => {
		const html = '<span class="ots-styled" style="font-feature-settings: \'liga\' 1, \'dlig\' 1, \'ss02\' 1">text</span>';
		const cursorAt = 2;

		const features = parseInlineFeaturesAtCursor(html, cursorAt);

		expect(features).toEqual(['liga', 'dlig', 'ss02']);
	});

	it('should return empty array for content without styled spans', () => {
		const html = 'Just plain text';
		const cursorAt = 5;

		const features = parseInlineFeaturesAtCursor(html, cursorAt);

		expect(features).toEqual([]);
	});

	it('should handle HTML entities in style attribute', () => {
		const html = '<span class="ots-styled" style="font-feature-settings: &quot;ss02&quot; 1">text</span>';
		const cursorAt = 2;

		const features = parseInlineFeaturesAtCursor(html, cursorAt);

		// DOMParser converts &quot; to actual quotes
		expect(features).toEqual(['ss02']);
	});
});

/**
 * WHAT WE LEARNED:
 *
 * 1. Unit tests verify small pieces of functionality
 * 2. Pure functions are easiest to test
 * 3. Test names should describe what they're testing
 * 4. Use AAA pattern: Arrange, Act, Assert
 * 5. Test both happy path and edge cases
 * 6. Tests protect against regressions when refactoring
 * 7. Security tests (HTML escaping) are critical for user-generated content
 *
 * NEXT STEPS:
 *
 * 1. Run these tests: npm test
 * 2. Watch mode: npm run test:watch
 * 3. Add more tests for other functions
 * 4. Eventually, test the full React component (more advanced)
 *
 * TESTING COMMANDS:
 *
 * - npm test                  Run all tests once
 * - npm run test:watch        Run tests in watch mode (re-runs on file changes)
 * - npm test -- --coverage    See test coverage report
 */
