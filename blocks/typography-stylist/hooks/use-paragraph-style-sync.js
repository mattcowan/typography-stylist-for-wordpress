/**
 * Typography Stylist Block - keep a block in sync with its paragraph style.
 *
 * Moved out of edit.js (#356). Since #451 the settings the author changed on
 * top of the style (the overrideKeys attribute) are kept by the re-sync, and
 * they decide what the editor renders inline.
 */

import { store as blockEditorStore } from '@wordpress/block-editor';
import { useState, useEffect, useMemo, useRef } from '@wordpress/element';
import { dispatch, select } from '@wordpress/data';
import { findParagraphStyleByClass, isOrphanStyleClass, resolveDetachFontSizeUnit, overrideKeysToMap, normalizeOverrideKeys, isStyleUpdateSource, resolveStyleSyncUpdate, resolveDerivedStyleSync } from '../utils';

/**
 * The paragraph style named by styleClass, and the settings the block
 * overrides.
 *
 * Also re-syncs the block's attribute copy when the Paragraph Styles module
 * fires typost-paragraph-styles-updated, keeps the settings the block does
 * not override in line with the style (derived, not persistent), and clears
 * a styleClass whose style no longer exists (the block then behaves as
 * detached).
 *
 * @param {Object}   args
 * @param {string}   args.clientId      The block's clientId
 * @param {string}   args.styleClass    The block's styleClass attribute
 * @param {Array}    args.overrideKeys  The block's overrideKeys attribute (#451)
 * @param {Object}   args.attributes    The block's attributes (a change runs
 *                                      the derived re-sync again)
 * @param {Function} args.setAttributes Block setAttributes (not the override
 *                                      tracking one: a re-sync is not an edit)
 * @param {Object}   args.blockPropsRef Ref holding the current fontIdMap
 * @return {Object} activeParagraphStyle (or null) and styleOverrides (the
 *                  listed keys as a map, or null without an active style).
 */
export default function useParagraphStyleSync({
	clientId,
	styleClass,
	overrideKeys,
	attributes,
	setAttributes,
	blockPropsRef
}) {
	// The paragraph style behind styleClass, when it still exists. With it the
	// content element carries the style's class and the class rule renders the
	// style in the editor exactly as on the frontend. Attributes are the
	// Inspector's working copy: only the settings the author changed on top
	// of the style (overrideKeys, #451) are rendered inline, as save.js writes
	// them, and a style updated elsewhere shows on every block that uses it
	// (PS-5) — including fixed px sizes the block cannot express itself (PS-4).
	// Bumps when the Paragraph Styles module saves/updates/deletes a style
	// (it rewrites window.typostData.paragraphStyles and fires this event), so
	// every block using the style re-reads it and re-renders from the class.
	const [paragraphStylesVersion, setParagraphStylesVersion] = useState(0);
	const clientIdRef = useRef(clientId);
	clientIdRef.current = clientId;
	useEffect(() => {
		const onStylesUpdated = (event) => {
			setParagraphStylesVersion((v) => v + 1);
			// Re-sync this block's working copy with the style it uses. The
			// attributes are a copy taken when the style was applied; after
			// "Update Style" elsewhere they would differ from the style while
			// the class renders the new values (PS-5). Settings the block
			// overrides keep the block's values (#451); the block that ran
			// Update Style takes the keys it saved into the style off its list.
			const blockEditor = select(blockEditorStore);
			const current = blockEditor.getBlockAttributes(clientIdRef.current);
			if (!current) {
				return;
			}
			const style = findParagraphStyleByClass(current.styleClass, window.typostData && window.typostData.paragraphStyles);
			if (!style || !style.properties) {
				return;
			}
			const isSource = isStyleUpdateSource(event && event.detail, style, blockEditor.getSelectedBlockClientId() === clientIdRef.current);
			const psUtils = window.typostPSUtils;
			const props = psUtils && psUtils.normalizeApplyProperties ? psUtils.normalizeApplyProperties(style.properties) : style.properties;
			const { fontIdMap: idMap } = blockPropsRef.current || {};
			const synced = resolveStyleSyncUpdate(current, style, props, idMap, isSource);
			if (!synced) {
				return;
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
	// permanently apart: save.js writes only the overridden settings under a
	// styleClass and the class rule is gone, so the frontend falls back to the
	// theme while the editor still shows the attribute copy. Drop the orphaned
	// class so the block behaves as detached and both sides render the
	// attributes inline. The override list means nothing without a style.
	useEffect(() => {
		if (isOrphanStyleClass(styleClass, window.typostData && window.typostData.paragraphStyles)) {
			// The deleted style's unit is unknown: px, as before #233
			const cleared = { styleClass: '', fontSizeUnit: resolveDetachFontSizeUnit(styleClass, window.typostData && window.typostData.paragraphStyles) };
			if (normalizeOverrideKeys(overrideKeys).length) {
				cleared.overrideKeys = [];
			}
			setAttributes(cleared);
		}
	}, [styleClass, paragraphStylesVersion, setAttributes]); // eslint-disable-line react-hooks/exhaustive-deps -- overrideKeys is read at the time the class is found orphaned
	// Unlisted settings follow the style as derived state (#451 round 1): a
	// block saved before its style changed, or brought back by undo, holds
	// old copies that the class does not render. Without this the sidebar
	// showed them with "(modified)", Detach wrote them, the fit measurement
	// measured them and Update Style published them into the style. Not
	// persistent and out of the undo history, so opening a post does not
	// mark it as changed; the saved post takes the values with the next real
	// edit. Runs whenever the attributes or the style change, and writes
	// only real changes (resolveDerivedStyleSync()), so it cannot repeat.
	useEffect(() => {
		if (!activeParagraphStyle) {
			return undefined;
		}
		// After the commit, not in it: a change made while the editor mounts
		// (React's StrictMode, SCRIPT_DEBUG on, runs the effects twice) was
		// taken as an edit and marked the post as changed. Measured; the fit
		// measurement is deferred too (#388).
		const timer = window.setTimeout(() => {
			const current = select(blockEditorStore).getBlockAttributes(clientIdRef.current);
			if (!current) {
				return;
			}
			const psUtils = window.typostPSUtils;
			const props = psUtils && psUtils.normalizeApplyProperties ? psUtils.normalizeApplyProperties(activeParagraphStyle.properties || {}) : (activeParagraphStyle.properties || {});
			const { fontIdMap: idMap } = blockPropsRef.current || {};
			const update = resolveDerivedStyleSync(current, activeParagraphStyle, props, idMap);
			if (!update) {
				return;
			}
			// history 'ignore' (WordPress 7.1+; older versions take no
			// argument), as the fit measurement does (#388)
			if (typeof dispatch(blockEditorStore).__unstableMarkNextChangeAsNotPersistent === 'function') {
				dispatch(blockEditorStore).__unstableMarkNextChangeAsNotPersistent({ history: 'ignore' });
			}
			setAttributes(update);
		}, 0);
		return () => window.clearTimeout(timer);
	}, [activeParagraphStyle, attributes, setAttributes]); // eslint-disable-line react-hooks/exhaustive-deps -- the attributes are read from the store; the object only says when to look
	// The editor renders inline what save.js writes: the listed keys (#451).
	// A value that differs from the style but is not listed (a copy taken
	// before the style changed, in a post that was not open then) renders
	// from the class, as on the frontend.
	const styleOverrides = useMemo(
		() => (activeParagraphStyle ? overrideKeysToMap(overrideKeys) : null),
		[activeParagraphStyle, overrideKeys]
	);

	return { activeParagraphStyle, styleOverrides };
}
