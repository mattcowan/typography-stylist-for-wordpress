/**
 * Typography Stylist Block - the inline style of the block's editing surface.
 *
 * Moved out of edit.js unchanged (#356): the body of buildStyle(), which
 * reads only the values passed here. Tests: __tests__/editor-style.test.js.
 * The comment "an orphaned styleClass is cleared above" below refers to the
 * orphan effect in hooks/use-paragraph-style-sync.js.
 */

import { resolveBlockFontFamilyStyle, buildResponsiveClamp, formatFontSizeLength, normalizeHang, normalizeTextCase, caseStyleObject } from './utils';

/**
 * The inline style object for the block's RichText in the editor.
 *
 * Under an active paragraph style only the attributes that differ from the
 * style (styleOverrides) are written inline; the class renders the rest.
 *
 * @param {Object}  block                 Block attributes the style reads
 * @param {string}  block.sizePreviewUnit The unit sizes preview in ('px' or 'rem')
 * @param {?Object} block.styleOverrides  Attributes that differ from the active
 *                                        paragraph style, or null without one
 * @return {Object} React style object.
 */
export default function buildEditorStyle({
	features,
	fontId,
	fontFamily,
	fontWeight,
	fontStyle,
	letterSpacing,
	lineHeight,
	fontSize,
	fontSizeMin,
	fontSizePreferred,
	fontSizeMax,
	sizePreviewUnit,
	styleOverrides,
	fontVariationSettings,
	textAlign,
	initialHang,
	textCase,
	fakeSmallCaps
}) {
	const rendersInline = (key) => !styleOverrides || !!styleOverrides[key];
	const styles = {};

	if (features.length > 0 && rendersInline('features')) {
		styles.fontFeatureSettings = features.map(f => `"${f}" 1`).join(', ');
	}

	// Use CSS variable if fontId is set (for font replacements), otherwise
	// the literal font name for legacy/custom fonts. fontId alone must
	// resolve too (save.js parity): blocks authored outside the editor UI
	// carry only fontId, and gating on fontFamily rendered them in the
	// theme's inherited font.
	const blockFontFamily = resolveBlockFontFamilyStyle(fontId, fontFamily);
	if (blockFontFamily && rendersInline('fontId')) {
		styles.fontFamily = blockFontFamily;
	}

	if (fontWeight && rendersInline('fontWeight')) {
		styles.fontWeight = fontWeight;
	}

	if (fontStyle && rendersInline('fontStyle')) {
		styles.fontStyle = fontStyle;
	}

	if (letterSpacing !== 0 && rendersInline('letterSpacing')) {
		styles.letterSpacing = `${letterSpacing / 1000}em`;
	}

	if (lineHeight !== 0 && rendersInline('lineHeight')) {
		styles.lineHeight = lineHeight;
	}

	if (fontSize === 'responsive' && rendersInline('fontSize')) {
		styles.fontSize = buildResponsiveClamp(fontSizeMin, fontSizePreferred, fontSizeMax, sizePreviewUnit);
	}

	// Fit-to-width: the editing surface renders the real per-line
	// typost-line wrappers (wrapFitLines), each carrying its own cqi
	// font-size. The block-level size is only the fallback that
	// unmeasured lines and empty lines inherit — the same clamp the
	// frontend emits (save.js) for browsers without container queries.
	if (fontSize === 'fit' && rendersInline('fontSize')) {
		styles.fontSize = buildResponsiveClamp(fontSizeMin, fontSizePreferred, fontSizeMax, sizePreviewUnit);
	}

	// A fixed px size (a style created from the inline editor) has no
	// block-native control; render it inline when it is not coming from
	// the style's class (an edit in progress, or a detached block that
	// kept the size — an orphaned styleClass is cleared above). save.js
	// emits the same inline size once the block has no styleClass. Zero
	// means "no size" (save.js and the style CSS generators agree).
	if ((!styleOverrides || styleOverrides.fontSize) && /^\d+(\.\d+)?$/.test(String(fontSize)) && Number(fontSize) > 0) {
		styles.fontSize = formatFontSizeLength(fontSize, sizePreviewUnit);
	}

	if (fontVariationSettings && rendersInline('fontVariationSettings')) {
		styles.fontVariationSettings = fontVariationSettings;
	}

	if (textAlign) {
		styles.textAlign = textAlign;
	}

	// Hanging initial (#242): a custom property. In the editor it drives
	// the text-indent rule in editor.css and, in fit mode, the line-1
	// margin in style.css (the frontend's ::first-letter rule never
	// reaches the RichText). With a paragraph style active the
	// class supplies it; an override is written even at 0, so turning the
	// hang off on one block cancels the style's value while previewing.
	if (rendersInline('initialHang') && (styleOverrides || normalizeHang(initialHang) > 0)) {
		styles['--typost-hang'] = String(normalizeHang(initialHang));
	}

	// Case (#214). With a paragraph style active the class supplies it;
	// an override back to Default previews as Normal, because an inline
	// style cannot fall back to the theme past the class rule.
	if (rendersInline('textCase')) {
		const caseValue = normalizeTextCase(textCase) || (styleOverrides ? 'none' : '');
		Object.assign(styles, caseStyleObject(caseValue, fakeSmallCaps));
	}

	return styles;
}
