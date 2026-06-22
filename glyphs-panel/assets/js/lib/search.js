/**
 * Glyphs Panel — Search & Filter
 *
 * Pure functions for searching and filtering glyph grid items.
 *
 * Grid item shapes:
 *   { type: 'char', cp: 65 }                                  — encoded character
 *   { type: 'char', cp: 65, feature: 'ss01' }                 — character in a feature view
 *   { type: 'lig',  text: 'fi', cps: [102, 105], feature: 'dlig' } — ligature
 *
 * Dual export: window.typostGlyphs.* for the browser, module.exports for Jest.
 */
(function() {
	'use strict';

	/**
	 * Static Unicode block table for filtering. Intentionally coarse —
	 * a curated set of typographically relevant blocks, not the full
	 * Unicode block database. Items outside all ranges fall into 'other'.
	 */
	var UNICODE_BLOCKS = [
		{ id: 'basic-latin', label: 'Basic Latin', start: 0x0020, end: 0x007F },
		{ id: 'latin-1', label: 'Latin-1 Supplement', start: 0x0080, end: 0x00FF },
		{ id: 'latin-ext-a', label: 'Latin Extended-A', start: 0x0100, end: 0x017F },
		{ id: 'latin-ext-b', label: 'Latin Extended-B', start: 0x0180, end: 0x024F },
		{ id: 'ipa', label: 'IPA Extensions', start: 0x0250, end: 0x02AF },
		{ id: 'spacing-modifiers', label: 'Spacing Modifier Letters', start: 0x02B0, end: 0x02FF },
		{ id: 'diacritics', label: 'Combining Diacritical Marks', start: 0x0300, end: 0x036F },
		{ id: 'greek', label: 'Greek and Coptic', start: 0x0370, end: 0x03FF },
		{ id: 'cyrillic', label: 'Cyrillic', start: 0x0400, end: 0x04FF },
		{ id: 'hebrew', label: 'Hebrew', start: 0x0590, end: 0x05FF },
		{ id: 'arabic', label: 'Arabic', start: 0x0600, end: 0x06FF },
		{ id: 'latin-ext-additional', label: 'Latin Extended Additional', start: 0x1E00, end: 0x1EFF },
		{ id: 'punctuation', label: 'General Punctuation', start: 0x2000, end: 0x206F },
		{ id: 'super-sub', label: 'Superscripts and Subscripts', start: 0x2070, end: 0x209F },
		{ id: 'currency', label: 'Currency Symbols', start: 0x20A0, end: 0x20CF },
		{ id: 'letterlike', label: 'Letterlike Symbols', start: 0x2100, end: 0x214F },
		{ id: 'number-forms', label: 'Number Forms', start: 0x2150, end: 0x218F },
		{ id: 'arrows', label: 'Arrows', start: 0x2190, end: 0x21FF },
		{ id: 'math-operators', label: 'Mathematical Operators', start: 0x2200, end: 0x22FF },
		{ id: 'geometric-shapes', label: 'Geometric Shapes', start: 0x25A0, end: 0x25FF },
		{ id: 'misc-symbols', label: 'Miscellaneous Symbols', start: 0x2600, end: 0x26FF },
		{ id: 'dingbats', label: 'Dingbats', start: 0x2700, end: 0x27BF },
		{ id: 'ligatures-area', label: 'Alphabetic Presentation Forms', start: 0xFB00, end: 0xFB4F },
		{ id: 'private-use', label: 'Private Use Area', start: 0xE000, end: 0xF8FF }
	];

	/**
	 * Find the block ID for a codepoint, or 'other' if outside all blocks.
	 *
	 * @param {number} cp Unicode codepoint
	 * @return {string} Block ID
	 */
	function blockForCodepoint(cp) {
		for (var i = 0; i < UNICODE_BLOCKS.length; i++) {
			if (cp >= UNICODE_BLOCKS[i].start && cp <= UNICODE_BLOCKS[i].end) {
				return UNICODE_BLOCKS[i].id;
			}
		}
		return 'other';
	}

	/**
	 * Parse a search query into a structured form.
	 *
	 * Supported forms:
	 *   ''            → { type: 'empty' }
	 *   'U+0041'/'u41' → { type: 'codepoint', cp: 65 }
	 *   'Aa'          → { type: 'text', cps: [65, 97], raw: 'Aa' }
	 *
	 * @param {string} query Raw search input
	 * @return {Object} Parsed query
	 */
	function parseSearchQuery(query) {
		var raw = (query || '').trim();
		if (!raw) {
			return { type: 'empty' };
		}

		var hexMatch = raw.match(/^u\+?([0-9a-f]{1,6})$/i);
		if (hexMatch) {
			return { type: 'codepoint', cp: parseInt(hexMatch[1], 16) };
		}

		// Treat each character (codepoint-aware) as a literal to match
		var cps = Array.from(raw).map(function(ch) {
			return ch.codePointAt(0);
		});
		return { type: 'text', cps: cps, raw: raw };
	}

	/**
	 * Filter grid items by Unicode block.
	 *
	 * Ligature items match a block when their FIRST component codepoint
	 * falls inside it (pragmatic — ligatures rarely matter for block browsing).
	 *
	 * @param {Array} items   Grid items
	 * @param {string} blockId Block ID, or 'all'
	 * @return {Array} Filtered items
	 */
	function filterByBlock(items, blockId) {
		if (!blockId || blockId === 'all') {
			return items;
		}
		return items.filter(function(item) {
			var cp = item.type === 'lig' ? (item.cps && item.cps[0]) : item.cp;
			if (typeof cp !== 'number') {
				return false;
			}
			return blockForCodepoint(cp) === blockId;
		});
	}

	/**
	 * Filter grid items by a search query.
	 *
	 * - codepoint query: exact codepoint match
	 * - short text query (1-2 characters): char items matching any query
	 *   character; ligature items whose text contains the raw query
	 * - long text query (3+ characters): glyph name substring match (when
	 *   names are available) and ligature text match — per-character matching
	 *   is disabled so name searches like "swash" don't match every 'a'/'s'
	 *
	 * @param {Array} items        Grid items
	 * @param {string} query       Raw search input
	 * @param {Object|null} names  Optional codepoint(string) → glyph name map
	 * @return {Array} Filtered items
	 */
	function filterBySearch(items, query, names) {
		var parsed = parseSearchQuery(query);
		if (parsed.type === 'empty') {
			return items;
		}

		if (parsed.type === 'codepoint') {
			return items.filter(function(item) {
				if (item.type === 'lig') {
					return (item.cps || []).indexOf(parsed.cp) !== -1;
				}
				return item.cp === parsed.cp;
			});
		}

		// Text query
		var isShortQuery = parsed.cps.length <= 2;
		var cpSet = {};
		parsed.cps.forEach(function(cp) {
			cpSet[cp] = true;
		});
		var lowerQuery = parsed.raw.toLowerCase();
		var useNameSearch = names && !isShortQuery;

		return items.filter(function(item) {
			if (item.type === 'lig') {
				return item.text && item.text.indexOf(parsed.raw) !== -1;
			}
			if (isShortQuery && cpSet[item.cp]) {
				return true;
			}
			if (useNameSearch) {
				var name = names[String(item.cp)];
				return !!(name && name.toLowerCase().indexOf(lowerQuery) !== -1);
			}
			return false;
		});
	}

	/**
	 * Build the grid cells contributed by a single feature entry.
	 *
	 * A feature entry may carry any combination of codepoints (single
	 * substitutions), alts (indexed alternate sets), and ligatures — compose
	 * the cells from whatever is present.
	 *
	 * @param {Object} feature Feature metadata entry
	 * @param {string} tag     Feature tag (stamped onto each item)
	 * @return {Array} Grid items
	 */
	function featureItems(feature, tag) {
		var items = [];

		(feature.codepoints || []).forEach(function(cp) {
			items.push({ type: 'char', cp: cp, feature: tag });
		});

		// One cell per alternate index — each renders the base character
		// with e.g. font-feature-settings: "salt" 2
		Object.keys(feature.alts || {}).map(function(cpKey) {
			return parseInt(cpKey, 10);
		}).sort(function(a, b) { return a - b; }).forEach(function(cp) {
			var count = feature.alts[String(cp)];
			for (var i = 1; i <= count; i++) {
				items.push({ type: 'char', cp: cp, feature: tag, altIndex: i, altCount: count });
			}
		});

		(feature.ligatures || []).forEach(function(lig) {
			items.push({ type: 'lig', text: lig.text, cps: lig.components, feature: tag });
		});

		return items;
	}

	/**
	 * Build the base grid items for a font + optional feature filter.
	 *
	 * With no feature filter, the default "All glyphs" view lists the font's
	 * encoded characters first, then every feature's variants appended after.
	 * This surfaces OpenType-only glyphs (e.g. an alternate 'g') that would
	 * otherwise be reachable only via the feature dropdown or the alternates
	 * box. Variants render as their base character with font-feature-settings,
	 * so only feature-reachable glyphs appear — glyphs with no codepoint and no
	 * feature path remain unrenderable as text.
	 *
	 * @param {Object} meta        Font metadata (see metadata.js)
	 * @param {string|null} featureTag Feature tag to filter by, or null for all glyphs
	 * @return {Array} Grid items
	 */
	function buildGridItems(meta, featureTag) {
		if (!meta) {
			return [];
		}

		if (!featureTag) {
			var items = (meta.codepoints || []).map(function(cp) {
				return { type: 'char', cp: cp };
			});
			var features = meta.features || {};
			Object.keys(features).sort().forEach(function(tag) {
				items = items.concat(featureItems(features[tag], tag));
			});
			return items;
		}

		var feature = meta.features && meta.features[featureTag];
		if (!feature) {
			return [];
		}

		return featureItems(feature, featureTag);
	}

	/**
	 * Build the "alternates for a character" item list: the base character
	 * followed by one cell per feature variant that affects it.
	 *
	 * - 'sub' features covering the codepoint → one cell rendered with the feature
	 * - 'alt' features → one cell per alternate index ("salt" 1..N)
	 * - 'lig' features → ligatures containing the codepoint
	 *
	 * @param {Object} meta Font metadata (see metadata.js)
	 * @param {number} cp   Base character codepoint
	 * @return {Array} Grid items (empty when meta is missing or cp not in the font)
	 */
	function buildAlternateItems(meta, cp) {
		if (!meta || typeof cp !== 'number') {
			return [];
		}
		if ((meta.codepoints || []).indexOf(cp) === -1) {
			return [];
		}

		var items = [{ type: 'char', cp: cp }];
		var ligItems = [];

		Object.keys(meta.features || {}).sort().forEach(function(tag) {
			var feature = meta.features[tag];
			// Field-driven: a feature entry may carry any combination of
			// codepoints, alts, and ligatures (mixed-lookup tags like aalt)
			if ((feature.codepoints || []).indexOf(cp) !== -1) {
				items.push({ type: 'char', cp: cp, feature: tag });
			}
			var count = (feature.alts || {})[String(cp)];
			for (var i = 1; i <= (count || 0); i++) {
				items.push({ type: 'char', cp: cp, feature: tag, altIndex: i, altCount: count });
			}
			(feature.ligatures || []).forEach(function(lig) {
				if ((lig.components || []).indexOf(cp) !== -1) {
					ligItems.push({ type: 'lig', text: lig.text, cps: lig.components, feature: tag });
				}
			});
		});

		return items.concat(ligItems);
	}

	/**
	 * Count items per Unicode block (for the block filter dropdown).
	 *
	 * @param {Array} items Grid items
	 * @return {Object} blockId → count, including 'other' and 'all'
	 */
	function countByBlock(items) {
		var counts = { all: items.length };
		items.forEach(function(item) {
			var cp = item.type === 'lig' ? (item.cps && item.cps[0]) : item.cp;
			if (typeof cp !== 'number') {
				return;
			}
			var id = blockForCodepoint(cp);
			counts[id] = (counts[id] || 0) + 1;
		});
		return counts;
	}

	var api = {
		UNICODE_BLOCKS: UNICODE_BLOCKS,
		blockForCodepoint: blockForCodepoint,
		parseSearchQuery: parseSearchQuery,
		filterByBlock: filterByBlock,
		filterBySearch: filterBySearch,
		buildGridItems: buildGridItems,
		buildAlternateItems: buildAlternateItems,
		countByBlock: countByBlock
	};

	if (typeof window !== 'undefined') {
		window.typostGlyphs = window.typostGlyphs || {};
		Object.assign(window.typostGlyphs, api);
	}
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = api;
	}
})();
