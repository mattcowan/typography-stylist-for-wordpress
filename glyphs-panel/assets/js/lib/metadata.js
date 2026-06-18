/**
 * Glyphs Panel — Font Metadata Builder
 *
 * Builds a lightweight metadata structure from a parsed opentype.js Font.
 *
 * EULA note: this extracts METADATA ONLY — which codepoints exist (cmap)
 * and which OpenType features substitute which characters (GSUB). No glyph
 * outline, path, or SVG data is ever read, computed, or stored.
 *
 * Pure with respect to its inputs (takes a parsed font object + info),
 * so it is fully unit-testable with mocked font table structures.
 *
 * Dual export: window.typostGlyphs.* for the browser, module.exports for Jest.
 */
(function() {
	'use strict';

	var METADATA_SCHEMA = 2;

	/**
	 * Expand an opentype.js GSUB coverage table to an array of glyph IDs.
	 *
	 * @param {Object} coverage Coverage table: {format: 1, glyphs: []} or
	 *                          {format: 2, ranges: [{start, end, index}]}
	 * @return {number[]} Glyph IDs
	 */
	function coverageToGlyphs(coverage) {
		if (!coverage) {
			return [];
		}
		if (coverage.format === 1) {
			return coverage.glyphs || [];
		}
		if (coverage.format === 2) {
			var glyphs = [];
			(coverage.ranges || []).forEach(function(range) {
				for (var gid = range.start; gid <= range.end; gid++) {
					glyphs.push(gid);
				}
			});
			return glyphs;
		}
		return [];
	}

	/**
	 * Build a reverse glyphId → codepoint map from a cmap glyphIndexMap.
	 * First codepoint wins when multiple codepoints map to one glyph.
	 *
	 * @param {Object} glyphIndexMap codepoint(string|number) → glyphId
	 * @return {Object} glyphId(string) → codepoint(number)
	 */
	function buildReverseCmap(glyphIndexMap) {
		var reverse = {};
		Object.keys(glyphIndexMap || {}).forEach(function(cpKey) {
			var gid = glyphIndexMap[cpKey];
			if (reverse[String(gid)] === undefined) {
				reverse[String(gid)] = parseInt(cpKey, 10);
			}
		});
		return reverse;
	}

	/**
	 * Collect glyph names for encoded codepoints when the font provides
	 * meaningful names (post table v2 or CFF). Generic generated names
	 * (gid123, glyph123) don't count.
	 *
	 * @param {Object} font          Parsed opentype.js font
	 * @param {Object} glyphIndexMap codepoint → glyphId
	 * @return {Object|null} codepoint(string) → name, or null if names are meaningless
	 */
	function collectGlyphNames(font, glyphIndexMap) {
		if (!font.glyphs || typeof font.glyphs.get !== 'function') {
			return null;
		}
		var names = {};
		var meaningful = 0;
		var total = 0;
		Object.keys(glyphIndexMap || {}).forEach(function(cpKey) {
			var gid = glyphIndexMap[cpKey];
			var glyph;
			try {
				glyph = font.glyphs.get(gid);
			} catch (e) {
				return;
			}
			var name = glyph && glyph.name;
			total++;
			if (name && typeof name === 'string' && !/^(gid|glyph)\d+$/i.test(name)) {
				names[cpKey] = name;
				meaningful++;
			}
		});
		// Require a reasonable share of meaningful names — post v3 fonts
		// produce all-generic names, which would only pollute search
		if (total === 0 || meaningful / total < 0.5) {
			return null;
		}
		return names;
	}

	/**
	 * Walk GSUB features and lookups, accumulating per-feature substitution maps.
	 *
	 * Handles lookup types:
	 *   1 — Single substitution (stylistic sets, swashes, small caps, ...)
	 *   3 — Alternate substitution (salt, aalt)
	 *   4 — Ligature substitution (liga, dlig, ...)
	 * Types 2/5/6 (multiple/contextual) are counted in skippedLookups.
	 *
	 * @param {Object} gsub        font.tables.gsub
	 * @param {Object} reverseCmap glyphId(string) → codepoint
	 * @param {Object} labels      Optional feature tag → display name map
	 * @return {{features: Object, skippedLookups: number}}
	 */
	function buildFeatureMaps(gsub, reverseCmap, labels) {
		var features = {};
		var skipped = 0;
		var skippedSeen = {};

		if (!gsub || !gsub.features || !gsub.lookups) {
			return { features: features, skippedLookups: 0 };
		}

		var cpFor = function(gid) {
			var cp = reverseCmap[String(gid)];
			return typeof cp === 'number' ? cp : null;
		};

		gsub.features.forEach(function(featureRecord) {
			var tag = featureRecord.tag;
			var lookupIndexes = featureRecord.feature && featureRecord.feature.lookupListIndexes;
			if (!tag || !lookupIndexes) {
				return;
			}

			lookupIndexes.forEach(function(lookupIndex) {
				var lookup = gsub.lookups[lookupIndex];
				if (!lookup) {
					return;
				}

				if (lookup.lookupType === 1) {
					// Single substitution — covered glyphs with codepoints
					var entry1 = ensureFeature(features, tag, labels);
					(lookup.subtables || []).forEach(function(subtable) {
						coverageToGlyphs(subtable.coverage).forEach(function(gid) {
							var cp = cpFor(gid);
							if (cp !== null) {
								entry1._cpSet[cp] = true;
							}
						});
					});
				} else if (lookup.lookupType === 3) {
					// Alternate substitution — codepoint → alternate count
					var entry3 = ensureFeature(features, tag, labels);
					(lookup.subtables || []).forEach(function(subtable) {
						var covered = coverageToGlyphs(subtable.coverage);
						(subtable.alternateSets || []).forEach(function(alts, coverageIndex) {
							var gid = covered[coverageIndex];
							if (gid === undefined) {
								return;
							}
							var cp = cpFor(gid);
							if (cp !== null) {
								var key = String(cp);
								entry3.alts[key] = Math.max(entry3.alts[key] || 0, (alts || []).length);
							}
						});
					});
				} else if (lookup.lookupType === 4) {
					// Ligature substitution — component sequences
					var entry4 = ensureFeature(features, tag, labels);
					(lookup.subtables || []).forEach(function(subtable) {
						var firstGlyphs = coverageToGlyphs(subtable.coverage);
						(subtable.ligatureSets || []).forEach(function(ligatureSet, coverageIndex) {
							var firstGid = firstGlyphs[coverageIndex];
							if (firstGid === undefined) {
								return;
							}
							var firstCp = cpFor(firstGid);
							if (firstCp === null) {
								return;
							}
							(ligatureSet || []).forEach(function(ligature) {
								var cps = [firstCp];
								var allEncoded = true;
								(ligature.components || []).forEach(function(gid) {
									var cp = cpFor(gid);
									if (cp === null) {
										allEncoded = false;
									} else {
										cps.push(cp);
									}
								});
								// Skip ligatures with unencoded components — they
								// cannot be inserted as text
								if (!allEncoded || cps.length < 2) {
									return;
								}
								var text = String.fromCodePoint.apply(String, cps);
								if (!entry4._ligSeen[text]) {
									entry4._ligSeen[text] = true;
									entry4.ligatures.push({ components: cps, text: text });
								}
							});
						});
					});
				} else {
					// Contextual / multiple substitution — out of scope
					if (!skippedSeen[lookupIndex]) {
						skippedSeen[lookupIndex] = true;
						skipped++;
					}
				}
			});
		});

		// Finalize. A tag may mix lookup types (aalt commonly uses type 1 AND
		// type 3) — each entry keeps all populated fields:
		//   codepoints — chars covered by single substitution
		//   alts       — char → alternate count (type-1-only chars fold in as 1
		//                when any type-3 alternates exist for the tag)
		//   ligatures  — component sequences
		// `type` is the primary kind for labeling: 'alt' > 'sub' > 'lig'.
		Object.keys(features).forEach(function(tag) {
			var entry = features[tag];
			var cps = Object.keys(entry._cpSet).map(Number).sort(function(a, b) { return a - b; });
			delete entry._cpSet;
			delete entry._ligSeen;

			var hasAlts = Object.keys(entry.alts).length > 0;
			var hasLigs = entry.ligatures.length > 0;

			if (hasAlts) {
				// Single-substitution chars become 1-alternate entries
				cps.forEach(function(cp) {
					if (!entry.alts[String(cp)]) {
						entry.alts[String(cp)] = 1;
					}
				});
				entry.type = 'alt';
				delete entry.codepoints;
			} else if (cps.length > 0) {
				entry.type = 'sub';
				entry.codepoints = cps;
				delete entry.alts;
			} else if (hasLigs) {
				entry.type = 'lig';
				delete entry.alts;
			} else {
				delete features[tag];
				return;
			}
			if (!hasLigs) {
				delete entry.ligatures;
			}
		});

		return { features: features, skippedLookups: skipped };
	}

	/**
	 * Get or create a feature entry. All substitution kinds accumulate on the
	 * same entry; finalize() decides the primary type and prunes empty fields.
	 */
	function ensureFeature(features, tag, labels) {
		if (!features[tag]) {
			features[tag] = {
				label: (labels && labels[tag]) || tag,
				type: '',
				_cpSet: {},
				alts: {},
				ligatures: [],
				_ligSeen: {}
			};
		}
		return features[tag];
	}

	/**
	 * Build the complete metadata structure for a parsed font.
	 *
	 * @param {Object} font Parsed opentype.js Font (tables.cmap required)
	 * @param {Object} info {fontId, source, family, fileUrl, byteLength,
	 *                       partialCoverage, featureLabels, pluginVersion, parsedAt}
	 * @return {Object|null} Metadata (see shape below), or null if the font has no cmap
	 *
	 * Shape:
	 * {
	 *   schema, cacheKey, fontId, source, family, fileUrl, byteLength,
	 *   parsedAt, pluginVersion, partialCoverage, hasGlyphNames,
	 *   codepoints: [int...], names: {cp: name}|null,
	 *   features: { tag: {label, type: 'sub'|'alt'|'lig', ...} },
	 *   skippedLookups
	 * }
	 */
	function buildFontMetadata(font, info) {
		info = info || {};
		var glyphIndexMap = font && font.tables && font.tables.cmap && font.tables.cmap.glyphIndexMap;
		if (!glyphIndexMap) {
			return null;
		}

		var codepoints = Object.keys(glyphIndexMap)
			.map(function(k) { return parseInt(k, 10); })
			.filter(function(cp) { return isFinite(cp) && cp >= 0x20; }) // skip control codes
			.sort(function(a, b) { return a - b; });

		var reverseCmap = buildReverseCmap(glyphIndexMap);
		var names = collectGlyphNames(font, glyphIndexMap);
		var gsubResult = buildFeatureMaps(font.tables.gsub, reverseCmap, info.featureLabels);

		return {
			schema: METADATA_SCHEMA,
			cacheKey: String(info.fontId || 0) + '|' + (info.fileUrl || ''),
			fontId: info.fontId || 0,
			source: info.source || 'uploaded',
			family: info.family || '',
			fileUrl: info.fileUrl || '',
			byteLength: info.byteLength || 0,
			parsedAt: info.parsedAt || 0,
			pluginVersion: info.pluginVersion || '',
			partialCoverage: !!info.partialCoverage,
			hasGlyphNames: !!names,
			codepoints: codepoints,
			names: names,
			features: gsubResult.features,
			skippedLookups: gsubResult.skippedLookups
		};
	}

	var api = {
		METADATA_SCHEMA: METADATA_SCHEMA,
		coverageToGlyphs: coverageToGlyphs,
		buildReverseCmap: buildReverseCmap,
		buildFontMetadata: buildFontMetadata
	};

	// Attach to self (covers both window and Web Worker scopes — the parse
	// worker imports this module via importScripts)
	var root = (typeof self !== 'undefined') ? self : ((typeof window !== 'undefined') ? window : null);
	if (root) {
		root.typostGlyphs = root.typostGlyphs || {};
		Object.assign(root.typostGlyphs, api);
	}
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = api;
	}
})();
