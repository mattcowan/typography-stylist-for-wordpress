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
	 * The font a paragraph style may persist for this editor state (#278).
	 *
	 * state.fontId is the RENDERED font: for text with no font of its own,
	 * both core editors report the font the theme gives it, so the Glyphs
	 * panel browses the font the author sees. A style must never capture
	 * that: Detach would write the theme's font onto the span, where it stays
	 * when the theme changes, and the "(modified)" badge would show on every
	 * style without a font. Both core editors report explicitFontId (a span
	 * data-font-id, the popover's pick, or the block attribute); fall back to
	 * fontId solely for providers that predate the key.
	 */
	function persistableFontId(state) {
		if (state.explicitFontId !== undefined) {
			return state.explicitFontId || 0;
		}
		return state.fontId || state.selectedFontId || 0;
	}

	/**
	 * The font weight a paragraph style may persist for this editor state
	 * (#278). Same reason as persistableFontId(): state.fontWeight is the
	 * RENDERED weight (a theme-bold heading, <strong>), explicitFontWeight is
	 * the weight set on the text, '' when it inherits its weight.
	 */
	function persistableFontWeight(state) {
		if (state.explicitFontWeight !== undefined) {
			return state.explicitFontWeight ? String(state.explicitFontWeight) : '';
		}
		return state.fontWeight || state.selectedFontWeight || '';
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
	 * Named __ so WP-CLI make-pot extracts the literals passed to it; it
	 * delegates to translate() so Jest still works without a wp global.
	 *
	 * @param {string} text Source string. The domain argument at each call
	 *                      site is read only by make-pot.
	 * @return {string} Translated string.
	 */
	function __(text) {
		return translate(text);
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

	// Largest hanging-initial value, in em. Mirrors INITIAL_HANG_MAX in core
	// utils.js and HANG_MAX in paragraph-styles.php.
	var INITIAL_HANG_MAX = 1;

	/**
	 * Normalize a hanging-initial value (#242): 0 when off or invalid,
	 * otherwise capped at INITIAL_HANG_MAX and rounded to three decimals.
	 * Mirrors normalizeHang() in core utils.js and the PHP sanitizer, so the
	 * stored value and both CSS generators agree.
	 */
	function normalizeHang(value) {
		// Accept what PHP is_numeric() accepts: Number() alone would read
		// '0x1A' as 26 and true as 1, and the CSS would no longer match PHP's.
		if (typeof value === 'string' ? !/^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/.test(value) : typeof value !== 'number') return 0;
		var n = Number(value);
		// Below 0.0005 rounds to 0; String() would also print it as '1e-7'
		if (!isFinite(n) || n < 0.0005) return 0;
		return Number(Math.round(Number(Math.min(n, INITIAL_HANG_MAX) + 'e3')) + 'e-3');
	}

	// Case values a style can store (#214); absent = Default (theme case).
	// Mirrors TEXT_CASE_VALUES in core utils.js and in paragraph-styles.php.
	var TEXT_CASE_VALUES = ['none', 'uppercase', 'lowercase', 'capitalize', 'small-caps', 'all-small-caps'];

	/** '' for Default or an unknown value, otherwise the case value. */
	function normalizeTextCase(value) {
		return typeof value === 'string' && TEXT_CASE_VALUES.indexOf(value) !== -1 ? value : '';
	}

	/** True for the case values that use font-variant-caps. */
	function isSmallCapsCase(value) {
		var c = normalizeTextCase(value);
		return c === 'small-caps' || c === 'all-small-caps';
	}

	/**
	 * CSS declarations for a case setting (#214), as [property, value]
	 * pairs. Twin of caseDeclarations() in core utils.js and of
	 * case_declarations() in PHP (see there for why every value sets both
	 * text-transform and font-variant-caps). Order matters: it is part of
	 * the byte-identical style CSS.
	 */
	function caseDeclarations(textCase, fakeSmallCaps) {
		var c = normalizeTextCase(textCase);
		if (!c) return [];
		if (isSmallCapsCase(c)) {
			return [
				['text-transform', 'none'],
				['font-variant-caps', c],
				['font-synthesis-small-caps', fakeSmallCaps === false ? 'none' : 'auto'],
			];
		}
		return [
			['text-transform', c],
			['font-variant-caps', 'normal'],
		];
	}

	/**
	 * The fake small caps choice as stored: false only when it is off for a
	 * small caps value; true otherwise (it has no effect on other values).
	 */
	function effectiveFakeSmallCaps(textCase, fakeSmallCaps) {
		return !(isSmallCapsCase(textCase) && fakeSmallCaps === false);
	}

	/**
	 * Compare current editor state against a stored style's properties.
	 * Returns true if any property differs.
	 */
	function isStyleModified(state, styleProps) {
		if (!state || !styleProps) return false;

		// Compare fontId. Set on the text only, never the theme's (#278)
		var stateFontId = persistableFontId(state);
		var styleFontId = styleProps.fontId || 0;
		if (String(stateFontId) !== String(styleFontId)) return true;

		// Compare fontWeight. Set on the text only (#278); unset counts as 400
		var stateWeight = persistableFontWeight(state) || '400';
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

		// Compare the hanging initial (#242) only when the editor reports it.
		// It is block-level (::first-letter cannot reach an inline span), so
		// the inline editor never sends the key — comparing there would pin
		// "(modified)" on every use of a style that has a hang.
		if (state.initialHang !== undefined && normalizeHang(state.initialHang) !== normalizeHang(styleProps.initialHang)) return true;

		// Case (#214). Both core editors report it (a span stores its own
		// case since the inline editor got a Case control); an editor that
		// does not send the key is not compared.
		if (state.textCase !== undefined) {
			if (normalizeTextCase(state.textCase) !== normalizeTextCase(styleProps.textCase)) return true;
			if (effectiveFakeSmallCaps(state.textCase, state.fakeSmallCaps) !== effectiveFakeSmallCaps(styleProps.textCase, styleProps.fakeSmallCaps)) return true;
		}

		return false;
	}

	/**
	 * The size unit new styles write: 'px' only when the site asks for it
	 * (typostData.newFontSizeUnit, #248), else 'rem' (#233).
	 */
	function resolveNewStyleUnit(unit) {
		return unit === 'px' ? 'px' : 'rem';
	}

	/**
	 * Build properties object from current editor state.
	 *
	 * @param {Object} state     Editor state from typost_current_editor_state.
	 * @param {string} [newUnit] The site's unit for new sizes ('rem' default).
	 */
	function buildPropertiesFromState(state, newUnit) {
		var properties = {};
		if (!state) return properties;
		// Set on the text only: an inherited font or weight is not stored,
		// so Detach and Save do not write the theme's (#278)
		var fontId = persistableFontId(state);
		if (fontId) {
			properties.fontId = fontId;
		}
		var fontWeight = persistableFontWeight(state);
		if (fontWeight) {
			properties.fontWeight = fontWeight;
		}
		// '' means inherit (not stored); 'normal' is a real forced-upright
		// choice. Explicit only — never <em>-derived italic (see persistableFontStyle)
		var fontStyle = persistableFontStyle(state);
		if (fontStyle) {
			properties.fontStyle = fontStyle;
		}
		if (state.fontSize && state.fontSize !== 'inherit') {
			properties.fontSize = state.fontSize;
			// A style saved now is new content: its sizes are written in the
			// site's new-content unit, rem (#233) unless the Options setting
			// asks for px (#248). Not taken from the editor, because a
			// block's unit only keeps its own saved markup unchanged. Update
			// Style keeps the unit of a style that already has a size
			// (buildPropertiesForStyleSave).
			properties.fontSizeUnit = resolveNewStyleUnit(newUnit);
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
		// 0 = no hang, never stored (absent and 0 render the same)
		if (normalizeHang(state.initialHang) > 0) {
			properties.initialHang = normalizeHang(state.initialHang);
		}
		// Default case is never stored; fakeSmallCaps only when it is off
		// for a small caps value (absent = allowed)
		var textCase = normalizeTextCase(state.textCase);
		if (textCase) {
			properties.textCase = textCase;
			if (!effectiveFakeSmallCaps(textCase, state.fakeSmallCaps)) {
				properties.fakeSmallCaps = false;
			}
		}
		return properties;
	}

	/**
	 * Properties to store when an editor saves over an existing style
	 * (Update Style) or saves a variant of it (Save as New).
	 *
	 * Some properties are block-level only, and the inline editor does not
	 * report them in its state: initialHang (#242) works through
	 * ::first-letter, which cannot reach an inline span. The REST update
	 * replaces the whole properties object, so building from the inline
	 * state alone deleted the style's hang from every block that used it
	 * (PR review). A key the editor does not report is carried from the
	 * base style; a key it reports, including 0, is the editor's value.
	 * textCase / fakeSmallCaps (#214) follow the same rule for an editor
	 * (an extension's) that does not report them; both core editors do.
	 *
	 * Size unit (#233, #248): Update Style (isUpdate) keeps the unit of a
	 * style that already writes a size, so its CSS does not change unit
	 * under content that already uses it: px for a style saved before rem
	 * existed (a size and no fontSizeUnit) or under the px setting, rem for
	 * one saved as rem — whatever the site setting is now. A style that had
	 * no size wrote none, so a size added to it is new and takes the site's
	 * new-content unit. Save as New is a new style and always takes it.
	 *
	 * @param {Object}  state          Editor state from typost_current_editor_state.
	 * @param {Object}  baseProperties The active style's stored properties.
	 * @param {boolean} [isUpdate]     True for Update Style, false for Save as New.
	 * @param {string}  [newUnit]      The site's unit for new sizes ('rem' default).
	 * @return {Object} Properties for the REST request.
	 */
	function buildPropertiesForStyleSave(state, baseProperties, isUpdate, newUnit) {
		var properties = buildPropertiesFromState(state, newUnit);
		var base = baseProperties || {};
		if ((!state || state.initialHang === undefined) && normalizeHang(base.initialHang) > 0) {
			properties.initialHang = normalizeHang(base.initialHang);
		}
		if ((!state || state.textCase === undefined) && normalizeTextCase(base.textCase)) {
			properties.textCase = normalizeTextCase(base.textCase);
			if (!effectiveFakeSmallCaps(base.textCase, base.fakeSmallCaps)) {
				properties.fakeSmallCaps = false;
			}
		}
		// Same test as the CSS generators: only these write a size ('0' does not)
		var baseHasSize = base.fontSize === 'responsive' || base.fontSize === 'fit' ||
			(base.fontSize !== undefined && base.fontSize !== null && base.fontSize !== '' && isFinite(base.fontSize) && Number(base.fontSize) > 0);
		if (isUpdate && properties.fontSizeUnit && baseHasSize) {
			properties.fontSizeUnit = base.fontSizeUnit === 'rem' ? 'rem' : 'px';
		}
		return properties;
	}

	// ---------------------------------------------------------------------
	// Based On (#200)
	// ---------------------------------------------------------------------

	// Most styles a Based On chain may hold, the style itself included.
	// Mirrors MAX_BASED_ON_LEVELS in paragraph-styles.php.
	var MAX_BASED_ON_LEVELS = 10;

	// Property groups that inherit as a whole, keyed by the lead key that
	// marks a style as setting the group. Mirrors BASED_ON_GROUPS in PHP.
	var BASED_ON_GROUPS = {
		fontSize: ['fontSize', 'fontSizeUnit', 'fontSizeMin', 'fontSizePreferred', 'fontSizeMax', 'fitMaxSize'],
		textCase: ['textCase', 'fakeSmallCaps'],
	};

	// The value a style based on another stores to unset a property its
	// parent sets. The groups use fontSize 'inherit' and textCase ''.
	// Mirrors EMPTY_PROPERTY_VALUES in PHP.
	var EMPTY_PROPERTY_VALUES = {
		fontId: 0,
		fontWeight: '',
		fontStyle: '',
		letterSpacing: 0,
		lineHeight: 0,
		features: [],
		fontVariationSettings: '',
		initialHang: 0,
	};

	function hasOwn(obj, key) {
		return !!obj && Object.prototype.hasOwnProperty.call(obj, key);
	}

	function isGroupKey(key) {
		return BASED_ON_GROUPS.fontSize.indexOf(key) !== -1 || BASED_ON_GROUPS.textCase.indexOf(key) !== -1;
	}

	/** What a style stores itself: ownProperties in the client shape (resolveStyleList), else properties. */
	function ownPropertiesOf(style) {
		if (!style) return {};
		var own = style.ownProperties !== undefined ? style.ownProperties : style.properties;
		return own && typeof own === 'object' ? own : {};
	}

	/**
	 * Lay a child's own properties over its parent's resolved ones. Twin of
	 * PHP merge_properties(): the size and the case inherit as groups, every
	 * other key one by one.
	 *
	 * @param {Object} base Parent's resolved properties.
	 * @param {Object} own  Child's own properties.
	 * @return {Object}
	 */
	function mergeStyleProperties(base, own) {
		var out = Object.assign({}, base || {});
		if (!own || typeof own !== 'object') return out;
		Object.keys(BASED_ON_GROUPS).forEach(function (lead) {
			if (!hasOwn(own, lead)) return;
			BASED_ON_GROUPS[lead].forEach(function (key) {
				delete out[key];
				if (hasOwn(own, key)) {
					out[key] = own[key];
				}
			});
		});
		Object.keys(own).forEach(function (key) {
			if (!isGroupKey(key)) {
				out[key] = own[key];
			}
		});
		return out;
	}

	/**
	 * Drop the empty values that unset an inherited property, once resolved.
	 * Twin of PHP compact_properties(): fontSize 'inherit' drops the size
	 * group, an unknown or empty textCase the case group, and any other key
	 * goes when PHP empty() (an empty features list included).
	 *
	 * @param {Object} props
	 * @return {Object}
	 */
	function compactStyleProperties(props) {
		var out = Object.assign({}, props || {});
		if (hasOwn(out, 'fontSize') && (out.fontSize === null || out.fontSize === undefined || out.fontSize === '' || out.fontSize === 'inherit')) {
			BASED_ON_GROUPS.fontSize.forEach(function (key) { delete out[key]; });
		}
		if (hasOwn(out, 'textCase') && TEXT_CASE_VALUES.indexOf(out.textCase) === -1) {
			BASED_ON_GROUPS.textCase.forEach(function (key) { delete out[key]; });
		}
		Object.keys(out).forEach(function (key) {
			var value = out[key];
			if (!isGroupKey(key) && (phpFalsy(value) || (Array.isArray(value) && value.length === 0))) {
				delete out[key];
			}
		});
		return out;
	}

	/**
	 * A style's properties resolved through its Based On chain (#200). Twin
	 * of PHP resolve_properties(): a style without basedOn returns what it
	 * stores, untouched; otherwise the chain (at most MAX_BASED_ON_LEVELS
	 * styles, stopping at a missing parent or a loop) is merged from the
	 * root down and compacted.
	 *
	 * Takes styles in either shape: stored, or the client shape where
	 * ownProperties holds what each style stores.
	 *
	 * @param {Object} style  Style.
	 * @param {Array}  styles Every style.
	 * @return {Object} Resolved properties.
	 */
	function resolveStyleProperties(style, styles) {
		var own = ownPropertiesOf(style);
		if (!style || !style.basedOn) return own;
		var byId = {};
		(Array.isArray(styles) ? styles : []).forEach(function (candidate) {
			if (candidate && candidate.id !== undefined && isFinite(candidate.id)) {
				byId[parseInt(candidate.id, 10)] = candidate;
			}
		});
		var chain = [style];
		var visited = {};
		visited[parseInt(style.id, 10) || 0] = true;
		var current = style;
		while (current.basedOn && chain.length < MAX_BASED_ON_LEVELS) {
			var parentId = parseInt(current.basedOn, 10);
			if (!byId[parentId] || visited[parentId]) break;
			visited[parentId] = true;
			current = byId[parentId];
			chain.push(current);
		}
		var resolved = {};
		for (var i = chain.length - 1; i >= 0; i--) {
			resolved = mergeStyleProperties(resolved, ownPropertiesOf(chain[i]));
		}
		return compactStyleProperties(resolved);
	}

	/**
	 * Every style in the client shape: `properties` resolved, plus
	 * `ownProperties` (what the style stores) for a style based on another.
	 * Twin of PHP prepare_style_for_client(). Idempotent, so the editor runs
	 * it over its list after every save: a change to a parent changes the
	 * resolved properties of every style based on it.
	 *
	 * @param {Array} styles Styles, stored or client shape.
	 * @return {Array}
	 */
	function resolveStyleList(styles) {
		var list = Array.isArray(styles) ? styles : [];
		return list.map(function (style) {
			if (!style || !style.basedOn) return style;
			return Object.assign({}, style, {
				ownProperties: ownPropertiesOf(style),
				properties: resolveStyleProperties(style, list),
			});
		});
	}

	// PHP (string) cast for the scalar values styles hold
	function phpString(value) {
		if (value === null || value === undefined || value === false) return '';
		if (value === true) return '1';
		if (typeof value === 'object') return '';
		return String(value);
	}

	/**
	 * A comparable form of a group, as the CSS generators read it. Twin of
	 * PHP group_signature().
	 */
	function groupSignature(lead, props) {
		var p = props || {};
		if (lead === 'textCase') {
			var c = TEXT_CASE_VALUES.indexOf(p.textCase) !== -1 ? p.textCase : '';
			return c + '|' + (effectiveFakeSmallCaps(c, p.fakeSmallCaps) ? '1' : '0');
		}
		var size = hasOwn(p, 'fontSize') ? phpString(p.fontSize) : '';
		if (size === '' || size === 'inherit') return 'none';
		var parts = [size, p.fontSizeUnit === 'rem' ? 'rem' : 'px'];
		if (size === 'responsive' || size === 'fit') {
			['fontSizeMin', 'fontSizePreferred', 'fontSizeMax'].forEach(function (key) {
				parts.push(p[key] !== undefined && p[key] !== null ? String(phpInt(p[key])) : '');
			});
		}
		if (size === 'fit') {
			parts.push(p.fitMaxSize !== undefined && p.fitMaxSize !== null ? String(phpInt(p.fitMaxSize)) : '0');
		}
		return parts.join('|');
	}

	/**
	 * Whether a non-group property has the same value in two property sets,
	 * absent counting as empty. Twin of PHP property_values_equal().
	 */
	function propertyValuesEqual(key, a, b) {
		var va = hasOwn(a, key) ? a[key] : null;
		var vb = hasOwn(b, key) ? b[key] : null;
		switch (key) {
			case 'fontId':
				return Math.abs(phpInt(va)) === Math.abs(phpInt(vb));
			case 'letterSpacing':
				return phpInt(va) === phpInt(vb);
			case 'lineHeight':
				return Math.abs((parseFloat(va) || 0) - (parseFloat(vb) || 0)) <= LINE_HEIGHT_TOLERANCE;
			case 'initialHang':
				return normalizeHang(va) === normalizeHang(vb);
			case 'features':
				var fa = (Array.isArray(va) ? va : []).map(String).sort();
				var fb = (Array.isArray(vb) ? vb : []).map(String).sort();
				return fa.join(',') === fb.join(',') && fa.length === fb.length;
			default:
				return phpString(va) === phpString(vb);
		}
	}

	/**
	 * The own properties to store for a style based on another (#200).
	 *
	 * `full` is the whole look the editor saves; the result keeps only what
	 * differs from the parent's resolved properties. A value equal to the
	 * parent's becomes inherited, so a later change to the parent reaches
	 * the style (the editors save their whole state, so keeping such values
	 * as overrides would cut every property off from the parent on the first
	 * Update Style). A property the parent sets and `full` does not is
	 * stored as its empty value (EMPTY_PROPERTY_VALUES, fontSize 'inherit',
	 * textCase ''), so the style keeps not setting it.
	 *
	 * Twin of PHP compute_overrides() (the server's first-parent rebase);
	 * both read the `overrides` cases of the shared fixture.
	 *
	 * @param {Object} full   Properties as buildPropertiesForStyleSave() builds them.
	 * @param {Object} parent The parent's resolved properties.
	 * @return {Object}
	 */
	function computeStyleOverrides(full, parent) {
		var f = full || {};
		var p = parent || {};
		var out = {};
		Object.keys(BASED_ON_GROUPS).forEach(function (lead) {
			var mine = groupSignature(lead, f);
			if (mine === groupSignature(lead, p)) return;
			if (mine === 'none' || (lead === 'textCase' && !normalizeTextCase(f.textCase))) {
				out[lead] = lead === 'fontSize' ? 'inherit' : '';
				return;
			}
			BASED_ON_GROUPS[lead].forEach(function (key) {
				if (hasOwn(f, key)) {
					out[key] = f[key];
				}
			});
		});
		var keys = {};
		Object.keys(f).concat(Object.keys(p)).forEach(function (key) {
			if (!isGroupKey(key)) keys[key] = true;
		});
		Object.keys(keys).forEach(function (key) {
			if (propertyValuesEqual(key, f, p)) return;
			if (hasOwn(f, key)) {
				out[key] = f[key];
			} else if (hasOwn(EMPTY_PROPERTY_VALUES, key)) {
				var empty = EMPTY_PROPERTY_VALUES[key];
				out[key] = Array.isArray(empty) ? [] : empty;
			}
		});
		return out;
	}

	/**
	 * Ids of the styles based on a style, directly or through others. Twin
	 * of PHP descendant_ids(); the admin form leaves them out of its Based
	 * On choices, because choosing one would make a loop.
	 *
	 * @param {Array}         styles  Every style.
	 * @param {number|string} styleId Style id.
	 * @return {number[]}
	 */
	function getStyleDescendantIds(styles, styleId) {
		var children = {};
		(Array.isArray(styles) ? styles : []).forEach(function (style) {
			if (style && style.basedOn && style.id !== undefined) {
				var parent = parseInt(style.basedOn, 10);
				(children[parent] = children[parent] || []).push(parseInt(style.id, 10));
			}
		});
		var root = parseInt(styleId, 10);
		var found = [];
		var seen = {};
		var queue = [root];
		while (queue.length) {
			(children[queue.shift()] || []).forEach(function (child) {
				if (!seen[child] && child !== root) {
					seen[child] = true;
					found.push(child);
					queue.push(child);
				}
			});
		}
		return found;
	}

	/**
	 * The properties Update Style sends for a style (#200): the editor's
	 * look (buildPropertiesForStyleSave()) for a style without a parent, and
	 * only the overrides (computeStyleOverrides()) for a style based on
	 * another. A missing parent sends the whole look.
	 *
	 * @param {Object} state     Editor state.
	 * @param {Object} style     The active style (client shape: resolved properties).
	 * @param {Array}  styles    Every style.
	 * @param {string} [newUnit] The site's unit for new sizes.
	 * @return {Object}
	 */
	function buildStyleUpdateProperties(state, style, styles, newUnit) {
		var full = buildPropertiesForStyleSave(state, style ? style.properties : null, true, newUnit);
		if (!style || !style.basedOn) return full;
		var parent = null;
		(Array.isArray(styles) ? styles : []).forEach(function (candidate) {
			if (candidate && String(candidate.id) === String(style.basedOn)) parent = candidate;
		});
		if (!parent) return full;
		return computeStyleOverrides(full, resolveStyleProperties(parent, styles));
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
	 * - fontSizeUnit (#233) — style-only: it decides the unit of the style's
	 *   own CSS rule. It rides along in the payload when stored, but neither
	 *   editor's apply handler reads it: a block keeps its own unit, which
	 *   only matters once the block has no styleClass.
	 * - Extension-owned keys (layeredConfigId, animationConfigId).
	 *
	 * initialHang IS normalized (to 0): a style without a hang must remove a
	 * lingering hang on apply. The inline editor ignores the key, because a
	 * hang has no effect on an inline span.
	 *
	 * textCase IS normalized (to '' = Default) and fakeSmallCaps (to true),
	 * for the same reason (#214). Both editors apply them: the block sets
	 * its attributes, and the inline editor stores them on the span
	 * (data-textcase) while the style's class renders the case, so Detach
	 * keeps it.
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
			initialHang: 0,
			textCase: '',
			fakeSmallCaps: true,
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
	 *
	 * savedFromSelection marks a style the panel has just saved from the
	 * selected text (Save, Save as New). The host then skips its "replaces
	 * that styling" question when the selection has one set of values: the
	 * style was built from them (#303).
	 */
	function buildApplyEventDetail(style, editorSource, detachProperties, applyTo, savedFromSelection) {
		var source = editorSource === 'inspector' ? 'inspector' : editorSource;
		// 'selection' asks the host to wrap the selected text rather than
		// restyle the whole block. Only set when the caller knows a selection
		// was captured; anything else stays block-level, which is what a
		// paragraph style normally means.
		var scope = applyTo === 'selection' ? { applyTo: 'selection' } : {};
		if (style && savedFromSelection) {
			scope.savedFromSelection = true;
		}

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
				/* translators: 1: smallest font size, 2: largest font size. */ __('Fluid %1$s–%2$s', 'typost-paragraph-styles'),
				[props.fontSizeMin || '?', props.fontSizeMax || '?']
			);
		} else if (fontSize === 'fit') {
			// Fit sizes are measured per line at render time; the cap is the
			// only number the style itself knows.
			realSize = parseFloat(props.fitMaxSize) || null;
			sizeLabel = props.fitMaxSize
				? format(/* translators: %s: maximum font size in pixels. */ __('Fit ≤ %spx', 'typost-paragraph-styles'), [props.fitMaxSize])
				: __('Fit', 'typost-paragraph-styles');
		} else if (fontSize && fontSize !== 'inherit') {
			realSize = parseFloat(fontSize);
			sizeLabel = isNaN(realSize) ? '' : format(/* translators: %s: font size in pixels. */ __('%spx', 'typost-paragraph-styles'), [realSize]);
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

	// px ÷ 16, rounded to six decimals: the twin of PHP px_to_rem() and of
	// pxToRem() in core's assets/js/font-size-units.js (#233), which this
	// module cannot require (no build step). Keep all three identical.
	function pxToRem(px) {
		var rem = Number(px) / 16;
		if (!isFinite(rem) || Math.abs(rem) < 0.0001) {
			return 0;
		}
		return Number(Math.round(Number(rem + 'e6')) + 'e-6');
	}

	/**
	 * The vw term of a rem style's responsive clamp (#234): the author's
	 * slope, limited so the size doubles by 500% browser zoom. Twin of
	 * getResponsiveZoomLimit() in core's assets/js/font-size-units.js (which
	 * explains the bound) and of PHP responsive_zoom_vw(). Keep all three
	 * identical.
	 *
	 * @param {number} min  Mobile size (px)
	 * @param {number} pref Preferred size (px)
	 * @param {number} max  Desktop size (px)
	 * @return {number} vw coefficient, four decimals
	 */
	function responsiveZoomVw(min, pref, max) {
		var vw = ((max - min) / (RESPONSIVE_FONT_MAX_VIEWPORT - RESPONSIVE_FONT_MIN_VIEWPORT)) * 100;
		var reach = Math.max(4 * pref, 2.5 * min);
		if (vw > 0 && pref >= 0 && max > reach) {
			var bound = Math.floor((((reach - pref) * 100) / RESPONSIVE_FONT_MAX_VIEWPORT) * 10000 + 1e-7) / 10000;
			if (bound < vw) {
				return bound;
			}
		}
		return round4(vw);
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

		// Styles saved after #233 write rem; a style without the key writes
		// px exactly as before (see the PHP twin)
		var useRem = props.fontSizeUnit === 'rem';

		if (props.fontSize !== undefined && isFinite(props.fontSize) && Number(props.fontSize) > 0) {
			rules.push(useRem
				? 'font-size: ' + phpFloatStr(pxToRem(props.fontSize)) + 'rem'
				: 'font-size: ' + phpInt(props.fontSize) + 'px');
		}

		// Responsive clamp; fit styles emit the same fallback clamp (see the
		// PHP twin for why)
		if ((props.fontSize === 'responsive' || props.fontSize === 'fit') &&
			props.fontSizeMin !== undefined && props.fontSizePreferred !== undefined && props.fontSizeMax !== undefined) {
			var min = phpInt(props.fontSizeMin);
			var pref = phpInt(props.fontSizePreferred);
			var max = phpInt(props.fontSizeMax);
			var vw = ((max - min) / (RESPONSIVE_FONT_MAX_VIEWPORT - RESPONSIVE_FONT_MIN_VIEWPORT)) * 100;
			if (useRem) {
				rules.push('font-size: clamp(' + phpFloatStr(pxToRem(min)) + 'rem, ' + phpFloatStr(pxToRem(pref)) + 'rem + ' +
					responsiveZoomVw(min, pref, max) + 'vw, ' + phpFloatStr(pxToRem(max)) + 'rem)');
			} else {
				rules.push('font-size: clamp(' + min + 'px, ' + round4(pref / 16) + 'rem + ' + round4(vw) + 'vw, ' + max + 'px)');
			}
		}

		// Hanging initial (#242): a custom property that core's block
		// style.css reads in its ::first-letter rule. Same clamp and rounding
		// as the PHP twin.
		var hang = normalizeHang(props.initialHang);
		if (hang > 0) {
			rules.push('--typost-hang: ' + phpFloatStr(hang));
		}

		// Case (#214). Same declarations and order as the PHP twin.
		var caseRules = caseDeclarations(props.textCase, props.fakeSmallCaps);
		for (var k = 0; k < caseRules.length; k++) {
			rules.push(caseRules[k][0] + ': ' + caseRules[k][1]);
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

		var css = selector + ' {\n    ' + rules.join(';\n    ') + ';\n}';
		if (hang > 0) {
			css += coreBlockHangCss(id);
		}
		return css;
	}

	/**
	 * The First Letter Hang rules for a style on core blocks (#219) — the
	 * JS twin of PHP core_block_hang_css(); see there for each rule's reason.
	 * Emitted only for a style with a hang.
	 *
	 * @param {number} id Style id.
	 * @return {string} CSS, starting with a blank line.
	 */
	function coreBlockHangCss(id) {
		var cls = '.typost-styled.typost-ps-' + id;
		var amount = 'calc(var(--typost-hang, 0) * var(--typost-hang-on, 1) * -1em)';
		var tags = ':is(p, h1, h2, h3, h4, h5, h6)';
		var off = ' {\n    --typost-hang-on: 0;\n}';
		var on = ' {\n    --typost-hang-on: 1;\n}';
		var rtl = ':is([style*="direction: rtl"], [style*="direction:rtl"])';
		var ltr = ':is([style*="direction: ltr"], [style*="direction:ltr"])';
		return '\n\n' + cls + tags + ':not(.wp-block-typost *, .has-drop-cap, .block-editor-rich-text__editable, [style*="text-indent"])::first-letter {\n    margin-inline-start: ' + amount + ';\n}' +
			'\n\n' + cls + '.block-editor-rich-text__editable' + tags + ':not(.wp-block-typost *, .has-drop-cap, [style*="text-indent"]) {\n    text-indent: ' + amount + ';\n}' +
			'\n\n' + cls + '.has-text-align-center' + off +
			'\n\n' + cls + '.has-text-align-right:dir(ltr)' + off +
			'\n\n' + cls + '.has-text-align-left:dir(rtl)' + off +
			// A block's own direction is an inline declaration in the editor,
			// which :dir() does not see; it decides the end edge there
			'\n\n' + cls + '.has-text-align-right' + ltr + off +
			'\n\n' + cls + '.has-text-align-left' + rtl + off +
			'\n\n' + cls + '.has-text-align-right' + rtl + on +
			'\n\n' + cls + '.has-text-align-left' + ltr + on;
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
	 * What the Paragraph Style panel works on (#303).
	 *
	 * Every other control in the Quick Feature Toggles styles the selected
	 * text, so with text selected their panel does too: it captures and
	 * diffs the values set on the selection (state.selection), shows the
	 * style on the selection, and applies with applyTo 'selection'. With
	 * only a caret it stays block-level. The Inspector's panel is always
	 * block-level, and the inline editor's host applies to its own saved
	 * selection, so neither needs the flag.
	 *
	 * Block-level in the Typography Stylist block ('qft' with a caret,
	 * 'inspector') reads the block's own font, weight and font style
	 * (state.block), not the selected text's, which the shared explicit keys
	 * report first.
	 *
	 * @param {string} editorSource 'qft' | 'inspector' | 'inline'
	 * @param {Object} state        Editor state from typost_current_editor_state
	 * @return {{applyTo: (string|undefined), state: Object, activeStyleId: number}}
	 *   applyTo for buildApplyEventDetail, the state to capture and diff,
	 *   and the style to show as active (0 for none)
	 */
	function resolvePanelScope(editorSource, state) {
		var s = state || {};
		var onSelection = editorSource === 'qft' && !!s.hasSelection;
		var blockState = s;
		if ((editorSource === 'qft' || editorSource === 'inspector') && s.block) {
			blockState = Object.assign({}, s, s.block);
		}
		return {
			applyTo: onSelection ? 'selection' : undefined,
			// Never the block's values with text selected: an empty
			// selection state captures nothing, which is what the text sets
			state: onSelection ? (s.selection || {}) : blockState,
			activeStyleId: resolveBrowserActiveStyleId(s, onSelection),
		};
	}

	// -------------------------------------------------------------------------
	// Styles on core blocks (#219)
	// -------------------------------------------------------------------------

	/**
	 * Core blocks that take a paragraph style as a whole. The style goes in
	 * the block's className as `typost-styled typost-ps-N`, which the block
	 * serializes into both the comment and the root element's class, so the
	 * block stays valid and the generator's block-level selector matches it.
	 */
	var CORE_STYLE_BLOCKS = ['core/paragraph', 'core/heading'];

	var STYLE_CLASS_PATTERN = /^typost-ps-([A-Za-z0-9_-]+)$/;

	/**
	 * @param {string} blockName Block type name
	 * @return {boolean} Whether a style can be applied to the whole block
	 */
	function isCoreStyleBlock(blockName) {
		return CORE_STYLE_BLOCKS.indexOf(blockName) !== -1;
	}

	function classTokens(className) {
		return typeof className === 'string' ? className.split(/\s+/).filter(Boolean) : [];
	}

	/**
	 * Every class except the ones a paragraph style owns. Other classes
	 * (a theme's is-style-outline, the author's own) stay in their order.
	 * A bare `typost-styled` with no `typost-ps-*` is removed too: the two
	 * classes are one pair that belongs to the style, so a block never
	 * keeps half of it.
	 */
	function withoutStyleClasses(className) {
		return classTokens(className).filter(function (token) {
			return token !== 'typost-styled' && !STYLE_CLASS_PATTERN.test(token);
		});
	}

	/**
	 * The style reference in a core block's className.
	 *
	 * @param {string} className The block's className attribute
	 * @return {string} The id (or legacy id) after `typost-ps-`, '' for none
	 */
	function getCoreBlockStyleRef(className) {
		var tokens = classTokens(className);
		for (var i = 0; i < tokens.length; i++) {
			var match = STYLE_CLASS_PATTERN.exec(tokens[i]);
			if (match) {
				return match[1];
			}
		}
		return '';
	}

	/**
	 * The className with a style applied. Replaces any style the block
	 * already had, so a block carries at most one.
	 *
	 * @param {string}        className The block's className attribute
	 * @param {number|string} styleId   Style id
	 * @return {string} New className
	 */
	function applyStyleToClassName(className, styleId) {
		var id = String(styleId === undefined || styleId === null ? '' : styleId);
		var tokens = withoutStyleClasses(className);
		if (/^[A-Za-z0-9_-]+$/.test(id)) {
			tokens.push('typost-styled', 'typost-ps-' + id);
		}
		return tokens.join(' ');
	}

	/**
	 * The className with the style removed (Detach).
	 *
	 * @param {string} className The block's className attribute
	 * @return {string|undefined} New className, undefined when no class is
	 *   left, so the attribute is dropped instead of saved as ""
	 */
	function removeStyleFromClassName(className) {
		var tokens = withoutStyleClasses(className);
		return tokens.length ? tokens.join(' ') : undefined;
	}

	/**
	 * The stored style a reference names: by id, or by the legacy
	 * `ps_…` id that migrated content can still carry.
	 *
	 * @param {Array}         styles Stored styles
	 * @param {string|number} ref    Style reference
	 * @return {Object|null} The style, or null when none matches
	 */
	function findStyleByRef(styles, ref) {
		var key = String(ref === undefined || ref === null ? '' : ref);
		if (!key) return null;
		var list = styles || [];
		for (var i = 0; i < list.length; i++) {
			var style = list[i];
			if (style && (String(style.id) === key || (style.legacyId && String(style.legacyId) === key))) {
				return style;
			}
		}
		return null;
	}

	/**
	 * Where a browser opened from a block toolbar applies.
	 *
	 * - The inline editor's toolbar (source 'inline') with text selected:
	 *   the selection, through the inline route (a data-style-id span).
	 * - The same toolbar with only a caret, in a core Paragraph or Heading:
	 *   the whole block, through its className ('core-block').
	 * - The same toolbar with only a caret in any other block: nothing to
	 *   apply to (needsSelection). Those blocks take a style on selected
	 *   text only, and a collapsed range would style nothing.
	 * - The Typography Stylist block's toolbar: block-level through the
	 *   'inspector' route, or the selection when one was captured.
	 * A caller that names its editorSource (the panels) keeps it.
	 *
	 * @param {Object} context Toolbar click context (see HOOKS.md)
	 * @param {Object} block   The selected block ({clientId, name}), or null
	 * @return {Object} {editorSource, hasSelection, clientId, needsSelection}
	 */
	function resolveBrowserLaunch(context, block) {
		var ctx = context || {};
		if (ctx.editorSource) {
			return {
				editorSource: ctx.editorSource,
				hasSelection: !!ctx.hasSelection,
				clientId: ctx.clientId || null,
				needsSelection: false,
			};
		}
		if (ctx.source === 'inline') {
			var start = ctx.savedSelectionStart;
			var end = ctx.savedSelectionEnd;
			var selected = typeof start === 'number' && typeof end === 'number' && start !== end;
			if (!selected && block && isCoreStyleBlock(block.name)) {
				return { editorSource: 'core-block', hasSelection: false, clientId: block.clientId || null, needsSelection: false };
			}
			return { editorSource: 'inline', hasSelection: true, clientId: null, needsSelection: !selected };
		}
		var captured = ctx.capturedSelection;
		var hasSelection = ctx.hasSelection !== undefined
			? !!ctx.hasSelection
			: !!(captured && captured.start !== captured.end);
		return { editorSource: 'inspector', hasSelection: hasSelection, clientId: null, needsSelection: false };
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
	var BROWSER_GROUP_MODES = ['none', 'font', 'size', 'recent'];

	/** localStorage key holding the ids of the styles this author applied last. */
	var RECENT_STYLES_KEY = 'typost_ps_recent_styles';

	/** How many recently used style ids are remembered. */
	var RECENT_STYLES_LIMIT = 8;

	/**
	 * Read the recently used style ids, most recent first.
	 *
	 * Browser storage is a per-viewer convenience: it can be missing, blocked
	 * or hold garbage, so every failure reads as "nothing remembered".
	 *
	 * @param {Storage} storage window.localStorage (or a stand-in)
	 * @return {number[]} Style ids, most recent first, deduplicated
	 */
	function readRecentStyleIds(storage) {
		var raw;
		try {
			raw = storage && storage.getItem ? storage.getItem(RECENT_STYLES_KEY) : null;
		} catch (e) {
			return [];
		}
		if (!raw) return [];
		var parsed;
		try {
			parsed = JSON.parse(raw);
		} catch (e) {
			return [];
		}
		if (!Array.isArray(parsed)) return [];
		var seen = {};
		return parsed.map(function (id) { return parseInt(id, 10); }).filter(function (id) {
			if (!(id > 0) || seen[id]) return false;
			seen[id] = true;
			return true;
		}).slice(0, RECENT_STYLES_LIMIT);
	}

	/**
	 * Remember a style as the most recently used and return the new list.
	 *
	 * @param {Storage} storage window.localStorage (or a stand-in)
	 * @param {number}  styleId Style just applied
	 * @param {number}  [limit] Ids to keep (default RECENT_STYLES_LIMIT)
	 * @return {number[]} The stored list, most recent first
	 */
	function recordRecentStyleId(storage, styleId, limit) {
		var id = parseInt(styleId, 10);
		var keep = parseInt(limit, 10) || RECENT_STYLES_LIMIT;
		var list = readRecentStyleIds(storage);
		if (!(id > 0)) return list;
		list = [id].concat(list.filter(function (other) { return other !== id; })).slice(0, keep);
		try {
			if (storage && storage.setItem) storage.setItem(RECENT_STYLES_KEY, JSON.stringify(list));
		} catch (e) {
			// Storage blocked or full: the list still works for this open modal
		}
		return list;
	}

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
	 * - 'recent': the styles in recentIds (most recent first) under "Recently
	 *   used", the rest under "Other styles"; with nothing remembered among
	 *   the list the flat list is returned.
	 * - anything else: a single group with key 'all' and no label, which the
	 *   browser renders as the flat list.
	 *
	 * @param {Array}    styles     Styles to group (already filtered)
	 * @param {string}   mode       'none' | 'font' | 'size' | 'recent'
	 * @param {Function} fontNameOf style → font name ('' / null when none)
	 * @param {number[]} [recentIds] Recently used style ids, most recent first
	 * @return {Array} [{ key, label, styles }] in display order
	 */
	function groupParagraphStyles(styles, mode, fontNameOf, recentIds) {
		var list = (styles || []).filter(function (style) { return !!style; });

		if (mode === 'recent') {
			var ids = (recentIds || []).map(function (id) { return String(id); });
			var byId = {};
			list.forEach(function (style) { byId[String(style.id)] = style; });
			var recent = ids.map(function (id) { return byId[id]; }).filter(function (style) { return !!style; });
			if (!recent.length) {
				return [{ key: 'all', label: '', styles: list }];
			}
			var recentSet = {};
			recent.forEach(function (style) { recentSet[String(style.id)] = true; });
			var others = list.filter(function (style) { return !recentSet[String(style.id)]; });
			var out = [{ key: 'recent', label: __('Recently used', 'typost-paragraph-styles'), styles: recent }];
			if (others.length) {
				out.push({ key: 'recent:others', label: __('Other styles', 'typost-paragraph-styles'), styles: others });
			}
			return out;
		}

		if (mode === 'font') {
			// Prototype-free: a family named "constructor" must be its own group
			var byName = Object.create(null);
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
				groups.push({ key: 'font:none', label: __('No font set', 'typost-paragraph-styles'), styles: noFont });
			}
			return groups;
		}

		if (mode === 'size') {
			var buckets = { fixed: [], responsive: [], fit: [], inherit: [] };
			list.forEach(function (style) {
				buckets[sizeModeOf(style.properties && style.properties.fontSize)].push(style);
			});
			return [
				{ key: 'size:fixed', label: __('Fixed size', 'typost-paragraph-styles'), styles: buckets.fixed },
				{ key: 'size:responsive', label: __('Responsive', 'typost-paragraph-styles'), styles: buckets.responsive },
				{ key: 'size:fit', label: __('Fit to width', 'typost-paragraph-styles'), styles: buckets.fit },
				{ key: 'size:inherit', label: __('Inherited size', 'typost-paragraph-styles'), styles: buckets.inherit },
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
		normalizeHang: normalizeHang,
		TEXT_CASE_VALUES: TEXT_CASE_VALUES,
		normalizeTextCase: normalizeTextCase,
		isSmallCapsCase: isSmallCapsCase,
		caseDeclarations: caseDeclarations,
		resolveBrowserActiveStyleId: resolveBrowserActiveStyleId,
		resolvePanelScope: resolvePanelScope,
		CORE_STYLE_BLOCKS: CORE_STYLE_BLOCKS,
		isCoreStyleBlock: isCoreStyleBlock,
		getCoreBlockStyleRef: getCoreBlockStyleRef,
		applyStyleToClassName: applyStyleToClassName,
		removeStyleFromClassName: removeStyleFromClassName,
		findStyleByRef: findStyleByRef,
		resolveBrowserLaunch: resolveBrowserLaunch,
		BROWSER_PAGE_SIZE: BROWSER_PAGE_SIZE,
		BROWSER_GROUP_MODES: BROWSER_GROUP_MODES,
		RECENT_STYLES_KEY: RECENT_STYLES_KEY,
		RECENT_STYLES_LIMIT: RECENT_STYLES_LIMIT,
		readRecentStyleIds: readRecentStyleIds,
		recordRecentStyleId: recordRecentStyleId,
		filterParagraphStyles: filterParagraphStyles,
		buildBrowserSampleText: buildBrowserSampleText,
		groupParagraphStyles: groupParagraphStyles,
		paginateGroups: paginateGroups,
		flattenGroups: flattenGroups,
		resolveBrowserCursorIndex: resolveBrowserCursorIndex,
		resolveBrowserCursorKey: resolveBrowserCursorKey,
		findTypeAheadMatch: findTypeAheadMatch,
		buildPropertiesFromState: buildPropertiesFromState,
		buildPropertiesForStyleSave: buildPropertiesForStyleSave,
		MAX_BASED_ON_LEVELS: MAX_BASED_ON_LEVELS,
		BASED_ON_GROUPS: BASED_ON_GROUPS,
		mergeStyleProperties: mergeStyleProperties,
		compactStyleProperties: compactStyleProperties,
		resolveStyleProperties: resolveStyleProperties,
		resolveStyleList: resolveStyleList,
		computeStyleOverrides: computeStyleOverrides,
		buildStyleUpdateProperties: buildStyleUpdateProperties,
		getStyleDescendantIds: getStyleDescendantIds,
		normalizeApplyProperties: normalizeApplyProperties,
		buildApplyEventDetail: buildApplyEventDetail,
		buildStylePreviewStyle: buildStylePreviewStyle,
		buildStyleCssBlock: buildStyleCssBlock,
		pxToRem: pxToRem,
		responsiveZoomVw: responsiveZoomVw,
	};

	if (typeof window !== 'undefined') {
		window.typostPSUtils = api;
	}
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = api;
	}
})();
