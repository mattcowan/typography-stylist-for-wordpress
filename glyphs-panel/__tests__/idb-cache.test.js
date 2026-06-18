/**
 * Tests for the pure cache helpers (makeCacheKey, isValidEntry).
 * The IndexedDB wrapper itself is browser-only and exercised manually.
 */

const { makeCacheKey, isValidEntry, MUTABLE_SOURCE_TTL_MS } = require('../assets/js/lib/idb-cache.js');

describe('makeCacheKey', () => {
	test('combines fontId and file URL', () => {
		expect(makeCacheKey(12, 'https://x.test/f.woff2')).toBe('12|https://x.test/f.woff2');
	});

	test('handles missing values', () => {
		expect(makeCacheKey(0, '')).toBe('0|');
		expect(makeCacheKey(null, null)).toBe('0|');
	});
});

describe('isValidEntry', () => {
	const NOW = 1700000000000;
	const OPTS = { schema: 1, pluginVersion: '1.0.0', now: NOW };

	function entry(overrides) {
		return Object.assign({
			schema: 1,
			pluginVersion: '1.0.0',
			source: 'uploaded',
			parsedAt: NOW - 1000
		}, overrides);
	}

	test('valid uploaded entry passes regardless of age', () => {
		expect(isValidEntry(entry(), OPTS)).toBe(true);
		expect(isValidEntry(entry({ parsedAt: NOW - 365 * 24 * 3600 * 1000 }), OPTS)).toBe(true);
	});

	test('schema mismatch invalidates', () => {
		expect(isValidEntry(entry({ schema: 0 }), OPTS)).toBe(false);
	});

	test('plugin version mismatch invalidates', () => {
		expect(isValidEntry(entry({ pluginVersion: '0.9.0' }), OPTS)).toBe(false);
	});

	test('adobe entries expire after the TTL', () => {
		const fresh = entry({ source: 'adobe', parsedAt: NOW - MUTABLE_SOURCE_TTL_MS + 1000 });
		const stale = entry({ source: 'adobe', parsedAt: NOW - MUTABLE_SOURCE_TTL_MS - 1000 });
		expect(isValidEntry(fresh, OPTS)).toBe(true);
		expect(isValidEntry(stale, OPTS)).toBe(false);
	});

	test('manual entries expire after the TTL', () => {
		const stale = entry({ source: 'manual', parsedAt: NOW - MUTABLE_SOURCE_TTL_MS - 1 });
		expect(isValidEntry(stale, OPTS)).toBe(false);
	});

	test('future parsedAt (clock skew) invalidates mutable sources', () => {
		expect(isValidEntry(entry({ source: 'adobe', parsedAt: NOW + 60000 }), OPTS)).toBe(false);
	});

	test('null entry or opts invalidates', () => {
		expect(isValidEntry(null, OPTS)).toBe(false);
		expect(isValidEntry(entry(), null)).toBe(false);
	});
});
