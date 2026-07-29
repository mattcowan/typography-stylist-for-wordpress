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
	 *
	 * @param {Object} opts
	 * @param {string} opts.text            Character(s) to insert ('A', 'fi')
	 * @param {string|null} opts.featureTag Feature required to render this glyph, or null
	 * @param {number} opts.featureIndex    Alternate index for indexed features
	 *                                      (salt/aalt); 1 or omitted = plain "tag" 1
	 * @param {boolean} opts.isBaseGlyph    True for the alternates view's base
	 *                                      cell — force a span so the inherited
	 *                                      alternate is cleared (rule 5)
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
		var plainTags = [];
		var seen = {};
		(featureTag && !indexed ? [featureTag] : []).concat(contextFeatures).forEach(function(tag) {
			if (tag && !seen[tag] && !(indexed && tag === featureTag)) {
				seen[tag] = true;
				plainTags.push(tag);
			}
		});

		if (indexed) {
			// Indexed alternates can't be expressed by comma-tag data-features —
			// the raw value goes into data-feature-settings (registered on the
			// core typost/features format)
			var raw = '"' + featureTag + '" ' + featureIndex;
			if (plainTags.length > 0) {
				raw += ', ' + buildFeatureSettingsCSS(plainTags);
				attributes['data-features'] = plainTags.join(',');
			}
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

	var api = {
		buildFeatureSettingsCSS: buildFeatureSettingsCSS,
		buildInsertionPayload: buildInsertionPayload,
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
