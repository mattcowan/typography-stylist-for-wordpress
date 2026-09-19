/**
 * Tests for the style browser's list helpers in
 * paragraph-styles/assets/js/lib/ps-utils.js: sample text, grouping and
 * paging, and the listbox cursor / type-ahead logic that editor.js drives
 * from keyboard events.
 *
 * The browser component itself (editor.js) is an IIFE over wp.element and
 * wp.components, neither of which exists under Jest, so the DOM layer stays
 * thin and everything it decides is decided here.
 */

const {
	buildBrowserSampleText,
	groupParagraphStyles,
	paginateGroups,
	flattenGroups,
	resolveBrowserCursorIndex,
	resolveBrowserCursorKey,
	findTypeAheadMatch,
	BROWSER_GROUP_MODES,
	BROWSER_PAGE_SIZE,
} = require('../assets/js/lib/ps-utils.js');

describe('buildBrowserSampleText (row sample from the selection)', () => {
	test('uses the selected text, with whitespace collapsed and trimmed', () => {
		expect(buildBrowserSampleText('  Hello\n\t world  ', 'Display')).toBe('Hello world');
	});

	test('falls back to the style name for a whitespace-only selection', () => {
		expect(buildBrowserSampleText('   \n ', 'Display')).toBe('Display');
	});

	test('falls back to the style name when there is no selection at all', () => {
		expect(buildBrowserSampleText(undefined, 'Display')).toBe('Display');
		expect(buildBrowserSampleText(null, 'Display')).toBe('Display');
		expect(buildBrowserSampleText('', 'Display')).toBe('Display');
	});

	test('a selection of exactly maxChars is untouched', () => {
		const forty = 'abcdefghij'.repeat(4);
		expect(forty).toHaveLength(40);
		expect(buildBrowserSampleText(forty, 'Display')).toBe(forty);
		expect(buildBrowserSampleText('abcde fghij', 'Display', 11)).toBe('abcde fghij');
	});

	test('a long selection is cut at a word boundary with one ellipsis', () => {
		const text = 'The quick brown fox jumps over the lazy dog and keeps on running';
		const sample = buildBrowserSampleText(text, 'Display');
		expect(sample).toBe('The quick brown fox jumps over the lazy…');
		expect(sample.length).toBeLessThanOrEqual(41);
		expect(sample.match(/…/g)).toHaveLength(1);
	});

	test('hard-cuts when the only whitespace is in the first half', () => {
		expect(buildBrowserSampleText('ab cdefghijklmnopqrstuvwxyz', 'Display', 10)).toBe('ab cdefghi…');
		expect(buildBrowserSampleText('abcdefghijklmnopqrstuvwxyz', 'Display', 10)).toBe('abcdefghij…');
	});

	test('honors a custom cap', () => {
		expect(buildBrowserSampleText('one two three four', 'Display', 9)).toBe('one two…');
	});
});

describe('groupParagraphStyles', () => {
	const styles = [
		{ id: 1, name: 'Body', properties: { fontId: 37, fontSize: '18' } },
		{ id: 2, name: 'Display', properties: { fontId: 1, fontSize: 'responsive' } },
		{ id: 3, name: 'Poster', properties: { fontId: 37, fontSize: 'fit' } },
		{ id: 4, name: 'Quote', properties: { fontId: 0 } },
		{ id: 5, name: 'Accent', properties: { fontId: 40, fontSize: 24 } },
		{ id: 6, name: 'Note', properties: { fontId: 99, fontSize: 'inherit' } },
	];
	const fontNameOf = (style) => ({ 1: 'bookmania', 37: 'EB Garamond', 40: 'Style Script' })[style.properties.fontId] || '';

	test('the modes are none, font, size and recent', () => {
		expect(BROWSER_GROUP_MODES).toEqual(['none', 'font', 'size', 'recent']);
	});

	test("'none' returns a single unlabeled group keyed 'all' in incoming order", () => {
		const groups = groupParagraphStyles(styles, 'none', fontNameOf);
		expect(groups).toHaveLength(1);
		expect(groups[0].key).toBe('all');
		expect(groups[0].label).toBe('');
		expect(groups[0].styles.map((s) => s.id)).toEqual([1, 2, 3, 4, 5, 6]);
	});

	test("an unknown mode behaves like 'none'", () => {
		expect(groupParagraphStyles(styles, undefined, fontNameOf)[0].key).toBe('all');
		expect(groupParagraphStyles(styles, 'bogus', fontNameOf)[0].key).toBe('all');
	});

	test("'font' groups by font name, alphabetically (case-insensitive), keeping order inside a group", () => {
		const groups = groupParagraphStyles(styles, 'font', fontNameOf);
		expect(groups.map((g) => g.label)).toEqual(['bookmania', 'EB Garamond', 'Style Script', 'No font set']);
		expect(groups.map((g) => g.key)).toEqual(['font:bookmania', 'font:EB Garamond', 'font:Style Script', 'font:none']);
		expect(groups[1].styles.map((s) => s.id)).toEqual([1, 3]);
	});

	test("'font' puts unset and unknown fonts in a last 'No font set' bucket", () => {
		const groups = groupParagraphStyles(styles, 'font', fontNameOf);
		const last = groups[groups.length - 1];
		expect(last.key).toBe('font:none');
		expect(last.styles.map((s) => s.id)).toEqual([4, 6]);
	});

	test("'font' drops the bucket when every style has a font", () => {
		const groups = groupParagraphStyles(styles.slice(0, 3), 'font', fontNameOf);
		expect(groups.map((g) => g.key)).toEqual(['font:bookmania', 'font:EB Garamond']);
	});

	test("'size' buckets in the fixed order Fixed, Responsive, Fit, Inherited", () => {
		const groups = groupParagraphStyles(styles, 'size', fontNameOf);
		expect(groups.map((g) => g.label)).toEqual(['Fixed size', 'Responsive', 'Fit to width', 'Inherited size']);
		expect(groups.map((g) => g.key)).toEqual(['size:fixed', 'size:responsive', 'size:fit', 'size:inherit']);
		expect(groups[0].styles.map((s) => s.id)).toEqual([1, 5]);
		expect(groups[3].styles.map((s) => s.id)).toEqual([4, 6]);
	});

	test("'size' drops empty buckets", () => {
		const groups = groupParagraphStyles([styles[1], styles[3]], 'size', fontNameOf);
		expect(groups.map((g) => g.key)).toEqual(['size:responsive', 'size:inherit']);
	});

	test('ignores null entries and an empty list', () => {
		expect(groupParagraphStyles([null, styles[0]], 'size', fontNameOf)[0].styles).toEqual([styles[0]]);
		expect(groupParagraphStyles([], 'font', fontNameOf)).toEqual([]);
		expect(groupParagraphStyles(undefined, 'none')).toEqual([{ key: 'all', label: '', styles: [] }]);
	});
});

describe('paginateGroups (paging across group boundaries)', () => {
	const make = (prefix, count) => Array.from({ length: count }, (_, i) => ({ id: `${prefix}${i + 1}`, name: `${prefix} ${i + 1}` }));

	test('the first page can end inside the second group', () => {
		const groups = [
			{ key: 'a', label: 'A', styles: make('a', 20) },
			{ key: 'b', label: 'B', styles: make('b', 10) },
		];
		const page = paginateGroups(groups, BROWSER_PAGE_SIZE);
		expect(page.groups).toHaveLength(2);
		expect(page.groups[0].styles).toHaveLength(20);
		expect(page.groups[1].styles).toHaveLength(4);
		expect(page.groups[1].styles[0].id).toBe('b1');
		expect(page.hiddenCount).toBe(6);
	});

	test('groups that end up empty are dropped, and later groups count as hidden', () => {
		const groups = [
			{ key: 'a', label: 'A', styles: make('a', 3) },
			{ key: 'b', label: 'B', styles: make('b', 2) },
			{ key: 'c', label: 'C', styles: make('c', 4) },
		];
		const page = paginateGroups(groups, 3);
		expect(page.groups.map((g) => g.key)).toEqual(['a']);
		expect(page.hiddenCount).toBe(6);
	});

	test('everything fits: no hidden rows and groups untouched', () => {
		const groups = [
			{ key: 'a', label: 'A', styles: make('a', 2) },
			{ key: 'b', label: 'B', styles: make('b', 2) },
		];
		const page = paginateGroups(groups, 24);
		expect(page.groups.map((g) => g.styles.length)).toEqual([2, 2]);
		expect(page.hiddenCount).toBe(0);
	});

	test('a zero or missing count hides everything', () => {
		const groups = [{ key: 'a', label: 'A', styles: make('a', 2) }];
		expect(paginateGroups(groups, 0)).toEqual({ groups: [], hiddenCount: 2 });
		expect(paginateGroups(groups, undefined)).toEqual({ groups: [], hiddenCount: 2 });
		expect(paginateGroups(undefined, 5)).toEqual({ groups: [], hiddenCount: 0 });
	});

	test('flattenGroups returns the visible rows in DOM order', () => {
		const page = paginateGroups([
			{ key: 'a', label: 'A', styles: make('a', 2) },
			{ key: 'b', label: 'B', styles: make('b', 3) },
		], 4);
		expect(flattenGroups(page.groups).map((s) => s.id)).toEqual(['a1', 'a2', 'b1', 'b2']);
		expect(flattenGroups(undefined)).toEqual([]);
	});
});

describe('resolveBrowserCursorIndex', () => {
	const rows = [{ id: 3 }, { id: 5 }, { id: 8 }];

	test('keeps the remembered cursor when its row is still shown', () => {
		expect(resolveBrowserCursorIndex(rows, 8, 5)).toBe(2);
		expect(resolveBrowserCursorIndex(rows, '5', 0)).toBe(1);
	});

	test('falls back to the applied style, then the first row', () => {
		expect(resolveBrowserCursorIndex(rows, 99, 5)).toBe(1);
		expect(resolveBrowserCursorIndex(rows, 0, 0)).toBe(0);
		expect(resolveBrowserCursorIndex(rows, 99, 42)).toBe(0);
	});

	test('reports -1 for an empty list', () => {
		expect(resolveBrowserCursorIndex([], 3, 3)).toBe(-1);
		expect(resolveBrowserCursorIndex(undefined, 0, 0)).toBe(-1);
	});
});

describe('resolveBrowserCursorKey', () => {
	test('arrows step without wrapping', () => {
		expect(resolveBrowserCursorKey('ArrowDown', 0, 3)).toBe(1);
		expect(resolveBrowserCursorKey('ArrowDown', 2, 3)).toBe(2);
		expect(resolveBrowserCursorKey('ArrowUp', 1, 3)).toBe(0);
		expect(resolveBrowserCursorKey('ArrowUp', 0, 3)).toBe(0);
	});

	test('Home and End jump', () => {
		expect(resolveBrowserCursorKey('Home', 2, 3)).toBe(0);
		expect(resolveBrowserCursorKey('End', 0, 3)).toBe(2);
	});

	test('other keys and an empty list are ignored', () => {
		expect(resolveBrowserCursorKey('Enter', 1, 3)).toBe(-1);
		expect(resolveBrowserCursorKey('Escape', 1, 3)).toBe(-1);
		expect(resolveBrowserCursorKey('a', 1, 3)).toBe(-1);
		expect(resolveBrowserCursorKey('ArrowDown', 0, 0)).toBe(-1);
	});

	test('an out-of-range cursor is clamped first', () => {
		expect(resolveBrowserCursorKey('ArrowDown', -1, 3)).toBe(1);
		expect(resolveBrowserCursorKey('ArrowUp', 10, 3)).toBe(1);
	});
});

describe('findTypeAheadMatch (first-letter type-ahead)', () => {
	const labels = ['body', 'display swash', 'display serif', 'accent', 'drop cap'];

	test('a single letter finds the next row after the cursor starting with it', () => {
		expect(findTypeAheadMatch(labels, 'd', 0)).toBe(1);
		expect(findTypeAheadMatch(labels, 'a', 0)).toBe(3);
	});

	test('a repeated letter cycles through the rows starting with it', () => {
		expect(findTypeAheadMatch(labels, 'd', -1)).toBe(1);
		expect(findTypeAheadMatch(labels, 'dd', 1)).toBe(2);
		expect(findTypeAheadMatch(labels, 'ddd', 2)).toBe(4);
		expect(findTypeAheadMatch(labels, 'dddd', 4)).toBe(1);
	});

	test('a multi-character buffer matches a prefix', () => {
		expect(findTypeAheadMatch(labels, 'dr', 1)).toBe(4);
		expect(findTypeAheadMatch(labels, 'display se', 0)).toBe(2);
		expect(findTypeAheadMatch(labels, 'DISPLAY', 0)).toBe(1);
	});

	test('wraps around past the end and can land on the cursor row itself', () => {
		expect(findTypeAheadMatch(labels, 'b', 3)).toBe(0);
		expect(findTypeAheadMatch(labels, 'a', 3)).toBe(3);
	});

	test('returns -1 when nothing matches or the buffer is empty', () => {
		expect(findTypeAheadMatch(labels, 'z', 0)).toBe(-1);
		expect(findTypeAheadMatch(labels, 'dx', 0)).toBe(-1);
		expect(findTypeAheadMatch(labels, '', 0)).toBe(-1);
		expect(findTypeAheadMatch(labels, undefined, 0)).toBe(-1);
		expect(findTypeAheadMatch([], 'd', 0)).toBe(-1);
	});
});

describe('recently used styles (Group by: Recently used)', () => {
	const utils = require('../assets/js/lib/ps-utils.js');
	const { readRecentStyleIds, recordRecentStyleId, groupParagraphStyles, RECENT_STYLES_KEY, RECENT_STYLES_LIMIT } = utils;

	function memoryStorage(initial) {
		const store = {};
		if (initial !== undefined) store[RECENT_STYLES_KEY] = initial;
		return {
			getItem: (k) => (k in store ? store[k] : null),
			setItem: (k, v) => { store[k] = String(v); },
			dump: () => store,
		};
	}
	const styles = [2, 3, 4, 5].map((id) => ({ id, name: 'S' + id, properties: {} }));

	it('reads nothing from missing, blocked or malformed storage', () => {
		expect(readRecentStyleIds(null)).toEqual([]);
		expect(readRecentStyleIds({ getItem: () => { throw new Error('blocked'); } })).toEqual([]);
		expect(readRecentStyleIds(memoryStorage('not json'))).toEqual([]);
		expect(readRecentStyleIds(memoryStorage('{"a":1}'))).toEqual([]);
	});

	it('normalizes stored ids: numbers only, deduplicated, capped', () => {
		const s = memoryStorage(JSON.stringify(['3', 3, 'x', 0, -1, 5, 5, 2, 7, 8, 9, 10, 11, 12]));
		const ids = readRecentStyleIds(s);
		expect(ids.slice(0, 3)).toEqual([3, 5, 2]);
		expect(ids.length).toBeLessThanOrEqual(RECENT_STYLES_LIMIT);
	});

	it('records the newest id first, moves a repeat to the front and caps the list', () => {
		const s = memoryStorage();
		expect(recordRecentStyleId(s, 4)).toEqual([4]);
		expect(recordRecentStyleId(s, 2)).toEqual([2, 4]);
		expect(recordRecentStyleId(s, 4)).toEqual([4, 2]);
		expect(JSON.parse(s.dump()[RECENT_STYLES_KEY])).toEqual([4, 2]);
		let last;
		for (let i = 10; i < 30; i++) last = recordRecentStyleId(s, i);
		expect(last.length).toBe(RECENT_STYLES_LIMIT);
		expect(last[0]).toBe(29);
	});

	it('ignores an invalid id and survives a storage that refuses writes', () => {
		const s = memoryStorage(JSON.stringify([3]));
		expect(recordRecentStyleId(s, 'nope')).toEqual([3]);
		const readOnly = { getItem: () => '[3]', setItem: () => { throw new Error('full'); } };
		expect(recordRecentStyleId(readOnly, 5)).toEqual([5, 3]);
	});

	it('groups recently used styles first, in recency order, then the others', () => {
		const groups = groupParagraphStyles(styles, 'recent', null, [4, 2, 99]);
		expect(groups.map((g) => g.key)).toEqual(['recent', 'recent:others']);
		expect(groups[0].label).toBe('Recently used');
		expect(groups[0].styles.map((s) => s.id)).toEqual([4, 2]);
		expect(groups[1].label).toBe('Other styles');
		expect(groups[1].styles.map((s) => s.id)).toEqual([3, 5]);
	});

	it('falls back to the flat list when nothing remembered is in the list', () => {
		expect(groupParagraphStyles(styles, 'recent', null, [99])).toEqual([{ key: 'all', label: '', styles }]);
		expect(groupParagraphStyles(styles, 'recent', null, undefined)).toEqual([{ key: 'all', label: '', styles }]);
	});

	it('omits the "Other styles" group when every style is recent', () => {
		const groups = groupParagraphStyles(styles.slice(0, 2), 'recent', null, [3, 2]);
		expect(groups).toHaveLength(1);
		expect(groups[0].styles.map((s) => s.id)).toEqual([3, 2]);
	});

	it('is a listed group mode', () => {
		expect(utils.BROWSER_GROUP_MODES).toContain('recent');
	});
});
