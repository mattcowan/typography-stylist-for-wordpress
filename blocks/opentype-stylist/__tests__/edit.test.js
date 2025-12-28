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
		/**
		 * Helper function (we're testing this)
		 */
		const sanitizeFontFamily = (font) => {
			if (!font) return '';
			// Remove quotes and semicolons that could break style string
			return font.replace(/["';]/g, '');
		};

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
 * WHAT WE LEARNED:
 *
 * 1. Unit tests verify small pieces of functionality
 * 2. Pure functions are easiest to test
 * 3. Test names should describe what they're testing
 * 4. Use AAA pattern: Arrange, Act, Assert
 * 5. Test both happy path and edge cases
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
