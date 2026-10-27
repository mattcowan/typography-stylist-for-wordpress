/**
 * Tests for computeWindow() / computeColumns() — grid virtualization math.
 */

const {
	computeWindow,
	computeColumns,
	computePageRows,
	CELL_SIZES,
	DEFAULT_CELL_SIZE,
	CELL_SIZE_STORAGE_KEY,
	normalizeCellSize,
	glyphFontSize,
	fitCellSize,
	readCellSize,
	writeCellSize,
} = require('../assets/js/lib/window-grid.js');

describe('glyph size (#321)', () => {
	function memoryStorage(initial = {}) {
		const data = { ...initial };
		return {
			data,
			getItem: (key) => (key in data ? data[key] : null),
			setItem: (key, value) => { data[key] = String(value); },
		};
	}

	test('the default is the size the panel always had', () => {
		expect(DEFAULT_CELL_SIZE).toBe(56);
		expect(CELL_SIZES).toContain(56);
		expect(glyphFontSize(56)).toBe(26);
	});

	test('the glyph scales with the cell', () => {
		expect(glyphFontSize(128)).toBe(59);
		expect(glyphFontSize(40)).toBe(19);
	});

	test.each([
		['72', 72],
		[96, 96],
		['57', 56],
		['abc', 56],
		[null, 56],
		[undefined, 56],
	])('normalizeCellSize(%p) is %p', (value, expected) => {
		expect(normalizeCellSize(value)).toBe(expected);
	});

	test('a size wider than the grid is capped at the grid width', () => {
		expect(fitCellSize(128, 100.7)).toBe(100);
		expect(fitCellSize(56, 600)).toBe(56);
		expect(fitCellSize(128, 0)).toBe(128);
	});

	test('a capped size gives one full column', () => {
		const width = 100;
		expect(computeColumns(width, fitCellSize(128, width))).toBe(1);
	});

	test('reads back the size it wrote', () => {
		const storage = memoryStorage();
		expect(readCellSize(storage)).toBe(56);
		expect(writeCellSize(storage, 96)).toBe(true);
		expect(storage.data[CELL_SIZE_STORAGE_KEY]).toBe('96');
		expect(readCellSize(storage)).toBe(96);
	});

	test('ignores a stored value that is not a size', () => {
		expect(readCellSize(memoryStorage({ [CELL_SIZE_STORAGE_KEY]: '9999' }))).toBe(56);
	});

	test('missing or throwing storage reads the default and does not throw', () => {
		const throwing = {
			getItem: () => { throw new Error('blocked'); },
			setItem: () => { throw new Error('blocked'); },
		};
		expect(readCellSize(null)).toBe(56);
		expect(readCellSize(throwing)).toBe(56);
		expect(writeCellSize(null, 72)).toBe(false);
		expect(writeCellSize(throwing, 72)).toBe(false);
	});

	test('Page Down moves the rows that fit the grid at each size', () => {
		expect(CELL_SIZES.map((cell) => computePageRows(360, cell))).toEqual([9, 6, 5, 3, 2]);
		expect(computePageRows(100, 128)).toBe(1); // never less than 1
		expect(computePageRows(0, 56)).toBe(1);
	});
});

describe('computeColumns', () => {
	test('floors columns to fit', () => {
		expect(computeColumns(600, 56)).toBe(10);
		expect(computeColumns(55, 56)).toBe(1); // never less than 1
		expect(computeColumns(0, 56)).toBe(1);
	});
});

describe('computeWindow', () => {
	// 100 items, 10 columns → 10 rows of 56px = 560px total
	const CELL = 56;
	const COLS = 10;
	const COUNT = 100;

	test('empty grid', () => {
		expect(computeWindow(0, 400, CELL, COLS, 0, 2))
			.toEqual({ firstIndex: 0, lastIndex: 0, padTop: 0, totalHeight: 0 });
	});

	test('top of grid: starts at 0, no padTop', () => {
		const win = computeWindow(0, 400, CELL, COLS, COUNT, 0);
		expect(win.firstIndex).toBe(0);
		expect(win.padTop).toBe(0);
		expect(win.totalHeight).toBe(560);
		// ceil(400/56)+1 = 9 rows visible → 90 items
		expect(win.lastIndex).toBe(90);
	});

	test('scrolled: window moves with padTop', () => {
		const win = computeWindow(112, 112, CELL, COLS, COUNT, 0);
		// firstRow = floor(112/56) = 2
		expect(win.firstIndex).toBe(20);
		expect(win.padTop).toBe(112);
		// visibleRows = ceil(112/56)+1 = 3 → rows 2..4 → items 20..50
		expect(win.lastIndex).toBe(50);
	});

	test('overscan extends above and below, clamped at top', () => {
		const top = computeWindow(0, 112, CELL, COLS, COUNT, 2);
		expect(top.firstIndex).toBe(0); // clamped — no negative rows

		const mid = computeWindow(224, 112, CELL, COLS, COUNT, 2);
		// firstRow = 4 - 2 = 2
		expect(mid.firstIndex).toBe(20);
		expect(mid.padTop).toBe(112);
	});

	test('bottom of grid: lastIndex clamps to itemCount', () => {
		const win = computeWindow(560, 400, CELL, COLS, COUNT, 2);
		expect(win.lastIndex).toBe(COUNT);
		expect(win.firstIndex).toBeLessThanOrEqual(COUNT);
	});

	test('partial last row', () => {
		// 95 items in 10 columns → 10 rows, last row has 5
		const win = computeWindow(560, 400, CELL, COLS, 95, 0);
		expect(win.lastIndex).toBe(95);
		expect(win.totalHeight).toBe(560);
	});

	test('single-row font', () => {
		const win = computeWindow(0, 400, CELL, COLS, 4, 3);
		expect(win.firstIndex).toBe(0);
		expect(win.lastIndex).toBe(4);
		expect(win.totalHeight).toBe(56);
	});

	test('guards bad inputs', () => {
		const win = computeWindow(-50, 400, CELL, 0, COUNT, -1);
		expect(win.firstIndex).toBe(0);
		// columns coerced to 1 → totalHeight = 100 rows * 56
		expect(win.totalHeight).toBe(5600);
	});
});
