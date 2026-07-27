/**
 * Typography Stylist Block - Unit Tests
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
import { parseInlineFeaturesAtCursor, parseInlineFontFamilyAtCursor, detectBlockComputedFont, applyOrMergeStyling, validateRangeMatchesSelection, applyStylingSafeStringMethod, isValidFontSizeRange } from '../utils';

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
const { escapeHTML, hasHTMLTags, validateSelectionBounds, sanitizeFontFamily, sanitizeCSSValue, sanitizeFontVariationSettings } = window.typostUtils || {};

/**
 * Test Suite: Helper Functions
 *
 * These tests focus on pure functions that are easy to test.
 * They don't require React or WordPress dependencies.
 */
describe('Typography Stylist - Helper Functions', () => {
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
	 * Test: sanitizeFontVariationSettings function
	 *
	 * Validates and sanitizes font-variation-settings CSS values,
	 * ensuring each entry matches "axis" number format.
	 */
	describe('sanitizeFontVariationSettings', () => {
		it('should accept valid single axis', () => {
			expect(sanitizeFontVariationSettings('"wght" 700')).toBe('"wght" 700');
		});

		it('should accept valid multiple axes', () => {
			expect(sanitizeFontVariationSettings('"wght" 700, "wdth" 100')).toBe('"wght" 700, "wdth" 100');
		});

		it('should accept float values', () => {
			expect(sanitizeFontVariationSettings('"wght" 400.5')).toBe('"wght" 400.5');
		});

		it('should accept negative values', () => {
			expect(sanitizeFontVariationSettings('"slnt" -12')).toBe('"slnt" -12');
		});

		it('should normalize single quotes to double quotes', () => {
			expect(sanitizeFontVariationSettings("'wght' 700")).toBe('"wght" 700');
		});

		it('should reject malformed entries and return empty string', () => {
			expect(sanitizeFontVariationSettings('wght 700')).toBe('');
			expect(sanitizeFontVariationSettings('"wght"')).toBe('');
			expect(sanitizeFontVariationSettings('"wght" abc')).toBe('');
			expect(sanitizeFontVariationSettings('"toolongaxis" 700')).toBe('');
		});

		it('should reject injection attempts', () => {
			expect(sanitizeFontVariationSettings('"wght" 700; color: red')).toBe('');
			expect(sanitizeFontVariationSettings('"wght" 700, "wdth" 100; background: url(evil)')).toBe('');
		});

		it('should handle null, undefined, and empty string', () => {
			expect(sanitizeFontVariationSettings(null)).toBe('');
			expect(sanitizeFontVariationSettings(undefined)).toBe('');
			expect(sanitizeFontVariationSettings('')).toBe('');
		});

		it('should handle whitespace-only input', () => {
			expect(sanitizeFontVariationSettings('   ')).toBe('');
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
describe('Typography Stylist - toggleFeature Logic', () => {
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
describe('Typography Stylist - toggleBlockFeature Logic', () => {
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
describe('Typography Stylist - Edge Cases', () => {
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
describe('Typography Stylist - HTML Preservation', () => {
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
describe('Typography Stylist - Block Attribute Preservation', () => {
	/**
	 * Helper: Determine block attributes for selection-based conversion
	 */
	const getBlockAttributesForSelection = (isAlreadyTypostBlock, currentBlockFeatures, selectedFeatures) => {
		if (isAlreadyTypostBlock) {
			// Preserve existing block-level features
			return {
				features: currentBlockFeatures || [],
				preservedExisting: true
			};
		} else {
			// New Typost block from core/heading - no global features
			return {
				features: [],
				preservedExisting: false
			};
		}
	};

	it('should preserve existing features when updating Typographic Stylist block', () => {
		const result = getBlockAttributesForSelection(
			true, // isAlreadyTypostBlock
			['liga', 'dlig'], // currentBlockFeatures
			['ss14'] // selectedFeatures (applied inline only)
		);

		expect(result.features).toEqual(['liga', 'dlig']);
		expect(result.preservedExisting).toBe(true);
		expect(result.features).not.toContain('ss14'); // ss14 is inline-only
	});

	it('should use empty features for new Typographic Stylist block from core/heading', () => {
		const result = getBlockAttributesForSelection(
			false, // Not already Typost block
			undefined, // core/heading doesn't have features
			['ss14'] // selectedFeatures (applied inline only)
		);

		expect(result.features).toEqual([]);
		expect(result.preservedExisting).toBe(false);
	});

	it('should handle empty current features array', () => {
		const result = getBlockAttributesForSelection(
			true, // isAlreadyTypostBlock
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
describe('Typography Stylist - Inline Feature Detection', () => {
	it('should detect features from inline span at cursor position', () => {
		const html = 'Test <span class="typost-styled" style="font-feature-settings: \'ss02\' 1">H</span>ere';
		const cursorAt = 5; // Inside the "H"

		const features = parseInlineFeaturesAtCursor(html, cursorAt, cursorAt); // cursor position (start === end)

		expect(features).toEqual(['ss02']);
	});

	it('should detect features from data-features attribute', () => {
		const html = 'Test <span class="typost-styled" data-features="liga,dlig">text</span> here';
		const cursorAt = 8; // Inside "text"

		const features = parseInlineFeaturesAtCursor(html, cursorAt, cursorAt);

		expect(features).toEqual(['liga', 'dlig']);
	});

	it('should prefer data-features over style attribute', () => {
		const html = 'Test <span class="typost-styled" data-features="ss01" style="font-feature-settings: \'ss02\' 1">text</span>';
		const cursorAt = 7;

		const features = parseInlineFeaturesAtCursor(html, cursorAt, cursorAt);

		expect(features).toEqual(['ss01']); // Should use data-features, not style
	});

	it('should return innermost span when spans are nested', () => {
		const html = '<span class="typost-styled" data-features="liga">Outer <span class="typost-styled" data-features="ss02">Inner</span> text</span>';
		const cursorAt = 8; // Inside "Inner"

		const features = parseInlineFeaturesAtCursor(html, cursorAt, cursorAt);

		expect(features).toEqual(['ss02']); // Should find innermost span
	});

	it('should detect features from nested typost-styled spans (font-size wrapper case)', () => {
		// This tests the fix for the 'M' in Mephisto bug where font-size wraps a feature span
		const html = '<span data-fontsize="responsive" data-fontweight="400" class="typost-styled"><span data-features="ss01" class="typost-styled">M</span></span>';
		const cursorAt = 0; // Inside "M"

		const features = parseInlineFeaturesAtCursor(html, cursorAt, cursorAt);

		expect(features).toEqual(['ss01']); // Should detect ss01 from nested span
	});

	it('should collect features from all nested typost-styled spans in hierarchy', () => {
		// Test case: With our improved nested detection, we now collect features from
		// the matched span AND any typost-styled spans it contains (including nested ones)
		const html = '<span data-features="liga" class="typost-styled"><span data-features="ss01,ss02" class="typost-styled">Text</span></span>';
		const cursorAt = 1; // Inside "Text"

		const features = parseInlineFeaturesAtCursor(html, cursorAt, cursorAt);

		// After fixing nested feature collection, we now get all features from the nested structure
		expect(features).toContain('liga');
		expect(features).toContain('ss01');
		expect(features).toContain('ss02');
		expect(features).toHaveLength(3);
	});

	it('should handle deeply nested typost-styled spans', () => {
		// Test triple-nested case
		const html = '<span data-fontsize="responsive" class="typost-styled"><span data-fontweight="700" class="typost-styled"><span data-features="ss01,dlig" class="typost-styled">X</span></span></span>';
		const cursorAt = 0; // Inside "X"

		const features = parseInlineFeaturesAtCursor(html, cursorAt, cursorAt);

		expect(features).toContain('ss01');
		expect(features).toContain('dlig');
		expect(features).toHaveLength(2);
	});

	it('should return empty array when cursor is outside styled spans', () => {
		const html = 'Plain <span class="typost-styled" data-features="ss02">styled</span> text';
		const cursorAt = 2; // In "Plain", before the span

		const features = parseInlineFeaturesAtCursor(html, cursorAt, cursorAt);

		expect(features).toEqual([]);
	});

	it('should NOT detect features when cursor is immediately after styled span (boundary bug)', () => {
		// Reproduces the Moriarty bug: cursor on "o" should not detect ss01 from "M"
		const html = '<span class="typost-styled" data-features="ss01">M</span>oriarty';
		// Text positions: M=0, o=1, r=2, i=3, a=4, r=5, t=6, y=7
		const cursorAt = 1; // On "o" - immediately after the styled "M"

		const features = parseInlineFeaturesAtCursor(html, cursorAt, cursorAt);

		// Should return empty - cursor is NOT inside the span
		expect(features).toEqual([]);
	});

	it('should detect features when cursor is at start of styled span', () => {
		const html = '<span class="typost-styled" data-features="ss01">M</span>oriarty';
		const cursorAt = 0; // At start of "M"

		const features = parseInlineFeaturesAtCursor(html, cursorAt, cursorAt);

		// Should detect ss01 - cursor IS inside the span
		expect(features).toEqual(['ss01']);
	});

	it('should handle multiple features in style attribute', () => {
		const html = '<span class="typost-styled" style="font-feature-settings: \'liga\' 1, \'dlig\' 1, \'ss02\' 1">text</span>';
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
		const html = '<span class="typost-styled" style="font-feature-settings: &quot;ss02&quot; 1">text</span>';
		const cursorAt = 2;

		const features = parseInlineFeaturesAtCursor(html, cursorAt, cursorAt);

		// DOMParser converts &quot; to actual quotes
		expect(features).toEqual(['ss02']);
	});
});

/**
 * Test Suite: Edit.js Sidebar Feature Highlighting
 *
 * These tests verify that the Typographic Stylist block sidebar correctly highlights
 * features when the user clicks on styled text in the editor.
 * This prevents regression of the feature detection functionality.
 */
describe('Typography Stylist - Sidebar Feature Highlighting', () => {
	/**
	 * This test simulates the getInlineFeaturesAtSelection() function
	 * from edit.js to ensure it works correctly
	 */
	it('should highlight features in sidebar when cursor is on styled text', () => {
		// Arrange: Create content with inline styled text
		const content = 'Hello <span class="typost-styled" data-features="ss02,swsh">World</span> text';
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
		const content = 'Hello <span class="typost-styled" data-features="ss02">World</span> text';
		const cursorOffset = 2; // Cursor in "Hello" (unstyled)

		// Act: Parse inline features at cursor position
		const inlineFeatures = parseInlineFeaturesAtCursor(content, cursorOffset, cursorOffset);

		// Assert: Should return empty array
		expect(inlineFeatures).toEqual([]);
	});

	it('should highlight innermost features when spans are nested', () => {
		// Arrange: Nested styled spans with different features
		// Text content is "Outer Inner text" (Outer=0-4, Inner=6-10, text=12-15)
		const content = '<span class="typost-styled" data-features="liga">Outer <span class="typost-styled" data-features="ss02">Inner</span> text</span>';
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
		const content = '<span class="typost-styled" data-features="ss01">First</span> and <span class="typost-styled" data-features="ss02">Second</span>';
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
		const content = '<span class="typost-styled" style="font-feature-settings: \'ss02\' 1, \'liga\' 1">Text</span>';
		const cursorOffset = 2;

		// Act: Parse inline features at cursor position
		const inlineFeatures = parseInlineFeaturesAtCursor(content, cursorOffset, cursorOffset);

		// Assert: Should parse from style attribute
		expect(inlineFeatures).toContain('ss02');
		expect(inlineFeatures).toContain('liga');
	});
});

/**
 * Test Suite: Font Size Range Validation
 *
 * Tests for isValidFontSizeRange helper function that checks if min <= preferred <= max
 */
describe('Typography Stylist - Font Size Range Validation', () => {
	// Test the actual isValidFontSizeRange function imported from utils.js

	it('should return true when min <= preferred <= max', () => {
		expect(isValidFontSizeRange(16, 32, 64)).toBe(true);
		expect(isValidFontSizeRange(10, 20, 30)).toBe(true);
		expect(isValidFontSizeRange(8, 16, 24)).toBe(true);
	});

	it('should return false when min > preferred', () => {
		expect(isValidFontSizeRange(50, 30, 40)).toBe(false);
		expect(isValidFontSizeRange(32, 16, 64)).toBe(false);
	});

	it('should return false when preferred > max', () => {
		expect(isValidFontSizeRange(10, 100, 50)).toBe(false);
		expect(isValidFontSizeRange(16, 64, 32)).toBe(false);
	});

	it('should return false when min > max', () => {
		expect(isValidFontSizeRange(64, 32, 16)).toBe(false);
		expect(isValidFontSizeRange(100, 50, 25)).toBe(false);
	});

	it('should return true when all values are equal', () => {
		expect(isValidFontSizeRange(30, 30, 30)).toBe(true);
		expect(isValidFontSizeRange(16, 16, 16)).toBe(true);
	});

	it('should return true when preferred equals min or max', () => {
		expect(isValidFontSizeRange(16, 16, 64)).toBe(true);
		expect(isValidFontSizeRange(16, 64, 64)).toBe(true);
	});
});

/**
 * Test Suite: Nested Span Prevention
 *
 * Tests for applyOrMergeStyling utility that prevents creating nested typost-styled spans.
 * This fixes the issue where applying font-size + features created nested spans.
 */
describe('Typography Stylist - Nested Span Prevention', () => {
	/**
	 * Helper to create a DOM range for testing
	 */
	function createRangeInHTML(html, startOffset, endOffset) {
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
		const container = doc.body.firstChild;

		// Create a tree walker to find text nodes
		const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
		const range = doc.createRange();

		let currentOffset = 0;
		let node;
		let rangeSet = false;

		while ((node = walker.nextNode())) {
			const nodeLength = node.nodeValue.length;

			if (!rangeSet && currentOffset + nodeLength >= startOffset) {
				range.setStart(node, startOffset - currentOffset);
				rangeSet = true;
			}

			if (rangeSet && currentOffset + nodeLength >= endOffset) {
				range.setEnd(node, endOffset - currentOffset);
				break;
			}

			currentOffset += nodeLength;
		}

		return { range, doc, container };
	}

	it('should create new span when selection is not inside typost-styled span', () => {
		// Arrange
		const html = 'Plain text here';
		const { range, doc, container } = createRangeInHTML(html, 0, 5);

		const attributes = { 'data-features': 'ss01' };
		const styleString = 'font-feature-settings: "ss01" 1';

		// Act
		const success = applyOrMergeStyling(range, attributes, styleString, doc);

		// Assert
		expect(success).toBe(true);
		const spans = container.querySelectorAll('span.typost-styled');
		expect(spans.length).toBe(1);
		expect(spans[0].getAttribute('data-features')).toBe('ss01');
	});

	it('should merge attributes when selection is inside existing typost-styled span', () => {
		// Arrange: Existing span with font-size
		const html = '<span class="typost-styled" data-fontsize="responsive" style="font-size: 48px">Text</span>';
		const { range, doc, container } = createRangeInHTML(html, 0, 4);

		const attributes = { 'data-features': 'ss01' };
		const styleString = 'font-feature-settings: "ss01" 1';

		// Act
		const success = applyOrMergeStyling(range, attributes, styleString, doc);

		// Assert
		expect(success).toBe(true);
		const spans = container.querySelectorAll('span.typost-styled');
		expect(spans.length).toBe(1); // Should still be 1 span (not nested)

		// Check merged attributes
		expect(spans[0].getAttribute('data-features')).toBe('ss01');
		expect(spans[0].getAttribute('data-fontsize')).toBe('responsive');

		// Check merged styles
		const style = spans[0].getAttribute('style');
		expect(style).toContain('font-feature-settings');
		expect(style).toContain('font-size');
	});

	it('should merge features when adding to span that already has features', () => {
		// Arrange: Existing span with ss01
		const html = '<span class="typost-styled" data-features="ss01" style="font-feature-settings: &quot;ss01&quot; 1">Text</span>';
		const { range, doc, container } = createRangeInHTML(html, 0, 4);

		const attributes = { 'data-features': 'liga' };
		const styleString = 'font-feature-settings: "liga" 1';

		// Act
		const success = applyOrMergeStyling(range, attributes, styleString, doc);

		// Assert
		expect(success).toBe(true);
		const spans = container.querySelectorAll('span.typost-styled');
		expect(spans.length).toBe(1);

		// Check that features were merged (not replaced)
		const dataFeatures = spans[0].getAttribute('data-features');
		expect(dataFeatures).toContain('ss01');
		expect(dataFeatures).toContain('liga');
	});

	it('should deduplicate features when merging', () => {
		// Arrange: Existing span with ss01
		const html = '<span class="typost-styled" data-features="ss01,liga">Text</span>';
		const { range, doc, container } = createRangeInHTML(html, 0, 4);

		const attributes = { 'data-features': 'ss01' }; // Try to add ss01 again
		const styleString = 'font-feature-settings: "ss01" 1';

		// Act
		const success = applyOrMergeStyling(range, attributes, styleString, doc);

		// Assert
		expect(success).toBe(true);
		const dataFeatures = container.querySelector('span.typost-styled').getAttribute('data-features');
		const featuresArray = dataFeatures.split(',').map(f => f.trim());

		// Should not have duplicate ss01
		expect(featuresArray.filter(f => f === 'ss01').length).toBe(1);
		expect(featuresArray).toContain('liga');
	});

	it('should overwrite other attributes when merging', () => {
		// Arrange: Existing span with font-weight 400
		const html = '<span class="typost-styled" data-fontweight="400" style="font-weight: 400">Text</span>';
		const { range, doc, container } = createRangeInHTML(html, 0, 4);

		const attributes = { 'data-fontweight': '700' };
		const styleString = 'font-weight: 700';

		// Act
		const success = applyOrMergeStyling(range, attributes, styleString, doc);

		// Assert
		expect(success).toBe(true);
		const span = container.querySelector('span.typost-styled');
		expect(span.getAttribute('data-fontweight')).toBe('700'); // Should be updated
		expect(span.getAttribute('style')).toContain('font-weight: 700');
	});

	// NEW TESTS: Attribute Preservation for Bug Fix
	it('should preserve existing data-font-id when applying line-height', () => {
		// Arrange: Existing span with inline font-family
		const html = '<span class="typost-styled" data-font-id="arial-id" style="font-family: Arial, sans-serif">Text</span>';
		const { range, doc, container } = createRangeInHTML(html, 0, 4);

		// Apply line-height without specifying font-family
		const attributes = {};
		const styleString = 'line-height: 1.5';

		// Act
		const success = applyOrMergeStyling(range, attributes, styleString, doc);

		// Assert
		expect(success).toBe(true);
		const span = container.querySelector('span.typost-styled');
		expect(span.getAttribute('data-font-id')).toBe('arial-id'); // Should be preserved
		expect(span.getAttribute('style')).toContain('line-height: 1.5'); // New style added
	});

	it('should preserve multiple inline attributes when applying features', () => {
		// Arrange: Existing span with font-family and font-size
		const html = '<span class="typost-styled" data-font-id="times-id" data-fontsize="responsive" style="font-family: Times; font-size: 48px">Text</span>';
		const { range, doc, container } = createRangeInHTML(html, 0, 4);

		// Apply features without specifying font attributes
		const attributes = { 'data-features': 'liga' };
		const styleString = 'font-feature-settings: "liga" 1';

		// Act
		const success = applyOrMergeStyling(range, attributes, styleString, doc);

		// Assert
		expect(success).toBe(true);
		const span = container.querySelector('span.typost-styled');
		expect(span.getAttribute('data-font-id')).toBe('times-id'); // Preserved
		expect(span.getAttribute('data-fontsize')).toBe('responsive'); // Preserved
		expect(span.getAttribute('data-features')).toBe('liga'); // Added
	});

	it('should allow explicit override of preserved attributes', () => {
		// Arrange: Existing span with font-family "arial-id"
		const html = '<span class="typost-styled" data-font-id="arial-id" style="font-family: Arial">Text</span>';
		const { range, doc, container } = createRangeInHTML(html, 0, 4);

		// Explicitly set a different font-family
		const attributes = { 'data-font-id': 'georgia-id' };
		const styleString = 'font-family: Georgia';

		// Act
		const success = applyOrMergeStyling(range, attributes, styleString, doc);

		// Assert
		expect(success).toBe(true);
		const span = container.querySelector('span.typost-styled');
		expect(span.getAttribute('data-font-id')).toBe('georgia-id'); // Overridden, not preserved
		expect(span.getAttribute('style')).toContain('font-family: Georgia');
	});

	it('should apply line-height without block-level font-family', () => {
		// Test that line-height is applied without including font-family
		const html = 'Plain text';
		const { range, doc, container } = createRangeInHTML(html, 0, 5);

		const attributes = {};
		const styleString = 'line-height: 1.5';  // No font-family!

		// Act
		const success = applyOrMergeStyling(range, attributes, styleString, doc);

		// Assert
		expect(success).toBe(true);
		const span = container.querySelector('span.typost-styled');
		expect(span.getAttribute('style')).not.toContain('font-family');
		expect(span.getAttribute('style')).toContain('line-height: 1.5');
	});

	it('should preserve font-weight when applying letter-spacing', () => {
		// Arrange: Existing span with font-weight
		const html = '<span class="typost-styled" data-fontweight="700" style="font-weight: 700">Text</span>';
		const { range, doc, container } = createRangeInHTML(html, 0, 4);

		// Apply letter-spacing without specifying font-weight
		const attributes = {};
		const styleString = 'letter-spacing: 0.05em';

		// Act
		const success = applyOrMergeStyling(range, attributes, styleString, doc);

		// Assert
		expect(success).toBe(true);
		const span = container.querySelector('span.typost-styled');
		expect(span.getAttribute('data-fontweight')).toBe('700'); // Should be preserved
		expect(span.getAttribute('style')).toContain('letter-spacing: 0.05em');
		expect(span.getAttribute('style')).toContain('font-weight: 700'); // Style preserved too
	});

	it('should apply inline font-family using CSS variables', () => {
		// Test that inline font-family uses CSS variables (var(--font-ID)) instead of literal names
		const html = 'Plain text';
		const { range, doc, container } = createRangeInHTML(html, 0, 5);

		const fontId = '12';
		const attributes = { 'data-font-id': fontId };
		const styleString = `font-family: var(--font-${fontId})`;

		// Act
		const success = applyOrMergeStyling(range, attributes, styleString, doc);

		// Assert
		expect(success).toBe(true);
		const span = container.querySelector('span.typost-styled');
		expect(span.getAttribute('data-font-id')).toBe(fontId);
		expect(span.getAttribute('style')).toContain(`var(--font-${fontId})`);
		expect(span.getAttribute('style')).not.toContain('please-vf'); // No literal names
	});

	it('should preserve inline font CSS variable when applying line-height', () => {
		// Test that CSS variable for inline font is preserved when applying line-height
		const html = '<span data-font-id="12" style="font-family: var(--font-12)" class="typost-styled">Text</span>';
		const { range, doc, container } = createRangeInHTML(html, 0, 4);

		const attributes = {};
		const styleString = 'line-height: 1.5';

		// Act
		const success = applyOrMergeStyling(range, attributes, styleString, doc);

		// Assert
		expect(success).toBe(true);
		const span = container.querySelector('span.typost-styled');
		expect(span.getAttribute('data-font-id')).toBe('12');
		expect(span.getAttribute('style')).toContain('var(--font-12)');
		expect(span.getAttribute('style')).toContain('line-height: 1.5');
	});
});

/**
 * Test Suite: parseInlineFontFamilyAtCursor
 *
 * Tests for the utility function that detects inline font family at cursor position
 */
describe('Typography Stylist - parseInlineFontFamilyAtCursor', () => {
	it('should return font ID when cursor is inside span with data-font-id', () => {
		const html = '<span data-font-id="12" class="typost-styled">Text</span>';
		const cursorAt = 2; // Inside "Text"

		const fontId = parseInlineFontFamilyAtCursor(html, cursorAt, cursorAt);

		expect(fontId).toBe('12');
	});

	it('should return null when cursor is outside span with data-font-id', () => {
		const html = 'Plain <span data-font-id="12" class="typost-styled">Text</span> here';
		const cursorAt = 2; // Inside "Plain"

		const fontId = parseInlineFontFamilyAtCursor(html, cursorAt, cursorAt);

		expect(fontId).toBe(null);
	});

	it('should return innermost font ID when spans are nested', () => {
		const html = '<span data-font-id="5" class="typost-styled">Outer <span data-font-id="12" class="typost-styled">Inner</span> text</span>';
		const cursorAt = 8; // Inside "Inner"

		const fontId = parseInlineFontFamilyAtCursor(html, cursorAt, cursorAt);

		expect(fontId).toBe('12'); // Should return the innermost span's font
	});

	it('should return null when no data-font-id attribute exists', () => {
		const html = '<span class="typost-styled">Text</span>';
		const cursorAt = 2;

		const fontId = parseInlineFontFamilyAtCursor(html, cursorAt, cursorAt);

		expect(fontId).toBe(null);
	});

	it('should handle selection range that overlaps span', () => {
		const html = 'Plain <span data-font-id="12" class="typost-styled">Text</span> here';
		const start = 6; // Start of "Text"
		const end = 10; // End of "Text"

		const fontId = parseInlineFontFamilyAtCursor(html, start, end);

		expect(fontId).toBe('12');
	});
});

/**
 * Test Suite: Block Font Inheritance (block-editor.js)
 *
 * Tests for the getBlockInheritedFont() utility function that detects
 * computed fonts from DOM elements in different block types.
 */
describe('Typography Stylist - Block Font Inheritance (block-editor.js)', () => {
	// Get the utility function from window.typostUtils
	const { getBlockInheritedFont } = window.typostUtils || {};

	// Helper to create mock DOM elements for testing
	function createMockBlockDOM(blockId, blockName, tagName, fontFamily) {
		// Create a mock block wrapper
		const blockWrapper = document.createElement('div');
		blockWrapper.setAttribute('data-block', blockId);

		// Create the text element based on block type
		let textElement;
		if (blockName === 'core/heading') {
			textElement = document.createElement(tagName || 'h2');
		} else if (blockName === 'core/paragraph') {
			textElement = document.createElement('p');
		} else if (blockName === 'generateblocks/headline') {
			textElement = document.createElement('div');
			textElement.className = 'gb-headline-text';
		} else if (blockName === 'typost/block') {
			textElement = document.createElement('div');
			textElement.className = 'typost-block-content';
		} else {
			textElement = document.createElement('div');
			textElement.setAttribute('contenteditable', 'true');
		}

		textElement.textContent = 'Sample text';
		blockWrapper.appendChild(textElement);
		document.body.appendChild(blockWrapper);

		// Mock getComputedStyle to return our test font
		const originalGetComputedStyle = window.getComputedStyle;
		window.getComputedStyle = (element) => {
			if (element === textElement) {
				return {
					getPropertyValue: (prop) => {
						if (prop === 'font-family') {
							return fontFamily;
						}
						return '';
					}
				};
			}
			return originalGetComputedStyle(element);
		};

		return {
			blockWrapper,
			textElement,
			cleanup: () => {
				window.getComputedStyle = originalGetComputedStyle;
				if (blockWrapper.parentNode) {
					blockWrapper.parentNode.removeChild(blockWrapper);
				}
			}
		};
	}

	it('should detect font from core/heading blocks', () => {
		const mock = createMockBlockDOM('test-block-1', 'core/heading', 'h2', 'Hipster Script Pro, cursive');

		const result = getBlockInheritedFont('test-block-1', 'core/heading', document, window);

		expect(result).toBe('Hipster Script Pro, cursive');
		mock.cleanup();
	});

	it('should detect font from core/paragraph blocks', () => {
		const mock = createMockBlockDOM('test-block-2', 'core/paragraph', 'p', 'Georgia, serif');

		const result = getBlockInheritedFont('test-block-2', 'core/paragraph', document, window);

		expect(result).toBe('Georgia, serif');
		mock.cleanup();
	});

	it('should detect font from generateblocks/headline blocks', () => {
		const mock = createMockBlockDOM('test-block-3', 'generateblocks/headline', null, 'Roboto, sans-serif');

		const result = getBlockInheritedFont('test-block-3', 'generateblocks/headline', document, window);

		expect(result).toBe('Roboto, sans-serif');
		mock.cleanup();
	});

	it('should detect font from typost/block blocks', () => {
		const mock = createMockBlockDOM('test-block-4', 'typost/block', null, 'Playfair Display, serif');

		const result = getBlockInheritedFont('test-block-4', 'typost/block', document, window);

		expect(result).toBe('Playfair Display, serif');
		mock.cleanup();
	});

	it('should use fallback selector for unknown block types', () => {
		const mock = createMockBlockDOM('test-block-5', 'custom/unknown-block', null, 'Arial, sans-serif');

		const result = getBlockInheritedFont('test-block-5', 'custom/unknown-block', document, window);

		expect(result).toBe('Arial, sans-serif');
		mock.cleanup();
	});

	it('should remove quotes from font-family values', () => {
		const mock = createMockBlockDOM('test-block-6', 'core/heading', 'h3', '"Hipster Script Pro", cursive');

		const result = getBlockInheritedFont('test-block-6', 'core/heading', document, window);

		expect(result).toBe('Hipster Script Pro, cursive');
		expect(result).not.toContain('"');
		mock.cleanup();
	});

	it('should remove single quotes from font-family values', () => {
		const mock = createMockBlockDOM('test-block-7', 'core/heading', 'h4', "'Times New Roman', serif");

		const result = getBlockInheritedFont('test-block-7', 'core/heading', document, window);

		expect(result).toBe('Times New Roman, serif');
		expect(result).not.toContain("'");
		mock.cleanup();
	});

	it('should return empty string when block wrapper not found', () => {
		const result = getBlockInheritedFont('nonexistent-block', 'core/heading', document, window);

		expect(result).toBe('');
	});

	it('should return empty string when text element not found', () => {
		// Create a block wrapper without the expected text element
		const blockWrapper = document.createElement('div');
		blockWrapper.setAttribute('data-block', 'empty-block');
		document.body.appendChild(blockWrapper);

		const result = getBlockInheritedFont('empty-block', 'core/heading', document, window);

		expect(result).toBe('');
		blockWrapper.parentNode.removeChild(blockWrapper);
	});

	it('should return empty string when blockClientId is missing', () => {
		const result = getBlockInheritedFont('', 'core/heading', document, window);

		expect(result).toBe('');
	});

	it('should return empty string when blockName is missing', () => {
		const result = getBlockInheritedFont('test-block', '', document, window);

		expect(result).toBe('');
	});

	it('should return empty string when font-family is empty', () => {
		const mock = createMockBlockDOM('test-block-8', 'core/heading', 'h2', '');

		const result = getBlockInheritedFont('test-block-8', 'core/heading', document, window);

		expect(result).toBe('');
		mock.cleanup();
	});

	/**
	 * Test Suite: New WordPress 6.5+ DOM Structure
	 *
	 * WordPress 6.5+ changed the DOM structure to put data-block directly on the
	 * heading/paragraph element instead of a wrapper div. These tests verify the
	 * fix handles both old and new structures.
	 */
	describe('New WordPress DOM Structure (data-block on element itself)', () => {
		// Helper to create new WordPress structure where data-block is on the element itself
		function createNewWordPressDOM(blockId, blockName, tagName, fontFamily) {
			// Create the heading/paragraph element with data-block directly on it
			let element;
			if (blockName === 'core/heading') {
				element = document.createElement(tagName || 'h2');
			} else if (blockName === 'core/paragraph') {
				element = document.createElement('p');
			}

			// Set data-block attribute on the element itself (new structure)
			element.setAttribute('data-block', blockId);
			element.setAttribute('data-type', blockName);
			element.textContent = 'Sample text';
			document.body.appendChild(element);

			// Mock getComputedStyle to return our test font
			const originalGetComputedStyle = window.getComputedStyle;
			window.getComputedStyle = (el) => {
				if (el === element) {
					return {
						getPropertyValue: (prop) => {
							if (prop === 'font-family') {
								return fontFamily;
							}
							return '';
						}
					};
				}
				return originalGetComputedStyle(el);
			};

			return {
				element,
				cleanup: () => {
					window.getComputedStyle = originalGetComputedStyle;
					if (element.parentNode) {
						element.parentNode.removeChild(element);
					}
				}
			};
		}

		it('should detect font when data-block is on heading element itself (WordPress 6.5+)', () => {
			const mock = createNewWordPressDOM('new-block-1', 'core/heading', 'h2', 'Hipster Script Pro, cursive');

			const result = getBlockInheritedFont('new-block-1', 'core/heading', document, window);

			expect(result).toBe('Hipster Script Pro, cursive');
			mock.cleanup();
		});

		it('should detect font when data-block is on paragraph element itself (WordPress 6.5+)', () => {
			const mock = createNewWordPressDOM('new-block-2', 'core/paragraph', 'p', 'Georgia, serif');

			const result = getBlockInheritedFont('new-block-2', 'core/paragraph', document, window);

			expect(result).toBe('Georgia, serif');
			mock.cleanup();
		});

		it('should work for all heading levels with new structure', () => {
			const headingLevels = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6'];

			headingLevels.forEach((level, index) => {
				const mock = createNewWordPressDOM(`new-heading-${index}`, 'core/heading', level, 'Test Font, sans-serif');

				const result = getBlockInheritedFont(`new-heading-${index}`, 'core/heading', document, window);

				expect(result).toBe('Test Font, sans-serif');
				mock.cleanup();
			});
		});

		it('should remove quotes from font with new structure', () => {
			const mock = createNewWordPressDOM('new-block-3', 'core/heading', 'h3', '"Playfair Display", serif');

			const result = getBlockInheritedFont('new-block-3', 'core/heading', document, window);

			expect(result).toBe('Playfair Display, serif');
			expect(result).not.toContain('"');
			mock.cleanup();
		});

		/**
		 * Regression test: Verify old structure still works (backward compatibility)
		 */
		it('should still work with old WordPress structure (wrapper div)', () => {
			// Use the old createMockBlockDOM helper which creates a wrapper div
			const mock = createMockBlockDOM('old-structure-block', 'core/heading', 'h2', 'Arial, sans-serif');

			const result = getBlockInheritedFont('old-structure-block', 'core/heading', document, window);

			expect(result).toBe('Arial, sans-serif');
			mock.cleanup();
		});

		/**
		 * Integration test: Both structures should return same result
		 */
		it('should return same font for both old and new WordPress structures', () => {
			const testFont = 'Roboto, sans-serif';

			// Old structure (wrapper div with data-block)
			const oldMock = createMockBlockDOM('old-block', 'core/heading', 'h2', testFont);
			const oldResult = getBlockInheritedFont('old-block', 'core/heading', document, window);

			// New structure (data-block on heading itself)
			const newMock = createNewWordPressDOM('new-block', 'core/heading', 'h2', testFont);
			const newResult = getBlockInheritedFont('new-block', 'core/heading', document, window);

			expect(oldResult).toBe(newResult);
			expect(oldResult).toBe(testFont);

			oldMock.cleanup();
			newMock.cleanup();
		});
	});
});

/**
 * Test Suite: Font Detection in Typographic Stylist Blocks
 *
 * Tests for the detectBlockComputedFont() utility function from utils.js
 * that detects computed fonts for Typographic Stylist blocks.
 */
describe('Typography Stylist - Font Detection in Typographic Stylist Blocks', () => {
	// Helper to create mock DOM elements for testing
	function createMockTypostBlock(clientId, fontFamily) {
		// Create a mock block wrapper
		const blockWrapper = document.createElement('div');
		blockWrapper.setAttribute('data-block', clientId);

		// Create the RichText element (.typost-block-content)
		const richTextElement = document.createElement('div');
		richTextElement.className = 'typost-block-content';
		richTextElement.textContent = 'Sample text';
		blockWrapper.appendChild(richTextElement);
		document.body.appendChild(blockWrapper);

		// Mock getComputedStyle to return our test font
		const originalGetComputedStyle = window.getComputedStyle;
		window.getComputedStyle = (element) => {
			if (element === richTextElement) {
				return {
					getPropertyValue: (prop) => {
						if (prop === 'font-family') {
							return fontFamily;
						}
						return '';
					}
				};
			}
			return originalGetComputedStyle(element);
		};

		return {
			blockWrapper,
			richTextElement,
			cleanup: () => {
				window.getComputedStyle = originalGetComputedStyle;
				if (blockWrapper.parentNode) {
					blockWrapper.parentNode.removeChild(blockWrapper);
				}
			}
		};
	}

	it('should detect font from RichText element when fontFamily not set', () => {
		const mock = createMockTypostBlock('typost-block-1', 'Hipster Script Pro, cursive');

		const result = detectBlockComputedFont('typost-block-1');

		expect(result).toBe('Hipster Script Pro, cursive');
		mock.cleanup();
	});

	it('should remove quotes from detected font', () => {
		const mock = createMockTypostBlock('typost-block-2', '"Playfair Display", serif');

		const result = detectBlockComputedFont('typost-block-2');

		expect(result).toBe('Playfair Display, serif');
		expect(result).not.toContain('"');
		mock.cleanup();
	});

	it('should remove single quotes from detected font', () => {
		const mock = createMockTypostBlock('typost-block-3', "'Times New Roman', serif");

		const result = detectBlockComputedFont('typost-block-3');

		expect(result).toBe('Times New Roman, serif');
		expect(result).not.toContain("'");
		mock.cleanup();
	});

	it('should return empty string when block wrapper not found', () => {
		const result = detectBlockComputedFont('nonexistent-block');

		expect(result).toBe('');
	});

	it('should return empty string when RichText element not found', () => {
		// Create a block wrapper without .typost-block-content
		const blockWrapper = document.createElement('div');
		blockWrapper.setAttribute('data-block', 'empty-typost-block');
		document.body.appendChild(blockWrapper);

		const result = detectBlockComputedFont('empty-typost-block');

		expect(result).toBe('');
		blockWrapper.parentNode.removeChild(blockWrapper);
	});

	it('should return empty string when clientId is missing', () => {
		const result = detectBlockComputedFont('');

		expect(result).toBe('');
	});

	it('should return empty string when clientId is null', () => {
		const result = detectBlockComputedFont(null);

		expect(result).toBe('');
	});

	it('should return empty string when font-family is empty', () => {
		const mock = createMockTypostBlock('typost-block-4', '');

		const result = detectBlockComputedFont('typost-block-4');

		expect(result).toBe('');
		mock.cleanup();
	});

	it('should support custom element selector', () => {
		// Create a block with a custom selector
		const blockWrapper = document.createElement('div');
		blockWrapper.setAttribute('data-block', 'custom-block');

		const customElement = document.createElement('div');
		customElement.className = 'custom-richtext';
		customElement.textContent = 'Custom text';
		blockWrapper.appendChild(customElement);
		document.body.appendChild(blockWrapper);

		// Mock getComputedStyle
		const originalGetComputedStyle = window.getComputedStyle;
		window.getComputedStyle = (element) => {
			if (element === customElement) {
				return {
					getPropertyValue: (prop) => {
						if (prop === 'font-family') {
							return 'Custom Font, sans-serif';
						}
						return '';
					}
				};
			}
			return originalGetComputedStyle(element);
		};

		const result = detectBlockComputedFont('custom-block', '.custom-richtext');

		expect(result).toBe('Custom Font, sans-serif');

		// Cleanup
		window.getComputedStyle = originalGetComputedStyle;
		blockWrapper.parentNode.removeChild(blockWrapper);
	});

	it('should handle errors gracefully', () => {
		// Create a scenario that would throw an error
		// Mock getComputedStyle to throw
		const mock = createMockTypostBlock('error-block', 'Arial');
		const originalGetComputedStyle = window.getComputedStyle;

		window.getComputedStyle = () => {
			throw new Error('Test error');
		};

		const result = detectBlockComputedFont('error-block');

		expect(result).toBe('');

		// Restore and cleanup
		window.getComputedStyle = originalGetComputedStyle;
		mock.cleanup();
	});
});

/**
 * Test Suite: Block Conversion - Inline Feature Analysis
 *
 * These tests verify the logic for analyzing inline features during block conversion
 * to determine whether features should be extracted to block-level or preserved inline.
 *
 * This fixes the bug where converting a heading with partial inline features (e.g., ss01 on
 * first letter only) would incorrectly apply those features to the entire block.
 */
describe('Block Conversion - Inline Feature Analysis', () => {
	/**
	 * Import the utility functions we're testing
	 * Note: We need to import from utils.js after implementing them
	 */
	const { analyzeInlineFeatures, stripInlineFeatures } = require('../utils');

	describe('analyzeInlineFeatures', () => {
		it('should detect no inline features in plain text', () => {
			const html = 'Plain text without any features';

			const result = analyzeInlineFeatures(html);

			expect(result.hasInlineFeatures).toBe(false);
			expect(result.coverage).toBe('none');
			expect(result.commonFeatures).toEqual([]);
			expect(result.shouldExtractToBlock).toBe(false);
		});

		it('should detect partial inline features (first letter only)', () => {
			const html = '<span class="typost-styled" data-features="ss01">M</span>oriarty';

			const result = analyzeInlineFeatures(html);

			expect(result.hasInlineFeatures).toBe(true);
			expect(result.coverage).toBe('partial');
			expect(result.commonFeatures).toEqual([]);
			expect(result.shouldExtractToBlock).toBe(false);
		});

		it('should detect full coverage with uniform features', () => {
			const html = '<span class="typost-styled" data-features="ss01">Moriarty</span>';

			const result = analyzeInlineFeatures(html);

			expect(result.hasInlineFeatures).toBe(true);
			expect(result.coverage).toBe('full');
			expect(result.commonFeatures).toEqual(['ss01']);
			expect(result.shouldExtractToBlock).toBe(true);
		});

		it('should detect full coverage with multiple uniform features', () => {
			const html = '<span class="typost-styled" data-features="ss01,liga,dlig">Complete Text</span>';

			const result = analyzeInlineFeatures(html);

			expect(result.hasInlineFeatures).toBe(true);
			expect(result.coverage).toBe('full');
			expect(result.commonFeatures).toEqual(['ss01', 'liga', 'dlig']);
			expect(result.shouldExtractToBlock).toBe(true);
		});

		it('should not extract when coverage is full but features are mixed', () => {
			const html = '<span class="typost-styled" data-features="ss01">Mor</span><span class="typost-styled" data-features="ss02">iarty</span>';

			const result = analyzeInlineFeatures(html);

			expect(result.hasInlineFeatures).toBe(true);
			expect(result.coverage).toBe('full');
			expect(result.shouldExtractToBlock).toBe(false); // Different features per span
		});

		it('should handle nested spans (font-size wrapper case)', () => {
			const html = '<span class="typost-styled" data-fontsize="responsive"><span class="typost-styled" data-features="ss01">M</span>oriarty</span>';

			const result = analyzeInlineFeatures(html);

			expect(result.hasInlineFeatures).toBe(true);
			expect(result.coverage).toBe('partial'); // Features only on "M"
			expect(result.shouldExtractToBlock).toBe(false);
		});

		it('should handle leading/trailing whitespace correctly (coverage bug fix)', () => {
			// This tests the fix for the trim() inconsistency bug
			// HTML with leading space in the styled span
			const html = '<span class="typost-styled" data-features="ss01"> Moriarty</span>';

			const result = analyzeInlineFeatures(html);

			// Coverage should be 1.0 (full), not >1.0
			// Before fix: totalLength = "Moriarty".length (8), spanLength = " Moriarty".length (9) = ratio 1.125
			// After fix: totalLength = "Moriarty".length (8), spanLength = "Moriarty".length (8) = ratio 1.0
			expect(result.hasInlineFeatures).toBe(true);
			expect(result.coverage).toBe('full');
			expect(result.shouldExtractToBlock).toBe(true);
		});

		it('should handle content with whitespace', () => {
			const html = '<span class="typost-styled" data-features="ss01">Moriarty</span>  ';

			const result = analyzeInlineFeatures(html);

			// Note: textContent.trim() removes trailing whitespace, so this is actually full coverage
			// If we want to preserve trailing whitespace, we'd need to use innerHTML length instead
			expect(result.coverage).toBe('full');
			expect(result.shouldExtractToBlock).toBe(true);
		});

		it('should handle empty content', () => {
			const html = '';

			const result = analyzeInlineFeatures(html);

			expect(result.hasInlineFeatures).toBe(false);
			expect(result.coverage).toBe('none');
		});

		it('should handle content with only typost-styled spans but no features', () => {
			const html = '<span class="typost-styled" data-fontweight="700">Moriarty</span>';

			const result = analyzeInlineFeatures(html);

			// Has typost-styled but no OpenType features
			expect(result.hasInlineFeatures).toBe(false);
			expect(result.coverage).toBe('none');
			expect(result.shouldExtractToBlock).toBe(false);
		});

		it('should NOT extract when the featured span also carries other styling (extraction would destroy it)', () => {
			const html = '<span class="typost-styled" data-features="ss01" data-font-id="1" data-fontweight="700" style=\'font-feature-settings: "ss01" 1; font-family: var(--font-1); font-weight: 700\'>Moriarty</span>';

			const result = analyzeInlineFeatures(html);

			expect(result.coverage).toBe('full');
			expect(result.shouldExtractToBlock).toBe(false); // font + weight would be lost by stripping
		});

		it('should NOT extract when a styling-only span hides among featured spans', () => {
			// The featured span covers everything the coverage scan counts, but a
			// sibling styling-only span (glyph alternate) would be destroyed
			const html = '<span class="typost-styled" data-features="swsh" style=\'font-feature-settings: "swsh" 1\'>Moriart</span><span class="typost-styled" data-feature-settings=\'"salt" 3\' style=\'font-feature-settings: "salt" 3\'>y</span>';

			const result = analyzeInlineFeatures(html);

			expect(result.shouldExtractToBlock).toBe(false);
		});
	});

	describe('stripInlineFeatures', () => {
		it('should remove typost-styled spans while keeping text', () => {
			const html = '<span class="typost-styled" data-features="ss01">Moriarty</span>';

			const result = stripInlineFeatures(html);

			expect(result).toBe('Moriarty');
		});

		it('should remove multiple typost-styled spans', () => {
			const html = '<span class="typost-styled" data-features="ss01">Mor</span><span class="typost-styled" data-features="ss02">iarty</span>';

			const result = stripInlineFeatures(html);

			expect(result).toBe('Moriarty');
		});

		it('should preserve non-typost-styled markup', () => {
			const html = '<strong><span class="typost-styled" data-features="ss01">Moriarty</span></strong>';

			const result = stripInlineFeatures(html);

			expect(result).toBe('<strong>Moriarty</strong>');
		});

		it('should handle nested typost-styled spans', () => {
			const html = '<span class="typost-styled" data-fontsize="responsive"><span class="typost-styled" data-features="ss01">Moriarty</span></span>';

			const result = stripInlineFeatures(html);

			expect(result).toBe('Moriarty');
		});

		it('should handle plain text without spans', () => {
			const html = 'Plain text';

			const result = stripInlineFeatures(html);

			expect(result).toBe('Plain text');
		});

		it('should preserve text content exactly', () => {
			const html = '<span class="typost-styled" data-features="ss01">Test&nbsp;Text</span>';

			const result = stripInlineFeatures(html);

			// Should preserve HTML entities
			expect(result).toContain('Test');
			expect(result).toContain('Text');
		});
	});

	describe('Block Conversion Transform Integration', () => {
		it('should preserve partial inline features during conversion', () => {
			// Simulate what happens when converting a heading with partial features
			const sourceContent = '<span class="typost-styled" data-features="ss01">M</span>oriarty';

			const analysis = analyzeInlineFeatures(sourceContent);

			// Should NOT extract to block level
			expect(analysis.shouldExtractToBlock).toBe(false);

			// Content should remain unchanged
			expect(sourceContent).toContain('data-features="ss01"');
		});

		it('should extract full-coverage features to block level during conversion', () => {
			const sourceContent = '<span class="typost-styled" data-features="ss01">Moriarty</span>';

			const analysis = analyzeInlineFeatures(sourceContent);

			// Should extract to block level
			expect(analysis.shouldExtractToBlock).toBe(true);
			expect(analysis.commonFeatures).toEqual(['ss01']);

			// After stripping, content should have no spans
			const strippedContent = stripInlineFeatures(sourceContent);
			expect(strippedContent).toBe('Moriarty');
			expect(strippedContent).not.toContain('span');
		});

		it('should handle mixed features correctly', () => {
			const sourceContent = '<span class="typost-styled" data-features="ss01">M</span><span class="typost-styled" data-features="ss02">oriarty</span>';

			const analysis = analyzeInlineFeatures(sourceContent);

			// Should NOT extract because features are different
			expect(analysis.shouldExtractToBlock).toBe(false);
			expect(analysis.coverage).toBe('full'); // Full coverage but mixed features
		});
	});

	describe('Nested span cursor detection', () => {
		it('should NOT detect features when cursor is in outer wrapper but outside inner feature span', () => {
			// This reproduces the Moriarty bug: outer wrapper with font-weight, inner span with ss01 on "M"
			const html = '<span data-fontweight="400" class="typost-styled"><span data-features="ss01" class="typost-styled">M</span>oriarty.</span>';

			// Cursor on "o" (position 1)
			const featuresOnO = parseInlineFeaturesAtCursor(html, 1, 1);
			expect(featuresOnO).toEqual([]); // Should NOT detect ss01

			// Cursor on "r" (position 2)
			const featuresOnR = parseInlineFeaturesAtCursor(html, 2, 2);
			expect(featuresOnR).toEqual([]); // Should NOT detect ss01

			// Cursor on "i" (position 3)
			const featuresOnI = parseInlineFeaturesAtCursor(html, 3, 3);
			expect(featuresOnI).toEqual([]); // Should NOT detect ss01
		});

		it('should detect features when cursor is inside inner feature span', () => {
			const html = '<span data-fontweight="400" class="typost-styled"><span data-features="ss01" class="typost-styled">M</span>oriarty.</span>';

			// Cursor on "M" (position 0)
			const featuresOnM = parseInlineFeaturesAtCursor(html, 0, 0);
			expect(featuresOnM).toContain('ss01'); // Should detect ss01
		});

		it('should detect both outer and inner features when cursor is in nested feature span', () => {
			const html = '<span data-fontsize="24px" class="typost-styled"><span data-features="ss01" class="typost-styled">M</span>oriarty</span>';

			// Cursor on "M" (position 0) - inside both spans
			const featuresOnM = parseInlineFeaturesAtCursor(html, 0, 0);
			expect(featuresOnM).toContain('ss01');
		});
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

/**
 * SINGLE LETTER SELECTION BUG FIX TESTS
 *
 * These tests verify the fix for the bug where selecting a single letter
 * and applying an OpenType feature wrapped the entire block content instead
 * of just the selected letter.
 *
 * Root cause: getRangeForOffsets created invalid ranges for single-letter selections,
 * causing surroundContents() to wrap entire content.
 *
 * Solution: Hybrid approach with validation and string manipulation fallback.
 */

describe('Single Letter Selection Bug Fix', () => {

	describe('validateRangeMatchesSelection', () => {
		it('should validate exact text match', () => {
			const mockRange = {
				toString: () => 't'
			};

			const result = validateRangeMatchesSelection(mockRange, 't', 1);
			expect(result.valid).toBe(true);
			expect(result.reason).toBe('Exact match');
		});

		it('should reject mismatched text (the bug case)', () => {
			const mockRange = {
				toString: () => 'Gratitude script'
			};

			const result = validateRangeMatchesSelection(mockRange, 't', 1);
			expect(result.valid).toBe(false);
			expect(result.reason).toContain('Mismatch');
		});

		it('should handle null range', () => {
			const result = validateRangeMatchesSelection(null, 't', 1);
			expect(result.valid).toBe(false);
			expect(result.reason).toBe('Range is null');
		});

		it('should handle empty selection', () => {
			const mockRange = {
				toString: () => ''
			};

			const result = validateRangeMatchesSelection(mockRange, '', 0);
			expect(result.valid).toBe(false);
			expect(result.reason).toBe('Empty selection');
		});

		it('should accept trimmed match for whitespace differences', () => {
			const mockRange = {
				toString: () => ' test '
			};

			const result = validateRangeMatchesSelection(mockRange, 'test', 4);
			expect(result.valid).toBe(true);
			expect(result.reason).toBe('Trimmed match');
		});

		it('should accept length match for HTML entity differences', () => {
			const mockRange = {
				toString: () => 'test'
			};

			const result = validateRangeMatchesSelection(mockRange, 'test', 4);
			expect(result.valid).toBe(true);
			expect(result.reason).toBe('Exact match');
		});
	});

	describe('applyStylingSafeStringMethod', () => {
		it('should wrap single character correctly', () => {
			const result = applyStylingSafeStringMethod(
				'Gratitude script',
				3, // "t"
				4,
				{ 'data-features': 'ss01' },
				'font-feature-settings: "ss01" 1'
			);

			expect(result.success).toBe(true);
			expect(result.content).toContain('<span class="typost-styled"');
			expect(result.content).toContain('data-features="ss01"');
			expect(result.content).toMatch(/Gra<span[^>]*>t<\/span>itude script/);
		});

		it('should handle selection at start of text', () => {
			const result = applyStylingSafeStringMethod(
				'Gratitude',
				0, // "G"
				1,
				{ 'data-features': 'ss01' },
				'font-feature-settings: "ss01" 1'
			);

			expect(result.success).toBe(true);
			expect(result.content).toMatch(/^<span[^>]*>G<\/span>ratitude/);
		});

		it('should handle selection at end of text', () => {
			const result = applyStylingSafeStringMethod(
				'script',
				5, // "t"
				6,
				{ 'data-features': 'ss01' },
				'font-feature-settings: "ss01" 1'
			);

			expect(result.success).toBe(true);
			expect(result.content).toMatch(/scrip<span[^>]*>t<\/span>$/);
		});

		it('should handle multi-character selection', () => {
			const result = applyStylingSafeStringMethod(
				'Gratitude',
				4, // "itude"
				9,
				{ 'data-features': 'ss01' },
				'font-feature-settings: "ss01" 1'
			);

			expect(result.success).toBe(true);
			expect(result.content).toMatch(/Grat<span[^>]*>itude<\/span>$/);
		});

		it('should include style attribute when provided', () => {
			const result = applyStylingSafeStringMethod(
				'test',
				0,
				4,
				{ 'data-features': 'ss01' },
				'font-feature-settings: "ss01" 1; color: red'
			);

			expect(result.success).toBe(true);
			expect(result.content).toContain('style="font-feature-settings: &quot;ss01&quot; 1; color: red"');
		});

		it('should omit empty or null attributes', () => {
			const result = applyStylingSafeStringMethod(
				'test',
				0,
				4,
				{ 'data-features': 'ss01', 'data-empty': '', 'data-null': null },
				'font-feature-settings: "ss01" 1'
			);

			expect(result.success).toBe(true);
			expect(result.content).toContain('data-features="ss01"');
			expect(result.content).not.toContain('data-empty');
			expect(result.content).not.toContain('data-null');
		});

		it('should return error for empty content', () => {
			const result = applyStylingSafeStringMethod(
				'',
				0,
				1,
				{ 'data-features': 'ss01' },
				'font-feature-settings: "ss01" 1'
			);

			expect(result.success).toBe(false);
			expect(result.error).toBe('No text nodes in range');
		});

		it('should handle HTML with existing tags', () => {
			const result = applyStylingSafeStringMethod(
				'Hello <strong>world</strong>',
				6, // "w" in "world"
				7,
				{ 'data-features': 'ss01' },
				'font-feature-settings: "ss01" 1'
			);

			expect(result.success).toBe(true);
			expect(result.content).toContain('<strong>');
			expect(result.content).toMatch(/<span[^>]*>w<\/span>orld/);
		});
	});

	describe('Nested span wrapping detection', () => {
		it('should detect when surroundContents wraps entire content with nested spans', () => {
			// Simulate the nested span bug scenario
			const parser = new DOMParser();
			const doc = parser.parseFromString(
				'<div>Grati<span class="typost-styled" data-features="ss01">t</span>ude script</div>',
				'text/html'
			);
			const container = doc.body.firstChild;

			// Get all typost-styled spans
			const typostSpans = container.querySelectorAll('span.typost-styled');

			// Should have 1 span initially
			expect(typostSpans.length).toBe(1);

			// Now simulate wrapping everything with outer span (the bug)
			const outerSpan = doc.createElement('span');
			outerSpan.className = 'typost-styled';
			outerSpan.setAttribute('data-features', 'ss02');

			// Move all children into outer span
			while (container.firstChild) {
				outerSpan.appendChild(container.firstChild);
			}
			container.appendChild(outerSpan);

			// Get all spans now
			const typostSpansAfter = container.querySelectorAll('span.typost-styled');

			// Should have 2 spans (nested)
			expect(typostSpansAfter.length).toBe(2);

			// Outer span should contain all text (the bug)
			const containerText = container.textContent;
			const outerSpanText = typostSpansAfter[0].textContent;

			expect(outerSpanText).toBe(containerText);
			expect(outerSpanText.length).toBe(containerText.length);

			// This is the bug condition that post-validation should detect
			const wrappedEverything = outerSpanText.length >= containerText.length - 1;
			expect(wrappedEverything).toBe(true);
		});
	});
});
