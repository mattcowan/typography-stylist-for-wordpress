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
	 *
	 * @param {Object} opts
	 * @param {string} opts.text            Character(s) to insert ('A', 'fi')
	 * @param {string|null} opts.featureTag Feature required to render this glyph, or null
	 * @param {number} opts.featureIndex    Alternate index for indexed features
	 *                                      (salt/aalt); 1 or omitted = plain "tag" 1
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
		var panelFontId = opts.panelFontId || 0;
		var panelFontFamily = opts.panelFontFamily || '';
		var contextFontId = opts.contextFontId || 0;
		var contextFeatures = Array.isArray(opts.contextFeatures) ? opts.contextFeatures : [];
		var contextFontWeight = opts.contextFontWeight || '';

		var crossFont = (panelFontId !== 0 && panelFontId !== contextFontId) ||
			(panelFontId === 0 && !!panelFontFamily);
		var needsSpan = !!featureTag || crossFont;

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

		attributes.style = styleParts.join('; ');

		return { text: text, attributes: attributes };
	}

	/**
	 * Dispatch a typost-insert-content event to the core plugin.
	 *
	 * @param {string} source 'inline' or 'qft'
	 * @param {{text: string, attributes: Object|null}} payload From buildInsertionPayload()
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
