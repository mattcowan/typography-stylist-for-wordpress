/**
 * Glyphs Panel — Windowed Grid Math
 *
 * Pure functions for virtualizing the glyph grid. Fonts can expose
 * thousands of glyphs; only the visible window (plus overscan) is
 * rendered. No DOM access — fully unit-testable.
 *
 * Dual export: window.typostGlyphs.* for the browser, module.exports for Jest.
 */
(function() {
	'use strict';

	/**
	 * Compute the visible item window for a scrolled grid.
	 *
	 * @param {number} scrollTop       Current scroll offset of the grid container (px)
	 * @param {number} viewportHeight  Visible height of the grid container (px)
	 * @param {number} cellSize        Cell height/width in px (square cells; the Glyph size control sets it)
	 * @param {number} columns         Number of columns currently fitting the container
	 * @param {number} itemCount       Total number of grid items
	 * @param {number} overscanRows    Extra rows to render above/below the viewport
	 * @return {{firstIndex: number, lastIndex: number, padTop: number, totalHeight: number}}
	 *         firstIndex inclusive, lastIndex exclusive (use items.slice(firstIndex, lastIndex))
	 */
	function computeWindow(scrollTop, viewportHeight, cellSize, columns, itemCount, overscanRows) {
		var cols = Math.max(1, Math.floor(columns) || 1);
		var size = Math.max(1, cellSize || 1);
		var count = Math.max(0, itemCount || 0);
		var overscan = Math.max(0, overscanRows || 0);
		var top = Math.max(0, scrollTop || 0);

		var totalRows = Math.ceil(count / cols);
		var totalHeight = totalRows * size;

		if (count === 0) {
			return { firstIndex: 0, lastIndex: 0, padTop: 0, totalHeight: 0 };
		}

		var firstRow = Math.max(0, Math.floor(top / size) - overscan);
		var visibleRows = Math.ceil((viewportHeight || 0) / size) + 1 + overscan * 2;
		var lastRow = Math.min(totalRows, firstRow + visibleRows);

		return {
			firstIndex: firstRow * cols,
			lastIndex: Math.min(count, lastRow * cols),
			padTop: firstRow * size,
			totalHeight: totalHeight
		};
	}

	/**
	 * Compute how many columns fit a container width.
	 *
	 * @param {number} containerWidth Container inner width (px)
	 * @param {number} cellSize       Cell width (px)
	 * @return {number} At least 1
	 */
	function computeColumns(containerWidth, cellSize) {
		var size = Math.max(1, cellSize || 1);
		return Math.max(1, Math.floor((containerWidth || 0) / size));
	}

	/**
	 * Rows that Page Up / Page Down move: the rows that fit the grid height.
	 *
	 * @param {number} viewportHeight Visible height of the grid (px)
	 * @param {number} cellSize       Cell height (px)
	 * @return {number} At least 1
	 */
	function computePageRows(viewportHeight, cellSize) {
		var size = Math.max(1, cellSize || 1);
		return Math.max(1, Math.floor((viewportHeight || 0) / size));
	}

	// Glyph size control (#321). The cell sizes the author can pick, square,
	// in px; 56 is the size the panel always had.
	var CELL_SIZES = [40, 56, 72, 96, 128];
	var DEFAULT_CELL_SIZE = 56;
	// One key for the editor panel and the Settings Glyphs tab: both run on
	// the site's admin origin, so they share the stored size.
	var CELL_SIZE_STORAGE_KEY = 'typost_glyphs_cell_size';

	/**
	 * A stored or picked cell size, limited to CELL_SIZES.
	 *
	 * @param {*} value Any value (a stored string, a select value, null).
	 * @return {number} One of CELL_SIZES; DEFAULT_CELL_SIZE for anything else.
	 */
	function normalizeCellSize(value) {
		var size = parseInt(value, 10);
		return CELL_SIZES.indexOf(size) !== -1 ? size : DEFAULT_CELL_SIZE;
	}

	/**
	 * The glyph's font size for a cell size: 26px in the 56px default cell,
	 * scaled in the same ratio.
	 *
	 * @param {number} cellSize Cell size in px.
	 * @return {number} Font size in px.
	 */
	function glyphFontSize(cellSize) {
		return Math.round(cellSize * 26 / 56);
	}

	/**
	 * The cell size to render: the picked size, but never wider than the
	 * grid, so a large size in a narrow window (320px) shows one full column
	 * instead of a cell that runs past the grid.
	 *
	 * @param {number} cellSize       Picked cell size in px.
	 * @param {number} containerWidth Grid inner width in px (0 or less: not measured).
	 * @return {number} Cell size in px.
	 */
	function fitCellSize(cellSize, containerWidth) {
		if (!(containerWidth > 0)) {
			return cellSize;
		}
		return Math.max(1, Math.min(cellSize, Math.floor(containerWidth)));
	}

	/**
	 * Read the stored cell size. Storage can be missing or throw (private
	 * windows, blocked site data), so every access is guarded.
	 *
	 * @param {Storage|null} storage window.localStorage or null.
	 * @return {number} One of CELL_SIZES.
	 */
	function readCellSize(storage) {
		try {
			return normalizeCellSize(storage ? storage.getItem(CELL_SIZE_STORAGE_KEY) : null);
		} catch (e) {
			return DEFAULT_CELL_SIZE;
		}
	}

	/**
	 * Store the cell size. A failed write leaves the panel at the picked
	 * size for this session only.
	 *
	 * @param {Storage|null} storage window.localStorage or null.
	 * @param {number}       size    Cell size in px.
	 * @return {boolean} True when stored.
	 */
	function writeCellSize(storage, size) {
		try {
			if (!storage) {
				return false;
			}
			storage.setItem(CELL_SIZE_STORAGE_KEY, String(normalizeCellSize(size)));
			return true;
		} catch (e) {
			return false;
		}
	}

	var api = {
		computeWindow: computeWindow,
		computeColumns: computeColumns,
		computePageRows: computePageRows,
		CELL_SIZES: CELL_SIZES,
		DEFAULT_CELL_SIZE: DEFAULT_CELL_SIZE,
		CELL_SIZE_STORAGE_KEY: CELL_SIZE_STORAGE_KEY,
		normalizeCellSize: normalizeCellSize,
		glyphFontSize: glyphFontSize,
		fitCellSize: fitCellSize,
		readCellSize: readCellSize,
		writeCellSize: writeCellSize
	};

	if (typeof window !== 'undefined') {
		window.typostGlyphs = window.typostGlyphs || {};
		Object.assign(window.typostGlyphs, api);
	}
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = api;
	}
})();
