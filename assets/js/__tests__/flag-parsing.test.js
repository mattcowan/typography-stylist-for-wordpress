/**
 * Tests for isFlagEnabled() — reading boolean settings out of typostData.
 *
 * These options are stored as '1'/'0' strings and wp_localize_script()
 * stringifies whatever it is handed, so an uncast '0' arrives as the string
 * "0" — truthy in JavaScript. That silently inverted every affected setting:
 * turning one off did nothing at all.
 *
 * The helper lives in assets/js/inline-editor/sanitize.js (#357), which this
 * test requires directly, so it tests the real function rather than a copy.
 * block-editor.js also publishes it on window.typostUtils.
 */

const { isFlagEnabled } = require('../inline-editor/sanitize.js');

describe('isFlagEnabled', () => {
	test('the string "0" is off — the bug this exists to prevent', () => {
		expect(isFlagEnabled('0')).toBe(false);
	});

	test('the string "1" is on', () => {
		expect(isFlagEnabled('1')).toBe(true);
	});

	test('an empty string is off, which is how a cast PHP false localizes', () => {
		expect(isFlagEnabled('')).toBe(false);
	});

	test('real booleans pass through', () => {
		expect(isFlagEnabled(true)).toBe(true);
		expect(isFlagEnabled(false)).toBe(false);
	});

	test('a missing setting is off, not a crash', () => {
		expect(isFlagEnabled(undefined)).toBe(false);
		expect(isFlagEnabled(null)).toBe(false);
	});

	test('"false" and "true" strings are read as written', () => {
		expect(isFlagEnabled('false')).toBe(false);
		expect(isFlagEnabled('true')).toBe(true);
	});

	test('surrounding whitespace and case do not change the answer', () => {
		expect(isFlagEnabled(' 0 ')).toBe(false);
		expect(isFlagEnabled('FALSE')).toBe(false);
		expect(isFlagEnabled(' 1 ')).toBe(true);
	});

	test('numbers behave like booleans', () => {
		expect(isFlagEnabled(0)).toBe(false);
		expect(isFlagEnabled(1)).toBe(true);
	});
});
