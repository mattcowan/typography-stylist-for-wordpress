/**
 * Typography Stylist Block - Quick Feature Toggles fit-relative scale and shift.
 *
 * Moved out of edit.js unchanged (#356). The functions were closures inside
 * Edit and are still rebuilt on every render: Edit calls this factory once
 * per render with the current values, so every function sees the same
 * values it saw before.
 */

import { updateSpanPropertyInPlace, splitSpanAndApply, validateRangeMatchesSelection, applyOrMergeStyling, applyStylingSafeStringMethod, stripRedundantFontSizeAttrs, removePropertyFromSelection } from '../utils';
import { getRangeForOffsets } from '../qft-preview';

/**
 * Apply and clear the fit-relative scale and vertical shift on the
 * selection of a fit-to-width block.
 *
 * @param {Object} ctx Edit's current values, state setters, refs and the
 *                     functions earlier factories returned (see edit.js).
 * @return {Object} applyFitSpanProperty, applyFitScaleOnly, applyFitShiftOnly, clearFitScale, clearFitShift
 */
export default function createFitSpanActions(ctx) {
	const {
		capturedSelection, content, inlineFitScale, inlineFitShift, inlineStylesAtSelection,
		originalContentRef, reportInlineApplyFailure, resolvedApplyRange, revertInlineControl,
		setAttributes, setInlineFitScale, setInlineFitShift
	} = ctx;

	// Shared three-tier applier for the fit-relative span properties
	// (data-fitscale / data-fitshift) — same strategy chain as
	// applyLetterSpacingOnly: update-in-place at a collapsed cursor, split
	// when the selection's span already has the property, else wrap/merge
	// with the string-method fallback.
	// `revert` puts the caller's control back when both strategies refuse
	// (see reportInlineApplyFailure).
	const applyFitSpanProperty = ({ dataAttr, attrValue, styleProperty, styleValue, hasExisting, postProcess, revert }) => {
		if (!content || !resolvedApplyRange) return;

		const start = resolvedApplyRange.start;
		const end = resolvedApplyRange.end;
		const finish = (newContent) => {
			setAttributes({ content: postProcess ? postProcess(newContent) : newContent });
			originalContentRef.current = null;
		};

		// COLLAPSED CURSOR: Update parent span in-place
		if (start === end) {
			const result = updateSpanPropertyInPlace(content, start, dataAttr, attrValue, styleProperty, styleValue);
			if (result.success) {
				finish(result.content);
			}
			return;
		}

		// SELECTION: split the parent span when it already has the property
		if (hasExisting) {
			const result = splitSpanAndApply(content, start, end, dataAttr, { [dataAttr]: attrValue }, `${styleProperty}: ${styleValue}`);
			if (result.success) {
				finish(result.content);
				return;
			}
			// If split failed, fall through to merge/nest logic below
		}

		const styleString = `${styleProperty}: ${styleValue}`;
		const attributes = { [dataAttr]: attrValue };

		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
		const container = doc.body.firstChild;

		// STRATEGY: Try Range method first, fallback to string manipulation
		const range = getRangeForOffsets(container, start, end, doc);
		const validation = validateRangeMatchesSelection(
			range,
			capturedSelection?.text || '',
			capturedSelection?.length || 0
		);

		let success = false;
		let newContent = content;

		if (validation.valid) {
			success = applyOrMergeStyling(range, attributes, styleString, doc);
			if (success) {
				newContent = container.innerHTML;

				// POST-VALIDATION: Verify the result doesn't wrap entire content
				const parser2 = new DOMParser();
				const doc2 = parser2.parseFromString(`<div>${newContent}</div>`, 'text/html');
				const container2 = doc2.body.firstChild;

				let wrappedEverything = false;
				container2.querySelectorAll('span.typost-styled').forEach(span => {
					const spanText = span.textContent || '';
					const containerText = container2.textContent || '';
					if (spanText.length >= containerText.length - 1) {
						const isIntendedSelection = capturedSelection &&
						                            Math.abs(spanText.length - capturedSelection.length) <= 1;
						if (!isIntendedSelection) {
							wrappedEverything = true;
						}
					}
				});

				if (wrappedEverything) {
					success = false; // Force fallback
				}
			}
		}

		if (!success) {
			const fallbackResult = applyStylingSafeStringMethod(content, start, end, attributes, styleString);
			if (fallbackResult.success) {
				newContent = fallbackResult.content;
			} else {
				// Both methods failed - report it and put the control back
				reportInlineApplyFailure(fallbackResult.error, revert);
				return;
			}
		}

		finish(newContent);
	};

	// Apply fit-relative scale (data-fitscale → font-size: Nem). Em sizes
	// scale linearly with the fitted line, so the stored width ratio stays
	// valid; the content change re-triggers the debounced measure.
	const applyFitScaleOnly = () => {
		if (inlineFitScale === 100) return;
		applyFitSpanProperty({
			dataAttr: 'data-fitscale',
			attrValue: String(inlineFitScale / 100),
			styleProperty: 'font-size',
			styleValue: `${inlineFitScale / 100}em`,
			hasExisting: !!(inlineStylesAtSelection && inlineStylesAtSelection.fitScale !== null),
			// A span can't carry both data-fitscale and data-fontsize (one
			// font-size declaration; the fit neutralization rule would win)
			postProcess: stripRedundantFontSizeAttrs,
			revert: () => revertInlineControl('fitScale')
		});
	};

	// Apply fit-relative vertical shift (data-fitshift → vertical-align: Nem).
	// vertical-align moves the inline box without changing its advance, so
	// measured widths are unaffected. Em resolves against the span's own
	// (possibly fitscale-scaled) font size.
	const applyFitShiftOnly = () => {
		if (inlineFitShift === 0) return;
		applyFitSpanProperty({
			dataAttr: 'data-fitshift',
			attrValue: String(inlineFitShift),
			styleProperty: 'vertical-align',
			styleValue: `${inlineFitShift}em`,
			hasExisting: !!(inlineStylesAtSelection && inlineStylesAtSelection.fitShift !== null),
			revert: () => revertInlineControl('fitShift')
		});
	};

	// Clear fit scale (reset to 100% and remove from content)
	const clearFitScale = () => {
		if (!content || inlineFitScale === 100) return;

		setInlineFitScale(100);

		if (resolvedApplyRange) {
			const result = removePropertyFromSelection(
				content,
				resolvedApplyRange.start,
				resolvedApplyRange.end,
				'data-fitscale',
				'font-size'
			);
			if (result.success) {
				setAttributes({ content: result.content });
			}
		}
	};

	// Clear fit shift (reset to 0 and remove from content)
	const clearFitShift = () => {
		if (!content || inlineFitShift === 0) return;

		setInlineFitShift(0);

		if (resolvedApplyRange) {
			const result = removePropertyFromSelection(
				content,
				resolvedApplyRange.start,
				resolvedApplyRange.end,
				'data-fitshift',
				'vertical-align'
			);
			if (result.success) {
				setAttributes({ content: result.content });
			}
		}
	};

	return {
		applyFitSpanProperty,
		applyFitScaleOnly,
		applyFitShiftOnly,
		clearFitScale,
		clearFitShift
	};
}
