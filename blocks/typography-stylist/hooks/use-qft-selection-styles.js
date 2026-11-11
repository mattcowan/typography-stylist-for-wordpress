/**
 * Typography Stylist Block - the Quick Feature Toggles range and the inline
 * styles at it.
 *
 * Moved out of edit.js unchanged (#356).
 */

import { useMemo } from '@wordpress/element';
import { parseInlineStylesAtCursor, resolveQftApplyRange, resolveSelectionFontWeights, detectEmItalicAtRange, detectStrongBoldAtRange } from '../utils';

/**
 * Resolve the range QFT applies work on and detect the inline styles there.
 *
 * Also writes the selection fields of the shared editor state on
 * qftStateRef (selectionRange, inlineFontId, inlineFontStyle,
 * inlineExplicitFontStyle and the selection font weights).
 *
 * @param {Object}  args
 * @param {string}  args.content           Block content
 * @param {?Object} args.selectionStart    Store selection start
 * @param {?Object} args.selectionEnd      Store selection end
 * @param {string}  args.clientId          Block client ID
 * @param {?Object} args.capturedSelection Selection captured when the QFT modal opened
 * @param {Object}  args.qftStateRef       Shared editor state ref (useQftEditorState)
 * @return {Object} resolvedApplyRange, inlineStylesAtSelection and the
 *                  features, disabled features and font id at the selection.
 */
export default function useQftSelectionStyles({ content, selectionStart, selectionEnd, clientId, capturedSelection, qftStateRef }) {
	// The range QFT property applies operate on: the LIVE selection when it's
	// expanded and in this block, else the selection captured when the popover
	// opened (focus moving into the popover collapses the live one), else a
	// live caret, else null. Every applier and the detection below share this
	// so "what the controls show" and "where changes land" can't disagree.
	const resolvedApplyRange = useMemo(
		() => resolveQftApplyRange(selectionStart, selectionEnd, clientId, capturedSelection),
		[selectionStart?.offset, selectionEnd?.offset, selectionStart?.clientId, selectionEnd?.clientId, clientId, capturedSelection] // eslint-disable-line react-hooks/exhaustive-deps -- object identities intentionally reduced to offsets
	);
	// The same range for the shared editor state: with text selected, the
	// Paragraph Style panel in the Quick Feature Toggles saves and applies
	// styles on that text, not on the block (#303)
	qftStateRef.current.selectionRange = resolvedApplyRange && resolvedApplyRange.end > resolvedApplyRange.start ? resolvedApplyRange : null;

	// Unified inline styles detection at current cursor/selection position
	// Detects ALL properties: features, fontId, fontWeight, fontSize, letterSpacing, lineHeight, fitScale, fitShift
	// Memoized to run once per render instead of once per feature (15-20x performance improvement)
	const inlineStylesAtSelection = useMemo(() => {
		if (!content || !resolvedApplyRange) return null;
		return parseInlineStylesAtCursor(content, resolvedApplyRange.start, resolvedApplyRange.end);
	}, [content, resolvedApplyRange]);

	// Derive individual properties from unified detection for backward compatibility
	const inlineFeaturesAtSelection = inlineStylesAtSelection?.features || [];
	const inlineDisabledFeaturesAtSelection = inlineStylesAtSelection?.disabledFeatures || [];
	const inlineFontFamilyAtSelection = inlineStylesAtSelection?.fontId || null;

	// Surface the inline font-id at the cursor to QFT-state consumers (e.g. the
	// Glyphs panel) so they pre-select the span's font rather than only the
	// block-level font. data-font-id is stored as a string; the consumer side
	// normalizes type, but qftStateRef carries the raw value.
	qftStateRef.current.inlineFontId = inlineFontFamilyAtSelection;
	// Effective font style at the selection (span data-fontstyle, or an
	// <em>/<i> covering the range even without any typost span) — lets the
	// Glyphs panel load the face variant actually rendering
	const emItalicAtSelection = useMemo(() => {
		if (!content || !resolvedApplyRange || inlineStylesAtSelection?.fontStyle) return null;
		return detectEmItalicAtRange(content, resolvedApplyRange.start, resolvedApplyRange.end);
	}, [content, resolvedApplyRange, inlineStylesAtSelection]);
	qftStateRef.current.inlineFontStyle = inlineStylesAtSelection?.fontStyle || emItalicAtSelection || null;
	// The attr-derived value only (no <em> fallback) — feeds the shared
	// state's explicitFontStyle so persisting consumers can't capture
	// semantic italic (see buildQftEditorState)
	qftStateRef.current.inlineExplicitFontStyle = inlineStylesAtSelection?.explicitFontStyle || null;
	// Effective weight at the selection: a Typography Stylist weight span
	// (parseInlineStylesAtCursor walks up from the innermost one, so a letter
	// selected inside a weighted span resolves too), or failing that semantic
	// bold markup — core's Bold button leaves a <strong> and no span at all.
	//
	// Deliberately NOT named inlineFontWeight: that is already a state value in
	// this component holding the weight *the popover is offering* (default
	// 'inherit'), and publishing that truthy string into the shared editor
	// state would report a weight nothing renders at.
	// A paragraph style on the selected text counts too (#254); see
	// resolveSelectionFontWeights() for which weight is stored and which only
	// rendered.
	const strongBoldAtSelection = useMemo(() => {
		if (!content || !resolvedApplyRange || inlineStylesAtSelection?.storedFontWeight || inlineStylesAtSelection?.styleFontWeight) return null;
		return detectStrongBoldAtRange(content, resolvedApplyRange.start, resolvedApplyRange.end);
	}, [content, resolvedApplyRange, inlineStylesAtSelection]);
	const selectionFontWeights = resolveSelectionFontWeights(inlineStylesAtSelection, strongBoldAtSelection);
	qftStateRef.current.selectionRenderedFontWeight = selectionFontWeights.rendered;
	qftStateRef.current.selectionStoredFontWeight = selectionFontWeights.stored;
	// The style span's own weight, without the <strong> inside it, for the
	// state's explicitFontWeight (#278)
	qftStateRef.current.selectionStyleFontWeight = inlineStylesAtSelection?.styleFontWeight || null;

	return {
		resolvedApplyRange,
		inlineStylesAtSelection,
		inlineFeaturesAtSelection,
		inlineDisabledFeaturesAtSelection,
		inlineFontFamilyAtSelection
	};
}
