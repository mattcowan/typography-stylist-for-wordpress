/**
 * font-variation-settings validation
 *
 * Shared by the inline editor (assets/js/block-editor.js, bundled with
 * browserify) and the Typography Stylist block (blocks/typography-stylist/,
 * bundled with wp-scripts; utils.js re-exports it). Until #357 each build had
 * its own copy with the same rules. save.js and deprecated.js intentionally
 * keep their own frozen copies for save-output byte-stability.
 *
 * @since 2.4.0
 */

/**
 * Validate and sanitize a font-variation-settings value.
 *
 * Ensures each comma-separated entry matches the "axis" number format
 * (e.g. "wght" 700, "wdth" 100) and normalizes quoting. Returns '' for
 * any invalid input — the value can arrive via the public
 * typost-apply-block-properties CustomEvent (extensions), so it must
 * never reach a style string unvalidated (e.g. '"wght" 700; color:red'
 * would smuggle extra declarations in).
 *
 * @param {string} value - font-variation-settings string
 * @return {string} Validated and normalized value, or empty string
 */
function sanitizeFontVariationSettings(value) {
	if (!value) return '';
	const str = String(value).trim();
	if (!str) return '';
	const entries = str.split(',').map(e => e.trim()).filter(Boolean);
	const validEntries = [];
	for (const entry of entries) {
		const match = entry.match(/^["']([a-zA-Z][a-zA-Z0-9 ]{0,3})["']\s+(-?\d+(?:\.\d+)?)$/);
		if (!match) return '';
		validEntries.push(`"${match[1]}" ${match[2]}`);
	}
	return validEntries.join(', ');
}

module.exports = {
	sanitizeFontVariationSettings: sanitizeFontVariationSettings
};
