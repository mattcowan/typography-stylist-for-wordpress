/**
 * Typography Stylist Block - the typost-apply-block-properties bridge.
 *
 * Moved out of edit.js (#356). See HOOKS.md for the event.
 */

import { isRTL } from '@wordpress/i18n';
import { useRef, useEffect } from '@wordpress/element';
import { normalizeHang, normalizeTextCase, resolveDetachFontSizeUnit, findParagraphStyleByClass, styleAlignmentToTextAlign, buildBlockFontSizeCss, resolveFontSizeUnit } from '../utils';

/**
 * Listen for the typost-apply-block-properties CustomEvent and apply its
 * properties to this block, or to the selection for a selection-scoped
 * paragraph style or QFT font variation settings.
 *
 * The listener is registered once per block instance. What it needs from the
 * current render (fontIdMap, fontWeight, getClosestWeight, clientId, whether
 * the QFT modal is open, the selected block, styleClass, textAlign, the size
 * attributes) it reads from the returned ref, which Edit assigns on every
 * render once those values exist.
 *
 * @param {Object}   args
 * @param {Function} args.setAttributes                 Block setAttributes
 * @param {Function} args.setInlineFontFamily           QFT state setter
 * @param {Function} args.setInlineFontWeight           QFT state setter
 * @param {Function} args.setInlineLetterSpacing        QFT state setter
 * @param {Function} args.setInlineLineHeight           QFT state setter
 * @param {Function} args.setInlineFontSize             QFT state setter
 * @param {Function} args.setInlineFontSizeMin          QFT state setter
 * @param {Function} args.setInlineFontSizePreferred    QFT state setter
 * @param {Function} args.setInlineFontSizeMax          QFT state setter
 * @param {Object}   args.applyParagraphStyleRef        Ref to the selection paragraph style applier
 * @param {Object}   args.applyFontVariationSettingsRef Ref to the selection font variation applier
 * @return {Object} blockPropsRef, for Edit to fill in.
 */
export default function useApplyBlockProperties({
	setAttributes,
	setInlineFontFamily,
	setInlineFontWeight,
	setInlineLetterSpacing,
	setInlineLineHeight,
	setInlineFontSize,
	setInlineFontSizeMin,
	setInlineFontSizePreferred,
	setInlineFontSizeMax,
	applyParagraphStyleRef,
	applyFontVariationSettingsRef
}) {
	// Extension hook: Listen for block property application from extensions (v2.0.0)
	// Uses ref pattern to avoid stale closures — handler registered once,
	// reads current fontIdMap/fontWeight from ref.
	// Note: ref.current is assigned later (after fontIdMap/getClosestWeight are declared)
	const blockPropsRef = useRef({});

	useEffect(() => {
		const handleApplyBlockProperties = (e) => {
			if (e.detail && (e.detail.source === 'qft' || e.detail.source === 'inspector') && e.detail.properties) {
				const props = e.detail.properties;
				const { fontIdMap: idMap, fontWeight: curWeight, getClosestWeight: closestWeight, clientId: curClientId, isPopoverOpen: popoverOpen, selectedBlockClientId: selectedId, styleClass: curStyleClass, textAlign: curTextAlign } = blockPropsRef.current;
				// Targeting guard: every Typography Stylist block registers this
				// listener, so only the block the extension UI actually targets
				// may handle the event. Extensions don't know clientIds, so the
				// guard is receiving-side: a 'qft' event belongs to the block
				// whose QFT modal is open; an 'inspector' event belongs to the
				// currently selected block.
				if (e.detail.source === 'qft' ? !popoverOpen : selectedId !== curClientId) {
					return;
				}
				// Selection-scoped paragraph style. Styles are block-level by
				// nature, so this only happens when the sender explicitly asks
				// for it (applyTo: 'selection'): the style browser and the
				// Quick Feature Toggles' panel with text selected (#303). The
				// Inspector's panel stays block-level. Without it, styling one
				// selected word restyled every neighbouring word that happened
				// to carry no explicit styling of its own.
				if (e.detail.applyTo === 'selection' && e.detail.paragraphStyleId !== undefined && applyParagraphStyleRef.current) {
					if (applyParagraphStyleRef.current(e.detail.paragraphStyleId, !!e.detail.savedFromSelection)) {
						return;
					}
					// No usable selection — fall through to the block-level path
				}

				// QFT-scoped font-variation-settings applies to the current
				// selection (inline span), not the whole block — the inspector's
				// axis sliders remain block-level by design. Handled before the
				// generic attribute loop and excluded from it below.
				let fvsHandledInline = false;
				if (e.detail.source === 'qft' && props.fontVariationSettings !== undefined && applyFontVariationSettingsRef.current) {
					applyFontVariationSettingsRef.current(props.fontVariationSettings);
					fvsHandledInline = true;
				}
				// Apply to block-level attributes
				const newAttrs = {};
				if (props.fontId !== undefined) {
					newAttrs.fontId = props.fontId;
					// Resolve fontFamily from fontIdMap (same pattern as Inspector Controls onChange)
					if (idMap[props.fontId]) {
						const fontData = idMap[props.fontId];
						newAttrs.fontFamily = fontData.family;
						// Validate weight against new font's available weights
						const weight = props.fontWeight || curWeight;
						const available = fontData.availableWeights;
						if (available && available.length > 0 && !available.includes(weight)) {
							newAttrs.fontWeight = closestWeight(weight, available);
						}
					}
				}
				if (props.fontWeight !== undefined) newAttrs.fontWeight = props.fontWeight;
				if (props.fontStyle !== undefined) newAttrs.fontStyle = props.fontStyle;
				if (props.fontSize !== undefined) newAttrs.fontSize = props.fontSize;
				if (props.fontSizeMin !== undefined) newAttrs.fontSizeMin = props.fontSizeMin;
				if (props.fontSizePreferred !== undefined) newAttrs.fontSizePreferred = props.fontSizePreferred;
				if (props.fontSizeMax !== undefined) newAttrs.fontSizeMax = props.fontSizeMax;
				// fitLineSizes is deliberately NOT settable here: it's
				// content-specific and re-measured by the receiving block
				if (props.fitMaxSize !== undefined) newAttrs.fitMaxSize = props.fitMaxSize;
				// fitLineHangs is content-specific like fitLineSizes and never set here
				if (props.initialHang !== undefined) newAttrs.initialHang = normalizeHang(props.initialHang);
				if (props.textCase !== undefined) newAttrs.textCase = normalizeTextCase(props.textCase);
				if (props.fakeSmallCaps !== undefined) newAttrs.fakeSmallCaps = props.fakeSmallCaps !== false;
				if (props.letterSpacing !== undefined) newAttrs.letterSpacing = props.letterSpacing;
				if (props.lineHeight !== undefined) newAttrs.lineHeight = props.lineHeight;
				if (props.features !== undefined) newAttrs.features = props.features;
				if (props.fontVariationSettings !== undefined && !fvsHandledInline) newAttrs.fontVariationSettings = props.fontVariationSettings;
				// Generic styleClass support: extensions can pass a CSS class to apply
				if (e.detail.styleClass !== undefined) {
					newAttrs.styleClass = e.detail.styleClass;
					// Detach (#233): the sizes the style rendered keep its unit
					// once the block writes them itself
					if (e.detail.styleClass === '') {
						const detachUnit = resolveDetachFontSizeUnit(curStyleClass, window.typostData && window.typostData.paragraphStyles);
						if (detachUnit) {
							newAttrs.fontSizeUnit = detachUnit;
						}
						// Detach keeps the style's alignment (#207, PR #329
						// review) on a block without its own; a fit block
						// never took it (the style rule skips .typost-fit)
						const detachedStyle = findParagraphStyleByClass(curStyleClass, window.typostData && window.typostData.paragraphStyles);
						const detachedProps = (detachedStyle && detachedStyle.properties) || {};
						const keptAlign = styleAlignmentToTextAlign(detachedProps.alignment, isRTL());
						const isFitNow = (props.fontSize !== undefined ? props.fontSize : blockPropsRef.current.fontSize) === 'fit';
						if (keptAlign && !curTextAlign && !isFitNow) {
							newAttrs.textAlign = keptAlign;
						}
						// The color, spacing and indents stay in the block's own
						// settings (#346), the first line indent in core's Text
						// indent where core renders it (#348). Measured now, while
						// the style still renders. The module's notice names what
						// could not stay.
						const psUtils = window.typostPSUtils;
						// The size the style's em values resolved against: the
						// visual copy's size after Detach (#363), so a
						// responsive size keeps them as calc(N * clamp(…))
						const sizeNow = blockPropsRef.current.blockSizeAttrs || {};
						const pickSize = (key, current) => (newAttrs[key] !== undefined ? newAttrs[key] : current);
						const detachEmBasis = buildBlockFontSizeCss(
							{
								fontSize: pickSize('fontSize', blockPropsRef.current.fontSize),
								fontSizeMin: pickSize('fontSizeMin', sizeNow.fontSizeMin),
								fontSizePreferred: pickSize('fontSizePreferred', sizeNow.fontSizePreferred),
								fontSizeMax: pickSize('fontSizeMax', sizeNow.fontSizeMax),
							},
							resolveFontSizeUnit(pickSize('fontSizeUnit', sizeNow.fontSizeUnit))
						);
						if (detachedStyle && psUtils && psUtils.buildDetachBlockSettings) {
							const kept = psUtils.buildDetachBlockSettings(
								detachedProps,
								{ textColor: blockPropsRef.current.blockTextColor, style: blockPropsRef.current.blockStyle },
								{
									isRtl: isRTL(),
									palette: psUtils.readEditorPalette(),
									fontSizePx: psUtils.measureBlockFontSize(curClientId),
									isFit: isFitNow,
									// The style wrote its margins on this wrapper too
									keepMarginEm: true,
									hasGrepRules: !!(detachedStyle.grepRules && detachedStyle.grepRules.length),
									hasNestedRules: !!(detachedStyle.nestedRules && detachedStyle.nestedRules.length),
									textIndent: !!(psUtils.readTextIndentSupport && psUtils.readTextIndentSupport('typost/block')),
									followsSameStyle: !!(psUtils.blockCarriesStyle && psUtils.blockCarriesStyle(psUtils.readPreviousBlock(curClientId), detachedStyle)),
									emBasis: detachEmBasis,
									// With the theme's size (#364): the Line indent reaches
									// the text through --typost-text-indent, so em stays em;
									// the padding stays on the wrapper and takes theme.json's
									// size when the canvas proves it, else px as before
									textIndentInEm: true,
									themeEmBasis: !detachEmBasis && psUtils.readThemeTextSizeBasis ? psUtils.readThemeTextSizeBasis(curClientId) : '',
								}
							);
							Object.assign(newAttrs, kept.attributes);
							document.dispatchEvent(new CustomEvent('typost-paragraph-style-detached', { detail: kept }));
						}
					}
				}
				// Layered font configuration ID support
				if (props.layeredConfigId !== undefined) {
					newAttrs.layeredConfigId = props.layeredConfigId;
				}
				// Animation configuration ID support (animations extension)
				if (props.animationConfigId !== undefined) {
					newAttrs.animationConfigId = props.animationConfigId;
				}
				setAttributes(newAttrs);

				// Sync QFT inline state so controls reflect the applied style
				if (props.fontId !== undefined) {
					setInlineFontFamily(String(props.fontId));
				}
				if (newAttrs.fontWeight !== undefined) {
					setInlineFontWeight(newAttrs.fontWeight);
				} else if (props.fontWeight !== undefined) {
					setInlineFontWeight(props.fontWeight);
				}
				if (props.letterSpacing !== undefined) {
					setInlineLetterSpacing(props.letterSpacing);
				}
				if (props.lineHeight !== undefined) {
					setInlineLineHeight(props.lineHeight);
				}
				if (props.fontSize !== undefined) {
					setInlineFontSize(props.fontSize);
				}
				if (props.fontSizeMin !== undefined) {
					setInlineFontSizeMin(props.fontSizeMin);
				}
				if (props.fontSizePreferred !== undefined) {
					setInlineFontSizePreferred(props.fontSizePreferred);
				}
				if (props.fontSizeMax !== undefined) {
					setInlineFontSizeMax(props.fontSizeMax);
				}
			}
		};
		document.addEventListener('typost-apply-block-properties', handleApplyBlockProperties);
		return () => {
			document.removeEventListener('typost-apply-block-properties', handleApplyBlockProperties);
		};
	}, [setAttributes, setInlineFontFamily, setInlineFontWeight, setInlineLetterSpacing, setInlineLineHeight, setInlineFontSize, setInlineFontSizeMin, setInlineFontSizePreferred, setInlineFontSizeMax]); // eslint-disable-line react-hooks/exhaustive-deps -- fontIdMap/fontWeight/getClosestWeight read from ref

	return blockPropsRef;
}
