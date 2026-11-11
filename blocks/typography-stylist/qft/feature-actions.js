/**
 * Typography Stylist Block - OpenType feature toggles.
 *
 * Moved out of edit.js unchanged (#356). The functions were closures inside
 * Edit and are still rebuilt on every render: Edit calls this factory once
 * per render with the current values, so every function sees the same
 * values it saw before.
 */

import { getRangeForOffsets } from '../qft-preview';
import { validateRangeMatchesSelection, applyOrMergeStyling, applyStylingSafeStringMethod, pruneRawFeatureSettings, parseStyleString, buildStyleString } from '../utils';

/**
 * Toggle OpenType features on the selection (QFT) or on the whole block
 * (QFT with no selection, and the Inspector).
 *
 * @param {Object} ctx Edit's current values, state setters, refs and the
 *                     functions earlier factories returned (see edit.js).
 * @return {Object} toggleFeature, toggleBlockFeature, applyFeatureToSelection, removeFeatureFromSelection
 */
export default function createFeatureActions(ctx) {
	const {
		capturedSelection, content, features, inlineFeaturesAtSelection, inlineLetterSpacing,
		reportInlineApplyFailure, resolvedApplyRange, setAttributes
	} = ctx;

	const toggleFeature = (featureId) => {
		// Check if we have a valid selection - if so, toggle inline instead
		if (resolvedApplyRange) {

			const start = resolvedApplyRange.start;
			const end = resolvedApplyRange.end;

			// If there's a selection, toggle inline feature
			if (start !== end) {
				// Check if feature is already applied to this selection
				if (inlineFeaturesAtSelection.includes(featureId)) {
					// Feature is active - remove it
					removeFeatureFromSelection(featureId);
				} else {
					// Feature is not active - apply it
					applyFeatureToSelection(featureId);
				}
				return;
			}
		}

		// No selection - toggle block-level feature
		const newFeatures = [...features];
		const index = newFeatures.indexOf(featureId);
		if (index > -1) {
			newFeatures.splice(index, 1);
		} else {
			newFeatures.push(featureId);
		}
		setAttributes({ features: newFeatures });
	};

	// Toggle block-level feature (always applies to entire block, ignores selection)
	// Used by sidebar controls - for inline/selection control, use the Quick Feature Toggles modal
	const toggleBlockFeature = (featureId) => {
		const newFeatures = [...features];
		const index = newFeatures.indexOf(featureId);
		if (index > -1) {
			newFeatures.splice(index, 1);
		} else {
			newFeatures.push(featureId);
		}
		setAttributes({ features: newFeatures });
	};

	// Apply feature to selected text only (inline) - never applies to whole block
	const applyFeatureToSelection = (featureId) => {
		if (!content) return;

		// Check if we have a valid selection
		if (resolvedApplyRange) {

			const start = resolvedApplyRange.start;
			const end = resolvedApplyRange.end;

			if (start !== end) {
				// Build the styled span with feature and letter spacing
				const styleArray = [];
				styleArray.push(`font-feature-settings: "${featureId}" 1`);

				// Always include letter-spacing, even if 0
				if (inlineLetterSpacing !== 0) {
					styleArray.push(`letter-spacing: ${inlineLetterSpacing / 1000}em`);
				}

				const styleString = styleArray.join('; ');

				// Parse the current content as HTML, find the text node at the selection, and wrap it
				// This is a workaround since we need to work with HTML directly
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
					const attributes = { 'data-features': featureId };
					if (inlineLetterSpacing !== 0) {
						attributes['data-letterspacing'] = inlineLetterSpacing.toString();
					}
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
						// Check ALL spans, not just single-span case
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

					const attributes = { 'data-features': featureId };
					if (inlineLetterSpacing !== 0) {
						attributes['data-letterspacing'] = inlineLetterSpacing.toString();
					}
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
						// Both methods failed - report it (the feature checkbox
						// state is derived from the selection, so nothing to revert)
						reportInlineApplyFailure(fallbackResult.error);
						return;
					}
				}

				// 3. Update content (success is guaranteed: either step 1 succeeded, or step 2 succeeded, or we returned above)
				setAttributes({ content: newContent });
			}
		}
	};

	// Remove a specific feature from the selected text
	const removeFeatureFromSelection = (featureId) => {
		if (!content) return;

		// Check if we have a valid selection
		if (resolvedApplyRange) {

			const start = resolvedApplyRange.start;
			const end = resolvedApplyRange.end;

			if (start !== end) {
				// Parse the current content as HTML
				const parser = new DOMParser();
				const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
				const container = doc.body.firstChild;

				const range = getRangeForOffsets(container, start, end, doc);

				if (range) {
					// Find all typost-styled spans within the range that have this feature
					const commonAncestor = range.commonAncestorContainer;
					let searchRoot = commonAncestor.nodeType === Node.TEXT_NODE
						? commonAncestor.parentElement
						: commonAncestor;

					// Check if the selection itself is inside a typost-styled span
					const parentSpan = searchRoot.closest('span.typost-styled');
					if (parentSpan) {
						searchRoot = parentSpan;
					}

					const styledSpans = searchRoot.querySelectorAll('span.typost-styled');

					// Collect spans that have this specific feature — listed in
					// data-features, or carried only by the raw value (an indexed
					// alternate like "salt" 2 lives in data-feature-settings alone).
					// Exact tag match: "ss01" must not match "ss010".
					const spanHasFeature = (span) => {
						const listed = (span.getAttribute('data-features') || '').split(',').map(f => f.trim());
						if (listed.includes(featureId)) {
							return true;
						}
						const raw = span.getAttribute('data-feature-settings') || '';
						return raw !== pruneRawFeatureSettings(raw, featureId, false);
					};
					const spansToProcess = [];
					if (searchRoot.classList && searchRoot.classList.contains('typost-styled') && spanHasFeature(searchRoot)) {
						spansToProcess.push(searchRoot);
					}
					styledSpans.forEach(span => {
						if (spanHasFeature(span)) {
							spansToProcess.push(span);
						}
					});

					// Remove the feature from each span
					spansToProcess.forEach(span => {
						const dataFeatures = span.getAttribute('data-features') || '';
						{
							// Split features (comma-separated) and remove the target feature
							const featureList = dataFeatures.split(',').map(f => f.trim()).filter(f => f && f !== featureId);

							// Raw indexed alternates (data-feature-settings, e.g. '"salt" 2')
							// for OTHER tags must survive removal; the removed tag's own
							// clauses go with it, so a raw "on" can't keep it alive and an
							// "off" clause ("swsh" 0) can't linger on the span
							const rawSettings = pruneRawFeatureSettings(span.getAttribute('data-feature-settings') || '', featureId, false);
							if (rawSettings) {
								span.setAttribute('data-feature-settings', rawSettings);
							} else {
								span.removeAttribute('data-feature-settings');
							}

							if (featureList.length === 0) {
								// No toggled features left - remove data-features attribute
								span.removeAttribute('data-features');

								const remainingStyleObj = parseStyleString(span.getAttribute('style'));
								if (rawSettings) {
									// Keep the raw alternates rendering
									remainingStyleObj['font-feature-settings'] = rawSettings;
								} else {
									delete remainingStyleObj['font-feature-settings'];
								}

								// Rebuild style or remove it entirely
								if (Object.keys(remainingStyleObj).length > 0) {
									span.setAttribute('style', buildStyleString(remainingStyleObj));
								} else {
									span.removeAttribute('style');
								}

								// Check if any other typost attributes remain before unwrapping.
								// Generic on purpose: the old fixed list missed data-style-id
								// (a paragraph style), data-fontstyle, data-fitscale/-fitshift
								// and data-font-variation-settings, so removing the last feature
								// from a span that also carried one of those unwrapped it and
								// silently dropped that styling — reachable for a paragraph-
								// styled run holding only a raw Glyphs Panel alternate.
								const hasAnyAttributes = Array.prototype.some.call(span.attributes, (attr) =>
									attr.name.indexOf('data-') === 0);

								if (!hasAnyAttributes && Object.keys(remainingStyleObj).length === 0) {
									// No attributes or styles remain - safe to unwrap the span
									if (span.parentNode) {
										while (span.firstChild) {
											span.parentNode.insertBefore(span.firstChild, span);
										}
										span.parentNode.removeChild(span);
									}
								}
							} else {
								// Update the span with remaining features (comma-separated)
								span.setAttribute('data-features', featureList.join(','));

								// Rebuild font-feature-settings: raw indexed alternates first,
								// then remaining plain tags not already covered by the raw value
								const plainTags = featureList
									.filter(f => rawSettings.indexOf(`"${f}"`) === -1)
									.map(f => `"${f}" 1`)
									.join(', ');
								const featureSettings = rawSettings
									? (plainTags ? `${rawSettings}, ${plainTags}` : rawSettings)
									: plainTags;

								const styleObj = parseStyleString(span.getAttribute('style'));
								if (featureSettings) {
									styleObj['font-feature-settings'] = featureSettings;
								} else {
									delete styleObj['font-feature-settings'];
								}
								span.setAttribute('style', buildStyleString(styleObj));
							}
						}
					});

					// Get the updated HTML
					const newContent = container.innerHTML;
					setAttributes({ content: newContent });
				}
			}
		}
	};

	return {
		toggleFeature,
		toggleBlockFeature,
		applyFeatureToSelection,
		removeFeatureFromSelection
	};
}
