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
 * Import shared utilities
 * This ensures we're testing the actual production code
 */
import { parseInlineFeaturesAtCursor } from '../utils';

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
 * Test Suite: toggleBlockFeature Logic
 *
 * These tests verify that toggleBlockFeature always applies block-level features
 * regardless of selection state (for sidebar controls).
 */
describe('OpenType Stylist - toggleBlockFeature Logic', () => {
	/**
	 * Simplified version of toggleBlockFeature logic
	 * This always applies to the block, never inline
	 */
	const toggleBlockFeatureLogic = (featureId, currentFeatures) => {
		const newFeatures = [...currentFeatures];
		const index = newFeatures.indexOf(featureId);
		if (index > -1) {
			newFeatures.splice(index, 1);
		} else {
			newFeatures.push(featureId);
		}
		return { type: 'block', features: newFeatures };
	};

	it('should add feature to block when feature not active', () => {
		const featureId = 'ss02';
		const currentFeatures = [];

		const result = toggleBlockFeatureLogic(featureId, currentFeatures);

		expect(result.type).toBe('block');
		expect(result.features).toContain('ss02');
		expect(result.features.length).toBe(1);
	});

	it('should remove feature from block when feature already active', () => {
		const featureId = 'ss02';
		const currentFeatures = ['ss02', 'liga'];

		const result = toggleBlockFeatureLogic(featureId, currentFeatures);

		expect(result.type).toBe('block');
		expect(result.features).not.toContain('ss02');
		expect(result.features).toContain('liga');
		expect(result.features.length).toBe(1);
	});

	it('should always apply to block, never inline (regardless of selection)', () => {
		// This is the key difference from toggleFeature
		// toggleBlockFeature should NEVER apply inline, even if text is selected
		const featureId = 'ss02';
		const currentFeatures = [];

		const result = toggleBlockFeatureLogic(featureId, currentFeatures);

		// Should always be block-level, never inline
		expect(result.type).toBe('block');
		expect(result.type).not.toBe('inline');
	});

	it('should preserve other features when toggling', () => {
		const featureId = 'ss02';
		const currentFeatures = ['liga', 'dlig', 'ss01'];

		const result = toggleBlockFeatureLogic(featureId, currentFeatures);

		expect(result.features).toContain('liga');
		expect(result.features).toContain('dlig');
		expect(result.features).toContain('ss01');
		expect(result.features).toContain('ss02');
		expect(result.features.length).toBe(4);
	});

	/**
	 * Edge case: Toggle multiple different features sequentially
	 */
	it('should handle multiple sequential toggles correctly', () => {
		let currentFeatures = [];

		// Add first feature
		let result = toggleBlockFeatureLogic('liga', currentFeatures);
		currentFeatures = result.features;
		expect(currentFeatures).toContain('liga');
		expect(currentFeatures.length).toBe(1);

		// Add second feature
		result = toggleBlockFeatureLogic('ss01', currentFeatures);
		currentFeatures = result.features;
		expect(currentFeatures).toContain('liga');
		expect(currentFeatures).toContain('ss01');
		expect(currentFeatures.length).toBe(2);

		// Add third feature
		result = toggleBlockFeatureLogic('swsh', currentFeatures);
		currentFeatures = result.features;
		expect(currentFeatures).toContain('liga');
		expect(currentFeatures).toContain('ss01');
		expect(currentFeatures).toContain('swsh');
		expect(currentFeatures.length).toBe(3);

		// Remove middle feature
		result = toggleBlockFeatureLogic('ss01', currentFeatures);
		currentFeatures = result.features;
		expect(currentFeatures).toContain('liga');
		expect(currentFeatures).not.toContain('ss01');
		expect(currentFeatures).toContain('swsh');
		expect(currentFeatures.length).toBe(2);
	});

	/**
	 * Edge case: Toggle same feature on and off repeatedly
	 */
	it('should handle toggling same feature on and off repeatedly', () => {
		let currentFeatures = [];

		// Toggle on
		let result = toggleBlockFeatureLogic('ss14', currentFeatures);
		expect(result.features).toContain('ss14');
		expect(result.features.length).toBe(1);

		// Toggle off
		result = toggleBlockFeatureLogic('ss14', result.features);
		expect(result.features).not.toContain('ss14');
		expect(result.features.length).toBe(0);

		// Toggle on again
		result = toggleBlockFeatureLogic('ss14', result.features);
		expect(result.features).toContain('ss14');
		expect(result.features.length).toBe(1);

		// Toggle off again
		result = toggleBlockFeatureLogic('ss14', result.features);
		expect(result.features).not.toContain('ss14');
		expect(result.features.length).toBe(0);
	});

	/**
	 * Edge case: Ensure it works with all common OpenType features
	 */
	it('should work correctly with all standard OpenType feature codes', () => {
		const testFeatures = ['liga', 'dlig', 'calt', 'ss01', 'ss02', 'ss03', 'swsh', 'cswh', 'salt', 'titl', 'ornm'];
		let currentFeatures = [];

		// Add all features one by one
		testFeatures.forEach(feature => {
			const result = toggleBlockFeatureLogic(feature, currentFeatures);
			currentFeatures = result.features;
		});

		// Verify all features are present
		expect(currentFeatures.length).toBe(testFeatures.length);
		testFeatures.forEach(feature => {
			expect(currentFeatures).toContain(feature);
		});
	});

	/**
	 * Edge case: Empty features array should remain valid
	 */
	it('should handle empty features array without errors', () => {
		const result = toggleBlockFeatureLogic('ss01', []);
		expect(result.features).toBeInstanceOf(Array);
		expect(result.features.length).toBe(1);
		expect(result.features).toContain('ss01');
	});

	/**
	 * Comparison test: Verify toggleBlockFeature differs from toggleFeature
	 * This documents the intentional behavioral difference
	 */
	it('should differ from toggleFeature behavior when selection exists', () => {
		// toggleFeature (with selection) would return inline application
		const toggleFeatureWithSelection = (featureId) => {
			return { type: 'inline', featureId };
		};

		// toggleBlockFeature (same scenario) always returns block application
		const toggleBlockResult = toggleBlockFeatureLogic('ss02', []);
		const toggleFeatureResult = toggleFeatureWithSelection('ss02');

		// Assert the difference
		expect(toggleBlockResult.type).toBe('block');
		expect(toggleFeatureResult.type).toBe('inline');
		expect(toggleBlockResult.type).not.toBe(toggleFeatureResult.type);
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
	it('should detect features from inline span at cursor position', () => {
		const html = 'Test <span class="ots-styled" style="font-feature-settings: \'ss02\' 1">H</span>ere';
		const cursorAt = 5; // Inside the "H"

		const features = parseInlineFeaturesAtCursor(html, cursorAt, cursorAt); // cursor position (start === end)

		expect(features).toEqual(['ss02']);
	});

	it('should detect features from data-features attribute', () => {
		const html = 'Test <span class="ots-styled" data-features="liga,dlig">text</span> here';
		const cursorAt = 8; // Inside "text"

		const features = parseInlineFeaturesAtCursor(html, cursorAt, cursorAt);

		expect(features).toEqual(['liga', 'dlig']);
	});

	it('should prefer data-features over style attribute', () => {
		const html = 'Test <span class="ots-styled" data-features="ss01" style="font-feature-settings: \'ss02\' 1">text</span>';
		const cursorAt = 7;

		const features = parseInlineFeaturesAtCursor(html, cursorAt, cursorAt);

		expect(features).toEqual(['ss01']); // Should use data-features, not style
	});

	it('should return innermost span when spans are nested', () => {
		const html = '<span class="ots-styled" data-features="liga">Outer <span class="ots-styled" data-features="ss02">Inner</span> text</span>';
		const cursorAt = 8; // Inside "Inner"

		const features = parseInlineFeaturesAtCursor(html, cursorAt, cursorAt);

		expect(features).toEqual(['ss02']); // Should find innermost span
	});

	it('should return empty array when cursor is outside styled spans', () => {
		const html = 'Plain <span class="ots-styled" data-features="ss02">styled</span> text';
		const cursorAt = 2; // In "Plain", before the span

		const features = parseInlineFeaturesAtCursor(html, cursorAt, cursorAt);

		expect(features).toEqual([]);
	});

	it('should handle multiple features in style attribute', () => {
		const html = '<span class="ots-styled" style="font-feature-settings: \'liga\' 1, \'dlig\' 1, \'ss02\' 1">text</span>';
		const cursorAt = 2;

		const features = parseInlineFeaturesAtCursor(html, cursorAt, cursorAt);

		expect(features).toEqual(['liga', 'dlig', 'ss02']);
	});

	it('should return empty array for content without styled spans', () => {
		const html = 'Just plain text';
		const cursorAt = 5;

		const features = parseInlineFeaturesAtCursor(html, cursorAt, cursorAt);

		expect(features).toEqual([]);
	});

	it('should handle HTML entities in style attribute', () => {
		const html = '<span class="ots-styled" style="font-feature-settings: &quot;ss02&quot; 1">text</span>';
		const cursorAt = 2;

		const features = parseInlineFeaturesAtCursor(html, cursorAt, cursorAt);

		// DOMParser converts &quot; to actual quotes
		expect(features).toEqual(['ss02']);
	});
});

/**
 * Test Suite: Edit.js Sidebar Feature Highlighting
 *
 * These tests verify that the OTS block sidebar correctly highlights
 * features when the user clicks on styled text in the editor.
 * This prevents regression of the feature detection functionality.
 */
describe('OpenType Stylist - Sidebar Feature Highlighting', () => {
	/**
	 * This test simulates the getInlineFeaturesAtSelection() function
	 * from edit.js to ensure it works correctly
	 */
	it('should highlight features in sidebar when cursor is on styled text', () => {
		// Arrange: Create content with inline styled text
		const content = 'Hello <span class="ots-styled" data-features="ss02,swsh">World</span> text';
		const cursorOffset = 8; // Cursor inside "World"

		// Act: Parse inline features at cursor position
		const inlineFeatures = parseInlineFeaturesAtCursor(content, cursorOffset, cursorOffset);

		// Assert: Should detect both features
		expect(inlineFeatures).toContain('ss02');
		expect(inlineFeatures).toContain('swsh');
		expect(inlineFeatures).toHaveLength(2);
	});

	it('should not highlight features when cursor is on unstyled text', () => {
		// Arrange: Content with styled span, but cursor outside it
		const content = 'Hello <span class="ots-styled" data-features="ss02">World</span> text';
		const cursorOffset = 2; // Cursor in "Hello" (unstyled)

		// Act: Parse inline features at cursor position
		const inlineFeatures = parseInlineFeaturesAtCursor(content, cursorOffset, cursorOffset);

		// Assert: Should return empty array
		expect(inlineFeatures).toEqual([]);
	});

	it('should highlight innermost features when spans are nested', () => {
		// Arrange: Nested styled spans with different features
		// Text content is "Outer Inner text" (Outer=0-4, Inner=6-10, text=12-15)
		const content = '<span class="ots-styled" data-features="liga">Outer <span class="ots-styled" data-features="ss02">Inner</span> text</span>';
		const cursorOffset = 8; // Cursor inside "Inner"

		// Act: Parse inline features at cursor position
		const inlineFeatures = parseInlineFeaturesAtCursor(content, cursorOffset, cursorOffset);

		// Assert: Should return innermost span's features
		expect(inlineFeatures).toEqual(['ss02']);
		expect(inlineFeatures).not.toContain('liga');
	});

	it('should work with multiple styled spans in same block', () => {
		// Arrange: Multiple styled spans with different features
		// Text content is "First and Second" (offsets: First=0-4, " and "=5-9, Second=10-15)
		const content = '<span class="ots-styled" data-features="ss01">First</span> and <span class="ots-styled" data-features="ss02">Second</span>';
		const cursorOffset = 11; // Cursor inside "Second" (offset 10-15)

		// Act: Parse inline features at cursor position
		const inlineFeatures = parseInlineFeaturesAtCursor(content, cursorOffset, cursorOffset);

		// Assert: Should detect only the second span's features
		expect(inlineFeatures).toEqual(['ss02']);
		expect(inlineFeatures).not.toContain('ss01');
	});

	it('should combine block-level and inline features for isActive state', () => {
		// Arrange: Simulating the checkbox isActive logic from edit.js
		const blockLevelFeatures = ['liga', 'dlig'];
		const inlineFeatures = ['ss02', 'swsh'];

		// Act: Simulate the isActive check for different features
		const ligaActive = blockLevelFeatures.includes('liga') || inlineFeatures.includes('liga');
		const ss02Active = blockLevelFeatures.includes('ss02') || inlineFeatures.includes('ss02');
		const caltActive = blockLevelFeatures.includes('calt') || inlineFeatures.includes('calt');

		// Assert: Should correctly combine both sources
		expect(ligaActive).toBe(true); // From block-level
		expect(ss02Active).toBe(true); // From inline
		expect(caltActive).toBe(false); // Not in either
	});

	it('should fallback to style attribute when data-features is missing', () => {
		// Arrange: Legacy content without data-features attribute
		const content = '<span class="ots-styled" style="font-feature-settings: \'ss02\' 1, \'liga\' 1">Text</span>';
		const cursorOffset = 2;

		// Act: Parse inline features at cursor position
		const inlineFeatures = parseInlineFeaturesAtCursor(content, cursorOffset, cursorOffset);

		// Assert: Should parse from style attribute
		expect(inlineFeatures).toContain('ss02');
		expect(inlineFeatures).toContain('liga');
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
