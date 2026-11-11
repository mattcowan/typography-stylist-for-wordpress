/**
 * Typography Stylist Block - Quick Feature Toggles spacing and size preview.
 *
 * Moved out of edit.js unchanged (#356). The functions were closures inside
 * Edit and are still rebuilt on every render: Edit calls this factory once
 * per render with the current values, so every function sees the same
 * values it saw before.
 */

import { buildResponsiveClamp, getNewFontSizeUnit, removePropertyFromSelection, updateSpanPropertyInPlace, splitSpanAndApply, validateRangeMatchesSelection, applyOrMergeStyling, applyStylingSafeStringMethod } from '../utils';
import { applyPreviewStyles, getRangeForOffsets } from '../qft-preview';

/**
 * Live preview and apply of letter spacing and line height on the
 * selection, clearing them, and the responsive size preview.
 *
 * @param {Object} ctx Edit's current values, state setters, refs and the
 *                     functions earlier factories returned (see edit.js).
 * @return {Object} handleLetterSpacingChange, clearLetterSpacing, handleLineHeightChange, clearLineHeight, applyLineHeightOnly, handleFontSizePreviewChange, applyLetterSpacingOnly
 */
export default function createSpacingActions(ctx) {
	const {
		capturedSelection, clientId, content, inlineLetterSpacing, inlineLineHeight,
		inlineStylesAtSelection, originalContentRef, previewFontSize, previewFontSizeMax,
		previewFontSizeMin, previewFontSizePreferred, previewLetterSpacing, previewLineHeight,
		reportInlineApplyFailure, resolvedApplyRange, revertInlineControl, selectionEnd, selectionStart,
		setAttributes, setInlineLetterSpacing, setInlineLineHeight, setPreviewLetterSpacing,
		setPreviewLineHeight
	} = ctx;

	// Handle letter spacing change with live preview
	const handleLetterSpacingChange = (value) => {
		setInlineLetterSpacing(value);
		setPreviewLetterSpacing(value);

		// Build styles object with ALL active preview values
		const styles = {};

		if (value !== 0) {
			styles['letter-spacing'] = `${value / 1000}em`;
		}

		if (previewLineHeight !== 0) {
			styles['line-height'] = previewLineHeight;
		}

		if (previewFontSize === 'responsive') {
			const clampValue = buildResponsiveClamp(previewFontSizeMin, previewFontSizePreferred, previewFontSizeMax, getNewFontSizeUnit());
			styles['font-size'] = clampValue;
		}

		applyPreviewStyles({
			content,
			selectionStart,
			selectionEnd,
			clientId,
			styles,
			setAttributes,
			originalContentRef
		});
	};

	// Clear letter spacing (reset to 0 and remove from content)
	const clearLetterSpacing = () => {
		if (!content || inlineLetterSpacing === 0) return;

		setInlineLetterSpacing(0);
		setPreviewLetterSpacing(0);

		if (resolvedApplyRange) {
			const result = removePropertyFromSelection(
				content,
				resolvedApplyRange.start,
				resolvedApplyRange.end,
				'data-letterspacing',
				'letter-spacing'
			);
			if (result.success) {
				setAttributes({ content: result.content });
			}
		}
	};

	// Handle line height change with live preview
	const handleLineHeightChange = (value) => {
		setInlineLineHeight(value);
		setPreviewLineHeight(value);

		// Build styles object with ALL active preview values
		const styles = {};

		if (previewLetterSpacing !== 0) {
			styles['letter-spacing'] = `${previewLetterSpacing / 1000}em`;
		}

		if (value !== 0) {
			styles['line-height'] = value;
		}

		if (previewFontSize === 'responsive') {
			const clampValue = buildResponsiveClamp(previewFontSizeMin, previewFontSizePreferred, previewFontSizeMax, getNewFontSizeUnit());
			styles['font-size'] = clampValue;
		}

		applyPreviewStyles({
			content,
			selectionStart,
			selectionEnd,
			clientId,
			styles,
			setAttributes,
			originalContentRef
		});
	};

	// Clear line height (reset to 0 and remove from content)
	const clearLineHeight = () => {
		if (!content || inlineLineHeight === 0) return;

		setInlineLineHeight(0);
		setPreviewLineHeight(0);

		if (resolvedApplyRange) {
			const result = removePropertyFromSelection(
				content,
				resolvedApplyRange.start,
				resolvedApplyRange.end,
				'data-lineheight',
				'line-height'
			);
			if (result.success) {
				setAttributes({ content: result.content });
			}
		}
	};

	// Apply line height only (no feature)
	const applyLineHeightOnly = () => {
		if (!content || inlineLineHeight === 0) return;

		// Check if we have a valid selection
		if (resolvedApplyRange) {

			const start = resolvedApplyRange.start;
			const end = resolvedApplyRange.end;

			// COLLAPSED CURSOR: Update parent span in-place
			if (start === end) {
				const result = updateSpanPropertyInPlace(
					content,
					start,
					'data-lineheight',
					inlineLineHeight.toString(),
					'line-height',
					inlineLineHeight.toString()
				);

				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
					return;
				}
				return;
			}

			// SELECTION: Check if we should split parent span
			if (inlineStylesAtSelection && inlineStylesAtSelection.lineHeight !== null) {
				const result = splitSpanAndApply(
					content,
					start,
					end,
					'data-lineheight',
					{ 'data-lineheight': inlineLineHeight.toString() },
					`line-height: ${inlineLineHeight}`
				);

				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
					return;
				}
			}

			if (start !== end) {
				// Build the styled span with ONLY line height
				const styleArray = [];

				styleArray.push(`line-height: ${inlineLineHeight}`);

				const styleString = styleArray.join('; ');

				// Parse the current content as HTML
				const parser = new DOMParser();
				const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
				const container = doc.body.firstChild;

				// STRATEGY: Try Range method first, fallback to string manipulation

				// 1. TRY RANGE METHOD
				const range = getRangeForOffsets(container, start, end, doc);

				const validation = validateRangeMatchesSelection(
					range,
					capturedSelection?.text || '',
					capturedSelection?.length || 0
				);

				let success = false;
				let newContent = content;

				if (validation.valid) {
					// Range is valid - try applying with it
					const attributes = { 'data-lineheight': inlineLineHeight.toString() };
					success = applyOrMergeStyling(range, attributes, styleString, doc);

					if (success) {
						newContent = container.innerHTML;

						// POST-VALIDATION: Verify the result doesn't wrap entire content
						const parser2 = new DOMParser();
						const doc2 = parser2.parseFromString(`<div>${newContent}</div>`, 'text/html');
						const container2 = doc2.body.firstChild;
						const typostSpans = container2.querySelectorAll('span.typost-styled');

						// Check if we accidentally wrapped everything
						let wrappedEverything = false;
						typostSpans.forEach(span => {
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

				// 2. FALLBACK: String manipulation if range failed
				if (!success) {
					const attributes = { 'data-lineheight': inlineLineHeight.toString() };

					const fallbackResult = applyStylingSafeStringMethod(
						content,
						start,
						end,
						attributes,
						styleString
					);

					if (fallbackResult.success) {
						newContent = fallbackResult.content;
					} else {
						// Both methods failed - report it and put the control back
						reportInlineApplyFailure(fallbackResult.error, () => revertInlineControl('lineHeight'));
						return;
					}
				}

				// 3. Update content (success is guaranteed: either step 1 succeeded, or step 2 succeeded, or we returned above)
				setAttributes({ content: newContent });
				// CRITICAL: Clear originalContentRef so popover close doesn't restore old content
				originalContentRef.current = null;

				// Note: Re-detection handled by useEffect, no manual reset needed
			}
		}
	};

	// Handle font size preview change
	const handleFontSizePreviewChange = (min, preferred, max) => {
		const styles = {};

		// Include letter-spacing if active
		if (previewLetterSpacing !== 0) {
			styles['letter-spacing'] = `${previewLetterSpacing / 1000}em`;
		}

		// Include line-height if active
		if (previewLineHeight !== 0) {
			styles['line-height'] = previewLineHeight;
		}

		// Calculate clamp() for font-size
		const clampValue = buildResponsiveClamp(min, preferred, max, getNewFontSizeUnit());
		styles['font-size'] = clampValue;

		applyPreviewStyles({
			content,
			selectionStart,
			selectionEnd,
			clientId,
			styles,
			setAttributes,
			originalContentRef
		});
	};

	// Apply letter spacing only (no feature)
	const applyLetterSpacingOnly = () => {
		if (!content || inlineLetterSpacing === 0) return;

		// Check if we have a valid selection
		if (resolvedApplyRange) {

			const start = resolvedApplyRange.start;
			const end = resolvedApplyRange.end;

			// COLLAPSED CURSOR: Update parent span in-place
			if (start === end) {
				const styleValue = `${inlineLetterSpacing / 1000}em`;
				const result = updateSpanPropertyInPlace(
					content,
					start,
					'data-letterspacing',
					inlineLetterSpacing.toString(),
					'letter-spacing',
					styleValue
				);

				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
					return;
				}
				// If failed, do nothing (no span at cursor with this property)
				return;
			}

			// SELECTION: Check if we should split parent span
			if (inlineStylesAtSelection && inlineStylesAtSelection.letterSpacing !== null) {
				// Parent span has letter-spacing, try splitting
				const styleValue = `${inlineLetterSpacing / 1000}em`;
				const result = splitSpanAndApply(
					content,
					start,
					end,
					'data-letterspacing',
					{ 'data-letterspacing': inlineLetterSpacing.toString() },
					`letter-spacing: ${styleValue}`
				);

				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
					return;
				}
				// If split failed, fall through to merge/nest logic below
			}

			if (start !== end) {
				// Build the styled span with ONLY letter spacing
				const styleArray = [];

				styleArray.push(`letter-spacing: ${inlineLetterSpacing / 1000}em`);

				const styleString = styleArray.join('; ');

				// Parse the current content as HTML
				const parser = new DOMParser();
				const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
				const container = doc.body.firstChild;

				// STRATEGY: Try Range method first, fallback to string manipulation

				// 1. TRY RANGE METHOD
				const range = getRangeForOffsets(container, start, end, doc);

				const validation = validateRangeMatchesSelection(
					range,
					capturedSelection?.text || '',
					capturedSelection?.length || 0
				);

				let success = false;
				let newContent = content;

				if (validation.valid) {
					// Range is valid - try applying with it
					const attributes = { 'data-letterspacing': inlineLetterSpacing.toString() };
					success = applyOrMergeStyling(range, attributes, styleString, doc);

					if (success) {
						newContent = container.innerHTML;

						// POST-VALIDATION: Verify the result doesn't wrap entire content
						const parser2 = new DOMParser();
						const doc2 = parser2.parseFromString(`<div>${newContent}</div>`, 'text/html');
						const container2 = doc2.body.firstChild;
						const typostSpans = container2.querySelectorAll('span.typost-styled');

						// Check if we accidentally wrapped everything
						let wrappedEverything = false;
						typostSpans.forEach(span => {
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

				// 2. FALLBACK: String manipulation if range failed
				if (!success) {
					const attributes = { 'data-letterspacing': inlineLetterSpacing.toString() };

					const fallbackResult = applyStylingSafeStringMethod(
						content,
						start,
						end,
						attributes,
						styleString
					);

					if (fallbackResult.success) {
						newContent = fallbackResult.content;
					} else {
						// Both methods failed - report it and put the control back
						reportInlineApplyFailure(fallbackResult.error, () => revertInlineControl('letterSpacing'));
						return;
					}
				}

				// 3. Update content (success is guaranteed: either step 1 succeeded, or step 2 succeeded, or we returned above)
				setAttributes({ content: newContent });
				// CRITICAL: Clear originalContentRef so popover close doesn't restore old content
				originalContentRef.current = null;

				// Note: Re-detection handled by useEffect, no manual reset needed
			}
		}
	};

	return {
		handleLetterSpacingChange,
		clearLetterSpacing,
		handleLineHeightChange,
		clearLineHeight,
		applyLineHeightOnly,
		handleFontSizePreviewChange,
		applyLetterSpacingOnly
	};
}
