/**
 * Tests for buildFontMetadata() — cmap, glyph names, and GSUB parsing
 * against hand-mocked opentype.js font structures.
 */

const { buildFontMetadata, coverageToGlyphs, buildReverseCmap, METADATA_SCHEMA } = require('../assets/js/lib/metadata.js');

/**
 * Mock font factory. glyphIndexMap maps codepoint(string) → glyphId.
 * names maps glyphId → name.
 */
function mockFont({ glyphIndexMap, gsub, names = {}, postVersion = 2 }) {
	return {
		tables: {
			cmap: { glyphIndexMap },
			post: { version: postVersion },
			gsub
		},
		glyphs: {
			get(gid) {
				return { name: names[gid] };
			}
		}
	};
}

const INFO = {
	fontId: 12,
	source: 'uploaded',
	family: 'TestFont',
	fileUrl: 'https://example.test/fonts/test.woff2',
	byteLength: 1234,
	partialCoverage: false,
	featureLabels: { ss01: 'Stylistic Set 1', dlig: 'Discretionary Ligatures', salt: 'Stylistic Alternates' },
	pluginVersion: '1.0.0',
	parsedAt: 1700000000000
};

describe('coverageToGlyphs', () => {
	test('expands format 1 (glyph list)', () => {
		expect(coverageToGlyphs({ format: 1, glyphs: [5, 9, 12] })).toEqual([5, 9, 12]);
	});

	test('expands format 2 (ranges)', () => {
		expect(coverageToGlyphs({ format: 2, ranges: [{ start: 3, end: 5 }, { start: 10, end: 10 }] }))
			.toEqual([3, 4, 5, 10]);
	});

	test('returns empty for null/unknown coverage', () => {
		expect(coverageToGlyphs(null)).toEqual([]);
		expect(coverageToGlyphs({ format: 9 })).toEqual([]);
	});
});

describe('buildReverseCmap', () => {
	test('reverses codepoint→glyph map, first codepoint wins on collision', () => {
		const reverse = buildReverseCmap({ '65': 10, '97': 11, '0x66_dupe': NaN });
		expect(reverse['10']).toBe(65);
		expect(reverse['11']).toBe(97);
	});
});

describe('buildFontMetadata — cmap and basics', () => {
	test('returns null when font has no cmap', () => {
		expect(buildFontMetadata({ tables: {} }, INFO)).toBeNull();
	});

	test('builds sorted codepoint list, skipping control codes', () => {
		const font = mockFont({
			glyphIndexMap: { '97': 2, '65': 1, '13': 99, '8212': 3 } // includes CR (U+000D)
		});
		const meta = buildFontMetadata(font, INFO);
		expect(meta.codepoints).toEqual([65, 97, 8212]);
	});

	test('carries info fields and cache key', () => {
		const font = mockFont({ glyphIndexMap: { '65': 1 } });
		const meta = buildFontMetadata(font, INFO);
		expect(meta.schema).toBe(METADATA_SCHEMA);
		expect(meta.cacheKey).toBe('12|https://example.test/fonts/test.woff2');
		expect(meta.fontId).toBe(12);
		expect(meta.source).toBe('uploaded');
		expect(meta.family).toBe('TestFont');
		expect(meta.partialCoverage).toBe(false);
		expect(meta.pluginVersion).toBe('1.0.0');
		expect(meta.parsedAt).toBe(1700000000000);
	});
});

describe('buildFontMetadata — glyph names', () => {
	test('collects meaningful names (post v2 style)', () => {
		const font = mockFont({
			glyphIndexMap: { '65': 1, '97': 2 },
			names: { 1: 'A', 2: 'a' }
		});
		const meta = buildFontMetadata(font, INFO);
		expect(meta.hasGlyphNames).toBe(true);
		expect(meta.names).toEqual({ '65': 'A', '97': 'a' });
	});

	test('rejects generic generated names (post v3 style)', () => {
		const font = mockFont({
			glyphIndexMap: { '65': 1, '97': 2 },
			names: { 1: 'gid1', 2: 'glyph2' }
		});
		const meta = buildFontMetadata(font, INFO);
		expect(meta.hasGlyphNames).toBe(false);
		expect(meta.names).toBeNull();
	});
});

describe('buildFontMetadata — GSUB lookup type 1 (single substitution)', () => {
	test('collects covered codepoints for a stylistic set (coverage format 1)', () => {
		const font = mockFont({
			glyphIndexMap: { '65': 1, '97': 2, '98': 3 },
			gsub: {
				features: [{ tag: 'ss01', feature: { lookupListIndexes: [0] } }],
				lookups: [{
					lookupType: 1,
					subtables: [{ substFormat: 1, coverage: { format: 1, glyphs: [1, 2] }, deltaGlyphId: 100 }]
				}]
			}
		});
		const meta = buildFontMetadata(font, INFO);
		expect(meta.features.ss01).toEqual({
			label: 'Stylistic Set 1',
			type: 'sub',
			codepoints: [65, 97]
		});
	});

	test('collects covered codepoints with coverage format 2 ranges', () => {
		const font = mockFont({
			glyphIndexMap: { '65': 1, '66': 2, '67': 3 },
			gsub: {
				features: [{ tag: 'swsh', feature: { lookupListIndexes: [0] } }],
				lookups: [{
					lookupType: 1,
					subtables: [{ substFormat: 2, coverage: { format: 2, ranges: [{ start: 1, end: 3 }] }, substitute: [10, 11, 12] }]
				}]
			}
		});
		const meta = buildFontMetadata(font, INFO);
		// 'swsh' is not in featureLabels — falls back to raw tag
		expect(meta.features.swsh.label).toBe('swsh');
		expect(meta.features.swsh.codepoints).toEqual([65, 66, 67]);
	});

	test('skips covered glyphs with no codepoint (unencoded glyphs)', () => {
		const font = mockFont({
			glyphIndexMap: { '65': 1 }, // glyph 2 is unencoded
			gsub: {
				features: [{ tag: 'ss02', feature: { lookupListIndexes: [0] } }],
				lookups: [{
					lookupType: 1,
					subtables: [{ coverage: { format: 1, glyphs: [1, 2] } }]
				}]
			}
		});
		const meta = buildFontMetadata(font, INFO);
		expect(meta.features.ss02.codepoints).toEqual([65]);
	});
});

describe('buildFontMetadata — GSUB lookup type 3 (alternate substitution)', () => {
	test('records alternate counts per codepoint', () => {
		const font = mockFont({
			glyphIndexMap: { '65': 1, '97': 2 },
			gsub: {
				features: [{ tag: 'salt', feature: { lookupListIndexes: [0] } }],
				lookups: [{
					lookupType: 3,
					subtables: [{
						coverage: { format: 1, glyphs: [1, 2] },
						alternateSets: [[201, 202, 203], [301]]
					}]
				}]
			}
		});
		const meta = buildFontMetadata(font, INFO);
		expect(meta.features.salt).toEqual({
			label: 'Stylistic Alternates',
			type: 'alt',
			alts: { '65': 3, '97': 1 }
		});
	});
});

describe('buildFontMetadata — GSUB lookup type 4 (ligature substitution)', () => {
	test('builds ligature component sequences with text', () => {
		// f=glyph 10 (cp 102), i=glyph 11 (cp 105), l=glyph 12 (cp 108)
		const font = mockFont({
			glyphIndexMap: { '102': 10, '105': 11, '108': 12 },
			gsub: {
				features: [{ tag: 'dlig', feature: { lookupListIndexes: [0] } }],
				lookups: [{
					lookupType: 4,
					subtables: [{
						coverage: { format: 1, glyphs: [10] },
						ligatureSets: [[
							{ ligGlyph: 500, components: [11] },        // fi
							{ ligGlyph: 501, components: [11, 12] }     // fil → actually f+i+l
						]]
					}]
				}]
			}
		});
		const meta = buildFontMetadata(font, INFO);
		expect(meta.features.dlig.type).toBe('lig');
		expect(meta.features.dlig.ligatures).toEqual([
			{ components: [102, 105], text: 'fi' },
			{ components: [102, 105, 108], text: 'fil' }
		]);
	});

	test('skips ligatures with unencoded components', () => {
		const font = mockFont({
			glyphIndexMap: { '102': 10 }, // component glyph 99 unencoded
			gsub: {
				features: [{ tag: 'liga', feature: { lookupListIndexes: [0] } }],
				lookups: [{
					lookupType: 4,
					subtables: [{
						coverage: { format: 1, glyphs: [10] },
						ligatureSets: [[{ ligGlyph: 500, components: [99] }]]
					}]
				}]
			}
		});
		const meta = buildFontMetadata(font, INFO);
		expect(meta.features.liga).toBeUndefined(); // empty feature dropped
	});
});

describe('buildFontMetadata — skipped lookups and edge cases', () => {
	test('counts contextual/multiple lookups (types 2/5/6) as skipped', () => {
		const font = mockFont({
			glyphIndexMap: { '65': 1 },
			gsub: {
				features: [
					{ tag: 'calt', feature: { lookupListIndexes: [0, 1] } },
					{ tag: 'ss01', feature: { lookupListIndexes: [2] } }
				],
				lookups: [
					{ lookupType: 6, subtables: [] },
					{ lookupType: 5, subtables: [] },
					{ lookupType: 1, subtables: [{ coverage: { format: 1, glyphs: [1] } }] }
				]
			}
		});
		const meta = buildFontMetadata(font, INFO);
		expect(meta.skippedLookups).toBe(2);
		expect(meta.features.ss01.codepoints).toEqual([65]);
		expect(meta.features.calt).toBeUndefined();
	});

	test('same lookup referenced by multiple feature records (script variants) merges', () => {
		const font = mockFont({
			glyphIndexMap: { '65': 1, '97': 2 },
			gsub: {
				features: [
					{ tag: 'ss01', feature: { lookupListIndexes: [0] } }, // latn
					{ tag: 'ss01', feature: { lookupListIndexes: [0, 1] } } // DFLT
				],
				lookups: [
					{ lookupType: 1, subtables: [{ coverage: { format: 1, glyphs: [1] } }] },
					{ lookupType: 1, subtables: [{ coverage: { format: 1, glyphs: [2] } }] }
				]
			}
		});
		const meta = buildFontMetadata(font, INFO);
		expect(meta.features.ss01.codepoints).toEqual([65, 97]);
	});

	test('font without GSUB yields empty features', () => {
		const font = mockFont({ glyphIndexMap: { '65': 1 } });
		const meta = buildFontMetadata(font, INFO);
		expect(meta.features).toEqual({});
		expect(meta.skippedLookups).toBe(0);
	});
});

describe('buildFontMetadata — mixed lookup types per tag (aalt pattern)', () => {
	test('type 1 + type 3 under the same tag merge into alts (singles fold in as 1)', () => {
		// aalt commonly mixes single substitutions (one alternate) with
		// alternate sets (several alternates) — both must survive
		const font = mockFont({
			glyphIndexMap: { '65': 1, '97': 2, '98': 3 },
			gsub: {
				features: [{ tag: 'aalt', feature: { lookupListIndexes: [0, 1] } }],
				lookups: [
					{ lookupType: 1, subtables: [{ coverage: { format: 1, glyphs: [2, 3] } }] },
					{
						lookupType: 3,
						subtables: [{
							coverage: { format: 1, glyphs: [1] },
							alternateSets: [[201, 202, 203]]
						}]
					}
				]
			}
		});
		const meta = buildFontMetadata(font, INFO);
		expect(meta.features.aalt.type).toBe('alt');
		expect(meta.features.aalt.alts).toEqual({ '65': 3, '97': 1, '98': 1 });
		expect(meta.features.aalt.codepoints).toBeUndefined();
	});

	test('sub + ligatures under the same tag keep both fields', () => {
		const font = mockFont({
			glyphIndexMap: { '65': 1, '102': 10, '105': 11 },
			gsub: {
				features: [{ tag: 'ss01', feature: { lookupListIndexes: [0, 1] } }],
				lookups: [
					{ lookupType: 1, subtables: [{ coverage: { format: 1, glyphs: [1] } }] },
					{
						lookupType: 4,
						subtables: [{
							coverage: { format: 1, glyphs: [10] },
							ligatureSets: [[{ ligGlyph: 500, components: [11] }]]
						}]
					}
				]
			}
		});
		const meta = buildFontMetadata(font, INFO);
		expect(meta.features.ss01.type).toBe('sub');
		expect(meta.features.ss01.codepoints).toEqual([65]);
		expect(meta.features.ss01.ligatures).toEqual([{ components: [102, 105], text: 'fi' }]);
	});
});
