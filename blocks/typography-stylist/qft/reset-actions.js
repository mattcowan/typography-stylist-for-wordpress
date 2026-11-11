/**
 * Typography Stylist Block - clearing inline formatting and resetting the block.
 *
 * Moved out of edit.js unchanged (#356). The functions were closures inside
 * Edit and are still rebuilt on every render: Edit calls this factory once
 * per render with the current values, so every function sees the same
 * values it saw before.
 */

import { getRangeForOffsets } from '../qft-preview';

/**
 * Clear the inline formatting at the selection, clear all inline features,
 * or reset the whole block.
 *
 * @param {Object} ctx Edit's current values, state setters, refs and the
 *                     functions earlier factories returned (see edit.js).
 * @return {Object} clearInlineFormatting, clearAllInlineFeatures, resetEntireBlock
 */
export default function createResetActions(ctx) {
	const {
		content, resolvedApplyRange, setAttributes, setShowFullResetConfirm, setShowInlineResetConfirm
	} = ctx;

	// Clear all inline formatting from selected text (removes typost-styled spans)
	// This does NOT remove block-level features/styles
	const clearInlineFormatting = () => {
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
					// Find all typost-styled spans within the range
					const commonAncestor = range.commonAncestorContainer;
					let searchRoot = commonAncestor.nodeType === Node.TEXT_NODE
						? commonAncestor.parentElement
						: commonAncestor;

					// Check if the selection itself is inside an typost-styled span
					const parentSpan = searchRoot.closest('span.typost-styled');
					if (parentSpan) {
						searchRoot = parentSpan;
					}

					const styledSpans = searchRoot.querySelectorAll('span.typost-styled');

					// Also check if searchRoot itself is an typost-styled span
					const spansToUnwrap = [];
					if (searchRoot.classList && searchRoot.classList.contains('typost-styled')) {
						spansToUnwrap.push(searchRoot);
					}
					styledSpans.forEach(span => spansToUnwrap.push(span));

					// Unwrap each span (replace it with its contents)
					spansToUnwrap.forEach(span => {
						if (span.parentNode) {
							while (span.firstChild) {
								span.parentNode.insertBefore(span.firstChild, span);
							}
							span.parentNode.removeChild(span);
						}
					});

					// Get the updated HTML
					const newContent = container.innerHTML;
					setAttributes({ content: newContent });

				}
			}
		}
	};

	// Clear all inline typost-styled spans from content (doesn't affect block-level settings)
	const clearAllInlineFeatures = () => {
		if (!content) return;

		// Parse the content and remove all typost-styled spans
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
		const container = doc.body.firstChild;

		// Find all typost-styled spans
		const styledSpans = container.querySelectorAll('span.typost-styled');

		// Unwrap each span (replace it with its contents)
		styledSpans.forEach(span => {
			if (span.parentNode) {
				while (span.firstChild) {
					span.parentNode.insertBefore(span.firstChild, span);
				}
				span.parentNode.removeChild(span);
			}
		});

		// Get the updated HTML
		const newContent = container.innerHTML;
		setAttributes({ content: newContent });
		setShowInlineResetConfirm(false);
	};

	// Reset entire block (both inline and block-level features/styles)
	const resetEntireBlock = () => {
		// Clear inline features and reset block-level attributes in a single setAttributes call
		let newContent = content;

		if (content) {
			const parser = new DOMParser();
			const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
			const container = doc.body.firstChild;
			const styledSpans = container.querySelectorAll('span.typost-styled');
			styledSpans.forEach(span => {
				if (span.parentNode) {
					while (span.firstChild) {
						span.parentNode.insertBefore(span.firstChild, span);
					}
					span.parentNode.removeChild(span);
				}
			});
			newContent = container.innerHTML;
		}

		// Single setAttributes call for both content and block-level attributes.
		// A full reset also drops the paragraph style (otherwise the class kept
		// rendering it) and the block-level font, style and variation axes.
		setAttributes({
			content: newContent,
			styleClass: '',
			features: [],
			fontId: 0,
			fontFamily: '',
			fontWeight: '',
			fontStyle: '',
			fontVariationSettings: '',
			letterSpacing: 0,
			lineHeight: 0,
			fontSize: 'responsive',
			fontSizeMin: 16,
			fontSizePreferred: 32,
			fontSizeMax: 64,
			fitMaxSize: 0,
			initialHang: 0,
			fitLineHangs: [],
			textCase: '',
			fakeSmallCaps: true
		});

		setShowInlineResetConfirm(false);
		setShowFullResetConfirm(false);
	};

	return {
		clearInlineFormatting,
		clearAllInlineFeatures,
		resetEntireBlock
	};
}
