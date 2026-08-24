/**
 * Paragraph Styles utilities (pure logic)
 *
 * Shared by the editor script (loaded in the browser as a dependency,
 * exposed on window.typostPSUtils) and Jest tests (CommonJS export) —
 * same UMD-lite pattern as the Glyphs Panel and Variable Fonts lib files.
 */
(function () {
	'use strict';

	var TEXT_DOMAIN = 'typost-paragraph-styles';

	/**
	 * The font style a paragraph style may persist for this editor state.
	 *
	 * state.fontStyle is the RENDERED style and includes italic derived from
	 * semantic <em>/<i> emphasis (for previews and the Glyphs panel's face
	 * pick). A style must never capture that: em renders italic on its own,
	 * so the style's CSS could neither reproduce it elsewhere nor reset it —
	 * em's element rule outranks an inherited font-style — and the capture
	 * would also make the "(modified)" badge lie whenever the caret sits in
	 * emphasis. Both core editors therefore report explicitFontStyle (span
	 * data-fontstyle / popover choice / block attribute only); fall back to
	 * fontStyle solely for providers that predate the key.
	 */
	function persistableFontStyle(state) {
		if (state.explicitFontStyle !== undefined) {
			return state.explicitFontStyle || '';
		}
		return state.fontStyle || '';
	}

	/**
	 * Translate a string, falling back to the original.
	 *
	 * Looked up lazily rather than captured at load: this file is also
	 * required directly by Jest, where no `wp` global exists.
	 */
	function translate(text) {
		if (typeof wp !== 'undefined' && wp.i18n && wp.i18n.__) {
			return wp.i18n.__(text, TEXT_DOMAIN);
		}
		return text;
	}

	/**
	 * Fill %s / %1$s placeholders in a (translated) string.
	 *
	 * Uses wp.i18n.sprintf when available so translators get the usual
	 * argument-reordering support; the fallback covers the same two forms so
	 * tests and non-WordPress consumers produce identical output.
	 */
	function format(template, args) {
		if (typeof wp !== 'undefined' && wp.i18n && wp.i18n.sprintf) {
			return wp.i18n.sprintf.apply(null, [template].concat(args));
		}
		var index = 0;
		return template.replace(/%(\d+\$)?s/g, function (match, position) {
			if (position) {
				return String(args[parseInt(position, 10) - 1]);
			}
			return String(args[index++]);
		});
	}

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

		// Compare fontStyle ('' = inherit; 'normal' is a distinct forced-upright
		// choice). Explicit only — <em>-derived italic must not flag "(modified)"
		if (persistableFontStyle(state) !== (styleProps.fontStyle || '')) return true;

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
		// '' means inherit (not stored); 'normal' is a real forced-upright
		// choice. Explicit only — never <em>-derived italic (see persistableFontStyle)
		var fontStyle = persistableFontStyle(state);
		if (fontStyle) {
			properties.fontStyle = fontStyle;
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
	 * - fontSizeMin/Preferred/Max — only meaningful with the style's own
	 *   fontSize mode; defaults would clobber the block's tuned responsive
	 *   values while rendering identically.
	 * - fitMaxSize — style-owned since fit became a first-class style
	 *   property (fit styles always store it, so it rides in via properties);
	 *   not defaulted when absent for the same reason as min/pref/max.
	 * - Extension-owned keys (layeredConfigId, animationConfigId).
	 *
	 * fontStyle IS normalized (to '' = inherit): styles express italic as a
	 * first-class property now, so a style saved without one must reset a
	 * lingering italic on apply — the applied result has to look like the
	 * style. (An earlier revision excluded it because styles could not
	 * express italic at all; that carve-out was the bug that silently
	 * dropped italic from saved styles.)
	 */
	function normalizeApplyProperties(properties) {
		var normalized = {
			fontId: 0,
			fontWeight: '400',
			fontStyle: '',
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
	function buildApplyEventDetail(style, editorSource, detachProperties, applyTo) {
		var source = editorSource === 'inspector' ? 'inspector' : editorSource;
		// 'selection' asks the host to wrap the selected text rather than
		// restyle the whole block. Only set when the caller knows a selection
		// was captured; anything else stays block-level, which is what a
		// paragraph style normally means.
		var scope = applyTo === 'selection' ? { applyTo: 'selection' } : {};

		if (!style) {
			return Object.assign({
				properties: detachProperties || {},
				paragraphStyleId: 0,
				styleClass: '',
				source: source,
			}, scope);
		}
		return Object.assign({
			properties: normalizeApplyProperties(style.properties),
			paragraphStyleId: style.id,
			styleClass: 'typost-ps-' + style.id,
			source: source,
		}, scope);
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
			sizeLabel = format(
				/* translators: 1: smallest font size, 2: largest font size. */
				translate('Fluid %1$s–%2$s'),
				[props.fontSizeMin || '?', props.fontSizeMax || '?']
			);
		} else if (fontSize === 'fit') {
			// Fit sizes are measured per line at render time; the cap is the
			// only number the style itself knows.
			realSize = parseFloat(props.fitMaxSize) || null;
			sizeLabel = props.fitMaxSize
				/* translators: %s: maximum font size in pixels. */
				? format(translate('Fit ≤ %spx'), [props.fitMaxSize])
				: translate('Fit');
		} else if (fontSize && fontSize !== 'inherit') {
			realSize = parseFloat(fontSize);
			/* translators: %s: font size in pixels. */
			sizeLabel = isNaN(realSize) ? '' : format(translate('%spx'), [realSize]);
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

	// Mirror core's responsive viewport constants (px). generate_style_css()
	// in paragraph-styles.php uses the same pair; keep all four in sync.
	var RESPONSIVE_FONT_MIN_VIEWPORT = 320;
	var RESPONSIVE_FONT_MAX_VIEWPORT = 1920;

	// PHP round($x, 4) equivalent, so clamp() maths prints identically
	function round4(x) {
		return Math.round(x * 10000) / 10000;
	}

	// PHP intval() equivalent for numeric strings: parseInt reads '1e3' as 1,
	// PHP casts it to 1000. Callers guard non-numeric input themselves.
	function phpInt(x) {
		var n = Number(x);
		return isFinite(n) ? Math.trunc(n) : 0;
	}

	// PHP float-to-string equivalent: PHP prints floats at precision=14
	// significant digits, JS at up to 17 — trim to match.
	function phpFloatStr(x) {
		var n = parseFloat(x);
		if (!isFinite(n)) return '0';
		return String(Number(n.toPrecision(14)));
	}

	/**
	 * Build the CSS rule block for one stored style — the JS twin of PHP
	 * generate_style_css() in paragraph-styles.php.
	 *
	 * Exists so the editor can inject CSS for styles created or updated
	 * in-session: the server prints style CSS only at page load, so without
	 * this a freshly saved style has no rules in the editor document and the
	 * styled text falls back to theme defaults until reload. Output must stay
	 * byte-identical to the PHP for the same (sanitized) properties — when
	 * one side changes, change the other.
	 *
	 * Values are re-validated here with the same whitelists/regexes as the
	 * PHP even though the store is REST-sanitized, because this runs on
	 * whatever typostData.paragraphStyles holds.
	 *
	 * @param {Object} style Stored style ({id, legacyId?, properties}).
	 * @return {string} CSS rule block, or '' when nothing to emit.
	 */
	function buildStyleCssBlock(style) {
		if (!style || !style.id || !style.properties) return '';
		var props = style.properties;
		var rules = [];

		if (props.fontId && phpInt(props.fontId) > 0) {
			rules.push('font-family: var(--font-' + phpInt(props.fontId) + ')');
		}

		if (props.fontWeight) {
			var weight = props.fontWeight;
			if (isFinite(weight) && Number(weight) >= 1 && Number(weight) <= 1000) {
				rules.push('font-weight: ' + phpInt(weight));
			} else if (['normal', 'bold', 'lighter', 'bolder'].indexOf(String(weight)) !== -1) {
				rules.push('font-weight: ' + weight);
			}
		}

		if (props.fontStyle && ['normal', 'italic', 'oblique'].indexOf(String(props.fontStyle)) !== -1) {
			rules.push('font-style: ' + props.fontStyle);
		}

		if (props.features && props.features.length) {
			var tags = [];
			for (var i = 0; i < props.features.length; i++) {
				if (/^[a-z0-9_-]+$/i.test(String(props.features[i]))) {
					tags.push('"' + props.features[i] + '" 1');
				}
			}
			if (tags.length) {
				rules.push('font-feature-settings: ' + tags.join(', '));
			}
		}

		if (props.letterSpacing && phpInt(props.letterSpacing) !== 0) {
			rules.push('letter-spacing: ' + (phpInt(props.letterSpacing) / 1000) + 'em');
		}

		if (props.lineHeight && parseFloat(props.lineHeight)) {
			rules.push('line-height: ' + phpFloatStr(props.lineHeight));
		}

		if (props.fontVariationSettings) {
			var pairs = String(props.fontVariationSettings).split(',');
			var cleanPairs = [];
			for (var j = 0; j < pairs.length; j++) {
				var m = pairs[j].trim().match(/^"([a-zA-Z]{4})"\s+(-?\d+(?:\.\d+)?)$/);
				if (m) {
					cleanPairs.push('"' + m[1] + '" ' + phpFloatStr(m[2]));
				}
			}
			if (cleanPairs.length) {
				rules.push('font-variation-settings: ' + cleanPairs.join(', '));
			}
		}

		if (props.fontSize !== undefined && isFinite(props.fontSize) && Number(props.fontSize) > 0) {
			rules.push('font-size: ' + phpInt(props.fontSize) + 'px');
		}

		// Responsive clamp; fit styles emit the same fallback clamp (see the
		// PHP twin for why)
		if ((props.fontSize === 'responsive' || props.fontSize === 'fit') &&
			props.fontSizeMin !== undefined && props.fontSizePreferred !== undefined && props.fontSizeMax !== undefined) {
			var min = phpInt(props.fontSizeMin);
			var pref = phpInt(props.fontSizePreferred);
			var max = phpInt(props.fontSizeMax);
			var vw = ((max - min) / (RESPONSIVE_FONT_MAX_VIEWPORT - RESPONSIVE_FONT_MIN_VIEWPORT)) * 100;
			rules.push('font-size: clamp(' + min + 'px, ' + round4(pref / 16) + 'rem + ' + round4(vw) + 'vw, ' + max + 'px)');
		}

		if (!rules.length) return '';

		var id = parseInt(style.id, 10);
		var selector = '.typost-ps-' + id + ',\n.typost-styled[data-style-id="' + id + '"]';
		if (style.legacyId && /^[A-Za-z0-9_-]+$/.test(String(style.legacyId))) {
			selector += ',\n.typost-ps-' + style.legacyId + ',\n.typost-styled[data-style-id="' + style.legacyId + '"]';
		}

		return selector + ' {\n    ' + rules.join(';\n    ') + ';\n}';
	}

	var api = {
		findFontName: findFontName,
		isStyleModified: isStyleModified,
		buildPropertiesFromState: buildPropertiesFromState,
		normalizeApplyProperties: normalizeApplyProperties,
		buildApplyEventDetail: buildApplyEventDetail,
		buildStylePreviewStyle: buildStylePreviewStyle,
		buildStyleCssBlock: buildStyleCssBlock,
	};

	if (typeof window !== 'undefined') {
		window.typostPSUtils = api;
	}
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = api;
	}
})();
