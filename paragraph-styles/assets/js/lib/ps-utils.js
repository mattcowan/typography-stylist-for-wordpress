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
	 */
	function findFontName(fontId, fonts) {
		if (!fontId || !fonts) return null;
		for (var i = 0; i < fonts.length; i++) {
			if (fonts[i].id === fontId || String(fonts[i].id) === String(fontId)) {
				return fonts[i].name;
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

		// Compare responsive font size values
		if (stateFontSize === 'responsive') {
			if ((state.fontSizeMin || 16) !== (styleProps.fontSizeMin || 16)) return true;
			if ((state.fontSizePreferred || 24) !== (styleProps.fontSizePreferred || 24)) return true;
			if ((state.fontSizeMax || 32) !== (styleProps.fontSizeMax || 32)) return true;
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
	 * Build the detail payload for the typost-apply-block-properties
	 * CustomEvent that applies (or detaches, when style is null) a
	 * paragraph style in a given editor.
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
			properties: style.properties,
			paragraphStyleId: style.id,
			styleClass: 'typost-ps-' + style.id,
			source: source,
		};
	}

	var api = {
		findFontName: findFontName,
		isStyleModified: isStyleModified,
		buildPropertiesFromState: buildPropertiesFromState,
		buildApplyEventDetail: buildApplyEventDetail,
	};

	if (typeof window !== 'undefined') {
		window.typostPSUtils = api;
	}
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = api;
	}
})();
