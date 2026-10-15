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

var normalizeTextCase = require('./text-case.js').normalizeTextCase;
var isSmallCapsCase = require('./text-case.js').isSmallCapsCase;

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
 * @param {boolean} [facts.clearWeight]  An extension asked for the weight to be
 *                                       removed: nothing is written even when
 *                                       the span stores one.
 * @return {string} Weight to write, or '' to write none.
 */
function resolveWeightToWrite(facts) {
	var f = facts || {};
	if (f.clearWeight) {
		return '';
	}
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
 * How a typost-apply-block-properties event changes the weight flags of the
 * inline editor, or null to leave them as they are.
 *
 * A truthy fontWeight counts as picked, so it is written; a falsy one is an
 * explicit clear (PR #194 review); an absent key changes nothing. A payload
 * that replaces the format wholesale (a paragraph style, an animation, a
 * features list) leaves the flags alone: under a style its class renders
 * the weight. Detach (paragraphStyleId 0) is the exception, although it
 * replaces the format too: it hands back the weight the text showed under
 * the style, and without the pick the span lost that weight (#278).
 *
 * @since 2.3.3
 * @param {object} detail The event detail.
 * @return {{authorPicked: boolean, clearWeight: boolean}|null} New flags, or null.
 */
function resolveApplyWeightChoice(detail) {
	var props = detail && detail.properties ? detail.properties : {};
	if (props.fontWeight === undefined) {
		return null;
	}
	var isDetach = detail.paragraphStyleId !== undefined && !(parseInt(detail.paragraphStyleId, 10) > 0);
	var wholesale = detail.paragraphStyleId !== undefined || detail.animationId !== undefined || props.features !== undefined;
	if (wholesale && !isDetach) {
		return null;
	}
	return { authorPicked: !!props.fontWeight, clearWeight: !props.fontWeight };
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
 * @param {string}  args.effectiveWeight  Weight for the block: on a partial
 *                                        conversion the weight the block itself
 *                                        renders at (the pick stays on the span);
 *                                        otherwise getEffectiveFontWeight().
 * @param {object}  args.state            Modal state (selectedFeatures, selectedFont,
 *                                        fontSize, fontSizeMin/Preferred/Max,
 *                                        fontWeight, letterSpacing, lineHeight,
 *                                        textCase, fakeSmallCaps). A new block
 *                                        gets a case only when one is set
 *                                        (#214), and fakeSmallCaps only as
 *                                        false with a small caps value; an
 *                                        existing block takes both.
 * @param {Array}   args.existingFeatures Features already on an existing block.
 * @param {string}  args.fontSizeUnit     Size unit for a new block: the site's
 *                                        new-content unit (#248). Ignored for an
 *                                        existing block, which keeps its own.
 * @return {object} Attributes for createBlock() or updateBlockAttributes().
 */
function buildConvertBlockAttributes(args) {
	var a = args || {};
	var state = a.state || {};
	var attrs = { content: a.content };

	if (a.partialSelection) {
		if (a.isNewBlock) {
			attrs.tagName = a.tagName;
			setNewBlockFontSizeUnit(attrs, a.fontSizeUnit);
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
	// Case (#214). fakeSmallCaps is false only when it is off for a small
	// caps value, as paragraph styles store it. A new block gets the case
	// only when one is set and fakeSmallCaps only when false (the defaults
	// are '' and true). An existing block takes both from the modal, like
	// every other property here, so an old "off" cannot stay behind.
	var textCase = normalizeTextCase(state.textCase);
	var fakeSmallCaps = !(isSmallCapsCase(textCase) && state.fakeSmallCaps === false);
	if (!a.isNewBlock) {
		attrs.textCase = textCase;
		attrs.fakeSmallCaps = fakeSmallCaps;
	} else if (textCase) {
		attrs.textCase = textCase;
		if (!fakeSmallCaps) {
			attrs.fakeSmallCaps = false;
		}
	}
	if (a.isNewBlock) {
		attrs.tagName = a.tagName;
		setNewBlockFontSizeUnit(attrs, a.fontSizeUnit);
	}
	return attrs;
}

/**
 * Store the site's new-content size unit on a block being created (#248).
 *
 * block.json's fontSizeUnit default ('rem') also decides how saved blocks
 * parse, so it cannot follow the setting: a new block stores its unit
 * explicitly. An existing block keeps its own unit, so it is never set
 * there. 'rem' equals the default and is not serialized.
 *
 * @param {Object} attrs Block attributes being built (mutated)
 * @param {string} [unit] 'px' or 'rem'; anything else leaves the default
 */
function setNewBlockFontSizeUnit(attrs, unit) {
	if (unit === 'px' || unit === 'rem') {
		attrs.fontSizeUnit = unit;
	}
}

var resolveFontIdFromFamily = require('./font-options.js').resolveFontIdFromFamily;

/**
 * The font state a preset leaves in the inline modal.
 *
 * A preset that names a font sets both the family and the font ID, so the
 * apply path (which prefers the ID) writes the preset font. A preset with no
 * font keeps the selection font. Variable font axes belong to one font, so they
 * are cleared when the preset changes the font and kept when it does not.
 *
 * @param {Object|null} preset    Preset ({ fontFamily?, features, ... }).
 * @param {Object}      current   Current { selectedFont, selectedFontId, fontVariationSettings }.
 * @param {Object}      fontIdMap Map of font_id -> { family, ... } from buildFontOptions().
 * @return {{selectedFont: string, selectedFontId: number, fontVariationSettings: string}} Font state to set.
 */
function resolvePresetFontState(preset, current, fontIdMap) {
	var state = current || {};
	var keep = {
		selectedFont: state.selectedFont || '',
		selectedFontId: state.selectedFontId || 0,
		fontVariationSettings: state.fontVariationSettings || ''
	};
	var family = preset && preset.fontFamily ? String(preset.fontFamily) : '';
	if (!family) {
		return keep;
	}
	var fontId = resolveFontIdFromFamily(family, fontIdMap);
	var next = fontId && fontIdMap[fontId]
		? { selectedFont: fontIdMap[fontId].family, selectedFontId: fontId }
		: { selectedFont: family, selectedFontId: 0 };
	var sameFont = next.selectedFontId
		? next.selectedFontId === keep.selectedFontId
		: !keep.selectedFontId && next.selectedFont === keep.selectedFont;
	next.fontVariationSettings = sameFont ? keep.fontVariationSettings : '';
	return next;
}

var findStyleById = require('./font-size-units.js').findStyleById;

/**
 * The font weight a paragraph style gives the text under its data-style-id.
 *
 * A style span carries no weight of its own: the style's CSS rule sets it.
 * Without this, code that looks for a weight at the selection skipped the
 * style span and reported the block's weight, so a glyph inserted there
 * came out at the block's weight instead of the style's (#254).
 *
 * Mirrors the Paragraph Styles CSS generators: a number from 1 to 1000, or
 * normal / bold / lighter / bolder. normal and bold are reported as 400 and
 * 700; lighter and bolder stay keywords, because they depend on the parent.
 *
 * @param {Array}         styles  Stored styles (typostData.paragraphStyles).
 * @param {number|string} styleId The span's data-style-id.
 * @return {string} The weight, or '' when the style is unknown or sets none.
 */
function resolveParagraphStyleFontWeight(styles, styleId) {
	if (styleId === undefined || styleId === null || styleId === '' || String(styleId) === '0') {
		return '';
	}
	var style = findStyleById(styles, styleId);
	var weight = style && style.properties ? style.properties.fontWeight : '';
	if (!weight || weight === '0') {
		return '';
	}
	var text = String(weight).trim().toLowerCase();
	var keywords = { normal: '400', bold: '700', lighter: 'lighter', bolder: 'bolder' };
	if (keywords[text]) {
		return keywords[text];
	}
	var number = Number(text);
	if (text !== '' && isFinite(number) && number >= 1 && number <= 1000) {
		return String(parseInt(text, 10));
	}
	return '';
}

/**
 * Which weight of one span renders: its own, or its paragraph style's.
 *
 * Under a paragraph style the inline apply path keeps the span's
 * data-fontweight but writes no inline font-weight (review of #254). No CSS
 * reads data-fontweight, so on a span with a data-style-id that attribute
 * renders nothing: the style's weight shows, or, when the style sets none
 * (or was deleted), the weight around the span. A data-fontweight therefore
 * counts as stored only when the span has no data-style-id, or its own
 * style attribute declares font-weight (that declaration beats the class).
 *
 * Read paths only. The apply path keeps the raw data-fontweight.
 *
 * @param {Object}  span            The span's attributes.
 * @param {string}  span.dataWeight Its data-fontweight.
 * @param {string}  span.styleAttr  Its style attribute.
 * @param {*}       span.styleId    Its data-style-id.
 * @param {Array}   styles          Stored styles (typostData.paragraphStyles).
 * @return {{stored: string, styleWeight: string}} The stored weight, or the
 *         style weight that renders instead; '' for the one that does not
 *         apply. Both '' means this span decides nothing: look further out.
 */
function resolveSpanStoredFontWeight(span, styles) {
	var attrs = span || {};
	var styleId = attrs.styleId;
	var hasStyle = styleId !== undefined && styleId !== null && styleId !== '' && String(styleId) !== '0';
	var declares = /(^|;)\s*font-weight\s*:/i.test(String(attrs.styleAttr || ''));
	var stored = attrs.dataWeight && (!hasStyle || declares) ? String(attrs.dataWeight) : '';
	return { stored: stored, styleWeight: stored ? '' : resolveParagraphStyleFontWeight(styles, styleId) };
}

/**
 * The font set on one span: its own, or its paragraph style's (#278).
 *
 * The font twin of resolveSpanStoredFontWeight(). Under a paragraph style
 * the apply path writes no inline font-family, so the style's class renders
 * the font: a span that took a style without a font has no data-font-id,
 * and keeps none when Update Style later gives the style one, and a span
 * whose style changed its font keeps the old data-font-id. Reading
 * data-font-id alone made the Paragraph Styles badge show "(modified)"
 * there, and Detach dropped the style's font (review of #278). A
 * data-font-id therefore counts only when the span has no data-style-id,
 * or its own style attribute declares font-family.
 *
 * @since 2.3.3
 * @param {Object} span            The span's attributes.
 * @param {string} span.dataFontId Its data-font-id.
 * @param {string} span.styleAttr  Its style attribute.
 * @param {*}      span.styleId    Its data-style-id.
 * @param {Array}  styles          Stored styles (typostData.paragraphStyles).
 * @return {number} Font ID, or 0 when neither the span nor its style sets one.
 */
function resolveSpanExplicitFontId(span, styles) {
	var attrs = span || {};
	var styleId = attrs.styleId;
	var own = parseInt(attrs.dataFontId, 10) || 0;
	var hasStyle = styleId !== undefined && styleId !== null && styleId !== '' && String(styleId) !== '0';
	if (!hasStyle || /(^|;)\s*font-family\s*:/i.test(String(attrs.styleAttr || ''))) {
		return own;
	}
	var style = findStyleById(styles, styleId);
	return (style && style.properties && parseInt(style.properties.fontId, 10)) || 0;
}

module.exports = {
	isValidFontSizeRange: isValidFontSizeRange,
	resolveWeightToWrite: resolveWeightToWrite,
	resolveApplyWeightChoice: resolveApplyWeightChoice,
	buildConvertBlockAttributes: buildConvertBlockAttributes,
	resolvePresetFontState: resolvePresetFontState,
	resolveParagraphStyleFontWeight: resolveParagraphStyleFontWeight,
	resolveSpanStoredFontWeight: resolveSpanStoredFontWeight,
	resolveSpanExplicitFontId: resolveSpanExplicitFontId
};
