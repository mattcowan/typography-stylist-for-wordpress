/**
 * Shared font picker option builder
 *
 * Pure logic used by both the inline editor (assets/js/block-editor.js,
 * bundled with browserify) and the Typography Stylist block
 * (blocks/typography-stylist/edit.js, bundled with wp-scripts). Jest tests
 * import this module directly.
 *
 * WP Font Library fonts appear as a picker group. Fonts already adopted
 * (typost_adopted_wp_fonts) carry their numeric font_id like every other
 * source; unadopted ones use a "wp:{slug}" value — selecting one triggers
 * the idempotent adopt endpoint, which allocates a font_id, and the block
 * then stores fontId exactly as it always has. The save format never
 * changes.
 *
 * @since 2.1.0
 */

var WP_VALUE_PREFIX = 'wp:';

/**
 * Build picker options and the fontId lookup map from typostData-shaped data.
 *
 * @param {Object} data {fonts, adobeFonts, manualFonts, wpFontLibraryFonts,
 *                       adoptedWpFonts, pluginRegisteredSlugs, fontOrder}
 * @return {{options: Array, fontIdMap: Object}}
 */
function buildFontOptions(data) {
	data = data || {};
	var fonts = data.fonts || [];
	var adobeFonts = data.adobeFonts || [];
	var manualFonts = data.manualFonts || [];
	var wpLibraryFonts = data.wpFontLibraryFonts || [];
	var adoptedWpFonts = data.adoptedWpFonts || {};
	var pluginRegisteredSlugs = data.pluginRegisteredSlugs || [];
	var fontOrder = data.fontOrder || [];

	var options = [];
	var fontIdMap = {};

	// Uploaded fonts (webfont kits)
	fonts.forEach(function (font) {
		if (font.font_faces && font.font_faces.length > 0 && font.font_id) {
			var seen = {};
			font.font_faces.forEach(function (face) {
				if (!face.family || seen[face.family]) {
					return;
				}
				seen[face.family] = true;
				options.push({
					label: '📁 ' + face.family,
					value: String(font.font_id),
					fontFamily: face.family,
					fontId: font.font_id
				});
				fontIdMap[font.font_id] = {
					family: face.family,
					fallbacks: font.fallbacks,
					availableWeights: font.available_weights || []
				};
			});
		}
	});

	// Adobe Fonts
	adobeFonts.forEach(function (font) {
		// New structure: font_family (singular string - one entry per family)
		if (font.font_family && font.font_id) {
			options.push({
				label: '🅰️ ' + font.font_family,
				value: String(font.font_id),
				fontFamily: font.font_family,
				fontId: font.font_id
			});
			fontIdMap[font.font_id] = {
				family: font.font_family,
				fallbacks: font.fallbacks,
				availableWeights: font.available_weights || []
			};
		}
		// Legacy structure: font_families (plural array - multiple families per entry)
		else if (font.font_families && font.font_families.length > 0 && font.font_id) {
			font.font_families.forEach(function (family) {
				options.push({
					label: '🅰️ ' + family,
					value: String(font.font_id),
					fontFamily: family,
					fontId: font.font_id
				});
				fontIdMap[font.font_id] = {
					family: family,
					fallbacks: font.fallbacks,
					availableWeights: font.available_weights || []
				};
			});
		}
	});

	// Manual fonts
	manualFonts.forEach(function (font) {
		if (font.font_family && font.font_id) {
			options.push({
				label: '⚙️ ' + font.name,
				value: String(font.font_id),
				fontFamily: font.font_family,
				fontId: font.font_id
			});
			fontIdMap[font.font_id] = {
				family: font.font_family,
				fallbacks: font.fallbacks,
				availableWeights: font.available_weights || []
			};
		}
	});

	// WP Font Library fonts. Fonts the plugin itself registered are skipped —
	// they already appear above as uploaded kit fonts.
	wpLibraryFonts.forEach(function (wpl) {
		if (!wpl || !wpl.slug || !wpl.name) {
			return;
		}
		if (pluginRegisteredSlugs.indexOf(wpl.slug) !== -1) {
			return;
		}
		var adopted = adoptedWpFonts[wpl.slug];
		if (adopted && adopted.font_id) {
			options.push({
				label: '🌐 ' + wpl.name,
				value: String(adopted.font_id),
				fontFamily: adopted.font_family || wpl.font_family,
				fontId: adopted.font_id,
				wpSlug: wpl.slug
			});
			fontIdMap[adopted.font_id] = {
				family: adopted.font_family || wpl.font_family,
				fallbacks: adopted.fallbacks || '',
				availableWeights: adopted.available_weights || []
			};
		} else {
			options.push({
				label: '🌐 ' + wpl.name,
				value: WP_VALUE_PREFIX + wpl.slug,
				fontFamily: wpl.font_family,
				fontId: 0,
				wpSlug: wpl.slug
			});
		}
	});

	// Sort by saved font display order
	if (fontOrder.length > 0) {
		options.sort(function (a, b) {
			var keyVariants = function (opt) {
				var keys = [
					'font-' + opt.fontId,
					'adobe-' + opt.fontId,
					'manual-' + opt.fontId
				];
				if (opt.wpSlug) {
					keys.push('wpl-' + opt.wpSlug);
				}
				return keys;
			};
			var position = function (opt) {
				return keyVariants(opt).reduce(function (best, key) {
					var idx = fontOrder.indexOf(key);
					return idx !== -1 ? Math.min(best, idx) : best;
				}, Infinity);
			};
			var posA = position(a);
			var posB = position(b);
			if (posA === Infinity && posB === Infinity) return 0;
			if (posA === Infinity) return 1;
			if (posB === Infinity) return -1;
			return posA - posB;
		});
	}

	return { options: options, fontIdMap: fontIdMap };
}

/**
 * Whether a picker value refers to an unadopted WP Font Library font.
 *
 * @param {*} value
 * @return {boolean}
 */
function isWpLibraryValue(value) {
	return typeof value === 'string' && value.indexOf(WP_VALUE_PREFIX) === 0;
}

/**
 * Extract the Library slug from a "wp:{slug}" picker value.
 *
 * @param {string} value
 * @return {string}
 */
function wpSlugFromValue(value) {
	return isWpLibraryValue(value) ? value.slice(WP_VALUE_PREFIX.length) : '';
}

/**
 * Adopt a WP Font Library font: allocates (or returns the existing) numeric
 * font_id via the idempotent REST endpoint and records the adoption in
 * window.typostData so subsequent picker builds resolve it directly.
 *
 * @param {string} slug Library font slug
 * @return {Promise<Object>} Resolves with the adopted font entry
 */
function adoptWpFont(slug) {
	var typostData = window.typostData || {};
	var restUrl = typostData.restUrl || '';
	var nonce = typostData.nonce || '';

	return window.fetch(restUrl + 'wp-fonts/adopt', {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			'X-WP-Nonce': nonce
		},
		body: JSON.stringify({ slug: slug })
	}).then(function (response) {
		if (!response.ok) {
			throw new Error('adopt_failed');
		}
		return response.json();
	}).then(function (body) {
		if (!body || !body.font || !body.font.font_id) {
			throw new Error('adopt_failed');
		}
		// Record locally so the picker resolves this font by ID from now on
		if (window.typostData) {
			if (!window.typostData.adoptedWpFonts) {
				window.typostData.adoptedWpFonts = {};
			}
			window.typostData.adoptedWpFonts[slug] = body.font;
		}
		return body.font;
	});
}

/**
 * Resolve the font family for previewing the formatting at the current
 * selection. Spans written since v1.1.6 carry only data-font-id (the legacy
 * data-font family name is absent), so the family must be resolved from the
 * numeric ID via the fontIdMap.
 *
 * @param {string} activeFont   Family name from the legacy data-font attribute ('' if absent)
 * @param {number} activeFontId Numeric ID from data-font-id (0 if absent)
 * @param {Object} fontIdMap    Map of font_id -> {family, ...} from buildFontOptions()
 * @return {string} Family name, or '' when unresolvable
 */
function resolveActiveFontFamily(activeFont, activeFontId, fontIdMap) {
	if (activeFont) {
		return activeFont;
	}
	var id = parseInt(activeFontId, 10);
	if (!isNaN(id) && id > 0 && fontIdMap && fontIdMap[id]) {
		return fontIdMap[id].family;
	}
	return '';
}

/**
 * Resolve a plugin font ID from a computed `font-family` stack.
 *
 * The inverse of resolveActiveFontFamily(), for text that carries no typost
 * font of its own: a heading styled only by the theme still *renders* in one
 * of the plugin's fonts, and consumers like the Glyphs panel need its numeric
 * ID to load the actual font file. Without this they fall back to the first
 * font in the list and browse the wrong typeface.
 *
 * Matching walks the stack in order and takes the first family the plugin
 * knows, so `"Fraunces", Georgia, serif` resolves to Fraunces while a stack
 * of only system fonts resolves to nothing. Comparison ignores quotes and
 * case, which is how browsers report and authors write family names.
 *
 * @param {string} familyStack Computed font-family value (may list fallbacks)
 * @param {Object} fontIdMap   Map of font_id -> {family, ...} from buildFontOptions()
 * @return {number} Numeric font ID, or 0 when no family in the stack is a plugin font
 */
function resolveFontIdFromFamily(familyStack, fontIdMap) {
	if (!familyStack || !fontIdMap) {
		return 0;
	}

	var normalize = function (name) {
		return String(name).replace(/['"]/g, '').trim().toLowerCase();
	};

	var families = String(familyStack).split(',').map(normalize).filter(Boolean);
	if (!families.length) {
		return 0;
	}

	// Index the known fonts once, then walk the stack in priority order
	var byFamily = {};
	Object.keys(fontIdMap).forEach(function (id) {
		var entry = fontIdMap[id];
		if (entry && entry.family) {
			var key = normalize(entry.family);
			// First registration wins, matching the font list's own order
			if (!byFamily[key]) {
				byFamily[key] = parseInt(id, 10);
			}
		}
	});

	for (var i = 0; i < families.length; i++) {
		if (byFamily[families[i]]) {
			return byFamily[families[i]];
		}
	}

	return 0;
}

module.exports = {
	buildFontOptions: buildFontOptions,
	isWpLibraryValue: isWpLibraryValue,
	wpSlugFromValue: wpSlugFromValue,
	adoptWpFont: adoptWpFont,
	resolveActiveFontFamily: resolveActiveFontFamily,
	resolveFontIdFromFamily: resolveFontIdFromFamily
};
