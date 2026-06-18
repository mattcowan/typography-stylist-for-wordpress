/**
 * Tests for computeWindow() / computeColumns() — grid virtualization math.
 */

const { computeWindow, computeColumns } = require('../assets/js/lib/window-grid.js');

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
