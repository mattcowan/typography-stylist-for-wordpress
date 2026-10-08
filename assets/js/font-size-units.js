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

module.exports = {
	FONT_SIZE_UNIT_PX: FONT_SIZE_UNIT_PX,
	FONT_SIZE_UNIT_REM: FONT_SIZE_UNIT_REM,
	resolveFontSizeUnit: resolveFontSizeUnit,
	pxToRem: pxToRem,
	formatFontSizeLength: formatFontSizeLength,
	buildResponsiveClamp: buildResponsiveClamp
};
