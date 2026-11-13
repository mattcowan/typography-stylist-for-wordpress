/**
 * Typography Stylist Block - the "Theme default" weight (#411 review).
 *
 * A block with no weight of its own stores fontWeight '' (THEME_LOOK_PLUGIN_ATTRIBUTES
 * in assets/js/theme-look.js): save.js writes no font-weight for it, so the
 * tag renders at the theme's weight. "Remove all styling", Reset Entire
 * Block, a block made from an empty block, and the old reset all store it.
 * The sidebar Font Weight select had no option for '', so it showed its
 * first option ("100 (Thin)"). This module gives it one.
 */

/** The value of "Theme default": the same '' the strip writes. */
export const THEME_DEFAULT_WEIGHT = '';

/**
 * The sidebar weight options with "Theme default" first.
 *
 * The option is added after the font's weights are filtered, so no filter
 * removes it. Whether the panel shows at all still depends on the font's
 * weights alone (see shouldShowWeightPanel()).
 *
 * @param {Array}  weightOptions The font's weight options ({ label, value })
 * @param {string} label         Translated label of the theme option
 * @return {Array} Options for the SelectControl
 */
export function buildSidebarWeightOptions(weightOptions, label) {
	return [{ label, value: THEME_DEFAULT_WEIGHT }].concat(weightOptions || []);
}

/**
 * Whether the sidebar weight panel shows: as before, only when the font has
 * more than one weight to choose from. "Theme default" does not count, so a
 * font with one weight still has no panel.
 *
 * @param {Array} weightOptions The font's weight options, without "Theme default"
 * @return {boolean} True when the panel shows
 */
export function shouldShowWeightPanel(weightOptions) {
	return Array.isArray(weightOptions) && weightOptions.length > 1;
}
