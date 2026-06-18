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
	 * @param {number} cellSize        Cell height/width in px (square cells, fixed)
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

	var api = {
		computeWindow: computeWindow,
		computeColumns: computeColumns
	};

	if (typeof window !== 'undefined') {
		window.typostGlyphs = window.typostGlyphs || {};
		Object.assign(window.typostGlyphs, api);
	}
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = api;
	}
})();
