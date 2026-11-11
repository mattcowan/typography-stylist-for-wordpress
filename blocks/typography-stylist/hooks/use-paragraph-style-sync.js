/**
 * Typography Stylist Block - keep a block in sync with its paragraph style.
 *
 * Moved out of edit.js unchanged (#356).
 */

import { store as blockEditorStore } from '@wordpress/block-editor';
import { useState, useEffect, useMemo } from '@wordpress/element';
import { dispatch } from '@wordpress/data';
import { findParagraphStyleByClass, stylePropertyOverrides, isOrphanStyleClass, resolveDetachFontSizeUnit } from '../utils';

/**
 * The paragraph style named by styleClass, and the block attributes that
 * differ from it.
 *
 * Also re-syncs the block's attribute copy when the Paragraph Styles module
 * fires typost-paragraph-styles-updated, and clears a styleClass whose style
 * no longer exists (the block then behaves as detached).
 *
 * @param {Object}   args
 * @param {string}   args.styleClass    The block's styleClass attribute
 * @param {Function} args.setAttributes Block setAttributes
 * @param {Object}   args.qftStateRef   Shared editor state ref (current styleClass and attributes)
 * @param {Object}   args.blockPropsRef Ref holding the current fontIdMap
 * @return {Object} activeParagraphStyle (or null) and styleOverrides (or null).
 */
export default function useParagraphStyleSync({
	styleClass,
	setAttributes,
	qftStateRef,
	blockPropsRef,
	fontId,
	fontWeight,
	fontStyle,
	fontSize,
	fontSizeMin,
	fontSizePreferred,
	fontSizeMax,
	fitMaxSize,
	letterSpacing,
	lineHeight,
	features,
	fontVariationSettings,
	initialHang,
	textCase,
	fakeSmallCaps
}) {
	// The paragraph style behind styleClass, when it still exists. With it the
	// content element carries the style's class and the class rule renders the
	// style in the editor exactly as on the frontend (save.js emits no inline
	// styles under a styleClass). Attributes are the Inspector's working copy:
	// only the ones that differ from the style are still rendered inline, so
	// an in-progress edit previews without hiding the style, and a style
	// updated elsewhere shows on every block that uses it (PS-5) — including
	// fixed px sizes the block cannot express itself (PS-4).
	// Bumps when the Paragraph Styles module saves/updates/deletes a style
	// (it rewrites window.typostData.paragraphStyles and fires this event), so
	// every block using the style re-reads it and re-renders from the class.
	const [paragraphStylesVersion, setParagraphStylesVersion] = useState(0);
	useEffect(() => {
		const onStylesUpdated = () => {
			setParagraphStylesVersion((v) => v + 1);
			// Re-sync this block's working copy with the style it uses. The
			// attributes are a copy taken when the style was applied; after
			// "Update Style" elsewhere they would differ from the style and be
			// rendered inline as if they were edits, hiding the update (PS-5).
			// An in-progress edit on a block other than the one that saved the
			// style is overwritten by that save — the style is authoritative.
			const current = qftStateRef.current || {};
			const style = findParagraphStyleByClass(current.styleClass, window.typostData && window.typostData.paragraphStyles);
			if (!style || !style.properties) {
				return;
			}
			const overrides = stylePropertyOverrides(current, style.properties);
			if (!Object.keys(overrides).length) {
				return;
			}
			const psUtils = window.typostPSUtils;
			const props = psUtils && psUtils.normalizeApplyProperties ? psUtils.normalizeApplyProperties(style.properties) : style.properties;
			const { fontIdMap: idMap } = blockPropsRef.current || {};
			const synced = {};
			['fontId', 'fontWeight', 'fontStyle', 'fontSize', 'fontSizeMin', 'fontSizePreferred', 'fontSizeMax', 'fitMaxSize', 'letterSpacing', 'lineHeight', 'features', 'fontVariationSettings', 'initialHang', 'textCase', 'fakeSmallCaps'].forEach((key) => {
				if (props[key] !== undefined) {
					synced[key] = props[key];
				}
			});
			if (synced.fontId !== undefined && idMap && idMap[synced.fontId]) {
				synced.fontFamily = idMap[synced.fontId].family;
			}
			// Derived state, not an edit: one undo step per synced block would
			// let Ctrl+Z pull a single block back out of sync with its style.
			if (typeof dispatch(blockEditorStore).__unstableMarkNextChangeAsNotPersistent === 'function') {
				dispatch(blockEditorStore).__unstableMarkNextChangeAsNotPersistent();
			}
			setAttributes(synced);
		};
		document.addEventListener('typost-paragraph-styles-updated', onStylesUpdated);
		return () => document.removeEventListener('typost-paragraph-styles-updated', onStylesUpdated);
	}, [setAttributes]);
	const activeParagraphStyle = useMemo(
		() => findParagraphStyleByClass(styleClass, window.typostData && window.typostData.paragraphStyles),
		[styleClass, paragraphStylesVersion]
	);
	// A styleClass whose style was deleted leaves the editor and the frontend
	// permanently apart: save.js emits no inline styles under a styleClass and
	// the class rule is gone, so the frontend falls back to the theme while the
	// editor still shows the attribute copy. Drop the orphaned class so the
	// block behaves as detached and both sides render the attributes inline.
	useEffect(() => {
		if (isOrphanStyleClass(styleClass, window.typostData && window.typostData.paragraphStyles)) {
			// The deleted style's unit is unknown: px, as before #233
			setAttributes({ styleClass: '', fontSizeUnit: resolveDetachFontSizeUnit(styleClass, window.typostData && window.typostData.paragraphStyles) });
		}
	}, [styleClass, paragraphStylesVersion, setAttributes]);
	const styleOverrides = useMemo(
		() => activeParagraphStyle
			? stylePropertyOverrides({ fontId, fontWeight, fontStyle, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, fitMaxSize, letterSpacing, lineHeight, features, fontVariationSettings, initialHang, textCase, fakeSmallCaps }, activeParagraphStyle.properties)
			: null,
		[activeParagraphStyle, fontId, fontWeight, fontStyle, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, fitMaxSize, letterSpacing, lineHeight, features, fontVariationSettings, initialHang, textCase, fakeSmallCaps]
	);

	return { activeParagraphStyle, styleOverrides };
}
