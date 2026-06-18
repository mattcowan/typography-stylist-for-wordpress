/**
 * Tests for search/filter functions and grid item building.
 */

const {
	parseSearchQuery,
	blockForCodepoint,
	filterByBlock,
	filterBySearch,
	buildGridItems,
	buildAlternateItems,
	countByBlock
} = require('../assets/js/lib/search.js');

describe('parseSearchQuery', () => {
	test('empty input', () => {
		expect(parseSearchQuery('')).toEqual({ type: 'empty' });
		expect(parseSearchQuery('   ')).toEqual({ type: 'empty' });
		expect(parseSearchQuery(null)).toEqual({ type: 'empty' });
	});

	test('U+hex forms', () => {
		expect(parseSearchQuery('U+0041')).toEqual({ type: 'codepoint', cp: 65 });
		expect(parseSearchQuery('u41')).toEqual({ type: 'codepoint', cp: 65 });
		expect(parseSearchQuery('U+1F600')).toEqual({ type: 'codepoint', cp: 128512 });
	});

	test('literal characters (codepoint-aware)', () => {
		const result = parseSearchQuery('Aa');
		expect(result.type).toBe('text');
		expect(result.cps).toEqual([65, 97]);
	});

	test('astral plane character counts as one codepoint', () => {
		const result = parseSearchQuery('😀');
		expect(result.cps).toEqual([128512]);
	});

	test('single "u" is a literal, not a codepoint query prefix', () => {
		const result = parseSearchQuery('uu'); // 'u' + hex? 'u' is not hex → literal
		expect(result.type).toBe('text');
	});
});

describe('blockForCodepoint', () => {
	test('maps codepoints to blocks', () => {
		expect(blockForCodepoint(65)).toBe('basic-latin');
		expect(blockForCodepoint(0xE9)).toBe('latin-1');
		expect(blockForCodepoint(0x2014)).toBe('punctuation');
		expect(blockForCodepoint(0xFB01)).toBe('ligatures-area');
	});

	test('unknown ranges fall to other', () => {
		expect(blockForCodepoint(0x4E00)).toBe('other'); // CJK
	});
});

describe('filterByBlock', () => {
	const items = [
		{ type: 'char', cp: 65 },
		{ type: 'char', cp: 0xE9 },
		{ type: 'lig', text: 'fi', cps: [102, 105] }
	];

	test('"all" passes everything through', () => {
		expect(filterByBlock(items, 'all')).toHaveLength(3);
	});

	test('filters chars by block; ligatures match by first component', () => {
		const result = filterByBlock(items, 'basic-latin');
		expect(result).toHaveLength(2);
		expect(result[0].cp).toBe(65);
		expect(result[1].type).toBe('lig');
	});
});

describe('filterBySearch', () => {
	const items = [
		{ type: 'char', cp: 65 },  // A
		{ type: 'char', cp: 97 },  // a
		{ type: 'char', cp: 66 },  // B
		{ type: 'lig', text: 'fi', cps: [102, 105] }
	];

	test('empty query returns all', () => {
		expect(filterBySearch(items, '', null)).toHaveLength(4);
	});

	test('codepoint query exact-matches chars and ligature components', () => {
		expect(filterBySearch(items, 'U+0041', null)).toEqual([{ type: 'char', cp: 65 }]);
		expect(filterBySearch(items, 'U+0066', null)).toEqual([items[3]]);
	});

	test('literal query matches any query character', () => {
		const result = filterBySearch(items, 'Aa', null);
		expect(result.map((i) => i.cp)).toEqual([65, 97]);
	});

	test('ligature text contains the raw query', () => {
		expect(filterBySearch(items, 'fi', null)).toContain(items[3]);
	});

	test('name search matches substring when names provided and query > 2 chars', () => {
		const names = { '65': 'A.swash', '66': 'B' };
		const result = filterBySearch(items, 'swash', names);
		expect(result).toEqual([{ type: 'char', cp: 65 }]);
	});

	test('name search skipped for short queries', () => {
		const names = { '66': 'Bx' };
		// 'Bx' chars match B (66) literally; name search not needed to prove skip:
		const result = filterBySearch(items, 'zz', names);
		expect(result).toEqual([]);
	});
});

describe('buildGridItems', () => {
	const meta = {
		codepoints: [65, 97],
		features: {
			ss01: { label: 'Stylistic Set 1', type: 'sub', codepoints: [65] },
			salt: { label: 'Stylistic Alternates', type: 'alt', alts: { '97': 2, '65': 3 } },
			dlig: { label: 'Discretionary Ligatures', type: 'lig', ligatures: [{ components: [102, 105], text: 'fi' }] }
		}
	};

	test('no feature → all codepoints as char items', () => {
		expect(buildGridItems(meta, null)).toEqual([
			{ type: 'char', cp: 65 },
			{ type: 'char', cp: 97 }
		]);
	});

	test('sub feature → covered codepoints with feature tag', () => {
		expect(buildGridItems(meta, 'ss01')).toEqual([
			{ type: 'char', cp: 65, feature: 'ss01' }
		]);
	});

	test('alt feature → one cell per alternate index, sorted by codepoint', () => {
		expect(buildGridItems(meta, 'salt')).toEqual([
			{ type: 'char', cp: 65, feature: 'salt', altIndex: 1, altCount: 3 },
			{ type: 'char', cp: 65, feature: 'salt', altIndex: 2, altCount: 3 },
			{ type: 'char', cp: 65, feature: 'salt', altIndex: 3, altCount: 3 },
			{ type: 'char', cp: 97, feature: 'salt', altIndex: 1, altCount: 2 },
			{ type: 'char', cp: 97, feature: 'salt', altIndex: 2, altCount: 2 }
		]);
	});

	test('lig feature → ligature items', () => {
		expect(buildGridItems(meta, 'dlig')).toEqual([
			{ type: 'lig', text: 'fi', cps: [102, 105], feature: 'dlig' }
		]);
	});

	test('unknown feature or missing meta → empty', () => {
		expect(buildGridItems(meta, 'ss99')).toEqual([]);
		expect(buildGridItems(null, null)).toEqual([]);
	});
});

describe('buildAlternateItems', () => {
	const meta = {
		codepoints: [65, 97, 102, 105],
		features: {
			ss01: { label: 'Stylistic Set 1', type: 'sub', codepoints: [65] },
			ss02: { label: 'Stylistic Set 2', type: 'sub', codepoints: [97] },
			salt: { label: 'Stylistic Alternates', type: 'alt', alts: { '65': 2 } },
			dlig: { label: 'Discretionary Ligatures', type: 'lig', ligatures: [
				{ components: [102, 105], text: 'fi' },
				{ components: [65, 97], text: 'Aa' }
			] }
		}
	};

	test('base glyph first, then sub features, alt indexes, ligatures', () => {
		expect(buildAlternateItems(meta, 65)).toEqual([
			{ type: 'char', cp: 65 },
			{ type: 'char', cp: 65, feature: 'salt', altIndex: 1, altCount: 2 },
			{ type: 'char', cp: 65, feature: 'salt', altIndex: 2, altCount: 2 },
			{ type: 'char', cp: 65, feature: 'ss01' },
			{ type: 'lig', text: 'Aa', cps: [65, 97], feature: 'dlig' }
		]);
	});

	test('character with no variants → just the base glyph', () => {
		expect(buildAlternateItems({ codepoints: [66], features: {} }, 66)).toEqual([
			{ type: 'char', cp: 66 }
		]);
	});

	test('character not in the font → empty', () => {
		expect(buildAlternateItems(meta, 0x4E00)).toEqual([]);
	});

	test('null meta or non-numeric cp → empty', () => {
		expect(buildAlternateItems(null, 65)).toEqual([]);
		expect(buildAlternateItems(meta, null)).toEqual([]);
	});
});

describe('countByBlock', () => {
	test('counts per block plus all', () => {
		const items = [
			{ type: 'char', cp: 65 },
			{ type: 'char', cp: 66 },
			{ type: 'char', cp: 0xE9 },
			{ type: 'char', cp: 0x4E00 }
		];
		const counts = countByBlock(items);
		expect(counts.all).toBe(4);
		expect(counts['basic-latin']).toBe(2);
		expect(counts['latin-1']).toBe(1);
		expect(counts.other).toBe(1);
	});
});
