/**
 * Typography Stylist Block - Quick Feature Toggles font, size, style and case.
 *
 * Moved out of edit.js unchanged (#356). The functions were closures inside
 * Edit and are still rebuilt on every render: Edit calls this factory once
 * per render with the current values, so every function sees the same
 * values it saw before.
 */

import { removePropertyFromSelection, buildInlineFontSizeSpan, getNewFontSizeUnit, updateSpanPropertyInPlace, splitSpanAndApply, validateRangeMatchesSelection, applyOrMergeStyling, applyStylingSafeStringMethod, sanitizeFontVariationSettings, buildInlineCaseApply, normalizeInlineCaseSpans, parseInlineStylesAtCursor } from '../utils';
import { getRangeForOffsets } from '../qft-preview';

/**
 * Apply and reset the font family, weight, size, variation settings, style
 * and case on the selection.
 *
 * @param {Object} ctx Edit's current values, state setters, refs and the
 *                     functions earlier factories returned (see edit.js).
 * @return {Object} resetFontFamily, resetFontWeight, resetFontSize, applyInlineFontSize, applyInlineFontWeight, applyInlineFontVariationSettings, applyInlineFontStyle, resetFontStyle, applyInlineCase, resetInlineCase, applyInlineFontFamily
 */
export default function createFontActions(ctx) {
	const {
		capturedSelection, content, fontIdMap, inlineCaseFromStyle, inlineFontFamily, inlineFontSize,
		inlineFontSizeMax, inlineFontSizeMin, inlineFontSizePreferred, inlineFontStyle, inlineFontWeight,
		inlineStylesAtSelection, inlineTextCase, originalContentRef, reportInlineApplyFailure,
		resolvedApplyRange, revertInlineControl, setAttributes, setInlineCaseFromStyle,
		setInlineFakeSmallCaps, setInlineFontFamily, setInlineFontSize, setInlineFontSizeMax,
		setInlineFontSizeMin, setInlineFontSizePreferred, setInlineFontStyle, setInlineFontWeight,
		setInlineTextCase, setPreviewFontSize, setPreviewFontSizeMax, setPreviewFontSizeMin,
		setPreviewFontSizePreferred
	} = ctx;

	// Reset font family (remove from content)
	const resetFontFamily = () => {
		if (!content || !inlineFontFamily) return;

		setInlineFontFamily('');

		if (resolvedApplyRange) {
			const result = removePropertyFromSelection(
				content,
				resolvedApplyRange.start,
				resolvedApplyRange.end,
				'data-font-id',
				'font-family'
			);
			if (result.success) {
				setAttributes({ content: result.content });
			}
		}
	};

	// Reset font weight (remove from content)
	const resetFontWeight = () => {
		if (!content || inlineFontWeight === 'inherit') return;

		setInlineFontWeight('inherit');

		if (resolvedApplyRange) {
			const result = removePropertyFromSelection(
				content,
				resolvedApplyRange.start,
				resolvedApplyRange.end,
				'data-fontweight',
				'font-weight'
			);
			if (result.success) {
				setAttributes({ content: result.content });
			}
		}
	};

	// Reset font size (remove from content)
	const resetFontSize = () => {
		if (!content || inlineFontSize === 'inherit') return;

		setInlineFontSize('inherit');
		setInlineFontSizeMin(16);
		setInlineFontSizePreferred(32);
		setInlineFontSizeMax(64);

		if (resolvedApplyRange) {
			const result = removePropertyFromSelection(
				content,
				resolvedApplyRange.start,
				resolvedApplyRange.end,
				'data-fontsize',
				'font-size'
			);
			if (result.success) {
				setAttributes({ content: result.content });
			}
		}
	};

	// Apply font size to selected text only (inline).
	// `sizeOverride` lets the Font Size select apply the value it was just
	// given — state has not updated in that closure yet (QA finding E-6);
	// the debounced slider path passes nothing and reads state as before.
	const applyInlineFontSize = (sizeOverride) => {
		const size = sizeOverride !== undefined ? sizeOverride : inlineFontSize;
		// Attributes and style for both collapsed and selection cases; null
		// for 'inherit' (nothing to apply)
		const spanSpec = buildInlineFontSizeSpan(size, inlineFontSizeMin, inlineFontSizePreferred, inlineFontSizeMax, getNewFontSizeUnit());
		if (!content || !spanSpec) return;

		if (resolvedApplyRange) {

			const start = resolvedApplyRange.start;
			const end = resolvedApplyRange.end;
			const { attributes, styleString } = spanSpec;

			// COLLAPSED CURSOR: Update parent span in-place
			if (start === end) {
				// Note: For collapsed cursor, updateSpanPropertyInPlace only handles the primary property
				// For font-size, we just update data-fontsize and style, but not the min/max attributes
				// This is acceptable since collapsed cursor updates are less common than selection-based styling
				const result = updateSpanPropertyInPlace(
					content,
					start,
					'data-fontsize',
					size,
					'font-size',
					spanSpec.fontSize
				);

				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
					return;
				}
				return;
			}

			// SELECTION: Check if we should split parent span
			if (inlineStylesAtSelection && inlineStylesAtSelection.fontSize) {
				const result = splitSpanAndApply(
					content,
					start,
					end,
					'data-fontsize',
					attributes,
					styleString
				);

				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
					return;
				}
			}

			if (start !== end) {

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
					success = applyOrMergeStyling(range, attributes, styleString, doc);

					if (success) {
						newContent = container.innerHTML;

						// POST-VALIDATION: Verify the result doesn't wrap entire content
						// This catches cases where surroundContents() silently fails
						const parser2 = new DOMParser();
						const doc2 = parser2.parseFromString(`<div>${newContent}</div>`, 'text/html');
						const container2 = doc2.body.firstChild;
						const typostSpans = container2.querySelectorAll('span.typost-styled');

						// Check if we accidentally wrapped everything
						let wrappedEverything = false;
						typostSpans.forEach(span => {
							const spanText = span.textContent || '';
							const containerText = container2.textContent || '';

							// If this span's text matches the entire container text, it wrapped everything
							if (spanText.length >= containerText.length - 1) {
								// EXCEPTION: If this span is our INTENDED selection, it's valid
								// Check if span text matches what we captured
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
						reportInlineApplyFailure(fallbackResult.error, () => revertInlineControl('fontSize'));
						return;
					}
				}

				// 3. Update content (success is guaranteed: either step 1 succeeded, or step 2 succeeded, or we returned above)
				setAttributes({ content: newContent });
				// CRITICAL: Clear originalContentRef so popover close doesn't restore old content
				originalContentRef.current = null;

				// Clear preview state after applying
				setPreviewFontSize('inherit');
				setPreviewFontSizeMin(inlineFontSizeMin);
				setPreviewFontSizePreferred(inlineFontSizePreferred);
				setPreviewFontSizeMax(inlineFontSizeMax);

				// Note: Re-detection handled by useEffect, no manual reset needed
			}
		}
	};

	// Apply font weight to selected text only (inline)
	const applyInlineFontWeight = () => {
		if (!content || inlineFontWeight === 'inherit') return;

		if (resolvedApplyRange) {

			const start = resolvedApplyRange.start;
			const end = resolvedApplyRange.end;

			// COLLAPSED CURSOR: Update parent span in-place
			if (start === end) {
				const result = updateSpanPropertyInPlace(
					content,
					start,
					'data-fontweight',
					inlineFontWeight,
					'font-weight',
					inlineFontWeight
				);

				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
					return;
				}
				return;
			}

			// SELECTION: Check if we should split parent span
			if (inlineStylesAtSelection && inlineStylesAtSelection.fontWeight) {
				const result = splitSpanAndApply(
					content,
					start,
					end,
					'data-fontweight',
					{ 'data-fontweight': inlineFontWeight },
					`font-weight: ${inlineFontWeight}`
				);

				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
					return;
				}
			}

			if (start !== end) {
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
					const attributes = { 'data-fontweight': inlineFontWeight };
					const styleString = `font-weight: ${inlineFontWeight}`;
					success = applyOrMergeStyling(range, attributes, styleString, doc);

					if (success) {
						newContent = container.innerHTML;

						// POST-VALIDATION: Verify the result doesn't wrap entire content
						// This catches cases where surroundContents() silently fails
						const parser2 = new DOMParser();
						const doc2 = parser2.parseFromString(`<div>${newContent}</div>`, 'text/html');
						const container2 = doc2.body.firstChild;
						const typostSpans = container2.querySelectorAll('span.typost-styled');

						// Check if we accidentally wrapped everything
						let wrappedEverything = false;
						typostSpans.forEach(span => {
							const spanText = span.textContent || '';
							const containerText = container2.textContent || '';

							// If this span's text matches the entire container text, it wrapped everything
							if (spanText.length >= containerText.length - 1) {
								// EXCEPTION: If this span is our INTENDED selection, it's valid
								// Check if span text matches what we captured
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
					const attributes = { 'data-fontweight': inlineFontWeight };
					const styleString = `font-weight: ${inlineFontWeight}`;

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
						reportInlineApplyFailure(fallbackResult.error, () => revertInlineControl('fontWeight'));
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

	// Apply font-variation-settings to the selected text only (inline).
	// Routed here from the typost-apply-block-properties handler when a
	// variable-fonts axis control dispatches with source 'qft' — the
	// inspector's sliders stay block-level. Falls back to the block
	// attribute when the caret isn't inside styled text (no selection
	// context to scope to).
	const applyInlineFontVariationSettings = (settingsStr) => {
		if (!content) return;
		// The event is a public extension API, so the value cannot be
		// trusted into a style string raw ('"wght" 700; color:red' would
		// smuggle extra declarations). Invalid input sanitizes to '' and
		// flows into the removal branch — same treatment as the
		// inline-format editor's patch builder.
		const value = sanitizeFontVariationSettings(settingsStr);

		if (!resolvedApplyRange) {
			setAttributes({ fontVariationSettings: value });
			return;
		}

		const start = resolvedApplyRange.start;
		const end = resolvedApplyRange.end;

		// Empty value = "Reset to defaults": remove the property from the
		// selection (same shape as the other QFT reset paths). A collapsed
		// caret has no range to strip, so clear the block attribute instead.
		if (!value) {
			if (start !== end) {
				const result = removePropertyFromSelection(
					content,
					start,
					end,
					'data-font-variation-settings',
					'font-variation-settings'
				);
				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
					return;
				}
			}
			setAttributes({ fontVariationSettings: '' });
			return;
		}

		// COLLAPSED CURSOR: Update parent span in-place; caret outside any
		// styled span falls back to the block attribute
		if (start === end) {
			const result = updateSpanPropertyInPlace(
				content,
				start,
				'data-font-variation-settings',
				value,
				'font-variation-settings',
				value
			);

			if (result.success) {
				setAttributes({ content: result.content });
				originalContentRef.current = null;
			} else {
				setAttributes({ fontVariationSettings: value });
			}
			return;
		}

		// SELECTION: Check if we should split a parent span that already
		// carries the property
		if (inlineStylesAtSelection && inlineStylesAtSelection.fontVariationSettings) {
			const result = splitSpanAndApply(
				content,
				start,
				end,
				'data-font-variation-settings',
				{ 'data-font-variation-settings': value },
				`font-variation-settings: ${value}`
			);

			if (result.success) {
				setAttributes({ content: result.content });
				originalContentRef.current = null;
				return;
			}
		}

		// SELECTION, general: Range method first, string fallback (same
		// strategy as applyInlineFontWeight)
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
		const container = doc.body.firstChild;

		const range = getRangeForOffsets(container, start, end, doc);
		const validation = validateRangeMatchesSelection(
			range,
			capturedSelection?.text || '',
			capturedSelection?.length || 0
		);

		const attrs = { 'data-font-variation-settings': value };
		const styleString = `font-variation-settings: ${value}`;
		let success = false;
		let newContent = content;

		if (validation.valid) {
			success = applyOrMergeStyling(range, attrs, styleString, doc);

			if (success) {
				newContent = container.innerHTML;

				// POST-VALIDATION: Verify the result doesn't wrap entire content
				const parser2 = new DOMParser();
				const doc2 = parser2.parseFromString(`<div>${newContent}</div>`, 'text/html');
				const container2 = doc2.body.firstChild;
				const typostSpans = container2.querySelectorAll('span.typost-styled');

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
					success = false;
				}
			}
		}

		if (!success) {
			const fallbackResult = applyStylingSafeStringMethod(
				content,
				start,
				end,
				attrs,
				styleString
			);

			if (fallbackResult.success) {
				newContent = fallbackResult.content;
			} else {
				// Both methods failed - report it (the axis sliders belong to
				// the Variable Fonts module, so there is no core control to
				// put back)
				reportInlineApplyFailure(fallbackResult.error);
				return;
			}
		}

		setAttributes({ content: newContent });
		originalContentRef.current = null;
	};

	// Apply font style (visual italic) to selected text only (inline).
	// Style-only by design: semantic emphasis stays the editor's own Italic
	// button (<em>), which screen readers announce; this control just selects
	// the font's italic (or upright) face.
	const applyInlineFontStyle = (value) => {
		if (!content || !value) return;

		if (resolvedApplyRange) {
			const start = resolvedApplyRange.start;
			const end = resolvedApplyRange.end;

			// COLLAPSED CURSOR: Update parent span in-place
			if (start === end) {
				const result = updateSpanPropertyInPlace(
					content,
					start,
					'data-fontstyle',
					value,
					'font-style',
					value
				);

				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
				}
				return;
			}

			// SELECTION: Check if we should split parent span
			if (inlineStylesAtSelection && inlineStylesAtSelection.fontStyle) {
				const result = splitSpanAndApply(
					content,
					start,
					end,
					'data-fontstyle',
					{ 'data-fontstyle': value },
					`font-style: ${value}`
				);

				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
					return;
				}
			}

			// STRATEGY: Try Range method first, fallback to string manipulation
			const parser = new DOMParser();
			const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
			const container = doc.body.firstChild;
			const range = getRangeForOffsets(container, start, end, doc);
			const validation = validateRangeMatchesSelection(
				range,
				capturedSelection?.text || '',
				capturedSelection?.length || 0
			);

			let success = false;
			let newContent = content;

			if (validation.valid) {
				success = applyOrMergeStyling(range, { 'data-fontstyle': value }, `font-style: ${value}`, doc);
				if (success) {
					newContent = container.innerHTML;
				}
			}

			if (!success) {
				const fallbackResult = applyStylingSafeStringMethod(
					content,
					start,
					end,
					{ 'data-fontstyle': value },
					`font-style: ${value}`
				);
				if (fallbackResult.success) {
					newContent = fallbackResult.content;
				} else {
					// Both methods failed - report it and put the control back
					reportInlineApplyFailure(fallbackResult.error, () => revertInlineControl('fontStyle'));
					return;
				}
			}

			setAttributes({ content: newContent });
			originalContentRef.current = null;
		}
	};

	// Reset font style (remove from content)
	const resetFontStyle = () => {
		if (!content || !inlineFontStyle) return;

		setInlineFontStyle('');

		if (resolvedApplyRange) {
			const result = removePropertyFromSelection(
				content,
				resolvedApplyRange.start,
				resolvedApplyRange.end,
				'data-fontstyle',
				'font-style'
			);
			if (result.success) {
				setAttributes({ content: result.content });
			}
		}
	};

	// Apply a case to the selected text only (#309). Same strategies as
	// applyInlineFontStyle, with the span form of the inline format panel
	// (#214): data-textcase, data-fakesmallcaps and the case declarations.
	// The writers merge over a span's old values, so
	// normalizeInlineCaseSpans() then rebuilds each touched span's case from
	// its data attributes and drops what the old case left behind.
	const applyInlineCase = (value, fake) => {
		const apply = buildInlineCaseApply(value, fake);
		if (!content || !apply || !resolvedApplyRange) return;

		const start = resolvedApplyRange.start;
		const end = resolvedApplyRange.end;
		const finish = (html) => {
			setAttributes({ content: normalizeInlineCaseSpans(html, start, end) });
			originalContentRef.current = null;
			// The text now has a case of its own, also over a style
			setInlineCaseFromStyle(false);
		};

		// COLLAPSED CURSOR: Update parent span in-place
		if (start === end) {
			const result = updateSpanPropertyInPlace(
				content,
				start,
				'data-textcase',
				apply.attributes['data-textcase'],
				apply.firstDeclaration[0],
				apply.firstDeclaration[1],
				{ 'data-fakesmallcaps': apply.attributes['data-fakesmallcaps'] }
			);
			if (result.success) {
				finish(result.content);
			}
			return;
		}

		// SELECTION: Check if we should split parent span
		if (inlineStylesAtSelection && inlineStylesAtSelection.textCase) {
			const result = splitSpanAndApply(content, start, end, 'data-textcase', apply.attributes, apply.styleString);
			if (result.success) {
				finish(result.content);
				return;
			}
		}

		// STRATEGY: Try Range method first, fallback to string manipulation
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
		const container = doc.body.firstChild;
		const range = getRangeForOffsets(container, start, end, doc);
		const validation = validateRangeMatchesSelection(
			range,
			capturedSelection?.text || '',
			capturedSelection?.length || 0
		);

		if (validation.valid && applyOrMergeStyling(range, apply.attributes, apply.styleString, doc)) {
			finish(container.innerHTML);
			return;
		}

		const fallbackResult = applyStylingSafeStringMethod(content, start, end, apply.attributes, apply.styleString);
		if (fallbackResult.success) {
			finish(fallbackResult.content);
		} else {
			// Both methods failed - report it and put the control back
			reportInlineApplyFailure(fallbackResult.error, () => revertInlineControl('textCase'));
		}
	};

	// Reset the case of the selected text (remove it from content). On a
	// paragraph style span the style's case comes back (#309 review), so
	// the control is read again from the result instead of set to Default.
	const resetInlineCase = () => {
		if (!content || !inlineTextCase || inlineCaseFromStyle || !resolvedApplyRange) return;

		const { start, end } = resolvedApplyRange;
		// data-textcase removes the whole case group (removePropertyFromSpan)
		const result = removePropertyFromSelection(
			content,
			start,
			end,
			'data-textcase',
			'text-transform',
			window.typostData && window.typostData.paragraphStyles
		);
		if (!result.success) return;
		setAttributes({ content: result.content });
		const after = parseInlineStylesAtCursor(result.content, start, end);
		setInlineTextCase((after && after.textCase) || '');
		setInlineFakeSmallCaps(!after || after.fakeSmallCaps !== false);
		setInlineCaseFromStyle(!!(after && after.textCaseFromStyle));
	};

	// Apply font family to selected text only (inline)
	const applyInlineFontFamily = () => {
		if (!content || !inlineFontFamily) return;

		if (resolvedApplyRange) {

			const start = resolvedApplyRange.start;
			const end = resolvedApplyRange.end;

			// COLLAPSED CURSOR: Update parent span in-place
			if (start === end) {
				const result = updateSpanPropertyInPlace(
					content,
					start,
					'data-font-id',
					inlineFontFamily,
					'font-family',
					`var(--font-${inlineFontFamily})`
				);

				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
					return;
				}
				return;
			}

			// SELECTION: Check if we should split parent span
			if (inlineStylesAtSelection && inlineStylesAtSelection.fontId) {
				const result = splitSpanAndApply(
					content,
					start,
					end,
					'data-font-id',
					{ 'data-font-id': inlineFontFamily },
					`font-family: var(--font-${inlineFontFamily})`
				);

				if (result.success) {
					setAttributes({ content: result.content });
					originalContentRef.current = null;
					return;
				}
			}

			if (start !== end) {
				// Get font details from fontIdMap
				const fontData = fontIdMap[inlineFontFamily];

				// Validate that font exists in the map
				if (!fontData) {
					return;
				}

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
					const attributes = { 'data-font-id': inlineFontFamily };
					const styleString = `font-family: var(--font-${inlineFontFamily})`;
					success = applyOrMergeStyling(range, attributes, styleString, doc);

					if (success) {
						newContent = container.innerHTML;

						// POST-VALIDATION: Verify the result doesn't wrap entire content
						// This catches cases where surroundContents() silently fails
						const parser2 = new DOMParser();
						const doc2 = parser2.parseFromString(`<div>${newContent}</div>`, 'text/html');
						const container2 = doc2.body.firstChild;
						const typostSpans = container2.querySelectorAll('span.typost-styled');

						// Check if we accidentally wrapped everything
						let wrappedEverything = false;
						typostSpans.forEach(span => {
							const spanText = span.textContent || '';
							const containerText = container2.textContent || '';

							// If this span's text matches the entire container text, it wrapped everything
							if (spanText.length >= containerText.length - 1) {
								// EXCEPTION: If this span is our INTENDED selection, it's valid
								// Check if span text matches what we captured
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
					const attributes = { 'data-font-id': inlineFontFamily };
					const styleString = `font-family: var(--font-${inlineFontFamily})`;

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
						reportInlineApplyFailure(fallbackResult.error, () => revertInlineControl('fontFamily'));
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
		resetFontFamily,
		resetFontWeight,
		resetFontSize,
		applyInlineFontSize,
		applyInlineFontWeight,
		applyInlineFontVariationSettings,
		applyInlineFontStyle,
		resetFontStyle,
		applyInlineCase,
		resetInlineCase,
		applyInlineFontFamily
	};
}
