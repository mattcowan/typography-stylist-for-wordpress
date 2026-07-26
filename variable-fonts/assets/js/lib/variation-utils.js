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
			// Custom axes: min, max, and default plus interior stops snapped
			// to round multiples of a 1-2-5 step (200, 400, … — never offsets
			// of min like 201, 401), capped at 7 buttons so the row doesn't wrap.
			var range = max - min;
			if (range <= 0) return [min];

			var MAX_BUTTONS = 7;

			// Multiples of step inside (min, max), skipping any that crowd
			// min, max, or the default (closer than half a step).
			var interiorStops = function (step) {
				var stops = [];
				var k = Math.ceil(min / step - 1e-9);
				for (; k * step <= max + 1e-9; k++) {
					var val = Math.round(k * step * 100) / 100;
					var crowd = step / 2 - 1e-9;
					if (val - min < crowd || max - val < crowd || Math.abs(val - def) < crowd) {
						continue;
					}
					stops.push(val);
				}
				return stops;
			};

			// Ascend a 1-2-5 ladder of round steps until everything fits the cap
			var ladder = [1, 2, 5];
			var exp = Math.floor(Math.log10(range)) - 1;
			var mandatory = (def !== min && def !== max) ? 3 : 2;
			var stops = [];
			for (var guard = 0; guard < 12; guard++, exp++) {
				var found = false;
				for (i = 0; i < ladder.length; i++) {
					var candidate = interiorStops(ladder[i] * Math.pow(10, exp));
					if (candidate.length + mandatory <= MAX_BUTTONS) {
						stops = candidate;
						found = true;
						break;
					}
				}
				if (found) break;
			}

			buttons = stops.concat([min, max]);
			if (buttons.indexOf(def) === -1) {
				buttons.push(def);
			}
			buttons.sort(function (a, b) { return a - b; });
		}

		return buttons;
	}

	/**
	 * Decide how the standard weight control should render for a font.
	 *
	 * The hideWeights flag gates everything: without it (explicit admin
	 * uncheck of "Hide weight selection", or no flag data at all) the
	 * standard dropdown is kept even when a wght axis exists — the wght
	 * slider is skipped, though non-wght axes still render in their own
	 * panel. With hideWeights set, a wght axis renders the slider and its
	 * absence hides the weight control entirely.
	 *
	 * @param {string} currentType Incoming filter value ('default' or another
	 *                             extension's override — passed through).
	 * @param {Array|null} axes    The font's axis definitions, or null.
	 * @param {Object|null} flags  The font's {isVariable, hideWeights} flags.
	 * @return {string} 'variable' (wght slider replaces the dropdown),
	 *                  'hidden' (no weight control at all), or currentType.
	 */
	function resolveWeightControlType(currentType, axes, flags) {
		if (!flags || !flags.hideWeights) {
			return currentType;
		}
		var hasWght = false;
		if (axes) {
			for (var i = 0; i < axes.length; i++) {
				if (axes[i] && axes[i].tag === 'wght') {
					hasWght = true;
					break;
				}
			}
		}
		return hasWght ? 'variable' : 'hidden';
	}

	/**
	 * Resolve the font id the weight control refers to, mirroring how core
	 * calls the typost_weight_control filter (inline: selectedFontId,
	 * QFT: inlineFontFamilyAtSelection || fontId, inspector: fontId) so the
	 * action-side render agrees with the filter decision.
	 */
	function resolveWeightControlFontId(state) {
		if (!state) return undefined;
		return state.selectedFontId || state.inlineFontFamilyAtSelection || state.fontId;
	}

	/**
	 * Resolve the font id for the non-wght axes panel, preferring an inline
	 * font at the selection over the block-level font.
	 */
	function resolveAxesFontId(state) {
		if (!state) return undefined;
		return state.selectedFontId || state.inlineFontFamilyAtSelection ||
			state.inlineFontFamily || state.fontId;
	}

	/**
	 * Map opentype.js fvar axis records to the plugin's axis definition shape,
	 * matching the server-side parser's conventions (Typost_Font_Parser).
	 *
	 * @param {Array}  fvarAxes       font.tables.fvar.axes records
	 *                                ({tag, minValue, defaultValue, maxValue, name}).
	 * @param {Object} registeredAxes Map of registered tag -> display name.
	 * @return {Array} [{tag, name, min, max, default}] — deduped by tag,
	 *                 malformed records skipped.
	 */
	function mapFvarAxes(fvarAxes, registeredAxes) {
		var result = [];
		var seen = {};
		if (!fvarAxes || !fvarAxes.length) return result;
		registeredAxes = registeredAxes || {};

		function round2(n) {
			return Math.round(n * 100) / 100;
		}

		for (var i = 0; i < fvarAxes.length; i++) {
			var axis = fvarAxes[i];
			if (!axis || typeof axis.tag !== 'string') continue;
			var tag = axis.tag.trim();
			if (!tag || seen[tag]) continue;
			var min = parseFloat(axis.minValue);
			var max = parseFloat(axis.maxValue);
			var def = parseFloat(axis.defaultValue);
			if (isNaN(min) || isNaN(max)) continue;
			if (min > max) {
				var swap = min;
				min = max;
				max = swap;
			}
			min = round2(min);
			max = round2(max);
			if (isNaN(def)) def = min;
			def = Math.min(Math.max(round2(def), min), max);

			var name = registeredAxes[tag];
			if (!name && axis.name) {
				if (typeof axis.name === 'string') {
					name = axis.name;
				} else if (axis.name.en) {
					name = axis.name.en;
				} else {
					for (var key in axis.name) {
						if (axis.name.hasOwnProperty(key) && axis.name[key]) {
							name = axis.name[key];
							break;
						}
					}
				}
			}
			if (!name) name = tag.toUpperCase();

			seen[tag] = true;
			result.push({ tag: tag, name: name, min: min, max: max, 'default': def });
		}
		return result;
	}

	/**
	 * Merge a panel mount into a shared axis-adjustment session.
	 *
	 * A session tracks slider values AND which axes the author has actually
	 * touched. Only touched axes are ever emitted into
	 * font-variation-settings — an untouched axis must keep following the
	 * high-level font properties (font-weight -> wght etc.), NOT get pinned
	 * to the font file's default. Fraunces made the old behavior visible:
	 * its fvar wght default is 900, so emitting every axis on any slider
	 * move snapped text to Black the moment an unrelated axis (WONK) moved.
	 *
	 * Axes already present on the span (initialSettings) count as touched —
	 * they are applied styling that every dispatch must preserve, and it
	 * lets the weight panel and the custom-axes panel compose one value.
	 *
	 * @param {Object} session  {values:{}, touched:{}} — mutated in place
	 * @param {Array}  axes     Axis definitions [{tag, min, max, default}]
	 * @param {Object} initialSettings Parsed settings currently on the span
	 * @return {Object} The same session
	 */
	function mergeAxisSession(session, axes, initialSettings) {
		session.values = session.values || {};
		session.touched = session.touched || {};

		// Prune tags that don't belong to this font's axes — axis values are
		// font-specific, so leftovers from a previously-mounted font (or from
		// stale span settings) must never keep emitting
		var validTags = {};
		for (var i = 0; i < axes.length; i++) {
			validTags[axes[i].tag] = true;
		}
		var existing = Object.keys(session.values);
		for (var k = 0; k < existing.length; k++) {
			if (!validTags[existing[k]]) {
				delete session.values[existing[k]];
				delete session.touched[existing[k]];
			}
		}

		for (var j = 0; j < axes.length; j++) {
			var ax = axes[j];
			if (session.values[ax.tag] === undefined) {
				session.values[ax.tag] = ax['default'];
			}
		}
		if (initialSettings) {
			for (var tag in initialSettings) {
				if (initialSettings.hasOwnProperty(tag) && validTags[tag]) {
					session.values[tag] = initialSettings[tag];
					session.touched[tag] = true;
				}
			}
		}
		return session;
	}

	/**
	 * The settings object a session should emit: touched axes only.
	 *
	 * @param {Object} session {values:{}, touched:{}}
	 * @return {Object} {tag: value} for every touched axis
	 */
	function pickTouchedSettings(session) {
		var out = {};
		var touched = (session && session.touched) || {};
		var values = (session && session.values) || {};
		for (var tag in touched) {
			if (touched[tag] && values[tag] !== undefined) {
				out[tag] = values[tag];
			}
		}
		return out;
	}

	var api = {
		parseVariationSettings: parseVariationSettings,
		buildVariationSettings: buildVariationSettings,
		mergeAxisSession: mergeAxisSession,
		pickTouchedSettings: pickTouchedSettings,
		getQuickButtons: getQuickButtons,
		resolveWeightControlType: resolveWeightControlType,
		resolveWeightControlFontId: resolveWeightControlFontId,
		resolveAxesFontId: resolveAxesFontId,
		mapFvarAxes: mapFvarAxes
	};

	if (typeof window !== 'undefined') {
		window.typostVFUtils = api;
	}
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = api;
	}
})();
