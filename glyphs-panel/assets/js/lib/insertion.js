/**
 * Glyphs Panel — Insertion Payload Builder
 *
 * Builds the detail payload for the core plugin's `typost-insert-content`
 * CustomEvent. The payload builder is pure; dispatchInsert() is the only
 * browser-coupled function.
 *
 * Dual export: window.typostGlyphs.* for the browser, module.exports for Jest.
 */
(function() {
	'use strict';

	/**
	 * Build a font-feature-settings CSS value from feature tags.
	 * Each tag is enabled with value 1, matching the core plugin's
	 * featuresToCSS() convention.
	 *
	 * @param {string[]} features Feature tags
	 * @return {string} e.g. '"liga" 1, "ss01" 1'
	 */
	function buildFeatureSettingsCSS(features) {
		return (features || []).map(function(tag) {
			return '"' + tag + '" 1';
		}).join(', ');
	}

	/**
	 * Build the typost-insert-content event payload for a glyph insertion.
	 *
	 * Rules:
	 * 1. No feature and same font as context → plain text insertion
	 *    (attributes: null) — the character inherits surrounding formatting.
	 * 2. Feature glyphs merge the feature tag with context features, because
	 *    applying the typost format REPLACES it on the inserted range —
	 *    dropping context features would visually break mid-run insertions.
	 * 3. The span always carries data-font-id when a panel font is known, so
	 *    frontend @font-face detection loads the font.
	 * 4. Context font weight is preserved on the span when meaningful.
	 * 5. isBaseGlyph (the base cell of the alternates view) always builds a
	 *    span, even when rule 1 would send plain text. A base-cell click
	 *    means "restore the plain form": a plain insertion would inherit the
	 *    very alternate being removed (the core editor copies the replaced
	 *    range's formats onto the insertion), whereas a span payload owns
	 *    data-features / data-feature-settings in the core merge and so
	 *    drops the inherited alternate while sizing/spacing survive.
	 * 6. Clearing an inherited inline format is not enough when the alternate
	 *    comes from a BLOCK-LEVEL feature (or a paragraph style / theme CSS):
	 *    contextFeatures then carries that tag, and re-declaring it on the
	 *    span — or leaving it undeclared and inherited through CSS — keeps
	 *    the alternate on. So for isBaseGlyph, every clearTags entry that is
	 *    active in context is written as "tag" 0 into data-feature-settings
	 *    (the raw form the core format already supports for indexed
	 *    alternates), the remaining context tags follow at 1, and
	 *    data-features lists only the kept tags so the editor's toggles do
	 *    not show the cleared feature as on.
	 *
	 * @param {Object} opts
	 * @param {string} opts.text            Character(s) to insert ('A', 'fi')
	 * @param {string|null} opts.featureTag Feature required to render this glyph, or null
	 * @param {number} opts.featureIndex    Alternate index for indexed features
	 *                                      (salt/aalt); 1 or omitted = plain "tag" 1
	 * @param {boolean} opts.isBaseGlyph    True for the alternates view's base
	 *                                      cell — force a span so the inherited
	 *                                      alternate is cleared (rule 5)
	 * @param {string[]} opts.clearTags     Feature tags that produce alternates
	 *                                      for this character (the tags shown in
	 *                                      the alternates view); only used with
	 *                                      isBaseGlyph (rule 6)
	 * @param {number} opts.panelFontId     Font selected in the glyphs panel (numeric font_id)
	 * @param {string} opts.panelFontFamily CSS family for fonts without a numeric id
	 *                                      (WP Font Library); used only when panelFontId is 0
	 * @param {number} opts.contextFontId   Font active at the cursor / block
	 * @param {string[]} opts.contextFeatures Features active at the cursor
	 * @param {string} opts.contextFontWeight Font weight active at the cursor
	 * @return {{text: string, attributes: Object|null}}
	 */
	function buildInsertionPayload(opts) {
		opts = opts || {};
		var text = String(opts.text || '');
		var featureTag = opts.featureTag || null;
		var featureIndex = opts.featureIndex || 1;
		var isBaseGlyph = !!opts.isBaseGlyph;
		var clearTags = (isBaseGlyph && Array.isArray(opts.clearTags)) ? opts.clearTags : [];
		var panelFontId = opts.panelFontId || 0;
		var panelFontFamily = opts.panelFontFamily || '';
		var contextFontId = opts.contextFontId || 0;
		var contextFeatures = Array.isArray(opts.contextFeatures) ? opts.contextFeatures : [];
		var contextFontWeight = opts.contextFontWeight || '';

		var crossFont = (panelFontId !== 0 && panelFontId !== contextFontId) ||
			(panelFontId === 0 && !!panelFontFamily);
		var needsSpan = !!featureTag || crossFont || isBaseGlyph;

		if (!needsSpan) {
			return { text: text, attributes: null };
		}

		var attributes = {};
		var styleParts = [];

		// Plain (index-1) tags: the glyph's own feature first, then context
		// features, deduped; the indexed tag is carried separately
		var indexed = featureTag && featureIndex > 1;
		// Base cell: context tags that produce alternates for this character
		// are turned OFF explicitly (rule 6) instead of re-declared
		var disabledTags = [];
		var plainTags = [];
		var seen = {};
		(featureTag && !indexed ? [featureTag] : []).concat(contextFeatures).forEach(function(tag) {
			if (!tag || seen[tag] || (indexed && tag === featureTag)) {
				return;
			}
			seen[tag] = true;
			if (clearTags.indexOf(tag) !== -1) {
				disabledTags.push(tag);
			} else {
				plainTags.push(tag);
			}
		});

		if (indexed || disabledTags.length > 0) {
			// Indexed alternates ("salt" 2) and disabled tags ("swsh" 0) can't
			// be expressed by comma-tag data-features — the raw value goes into
			// data-feature-settings (registered on the core typost/features
			// format); the plain tags ride along at 1 AND in data-features
			var rawParts = [];
			if (indexed) {
				rawParts.push('"' + featureTag + '" ' + featureIndex);
			}
			disabledTags.forEach(function(tag) {
				rawParts.push('"' + tag + '" 0');
			});
			if (plainTags.length > 0) {
				rawParts.push(buildFeatureSettingsCSS(plainTags));
				attributes['data-features'] = plainTags.join(',');
			}
			var raw = rawParts.join(', ');
			attributes['data-feature-settings'] = raw;
			styleParts.push('font-feature-settings: ' + raw);
		} else if (plainTags.length > 0) {
			attributes['data-features'] = plainTags.join(',');
			styleParts.push('font-feature-settings: ' + buildFeatureSettingsCSS(plainTags));
		}

		// Font: panel font wins; ensures rendering + frontend @font-face detection
		var fontId = crossFont ? panelFontId : (contextFontId || panelFontId);
		if (fontId) {
			attributes['data-font-id'] = String(fontId);
			styleParts.push('font-family: var(--font-' + fontId + ')');
		} else if (crossFont && panelFontFamily) {
			// WP Font Library fonts have no numeric id / CSS variable — use the
			// raw family name (mirrors core's data-font convention). The font
			// must be loaded by WordPress/theme for frontend rendering.
			attributes['data-font'] = panelFontFamily;
			styleParts.push('font-family: ' + panelFontFamily);
		}

		// Preserve context weight (matches core attribute-preservation convention)
		if (contextFontWeight && contextFontWeight !== 'inherit') {
			attributes['data-fontweight'] = String(contextFontWeight);
			styleParts.push('font-weight: ' + contextFontWeight);
		}

		// A base-glyph span with no font/features/weight has nothing to
		// declare — the (attribute-less) span still replaces the inherited
		// typost format, which is the whole point of rule 5.
		if (styleParts.length > 0) {
			attributes.style = styleParts.join('; ');
		}

		return { text: text, attributes: attributes };
	}

	/**
	 * Dispatch a typost-insert-content event to the core plugin.
	 *
	 * @param {string} source 'inline' or 'qft'
	 * @param {{text: string, attributes: Object|null, swap: boolean=}} payload
	 *                        From buildInsertionPayload(); a truthy `swap`
	 *                        marks alternates-view semantics — the host editor
	 *                        keeps the inserted text selected so the next
	 *                        alternates click REPLACES it instead of appending
	 *                        after it.
	 * @param {Object} target Optional targeting info captured when the panel
	 *                        launched: {clientId, range: {start, end}}. Keeps
	 *                        insertion working after the host editor popover
	 *                        closes (modal focus changes reset its state).
	 */
	function dispatchInsert(source, payload, target) {
		if (typeof document === 'undefined' || !payload || !payload.text) {
			return;
		}
		target = target || {};
		document.dispatchEvent(new CustomEvent('typost-insert-content', {
			detail: {
				source: source,
				text: payload.text,
				attributes: payload.attributes,
				swap: payload.swap ? true : undefined,
				clientId: target.clientId || undefined,
				range: target.range || undefined
			}
		}));
	}

	/**
	 * Should this insertion swap (replace the glyph that is currently selected
	 * for alternate browsing and keep the new one selected) or insert?
	 *
	 * Swap semantics belong to browsing alternates of ONE character. The first
	 * pick swaps when the launch selection is that character (its alternates
	 * replace it); later picks swap while the browsed character is unchanged.
	 * As soon as the author browses a different character, the next insertion
	 * is a plain one, so the editor places it after the glyph that only stayed
	 * selected for swapping instead of over it (QA finding GP-1).
	 *
	 * @param {Object} args { inAlternatesView, altKey, lastAltKey, selectionText }
	 * @return {boolean}
	 */
	function shouldSwapInsertion(args) {
		if (!args || !args.inAlternatesView) {
			return false;
		}
		var altKey = args.altKey || '';
		if (!altKey) {
			return false;
		}
		if (args.lastAltKey !== null && args.lastAltKey !== undefined) {
			return args.lastAltKey === altKey;
		}
		return String(args.selectionText || '') === altKey;
	}

	var api = {
		buildFeatureSettingsCSS: buildFeatureSettingsCSS,
		buildInsertionPayload: buildInsertionPayload,
		shouldSwapInsertion: shouldSwapInsertion,
		dispatchInsert: dispatchInsert
	};

	if (typeof window !== 'undefined') {
		window.typostGlyphs = window.typostGlyphs || {};
		Object.assign(window.typostGlyphs, api);
	}
	if (typeof module !== 'undefined' && module.exports) {
		module.exports = api;
	}
})();
