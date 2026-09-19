/**
 * Inline editor apply rules
 *
 * Pure decisions behind the inline editor's apply and convert paths, kept
 * free of wp.* globals so the unit tests exercise the real logic. The inline
 * editor (assets/js/block-editor.js) requires this module through the
 * browserify build; the block's utils.js keeps its own copy of the size-range
 * check for the usual separate-build-pipeline reason.
 *
 * Two of these rules exist because of QA findings in the 2026-09 sweep:
 *
 * - E-2: toggling one OpenType feature wrote `font-weight: 400` onto the
 *   span, so a heading the theme renders at 700 visibly lightened. A weight
 *   is written only when the selection already carries one or the author
 *   picked one in this popover session — never the modal's display default.
 * - E-3: "Convert to Typography Stylist Block" with a partial selection
 *   copied the selection's size, letter spacing and line height onto the
 *   whole block. With a partial selection those properties stay on the span
 *   and the block takes inherit defaults.
 *
 * @package Typography_Stylist
 * @since 2.3.0
 */

/**
 * Whether three responsive sizes are in order (min ≤ preferred ≤ max).
 *
 * Mirrors isValidFontSizeRange() in blocks/typography-stylist/utils.js. Only
 * reports; never adjusts the values (the CSS clamp() is still written as
 * typed, so the author sees the warning instead of a silent correction).
 *
 * @param {number|string} min       Minimum (mobile) size in px.
 * @param {number|string} preferred Preferred (tablet) size in px.
 * @param {number|string} max       Maximum (desktop) size in px.
 * @return {boolean} True when the sizes are in non-decreasing order.
 */
function isValidFontSizeRange(min, preferred, max) {
	var a = Number(min);
	var b = Number(preferred);
	var c = Number(max);
	if (isNaN(a) || isNaN(b) || isNaN(c)) {
		return true;
	}
	return a <= b && b <= c;
}

/**
 * The weight to write onto the span, or '' for none.
 *
 * Precedence: a weight already stored on the selection (kept as is), then
 * the modal's weight when the author picked it in this popover session.
 * Anything else — the display default, or the weight inherited from the
 * theme that the select shows for information — is not written, so a
 * feature toggle on a bold heading leaves the heading's weight alone.
 *
 * @param {object}  facts                Inputs.
 * @param {string}  facts.explicitWeight `data-fontweight` on the selection, or ''.
 * @param {boolean} facts.authorPicked   Whether setFontWeight() ran this session.
 * @param {string}  facts.stateWeight    The modal's current weight value.
 * @return {string} Weight to write, or '' to write none.
 */
function resolveWeightToWrite(facts) {
	var f = facts || {};
	// A pick in this session wins over what the span already stores —
	// otherwise changing the weight of already-weighted text would be a
	// no-op that the select still displays as done (review of E-2).
	if (f.authorPicked && f.stateWeight) {
		return String(f.stateWeight);
	}
	if (f.explicitWeight) {
		return String(f.explicitWeight);
	}
	return '';
}

/**
 * Attributes for the block a conversion creates or updates.
 *
 * With a partial selection the span carries every typography property the
 * author set, so the block itself takes inherit defaults; only the rendered
 * weight travels (a core heading is bold because of theme CSS, and the block
 * would otherwise render at its '400' default). With the whole block (or
 * nothing) selected the modal's settings become the block's settings, as
 * before. Updating an existing Typography Stylist block from a partial
 * selection changes its content only.
 *
 * @param {object}  args                  Inputs.
 * @param {boolean} args.partialSelection True when a range of text is selected.
 * @param {boolean} args.isNewBlock       True when a typost/block is being created.
 * @param {string}  args.content          Block content HTML to store.
 * @param {string}  args.tagName          Tag for a new block (h2, p, ...).
 * @param {string}  args.effectiveWeight  Rendered weight (getEffectiveFontWeight()).
 * @param {object}  args.state            Modal state (selectedFeatures, selectedFont,
 *                                        fontSize, fontSizeMin/Preferred/Max,
 *                                        fontWeight, letterSpacing, lineHeight).
 * @param {Array}   args.existingFeatures Features already on an existing block.
 * @return {object} Attributes for createBlock() or updateBlockAttributes().
 */
function buildConvertBlockAttributes(args) {
	var a = args || {};
	var state = a.state || {};
	var attrs = { content: a.content };

	if (a.partialSelection) {
		if (a.isNewBlock) {
			attrs.tagName = a.tagName;
			attrs.features = [];
			attrs.fontFamily = '';
			attrs.fontSize = 'inherit';
			attrs.fontWeight = a.effectiveWeight || '400';
			attrs.letterSpacing = 0;
			attrs.lineHeight = 0;
		} else {
			// Existing block: keep every block-level setting it already has
			attrs.features = a.existingFeatures || [];
		}
		return attrs;
	}

	attrs.features = state.selectedFeatures || [];
	attrs.fontFamily = state.selectedFont || '';
	attrs.fontSize = state.fontSize || 'inherit';
	attrs.fontSizeMin = state.fontSizeMin;
	attrs.fontSizePreferred = state.fontSizePreferred;
	attrs.fontSizeMax = state.fontSizeMax;
	attrs.fontWeight = a.isNewBlock ? (a.effectiveWeight || state.fontWeight || '400') : (state.fontWeight || '400');
	attrs.letterSpacing = state.letterSpacing || 0;
	attrs.lineHeight = state.lineHeight || 0;
	if (a.isNewBlock) {
		attrs.tagName = a.tagName;
	}
	return attrs;
}

module.exports = {
	isValidFontSizeRange: isValidFontSizeRange,
	resolveWeightToWrite: resolveWeightToWrite,
	buildConvertBlockAttributes: buildConvertBlockAttributes
};
