/**
 * Paragraph Styles utilities (pure logic)
 *
 * Shared by the editor script (loaded in the browser as a dependency,
 * exposed on window.typostPSUtils) and Jest tests (CommonJS export) —
 * same UMD-lite pattern as the Glyphs Panel and Variable Fonts lib files.
 */
(function () {
	'use strict';

	/**
	 * Resolve a font name from a font ID against a fonts array
	 * (shape of window.typostData.fonts). Returns null when not found
	 * so the caller can substitute a translated "Default" label.
	 *
	 * Styles store the canonical numeric font id, which lives on `font_id` in
	 * the localized font entries — `id` there is the string kit/project slug.
	 * Matching `font_id` first is what makes the lookup work at all; the `id`
	 * comparison stays for entry shapes that carry only that.
	 */
	function findFontName(fontId, fonts) {
		if (!fontId || !fonts) return null;
		var wanted = String(fontId);
		for (var i = 0; i < fonts.length; i++) {
			var entry = fonts[i];
			if (!entry) continue;
			if (entry.font_id !== undefined && String(entry.font_id) === wanted) {
				return entry.name;
			}
			if (entry.id !== undefined && String(entry.id) === wanted) {
				return entry.name;
			}
		}
		return null;
	}

	/**
	 * Compare current editor state against a stored style's properties.
	 * Returns true if any property differs.
	 */
	function isStyleModified(state, styleProps) {
		if (!state || !styleProps) return false;

		// Compare fontId
		var stateFontId = state.fontId || state.selectedFontId || 0;
		var styleFontId = styleProps.fontId || 0;
		if (String(stateFontId) !== String(styleFontId)) return true;

		// Compare fontWeight
		var stateWeight = state.fontWeight || state.selectedFontWeight || '400';
		var styleWeight = styleProps.fontWeight || '400';
		if (stateWeight !== styleWeight) return true;

		// Compare fontSize
		var stateFontSize = state.fontSize || 'inherit';
		var styleFontSize = styleProps.fontSize || 'inherit';
		if (stateFontSize !== styleFontSize) return true;

		// Compare responsive/fit font size values (fit stores the same
		// min/pref/max trio as its no-container-query fallback clamp)
		if (stateFontSize === 'responsive' || stateFontSize === 'fit') {
			if ((state.fontSizeMin || 16) !== (styleProps.fontSizeMin || 16)) return true;
			if ((state.fontSizePreferred || 24) !== (styleProps.fontSizePreferred || 24)) return true;
			if ((state.fontSizeMax || 32) !== (styleProps.fontSizeMax || 32)) return true;
		}

		// Compare fit max-size cap (0 = uncapped)
		if (stateFontSize === 'fit') {
			if ((state.fitMaxSize || 0) !== (styleProps.fitMaxSize || 0)) return true;
		}

		// Compare letterSpacing
		if ((state.letterSpacing || 0) !== (styleProps.letterSpacing || 0)) return true;

		// Compare lineHeight
		if ((state.lineHeight || 0) !== (styleProps.lineHeight || 0)) return true;

		// Compare features
		var stateFeatures = (state.features || state.selectedFeatures || []).slice().sort();
		var styleFeatures = (styleProps.features || []).slice().sort();
		if (stateFeatures.length !== styleFeatures.length) return true;
		for (var i = 0; i < stateFeatures.length; i++) {
			if (stateFeatures[i] !== styleFeatures[i]) return true;
		}

		// Compare fontVariationSettings
		if ((state.fontVariationSettings || '') !== (styleProps.fontVariationSettings || '')) return true;

		return false;
	}

	/**
	 * Build properties object from current editor state.
	 */
	function buildPropertiesFromState(state) {
		var properties = {};
		if (!state) return properties;
		if (state.fontId || state.selectedFontId) {
			properties.fontId = state.fontId || state.selectedFontId;
		}
		if (state.fontWeight || state.selectedFontWeight) {
			properties.fontWeight = state.fontWeight || state.selectedFontWeight;
		}
		if (state.fontSize && state.fontSize !== 'inherit') {
			properties.fontSize = state.fontSize;
		}
		// Fit mode: the max-size cap is part of the fit look. Always stored
		// (0 = uncapped) so applying a fit style is deterministic.
		if (state.fontSize === 'fit') {
			properties.fitMaxSize = state.fitMaxSize || 0;
		}
		if (state.fontSizeMin) {
			properties.fontSizeMin = state.fontSizeMin;
		}
		if (state.fontSizePreferred) {
			properties.fontSizePreferred = state.fontSizePreferred;
		}
		if (state.fontSizeMax) {
			properties.fontSizeMax = state.fontSizeMax;
		}
		if (state.letterSpacing) {
			properties.letterSpacing = state.letterSpacing;
		}
		if (state.lineHeight) {
			properties.lineHeight = state.lineHeight;
		}
		if (state.features && state.features.length > 0) {
			properties.features = state.features;
		} else if (state.selectedFeatures && state.selectedFeatures.length > 0) {
			properties.features = state.selectedFeatures;
		}
		if (state.fontVariationSettings) {
			properties.fontVariationSettings = state.fontVariationSettings;
		}
		return properties;
	}

	/**
	 * Normalize a stored style's properties for the apply event.
	 *
	 * Core's typost-apply-block-properties handlers only update properties
	 * that are present in the payload, so a style that omits a key (no
	 * features, default weight, …) would leave the editor's current value
	 * in place and the applied result would be a merge instead of the
	 * style. Filling explicit defaults for every style-owned key makes
	 * application deterministic: the text ends up looking like the style.
	 *
	 * Deliberately NOT normalized (never introduced when absent):
	 * - fontStyle — styles cannot express italic; resetting it would strip
	 *   a user's italic on every apply.
	 * - fontSizeMin/Preferred/Max — only meaningful with the style's own
	 *   fontSize mode; defaults would clobber the block's tuned responsive
	 *   values while rendering identically.
	 * - fitMaxSize — style-owned since fit became a first-class style
	 *   property (fit styles always store it, so it rides in via properties);
	 *   not defaulted when absent for the same reason as min/pref/max.
	 * - Extension-owned keys (layeredConfigId, animationConfigId).
	 */
	function normalizeApplyProperties(properties) {
		var normalized = {
			fontId: 0,
			fontWeight: '400',
			fontSize: 'inherit',
			letterSpacing: 0,
			lineHeight: 0,
			features: [],
			fontVariationSettings: '',
		};
		if (!properties) return normalized;
		for (var key in properties) {
			if (Object.prototype.hasOwnProperty.call(properties, key)) {
				normalized[key] = properties[key];
			}
		}
		return normalized;
	}

	/**
	 * Build the detail payload for the typost-apply-block-properties
	 * CustomEvent that applies (or detaches, when style is null) a
	 * paragraph style in a given editor.
	 *
	 * Applying a style sends normalized properties (see
	 * normalizeApplyProperties). Detaching sends the given properties
	 * as-is — it intentionally re-applies the current editor state as
	 * inline styling, so there is no stale state to reset.
	 */
	function buildApplyEventDetail(style, editorSource, detachProperties) {
		var source = editorSource === 'inspector' ? 'inspector' : editorSource;
		if (!style) {
			return {
				properties: detachProperties || {},
				paragraphStyleId: 0,
				styleClass: '',
				source: source,
			};
		}
		return {
			properties: normalizeApplyProperties(style.properties),
			paragraphStyleId: style.id,
			styleClass: 'typost-ps-' + style.id,
			source: source,
		};
	}

	/**
	 * Build the inline style + size label for one row of the style browser.
	 *
	 * The row also carries the style's own CSS class, which supplies family,
	 * weight, letter-spacing, OpenType features and variation settings. Only
	 * the size is overridden here: a 64px display style would otherwise make
	 * the list unreadable. The override maps the real size into a 12–40px band
	 * so relative order still reads — a display style still looks bigger than a
	 * body style — while every row stays a sensible height. line-height is
	 * neutralised for the same reason.
	 *
	 * @param {Object} properties Stored style properties.
	 * @param {Object} bounds     Optional {min, max} preview size band.
	 * @return {{style: Object, sizeLabel: string}} Inline style and a label for the true size.
	 */
	function buildStylePreviewStyle(properties, bounds) {
		var props = properties || {};
		var min = (bounds && bounds.min) || 12;
		var max = (bounds && bounds.max) || 40;
		var fontSize = props.fontSize;
		var sizeLabel = '';
		var realSize = null;

		if (fontSize === 'responsive') {
			// Represent the fluid range by its preferred (mid) size
			realSize = parseFloat(props.fontSizePreferred) || parseFloat(props.fontSizeMax) || null;
			sizeLabel = 'Fluid ' +
				(props.fontSizeMin || '?') + '–' + (props.fontSizeMax || '?');
		} else if (fontSize === 'fit') {
			// Fit sizes are measured per line at render time; the cap is the
			// only number the style itself knows.
			realSize = parseFloat(props.fitMaxSize) || null;
			sizeLabel = props.fitMaxSize ? 'Fit ≤ ' + props.fitMaxSize + 'px' : 'Fit';
		} else if (fontSize && fontSize !== 'inherit') {
			realSize = parseFloat(fontSize);
			sizeLabel = isNaN(realSize) ? '' : realSize + 'px';
		}

		var previewSize;
		if (realSize === null || isNaN(realSize)) {
			previewSize = Math.round((min + max) / 2);
		} else {
			previewSize = Math.min(max, Math.max(min, realSize));
		}

		return {
			style: {
				fontSize: previewSize + 'px',
				lineHeight: 1.25,
			},
			sizeLabel: sizeLabel,
		};
	}

	var api = {
		findFontName: findFontName,
		isStyleModified: isStyleModified,
		buildPropertiesFromState: buildPropertiesFromState,
		normalizeApplyProperties: normalizeApplyProperties,
		buildApplyEventDetail: buildApplyEventDetail,
		buildStylePreviewStyle: buildStylePreviewStyle,
	};

	if (typeof window !== 'undefined') {
		window.typostPSUtils = api;
	}
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = api;
	}
})();
