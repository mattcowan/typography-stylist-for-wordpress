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

module.exports = {
	getClosestWeight: getClosestWeight
};
