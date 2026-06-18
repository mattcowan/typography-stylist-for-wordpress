/**
 * Glyphs Panel — IndexedDB Metadata Cache
 *
 * Caches font METADATA only (codepoint lists, feature maps — see metadata.js).
 * No outline/path/SVG data is ever stored. Client-side only; nothing is
 * written to the WordPress database.
 *
 * Invalidation:
 * - Uploaded kits live in timestamped kit-* directories, so re-uploading a
 *   kit changes the file URL and therefore the cache key (natural invalidation).
 * - Schema or plugin version changes invalidate on read.
 * - Adobe/manual sources get a 7-day TTL (their files can change in place).
 *
 * Falls back to an in-memory Map when IndexedDB is unavailable (private mode).
 *
 * Pure helpers (makeCacheKey, isValidEntry) are unit-tested; the IDB wrapper
 * is browser-only.
 *
 * Dual export: window.typostGlyphs.* for the browser, module.exports for Jest.
 */
(function() {
	'use strict';

	var DB_NAME = 'typost-glyphs-panel';
	var DB_VERSION = 1;
	var STORE = 'fonts';
	var MAX_ENTRIES = 30;
	var MUTABLE_SOURCE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

	/**
	 * Build the cache key for a font.
	 *
	 * @param {number} fontId  Numeric font_id
	 * @param {string} fileUrl Resolved font file URL
	 * @return {string}
	 */
	function makeCacheKey(fontId, fileUrl) {
		return String(fontId || 0) + '|' + (fileUrl || '');
	}

	/**
	 * Validate a cached metadata entry.
	 *
	 * @param {Object|null} entry   Cached metadata
	 * @param {Object} opts         {schema, pluginVersion, now}
	 * @return {boolean}
	 */
	function isValidEntry(entry, opts) {
		if (!entry || !opts) {
			return false;
		}
		if (entry.schema !== opts.schema) {
			return false;
		}
		if (entry.pluginVersion !== opts.pluginVersion) {
			return false;
		}
		// Mutable sources (files can change without the URL changing) expire
		if (entry.source !== 'uploaded') {
			var age = (opts.now || 0) - (entry.parsedAt || 0);
			if (age < 0 || age > MUTABLE_SOURCE_TTL_MS) {
				return false;
			}
		}
		return true;
	}

	// -------------------------------------------------------------------------
	// Browser-only IDB wrapper with in-memory fallback
	// -------------------------------------------------------------------------

	var memoryFallback = null; // Map when IDB unavailable
	var dbPromise = null;

	function openDb() {
		if (memoryFallback) {
			return Promise.resolve(null);
		}
		if (dbPromise) {
			return dbPromise;
		}
		dbPromise = new Promise(function(resolve) {
			var idb = (typeof indexedDB !== 'undefined') ? indexedDB : null;
			if (!idb) {
				memoryFallback = new Map();
				resolve(null);
				return;
			}
			try {
				var request = idb.open(DB_NAME, DB_VERSION);
				request.onupgradeneeded = function(e) {
					var db = e.target.result;
					if (!db.objectStoreNames.contains(STORE)) {
						var store = db.createObjectStore(STORE, { keyPath: 'cacheKey' });
						store.createIndex('parsedAt', 'parsedAt');
					}
				};
				request.onsuccess = function(e) {
					resolve(e.target.result);
				};
				request.onerror = function() {
					memoryFallback = new Map();
					resolve(null);
				};
			} catch (e) {
				memoryFallback = new Map();
				resolve(null);
			}
		});
		return dbPromise;
	}

	function getMeta(cacheKey) {
		return openDb().then(function(db) {
			if (!db) {
				return memoryFallback.get(cacheKey) || null;
			}
			return new Promise(function(resolve) {
				try {
					var tx = db.transaction(STORE, 'readonly');
					var request = tx.objectStore(STORE).get(cacheKey);
					request.onsuccess = function() {
						resolve(request.result || null);
					};
					request.onerror = function() {
						resolve(null);
					};
				} catch (e) {
					resolve(null);
				}
			});
		});
	}

	function putMeta(entry) {
		if (!entry || !entry.cacheKey) {
			return Promise.resolve(false);
		}
		return openDb().then(function(db) {
			if (!db) {
				memoryFallback.set(entry.cacheKey, entry);
				return true;
			}
			return new Promise(function(resolve) {
				try {
					var tx = db.transaction(STORE, 'readwrite');
					tx.objectStore(STORE).put(entry);
					tx.oncomplete = function() {
						resolve(true);
					};
					tx.onerror = function() {
						resolve(false);
					};
				} catch (e) {
					resolve(false);
				}
			}).then(function(ok) {
				if (ok) {
					prune();
				}
				return ok;
			});
		});
	}

	function deleteMeta(cacheKey) {
		return openDb().then(function(db) {
			if (!db) {
				memoryFallback.delete(cacheKey);
				return true;
			}
			return new Promise(function(resolve) {
				try {
					var tx = db.transaction(STORE, 'readwrite');
					tx.objectStore(STORE).delete(cacheKey);
					tx.oncomplete = function() {
						resolve(true);
					};
					tx.onerror = function() {
						resolve(false);
					};
				} catch (e) {
					resolve(false);
				}
			});
		});
	}

	/**
	 * Keep only the MAX_ENTRIES most recently parsed entries.
	 */
	function prune() {
		return openDb().then(function(db) {
			if (!db) {
				return;
			}
			return new Promise(function(resolve) {
				try {
					var tx = db.transaction(STORE, 'readwrite');
					var store = tx.objectStore(STORE);
					var getAll = store.getAll();
					getAll.onsuccess = function() {
						var entries = getAll.result || [];
						if (entries.length <= MAX_ENTRIES) {
							resolve();
							return;
						}
						entries.sort(function(a, b) {
							return (b.parsedAt || 0) - (a.parsedAt || 0);
						});
						entries.slice(MAX_ENTRIES).forEach(function(entry) {
							store.delete(entry.cacheKey);
						});
						resolve();
					};
					getAll.onerror = function() {
						resolve();
					};
				} catch (e) {
					resolve();
				}
			});
		});
	}

	var api = {
		makeCacheKey: makeCacheKey,
		isValidEntry: isValidEntry,
		MUTABLE_SOURCE_TTL_MS: MUTABLE_SOURCE_TTL_MS,
		MAX_CACHE_ENTRIES: MAX_ENTRIES,
		cache: {
			get: getMeta,
			put: putMeta,
			remove: deleteMeta,
			prune: prune
		}
	};

	if (typeof window !== 'undefined') {
		window.typostGlyphs = window.typostGlyphs || {};
		Object.assign(window.typostGlyphs, api);
	}
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = api;
	}
})();
