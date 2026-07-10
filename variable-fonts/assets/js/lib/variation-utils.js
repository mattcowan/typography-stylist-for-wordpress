/**
 * Variable font variation-settings utilities (pure logic)
 *
 * Shared by the editor script (loaded in the browser as a dependency,
 * exposed on window.typostVFUtils) and Jest tests (CommonJS export) —
 * same UMD-lite pattern as the Glyphs Panel lib files.
 */
(function () {
	'use strict';

	/**
	 * Parse a font-variation-settings string into an object.
	 * e.g. '"wght" 650, "wdth" 87.5' -> { wght: 650, wdth: 87.5 }
	 */
	function parseVariationSettings(str) {
		var result = {};
		if (!str) return result;
		var parts = str.split(',');
		for (var i = 0; i < parts.length; i++) {
			var trimmed = parts[i].trim();
			var match = trimmed.match(/["']([^"']+)["']\s+([\d.eE+-]+)/);
			if (match) {
				result[match[1]] = parseFloat(match[2]);
			}
		}
		return result;
	}

	/**
	 * Build a font-variation-settings string from an object.
	 * e.g. { wght: 650, wdth: 87.5 } -> '"wght" 650, "wdth" 87.5'
	 */
	function buildVariationSettings(obj) {
		var parts = [];
		for (var tag in obj) {
			if (obj.hasOwnProperty(tag)) {
				var val = obj[tag];
				// Use integer format when value is whole number
				parts.push('"' + tag + '" ' + (val % 1 === 0 ? val.toFixed(0) : val));
			}
		}
		return parts.join(', ');
	}

	/**
	 * Compute quick-select button values for an axis.
	 */
	function getQuickButtons(axis) {
		var tag = axis.tag;
		var min = axis.min;
		var max = axis.max;
		var def = axis['default'];
		var buttons = [];
		var i;

		if (tag === 'wght') {
			// Weight: every 100 from 100 to 900, clamped to range
			for (var w = 100; w <= 900; w += 100) {
				if (w >= min && w <= max) {
					buttons.push(w);
				}
			}
		} else if (tag === 'wdth') {
			// Width: meaningful stops
			var widthStops = [50, 62.5, 75, 87.5, 100, 112.5, 125, 150, 200];
			for (i = 0; i < widthStops.length; i++) {
				if (widthStops[i] >= min && widthStops[i] <= max) {
					buttons.push(widthStops[i]);
				}
			}
		} else if (tag === 'opsz') {
			// Optical size: common typographic sizes
			var opszStops = [8, 12, 14, 16, 24, 36, 48, 72, 144];
			for (i = 0; i < opszStops.length; i++) {
				if (opszStops[i] >= min && opszStops[i] <= max) {
					buttons.push(opszStops[i]);
				}
			}
		} else if (tag === 'slnt') {
			// Slant: key angles
			var slntStops = [-20, -15, -12, -10, -5, 0, 5, 10, 12, 15, 20];
			for (i = 0; i < slntStops.length; i++) {
				if (slntStops[i] >= min && slntStops[i] <= max) {
					buttons.push(slntStops[i]);
				}
			}
		} else if (tag === 'ital') {
			// Italic: binary
			buttons = [0, 1];
		} else {
			// Custom axes: divide range into ~8 steps, include min, default, max
			var range = max - min;
			if (range <= 0) return [min];
			var step = range / 8;
			// Round step to a nice number
			var magnitude = Math.pow(10, Math.floor(Math.log10(step)));
			step = Math.round(step / magnitude) * magnitude;
			if (step === 0) step = 1;

			for (var v = min; v <= max; v += step) {
				buttons.push(Math.round(v * 100) / 100);
			}
			// Ensure max is included
			if (buttons[buttons.length - 1] !== max) {
				buttons.push(max);
			}
			// Ensure default is included
			if (buttons.indexOf(def) === -1) {
				buttons.push(def);
				buttons.sort(function (a, b) { return a - b; });
			}
		}

		return buttons;
	}

	var api = {
		parseVariationSettings: parseVariationSettings,
		buildVariationSettings: buildVariationSettings,
		getQuickButtons: getQuickButtons
	};

	if (typeof window !== 'undefined') {
		window.typostVFUtils = api;
	}
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = api;
	}
})();
