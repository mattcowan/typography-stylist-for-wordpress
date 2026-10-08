/**
 * Font size units (#233)
 *
 * Pure helpers that write a px size, as authors enter it, in the unit the
 * content uses. New content writes rem (the px value divided by 16), so it
 * follows the reader's default font size setting; content saved before rem
 * existed keeps px and renders exactly as before.
 *
 * Shared by the inline editor (assets/js/block-editor.js, bundled with
 * browserify) and the Typography Stylist block (blocks/typography-stylist/,
 * bundled with wp-scripts). Jest tests import this module directly.
 *
 * The Paragraph Styles CSS generators (paragraph-styles.php and its JS twin
 * in ps-utils.js) apply the same px ÷ 16 conversion and the same six-decimal
 * rounding, so a style and a block with the same size write the same value.
 *
 * @since 2.3.2
 */

var FONT_SIZE_UNIT_PX = 'px';
var FONT_SIZE_UNIT_REM = 'rem';

// Viewport breakpoints for responsive font sizing, as in save.js
var RESPONSIVE_FONT_MIN_VIEWPORT = 320;
var RESPONSIVE_FONT_MAX_VIEWPORT = 1920;

/**
 * The unit a block or style writes its sizes in.
 *
 * Only an explicit 'rem' writes rem. A missing unit is px: the block's
 * deprecations set 'px' on blocks saved before the attribute existed, and
 * paragraph styles saved before it have no unit at all, so "missing"
 * always means older content that must render as it did.
 *
 * @param {*} unit Stored unit (block attribute or style property)
 * @return {string} 'rem' or 'px'
 */
function resolveFontSizeUnit(unit) {
	return unit === FONT_SIZE_UNIT_REM ? FONT_SIZE_UNIT_REM : FONT_SIZE_UNIT_PX;
}

/**
 * The unit new content writes its sizes in (#248).
 *
 * rem by default (#233). The Options setting "Write new font sizes in px"
 * (option typost_new_font_sizes_px, localized as typostData.newFontSizeUnit)
 * switches new content to px for themes that change the root font size
 * (html { font-size: 62.5% } would render 1.5rem at 15px). Only new content
 * follows it: a block stores its unit when it is inserted, a style stores
 * it when it is saved, and a span's declaration carries it, so content
 * saved under either setting keeps its unit when the setting changes.
 *
 * @param {Object} [data] Editor data; defaults to window.typostData
 * @return {string} 'rem' or 'px'
 */
function getNewFontSizeUnit(data) {
	var source = data;
	if (source === undefined && typeof window !== 'undefined') {
		source = window.typostData;
	}
	return source && source.newFontSizeUnit === FONT_SIZE_UNIT_PX ? FONT_SIZE_UNIT_PX : FONT_SIZE_UNIT_REM;
}

/**
 * The inserter variation that makes a new block store the site's unit (#248).
 *
 * block.json's fontSizeUnit default ('rem') also decides how saved blocks
 * parse: a block saved under the rem setting stores no unit, so the default
 * cannot follow the setting without breaking it. A new block must store the
 * unit when it is inserted instead. Core's inserter replaces a block's own
 * item with its isDefault variation and inserts it with the variation's
 * attributes (getInserterItems / getItemFromVariation in
 * @wordpress/block-editor), so the inserter, the slash inserter and drag
 * from the inserter all create the block with fontSizeUnit 'px'. Title,
 * icon and description are left out, so the item keeps the block's own.
 *
 * Nothing is registered for rem: the block's default already is rem.
 *
 * @param {string} unit The new-content unit (getNewFontSizeUnit)
 * @return {Object|null} Variation for registerBlockVariation(), or null
 */
function buildNewBlockUnitVariation(unit) {
	if (unit !== FONT_SIZE_UNIT_PX) {
		return null;
	}
	return {
		name: 'typost-new-font-size-unit',
		isDefault: true,
		scope: ['inserter'],
		attributes: { fontSizeUnit: FONT_SIZE_UNIT_PX }
	};
}

/**
 * Convert a px size to rem, rounded to six decimals.
 *
 * Whole and one- or two-decimal px values divide by 16 exactly, so the
 * rounding only matters for longer input. The decimal point is shifted
 * textually, as normalizeHang() does, so a half step rounds up the way
 * PHP's round() does in the paragraph style generator.
 *
 * Below 0.0001rem gives 0, as Typost_Paragraph_Styles::px_to_rem() does:
 * PHP prints smaller floats in exponent form (1.0E-5) and String() does so
 * below 1e-6, which the textual shift cannot read.
 *
 * @param {number|string} px Size in px
 * @return {number} Size in rem, 0 for non-numeric or tiny input
 */
function pxToRem(px) {
	var rem = Number(px) / 16;
	if (!isFinite(rem) || Math.abs(rem) < 0.0001) {
		return 0;
	}
	return Number(Math.round(Number(rem + 'e6')) + 'e-6');
}

/**
 * Write one px size as a CSS length in the given unit.
 *
 * @param {number|string} px   Size in px
 * @param {string}        unit 'px' or 'rem' (see resolveFontSizeUnit)
 * @return {string} '24px' or '1.5rem'
 */
function formatFontSizeLength(px, unit) {
	if (resolveFontSizeUnit(unit) === FONT_SIZE_UNIT_REM) {
		return pxToRem(px) + 'rem';
	}
	return px + 'px';
}

/**
 * Build the responsive clamp() font-size expression.
 *
 * The px form must reproduce the legacy inline expression byte-for-byte,
 * including float artifacts like 1.8124999999999998vw, because blocks and
 * spans saved before rem existed must keep validating. A byte-identity
 * test locks it in.
 *
 * The rem form is new content, so it is free to round: the vw term is
 * rounded to four decimals, as the paragraph style generators do.
 * 16 / 32 / 64 gives clamp(1rem, 2rem + 3vw, 4rem).
 *
 * @param {number} fontSizeMin       Mobile size (px, at 320px viewport)
 * @param {number} fontSizePreferred Preferred size (px, drives the rem base)
 * @param {number} fontSizeMax       Desktop size (px, at 1920px viewport)
 * @param {string} [unit='px']       'px' or 'rem' (see resolveFontSizeUnit)
 * @return {string} clamp() expression
 */
function buildResponsiveClamp(fontSizeMin, fontSizePreferred, fontSizeMax, unit) {
	var vw = ((fontSizeMax - fontSizeMin) / (RESPONSIVE_FONT_MAX_VIEWPORT - RESPONSIVE_FONT_MIN_VIEWPORT)) * 100;
	if (resolveFontSizeUnit(unit) === FONT_SIZE_UNIT_REM) {
		return 'clamp(' + pxToRem(fontSizeMin) + 'rem, ' + pxToRem(fontSizePreferred) + 'rem + ' +
			(Math.round(vw * 10000) / 10000) + 'vw, ' + pxToRem(fontSizeMax) + 'rem)';
	}
	return 'clamp(' + fontSizeMin + 'px, ' + (fontSizePreferred / 16) + 'rem + ' + vw + 'vw, ' + fontSizeMax + 'px)';
}

/**
 * The unit for sizes that a paragraph style rendered until now.
 *
 * Used when the style lets go of the text: Detach, or clearing the class of
 * a deleted style. Until then the text showed the style's size in the
 * style's unit, so it keeps that unit and renders the same. A block or span
 * under a style writes no size of its own, so its own unit tells nothing:
 * a block saved before #233 passes the current save and gets the 'rem'
 * default. A style that is not found (deleted) gives px, which is what the
 * text wrote before #233.
 *
 * @param {Object|null} style Stored style ({id, properties}), or null
 * @return {string} 'rem' or 'px'
 */
function resolveStyleFontSizeUnit(style) {
	if (!style) {
		return FONT_SIZE_UNIT_PX;
	}
	return resolveFontSizeUnit(style.properties && style.properties.fontSizeUnit);
}

/**
 * Find a paragraph style by numeric or legacy id.
 *
 * @param {Array}         styles Stored styles (typostData.paragraphStyles)
 * @param {number|string} id     Style id, as in data-style-id
 * @return {Object|null} The style, or null
 */
function findStyleById(styles, id) {
	if (!Array.isArray(styles) || id === undefined || id === null || id === '') {
		return null;
	}
	var ref = String(id);
	for (var i = 0; i < styles.length; i++) {
		var style = styles[i];
		if (style && (String(style.id) === ref || (style.legacyId && String(style.legacyId) === ref))) {
			return style;
		}
	}
	return null;
}

/**
 * The unit an editor writes when it rebuilds the size of an existing span.
 *
 * The inline editor rebuilds a span's whole style on every apply, also when
 * only a feature changed. A size the author did not touch must keep its
 * unit, or toggling one feature turns an older px span into rem (and, on a
 * partial selection, splits a word into a rem part and a px part).
 *
 * - The author changed the size in this session: the new-content unit.
 * - The span already declares a font-size: that declaration's unit.
 * - The span is under a paragraph style (Detach): the style's unit.
 * - Otherwise: the new-content unit (a new size).
 *
 * The new-content unit is rem unless the site writes new sizes in px
 * (#248, getNewFontSizeUnit).
 *
 * @param {Object}  args
 * @param {boolean} args.sizeChanged The author changed the size
 * @param {string}  [args.spanStyle] The span's current style attribute
 * @param {*}       [args.styleId]   The span's data-style-id
 * @param {Array}   [args.styles]    Stored paragraph styles
 * @param {string}  [args.newUnit]   Unit for new sizes (default rem)
 * @return {string} 'rem' or 'px'
 */
function resolveSpanFontSizeUnit(args) {
	var options = args || {};
	var newUnit = resolveFontSizeUnit(options.newUnit === undefined ? FONT_SIZE_UNIT_REM : options.newUnit);
	if (options.sizeChanged) {
		return newUnit;
	}
	var declaration = String(options.spanStyle || '').match(/(?:^|;)\s*font-size\s*:\s*([^;]*)/i);
	if (declaration && declaration[1].trim()) {
		return /\dpx\b/i.test(declaration[1]) ? FONT_SIZE_UNIT_PX : FONT_SIZE_UNIT_REM;
	}
	if (options.styleId !== undefined && options.styleId !== null && options.styleId !== '' && String(options.styleId) !== '0') {
		return resolveStyleFontSizeUnit(findStyleById(options.styles, options.styleId));
	}
	return newUnit;
}

module.exports = {
	FONT_SIZE_UNIT_PX: FONT_SIZE_UNIT_PX,
	FONT_SIZE_UNIT_REM: FONT_SIZE_UNIT_REM,
	resolveFontSizeUnit: resolveFontSizeUnit,
	getNewFontSizeUnit: getNewFontSizeUnit,
	buildNewBlockUnitVariation: buildNewBlockUnitVariation,
	pxToRem: pxToRem,
	formatFontSizeLength: formatFontSizeLength,
	buildResponsiveClamp: buildResponsiveClamp,
	resolveStyleFontSizeUnit: resolveStyleFontSizeUnit,
	findStyleById: findStyleById,
	resolveSpanFontSizeUnit: resolveSpanFontSizeUnit
};
