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
	 * Line-height is stored to three decimals (see roundLineHeight); half a
	 * unit in the last place is the largest difference that is still "equal".
	 */
	var LINE_HEIGHT_TOLERANCE = 0.0005;

	/**
	 * Round a line-height to three decimals for storage.
	 *
	 * The editor slider steps by 0.1, so three decimals lose nothing, and a
	 * fixed precision keeps float noise (1.6000000000000001) out of the
	 * stored style and out of the CSS it generates.
	 */
	function roundLineHeight(value) {
		var n = parseFloat(value);
		if (!isFinite(n)) return 0;
		// Exponent notation instead of `n * 1000`: the multiplication turns
		// an exact half-step such as 1.0005 into 1000.4999…, which
		// Math.round takes down to 1.0 while PHP's round() (which pre-rounds
		// the representation) gives 1.001 — a disagreement larger than the
		// compare tolerance. Shifting the decimal point textually rounds the
		// value the author actually typed, matching PHP.
		return Number(Math.round(Number(n + 'e3')) + 'e-3');
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

		// Compare lineHeight with a tolerance: the stored value has been
		// through PHP floatval and JSON (1.6 came back as
		// 1.6000000000000001 once, QA finding PS-8), and a strict compare
		// would flag "(modified)" forever on a style nobody touched.
		if (Math.abs((state.lineHeight || 0) - (styleProps.lineHeight || 0)) > LINE_HEIGHT_TOLERANCE) return true;

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
		// The min/preferred/max trio only means something in responsive and
		// fit modes (fit stores it as its fallback clamp). Every editor state
		// carries the trio at its defaults, so storing it unconditionally
		// gave every fixed-size and inherit style three junk numbers that
		// "Update Style" then spread to older styles (QA finding PS-3).
		if (state.fontSize === 'responsive' || state.fontSize === 'fit') {
			if (state.fontSizeMin) {
				properties.fontSizeMin = state.fontSizeMin;
			}
			if (state.fontSizePreferred) {
				properties.fontSizePreferred = state.fontSizePreferred;
			}
			if (state.fontSizeMax) {
				properties.fontSizeMax = state.fontSizeMax;
			}
		}
		if (state.letterSpacing) {
			properties.letterSpacing = state.letterSpacing;
		}
		if (state.lineHeight) {
			properties.lineHeight = roundLineHeight(state.lineHeight);
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

	// PHP intval() equivalent, verified against PHP 8.4: the leading numeric
	// portion is parsed, exponents included — intval('1e3px') is 1000 where
	// parseInt says 1 and Number says NaN. parseFloat matches that prefix scan
	// for every case in scratch harness intval-parity.php ('50px'→50,
	// '12abc'→12, '.5px'→0, '0x1A'→0, 'abc'→0).
	function phpInt(x) {
		var n = parseFloat(x);
		return isFinite(n) ? Math.trunc(n) : 0;
	}

	// PHP empty() for the scalar values styles hold: 0, 0.0, '', '0', null,
	// false are empty. The '0' string is the JS-truthy trap.
	function phpFalsy(v) {
		return !v || v === '0';
	}

	// PHP float-to-string equivalent: PHP prints floats at precision=14
	// significant digits, JS at up to 17 — trim to match.
	function phpFloatStr(x) {
		var n = parseFloat(x);
		if (!isFinite(n)) return '0';
		return String(Number(n.toPrecision(14)));
	}

	/**
	 * The selector list for one style id (numeric or legacy string).
	 *
	 * @param {number|string} id Style id.
	 * @return {string} Comma+newline separated selectors.
	 */
	function selectorSet(id) {
		var cls = '.typost-ps-' + id;
		return cls + ',\n' +
			'.typost-styled' + cls + cls + cls + cls + cls + ',\n' +
			'.typost-styled[data-style-id="' + id + '"][data-style-id][data-style-id][data-style-id][data-style-id]';
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

		// PHP guards with !empty then absint()s whatever is left, so a junk
		// fontId still emits (var(--font-0), a harmless undefined variable)
		// and a negative one is abs()ed — match, or injected CSS diverges
		// from what the server prints on the next load.
		if (!phpFalsy(props.fontId)) {
			rules.push('font-family: var(--font-' + Math.abs(phpInt(props.fontId)) + ')');
		}

		if (!phpFalsy(props.fontWeight)) {
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

		// !empty is PHP's only guard here: any non-empty value emits, so
		// '50px' renders 0.05em and even garbage renders 0em — which matters,
		// because an explicit 0 resets inherited spacing where absence would not
		if (!phpFalsy(props.letterSpacing)) {
			rules.push('letter-spacing: ' + (phpInt(props.letterSpacing) / 1000) + 'em');
		}

		if (!phpFalsy(props.lineHeight)) {
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

		// Same three selectors as generate_style_css() in PHP, byte for byte:
		// a plain `.typost-ps-N` for previews, then the block-level and
		// inline-span forms boosted to (0,6,0) so theme heading rules (often
		// (0,1,1), up to (0,3,4) on the frontend and (0,5,2) in the editor where
		// WordPress prefixes them with .editor-styles-wrapper) cannot override
		// the style.
		var id = parseInt(style.id, 10);
		var selector = selectorSet(id);
		if (style.legacyId && /^[A-Za-z0-9_-]+$/.test(String(style.legacyId))) {
			selector += ',\n' + selectorSet(String(style.legacyId));
		}

		return selector + ' {\n    ' + rules.join(';\n    ') + ';\n}';
	}

	/**
	 * Which style the toolbar browser should mark as active.
	 *
	 * With text selected the browser applies to that text, so the pressed row
	 * (and the Detach button) must describe the selection's own style — the
	 * span's data-style-id, or none — not the block's. Marking the block's
	 * style while saying "Applies to the selected text" offered to detach a
	 * style the selection did not carry (QA finding: browser scope mismatch).
	 *
	 * @param {Object}  state        Editor state from the toolbar click context.
	 * @param {boolean} hasSelection Whether a text selection was captured.
	 * @return {number} Style id, 0 for none.
	 */
	function resolveBrowserActiveStyleId(state, hasSelection) {
		var s = state || {};
		if (hasSelection) {
			return parseInt(s.selectionParagraphStyleId, 10) || 0;
		}
		return parseInt(s.paragraphStyleId, 10) || 0;
	}

	/**
	 * Rows the style browser shows before "Show more". At the 300-style
	 * stress test the list was 30,000 px tall; bytes were never the problem,
	 * a list that long is.
	 */
	var BROWSER_PAGE_SIZE = 24;

	/**
	 * Filter styles for the browser's search field: a case-insensitive
	 * substring match on the style name or its font name.
	 *
	 * @param {Array}    styles     Stored styles
	 * @param {string}   query      Search text
	 * @param {Function} fontNameOf Optional: style → font name
	 * @return {Array} Matching styles, all of them for an empty query
	 */
	function filterParagraphStyles(styles, query, fontNameOf) {
		var list = styles || [];
		var q = String(query || '').trim().toLowerCase();
		if (!q) {
			return list.slice();
		}
		return list.filter(function (style) {
			if (!style) return false;
			var name = String(style.name || '').toLowerCase();
			if (name.indexOf(q) !== -1) {
				return true;
			}
			var font = fontNameOf ? String(fontNameOf(style) || '').toLowerCase() : '';
			return font.indexOf(q) !== -1;
		});
	}

	/**
	 * The text each browser row renders in its style: the author's selection,
	 * so the preview shows the words about to be styled rather than the
	 * style's name.
	 *
	 * Whitespace is collapsed (a selection can span line breaks), and the
	 * result is capped: a long selection is cut on the last whitespace before
	 * the limit when one sits past half the limit, else hard-cut, and gets a
	 * single ellipsis. An empty or whitespace-only selection (or none at all,
	 * as with a caret) falls back to the style name.
	 *
	 * @param {string} selectionText Selected text, or undefined
	 * @param {string} styleName     Fallback
	 * @param {number} maxChars      Cap before the ellipsis (default 40)
	 * @return {string} Sample text
	 */
	function buildBrowserSampleText(selectionText, styleName, maxChars) {
		var limit = parseInt(maxChars, 10) > 0 ? parseInt(maxChars, 10) : 40;
		var text = String(selectionText || '').replace(/\s+/g, ' ').trim();
		if (!text) {
			return String(styleName || '');
		}
		if (text.length <= limit) {
			return text;
		}
		var cut = text.lastIndexOf(' ', limit);
		if (cut <= limit / 2) {
			cut = limit;
		}
		return text.slice(0, cut).replace(/\s+$/, '') + '…';
	}

	/**
	 * Group-by modes the browser offers.
	 */
	var BROWSER_GROUP_MODES = ['none', 'font', 'size'];

	/**
	 * Which size bucket a style's fontSize falls in for the "Size mode" grouping.
	 *
	 * @param {*} fontSize Stored fontSize property
	 * @return {string} 'fixed' | 'responsive' | 'fit' | 'inherit'
	 */
	function sizeModeOf(fontSize) {
		if (fontSize === 'responsive') return 'responsive';
		if (fontSize === 'fit') return 'fit';
		if (fontSize !== undefined && fontSize !== null && fontSize !== '' &&
			isFinite(fontSize) && Number(fontSize) > 0) {
			return 'fixed';
		}
		return 'inherit';
	}

	/**
	 * Group styles for the browser list.
	 *
	 * Runs on the search-filtered list and before paging, so a group heading
	 * describes exactly the rows under it. Styles keep their incoming order
	 * inside a group.
	 *
	 * - 'font': one group per font name from fontNameOf(style), ordered
	 *   alphabetically (case-insensitive); styles whose font is unknown or
	 *   unset collect in a last "No font set" group.
	 * - 'size': "Fixed size", "Responsive", "Fit to width", "Inherited size",
	 *   in that fixed order, only when non-empty.
	 * - anything else: a single group with key 'all' and no label, which the
	 *   browser renders as the flat list.
	 *
	 * @param {Array}    styles     Styles to group (already filtered)
	 * @param {string}   mode       'none' | 'font' | 'size'
	 * @param {Function} fontNameOf style → font name ('' / null when none)
	 * @return {Array} [{ key, label, styles }] in display order
	 */
	function groupParagraphStyles(styles, mode, fontNameOf) {
		var list = (styles || []).filter(function (style) { return !!style; });

		if (mode === 'font') {
			var byName = {};
			var order = [];
			var noFont = [];
			list.forEach(function (style) {
				var name = fontNameOf ? String(fontNameOf(style) || '').trim() : '';
				if (!name) {
					noFont.push(style);
					return;
				}
				if (!byName[name]) {
					byName[name] = [];
					order.push(name);
				}
				byName[name].push(style);
			});
			order.sort(function (a, b) {
				var la = a.toLowerCase();
				var lb = b.toLowerCase();
				if (la < lb) return -1;
				if (la > lb) return 1;
				return a < b ? -1 : (a > b ? 1 : 0);
			});
			var groups = order.map(function (name) {
				return { key: 'font:' + name, label: name, styles: byName[name] };
			});
			if (noFont.length) {
				groups.push({ key: 'font:none', label: translate('No font set'), styles: noFont });
			}
			return groups;
		}

		if (mode === 'size') {
			var buckets = { fixed: [], responsive: [], fit: [], inherit: [] };
			list.forEach(function (style) {
				buckets[sizeModeOf(style.properties && style.properties.fontSize)].push(style);
			});
			return [
				{ key: 'size:fixed', label: translate('Fixed size'), styles: buckets.fixed },
				{ key: 'size:responsive', label: translate('Responsive'), styles: buckets.responsive },
				{ key: 'size:fit', label: translate('Fit to width'), styles: buckets.fit },
				{ key: 'size:inherit', label: translate('Inherited size'), styles: buckets.inherit },
			].filter(function (group) { return group.styles.length > 0; });
		}

		return [{ key: 'all', label: '', styles: list }];
	}

	/**
	 * Cut grouped styles down to the first visibleCount rows in display order.
	 *
	 * Paging counts rows across groups, so "Show more" reveals the next page
	 * wherever the previous one stopped — the boundary can fall inside a
	 * group. Groups left with no visible rows are dropped, so no heading ever
	 * stands over an empty list.
	 *
	 * @param {Array}  groups       Output of groupParagraphStyles
	 * @param {number} visibleCount Rows to keep
	 * @return {{groups: Array, hiddenCount: number}} Visible groups and how many rows are cut
	 */
	function paginateGroups(groups, visibleCount) {
		var remaining = Math.max(0, parseInt(visibleCount, 10) || 0);
		var visible = [];
		var hidden = 0;
		(groups || []).forEach(function (group) {
			var rows = group.styles || [];
			var take = Math.min(remaining, rows.length);
			if (take > 0) {
				visible.push({ key: group.key, label: group.label, styles: rows.slice(0, take) });
			}
			hidden += rows.length - take;
			remaining -= take;
		});
		return { groups: visible, hiddenCount: hidden };
	}

	/**
	 * Flatten paginated groups into the rows the listbox shows, in DOM order.
	 *
	 * @param {Array} groups Output of paginateGroups().groups
	 * @return {Array} Styles in display order
	 */
	function flattenGroups(groups) {
		var rows = [];
		(groups || []).forEach(function (group) {
			rows = rows.concat(group.styles || []);
		});
		return rows;
	}

	/**
	 * Where the listbox cursor sits: the remembered style if it is still
	 * shown, else the applied style's row, else the first row (-1 when the
	 * list is empty). Keyed by style id rather than index so the cursor
	 * survives search, grouping and paging re-renders.
	 *
	 * @param {Array}  rows          Visible styles in DOM order
	 * @param {*}      cursorStyleId Remembered cursor style id (0 for none)
	 * @param {*}      activeStyleId Applied style id (0 for none)
	 * @return {number} Row index
	 */
	function resolveBrowserCursorIndex(rows, cursorStyleId, activeStyleId) {
		var list = rows || [];
		function indexOf(id) {
			if (!id) return -1;
			for (var i = 0; i < list.length; i++) {
				if (list[i] && String(list[i].id) === String(id)) return i;
			}
			return -1;
		}
		var index = indexOf(cursorStyleId);
		if (index === -1) index = indexOf(activeStyleId);
		if (index === -1 && list.length) index = 0;
		return index;
	}

	/**
	 * The row a navigation key moves the listbox cursor to.
	 *
	 * ArrowDown/ArrowUp step within bounds (no wrap, per the listbox
	 * pattern), Home/End jump. Returns -1 for any other key so the caller can
	 * leave it alone (Escape belongs to the Modal, Enter/Space apply).
	 *
	 * @param {string} key         KeyboardEvent.key
	 * @param {number} cursorIndex Current cursor row
	 * @param {number} rowCount    Visible rows
	 * @return {number} New cursor index, or -1 when the key is not a navigation key
	 */
	function resolveBrowserCursorKey(key, cursorIndex, rowCount) {
		if (!rowCount) return -1;
		var last = rowCount - 1;
		var current = Math.max(0, Math.min(last, parseInt(cursorIndex, 10) || 0));
		switch (key) {
			case 'ArrowDown': return Math.min(last, current + 1);
			case 'ArrowUp':   return Math.max(0, current - 1);
			case 'Home':      return 0;
			case 'End':       return last;
			default:          return -1;
		}
	}

	/**
	 * First-letter type-ahead for the listbox.
	 *
	 * The search starts after the cursor and wraps around, ending on the
	 * cursor row itself, so a repeated single character cycles through every
	 * row starting with it, and a multi-character buffer matches the first
	 * row whose label starts with the whole buffer.
	 *
	 * @param {Array}  labels      Row labels, lowercased, in DOM order
	 * @param {string} typedBuffer Characters typed within the reset window
	 * @param {number} cursorIndex Current cursor row (-1 for none)
	 * @return {number} Matching row index, or -1
	 */
	function findTypeAheadMatch(labels, typedBuffer, cursorIndex) {
		var list = labels || [];
		var buffer = String(typedBuffer || '').toLowerCase();
		if (!buffer || !list.length) return -1;
		// "aaa" means "next row starting with a", not a row named "aaa"
		var needle = buffer.length > 1 && buffer === new Array(buffer.length + 1).join(buffer.charAt(0))
			? buffer.charAt(0)
			: buffer;
		var n = list.length;
		var start = parseInt(cursorIndex, 10);
		if (isNaN(start) || start < 0) start = -1;
		for (var step = 1; step <= n; step++) {
			var index = (start + step) % n;
			if (String(list[index] || '').toLowerCase().indexOf(needle) === 0) {
				return index;
			}
		}
		return -1;
	}

	var api = {
		findFontName: findFontName,
		isStyleModified: isStyleModified,
		roundLineHeight: roundLineHeight,
		resolveBrowserActiveStyleId: resolveBrowserActiveStyleId,
		BROWSER_PAGE_SIZE: BROWSER_PAGE_SIZE,
		BROWSER_GROUP_MODES: BROWSER_GROUP_MODES,
		filterParagraphStyles: filterParagraphStyles,
		buildBrowserSampleText: buildBrowserSampleText,
		groupParagraphStyles: groupParagraphStyles,
		paginateGroups: paginateGroups,
		flattenGroups: flattenGroups,
		resolveBrowserCursorIndex: resolveBrowserCursorIndex,
		resolveBrowserCursorKey: resolveBrowserCursorKey,
		findTypeAheadMatch: findTypeAheadMatch,
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
