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
 * The vw slope of a responsive size, limited so the size doubles with zoom
 * (#234).
 *
 * The responsive size is clamp(min, pref + slope, max): the preferred size
 * plus a vw term. Browser zoom narrows the viewport in CSS px, so the vw
 * term shrinks as the zoom goes up. At zoom z in a window W px wide the
 * reader sees z × size(W / z). WCAG 1.4.4 asks for 200% text size, and for
 * fluid type that is read as 2× by 500% zoom (the browser maximum; no size
 * that grows with the viewport doubles at 200%). Because the preferred size
 * is a rem constant, z × size(W / z) only grows with z, so checking 500% is
 * enough.
 *
 * With a = pref, m = min, M = max (px) and slope b (px per px of window):
 * 5 × size(W / 5) >= 2 × size(W) holds for every window up to 1920px
 * when M <= max(4a, 2.5m), whatever the slope. Otherwise it holds exactly
 * when the size never reaches M in a 1920px window and
 * b × 1920 <= max(4a, 2.5m) - a. So the size can reach max(4a, 2.5m) in a
 * 1920px window and still double: that is `reach`. The bound comes from
 * size(W / 5) >= max(m, a + bW / 5); a brute-force test over windows and
 * zoom levels holds it to the real clamp().
 *
 * `limited` means the slope from the author's values, (M - m) / 1600 px
 * per px, is steeper than that bound. New content (rem) writes the bound
 * instead, rounded down to four decimals so it never overshoots; the size
 * then grows more slowly and reaches `reach`, not M, in a 1920px window.
 * Content saved before (px) keeps its slope, so there `limited` means the
 * size does not double.
 *
 * Mirrored in PHP by Typost_Paragraph_Styles::responsive_zoom_vw() and in
 * ps-utils.js (responsiveZoomVw). Keep all three identical.
 *
 * @param {number} fontSizeMin       Mobile size (px)
 * @param {number} fontSizePreferred Preferred size (px)
 * @param {number} fontSizeMax       Desktop size (px)
 * @return {{vw: number, limitedVw: number, limited: boolean, reach: number}}
 *   vw: the author's slope in vw (unrounded); limitedVw: the slope new
 *   content writes; reach: the largest size that still doubles (px)
 */
function getResponsiveZoomLimit(fontSizeMin, fontSizePreferred, fontSizeMax) {
	var min = Number(fontSizeMin);
	var pref = Number(fontSizePreferred);
	var max = Number(fontSizeMax);
	var vw = ((max - min) / (RESPONSIVE_FONT_MAX_VIEWPORT - RESPONSIVE_FONT_MIN_VIEWPORT)) * 100;
	var reach = Math.max(4 * pref, 2.5 * min);
	var result = { vw: vw, limitedVw: vw, limited: false, reach: reach };
	// Out-of-order or flat sizes clamp to a constant, which always doubles
	if (!(vw > 0) || !(pref >= 0) || !(max > reach)) {
		return result;
	}
	// The epsilon keeps an exact bound (2.5) from flooring to 2.4999
	var bound = Math.floor((((reach - pref) * 100) / RESPONSIVE_FONT_MAX_VIEWPORT) * 10000 + 1e-7) / 10000;
	if (bound >= vw) {
		return result;
	}
	result.limitedVw = bound;
	result.limited = true;
	return result;
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
 * 16 / 32 / 64 gives clamp(1rem, 2rem + 3vw, 4rem). Its slope is limited
 * so the size doubles by 500% zoom (#234, getResponsiveZoomLimit()):
 * 16 / 16 / 120 gives clamp(1rem, 1rem + 2.5vw, 7.5rem).
 *
 * @param {number} fontSizeMin       Mobile size (px, at 320px viewport)
 * @param {number} fontSizePreferred Preferred size (px, drives the rem base)
 * @param {number} fontSizeMax       Desktop size (px, at 1920px viewport)
 * @param {string} [unit='px']       'px' or 'rem' (see resolveFontSizeUnit)
 * @return {string} clamp() expression
 */
function buildResponsiveClamp(fontSizeMin, fontSizePreferred, fontSizeMax, unit) {
	if (resolveFontSizeUnit(unit) === FONT_SIZE_UNIT_REM) {
		var zoom = getResponsiveZoomLimit(fontSizeMin, fontSizePreferred, fontSizeMax);
		var vwTerm = zoom.limited ? zoom.limitedVw : Math.round(zoom.vw * 10000) / 10000;
		return 'clamp(' + pxToRem(fontSizeMin) + 'rem, ' + pxToRem(fontSizePreferred) + 'rem + ' +
			vwTerm + 'vw, ' + pxToRem(fontSizeMax) + 'rem)';
	}
	var vw = ((fontSizeMax - fontSizeMin) / (RESPONSIVE_FONT_MAX_VIEWPORT - RESPONSIVE_FONT_MIN_VIEWPORT)) * 100;
	return 'clamp(' + fontSizeMin + 'px, ' + (fontSizePreferred / 16) + 'rem + ' + vw + 'vw, ' + fontSizeMax + 'px)';
}

/**
 * The zoom notice to show beside responsive size controls (#234), or null.
 *
 * - 'slower': new content (rem) whose slope was limited. The size doubles
 *   with zoom, but reaches `reach` instead of the Large size in a 1920px
 *   window. `minPreferred` is the smallest Intermediate size that lets it
 *   reach the Large size.
 * - 'fails': content saved before (px) whose size does not double by 500%
 *   zoom. Lowering Large to `reach` or raising Intermediate to
 *   `minPreferred` fixes it.
 *
 * @param {number} fontSizeMin       Mobile size (px)
 * @param {number} fontSizePreferred Preferred size (px)
 * @param {number} fontSizeMax       Desktop size (px)
 * @param {string} [unit='px']       'px' or 'rem'
 * @return {{kind: string, reach: number, max: number, minPreferred: number}|null}
 */
function getResponsiveZoomNotice(fontSizeMin, fontSizePreferred, fontSizeMax, unit) {
	var zoom = getResponsiveZoomLimit(fontSizeMin, fontSizePreferred, fontSizeMax);
	if (!zoom.limited) {
		return null;
	}
	return {
		kind: resolveFontSizeUnit(unit) === FONT_SIZE_UNIT_REM ? 'slower' : 'fails',
		reach: Math.floor(zoom.reach),
		max: Number(fontSizeMax),
		minPreferred: Math.ceil(Number(fontSizeMax) / 4)
	};
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
 * - The author changed the size in this session: rem (a new value).
 * - The span already declares a font-size: that declaration's unit.
 * - The span is under a paragraph style (Detach): the style's unit.
 * - Otherwise: rem (a new size).
 *
 * @param {Object}  args
 * @param {boolean} args.sizeChanged The author changed the size
 * @param {string}  [args.spanStyle] The span's current style attribute
 * @param {*}       [args.styleId]   The span's data-style-id
 * @param {Array}   [args.styles]    Stored paragraph styles
 * @return {string} 'rem' or 'px'
 */
function resolveSpanFontSizeUnit(args) {
	var options = args || {};
	if (options.sizeChanged) {
		return FONT_SIZE_UNIT_REM;
	}
	var declaration = String(options.spanStyle || '').match(/(?:^|;)\s*font-size\s*:\s*([^;]*)/i);
	if (declaration && declaration[1].trim()) {
		return /\dpx\b/i.test(declaration[1]) ? FONT_SIZE_UNIT_PX : FONT_SIZE_UNIT_REM;
	}
	if (options.styleId !== undefined && options.styleId !== null && options.styleId !== '' && String(options.styleId) !== '0') {
		return resolveStyleFontSizeUnit(findStyleById(options.styles, options.styleId));
	}
	return FONT_SIZE_UNIT_REM;
}

module.exports = {
	FONT_SIZE_UNIT_PX: FONT_SIZE_UNIT_PX,
	FONT_SIZE_UNIT_REM: FONT_SIZE_UNIT_REM,
	resolveFontSizeUnit: resolveFontSizeUnit,
	pxToRem: pxToRem,
	formatFontSizeLength: formatFontSizeLength,
	buildResponsiveClamp: buildResponsiveClamp,
	getResponsiveZoomLimit: getResponsiveZoomLimit,
	getResponsiveZoomNotice: getResponsiveZoomNotice,
	resolveStyleFontSizeUnit: resolveStyleFontSizeUnit,
	findStyleById: findStyleById,
	resolveSpanFontSizeUnit: resolveSpanFontSizeUnit
};
