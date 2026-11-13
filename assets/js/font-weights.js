/**
 * Font weight helpers
 *
 * Shared by the inline editor (assets/js/block-editor.js, bundled with
 * browserify) and the Typography Stylist block (blocks/typography-stylist/,
 * bundled with wp-scripts; utils.js re-exports it). Until #357 the inline
 * editor kept its own copy as a class method.
 *
 * The weight option lists are not shared: the inline editor's labels are
 * translated, the block's ALL_WEIGHT_OPTIONS in utils.js are not.
 *
 * @since 2.4.0
 */

/**
 * Get the closest available weight to the given weight.
 * Used when switching fonts and the current weight isn't available.
 *
 * @param {string} currentWeight    The current weight value (e.g., '400').
 * @param {Array}  availableWeights Array of available weight strings (e.g., ['200', '700']).
 * @return {string} The closest available weight.
 */
function getClosestWeight(currentWeight, availableWeights) {
	if (!availableWeights || availableWeights.length === 0) return currentWeight;
	if (availableWeights.includes(currentWeight)) return currentWeight;

	const current = parseInt(currentWeight, 10);
	let closest = availableWeights[0];
	let minDiff = Math.abs(current - parseInt(closest, 10));

	for (const w of availableWeights) {
		const diff = Math.abs(current - parseInt(w, 10));
		if (diff < minDiff) {
			minDiff = diff;
			closest = w;
		}
	}
	return closest;
}

/**
 * A numeric weight string ('100' … '900') from a computed font-weight value,
 * or '' when there is none. Keywords map as detectBlockComputedWeight() in
 * utils.js maps them.
 *
 * @param {*} weight A computed font-weight ('700', 'bold', 700)
 * @return {string} The weight, or ''
 */
function normalizeRenderedWeight(weight) {
	if (weight === null || weight === undefined) return '';
	const value = String(weight).trim().toLowerCase();
	const keywords = { normal: '400', bold: '700', bolder: '700', lighter: '300' };
	if (keywords[value]) return keywords[value];
	return /^\d+$/.test(value) ? value : '';
}

/**
 * The block weight after the author picks a font (#411 review).
 *
 * A block with no weight of its own (fontWeight '', after "Remove all
 * styling" or a conversion from an empty block) renders at the weight the
 * theme, a paragraph style or a parent gives it. getClosestWeight('', …)
 * cannot place '' (parseInt gives NaN) and returned the font's lightest
 * weight, so a theme-bold heading turned light. Here '' is placed at the
 * weight it renders at:
 *
 * - the font has that weight: '' stays, and the theme still decides;
 * - it does not: the closest weight the font has is written;
 * - the rendered weight is not known: '' stays. A guess would change the
 *   look; with '' the browser picks the nearest face of the font itself.
 *
 * Any other weight gets exactly what the pickers wrote before:
 * getClosestWeight(), and the only weight of a font with one weight.
 *
 * @param {string} currentWeight    The block's fontWeight
 * @param {Array}  availableWeights The new font's weights ([] or none: no change)
 * @param {*}      renderedWeight   The weight the block renders at now (computed)
 * @return {string} The fontWeight to store
 */
function resolveFontPickWeight(currentWeight, availableWeights, renderedWeight) {
	if (!availableWeights || availableWeights.length === 0) return currentWeight;
	if (currentWeight !== '') {
		if (availableWeights.length === 1) return availableWeights[0];
		return getClosestWeight(currentWeight, availableWeights);
	}
	const rendered = normalizeRenderedWeight(renderedWeight);
	if (!rendered || availableWeights.includes(rendered)) return '';
	return getClosestWeight(rendered, availableWeights);
}

module.exports = {
	getClosestWeight: getClosestWeight,
	normalizeRenderedWeight: normalizeRenderedWeight,
	resolveFontPickWeight: resolveFontPickWeight
};
