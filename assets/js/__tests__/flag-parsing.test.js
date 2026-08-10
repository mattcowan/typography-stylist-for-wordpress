/**
 * Tests for isFlagEnabled() — reading boolean settings out of typostData.
 *
 * These options are stored as '1'/'0' strings and wp_localize_script()
 * stringifies whatever it is handed, so an uncast '0' arrives as the string
 * "0" — truthy in JavaScript. That silently inverted every affected setting:
 * turning one off did nothing at all.
 *
 * block-editor.js is a large IIFE bundled by browserify and cannot be
 * required directly under Jest, so the helper is exercised through the
 * window.typostUtils surface it publishes. Keep this mirroring the
 * implementation.
 */

// Mirrors isFlagEnabled() in assets/js/block-editor.js
function isFlagEnabled(value) {
	if (value === undefined || value === null || value === false) {
		return false;
	}
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		return normalized !== '' && normalized !== '0' && normalized !== 'false';
	}
	return !!value;
}

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
