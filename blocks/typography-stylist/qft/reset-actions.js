/**
 * Typography Stylist Block - clearing inline formatting and resetting the block.
 *
 * Moved out of edit.js unchanged (#356); resetEntireBlock() calls the shared
 * "Remove all styling" action since #411. The functions were closures inside
 * Edit and are still rebuilt on every render: Edit calls this factory once
 * per render with the current values, so every function sees the same
 * values it saw before.
 */

import { getRangeForOffsets } from '../qft-preview';
import { stripBlockStyles } from '../strip-styles/strip-styles';

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

	// Reset entire block: the same action as "Remove all styling" in the
	// block toolbar (#411). The content loses every Typography Stylist span
	// and inline format (links and line breaks stay), and the block goes back
	// to the theme's look: the plugin settings, the paragraph style, colors,
	// spacing, line height, Line indent, alignment and extra CSS class. One
	// setAttributes call, so one undo step restores the block.
	const resetEntireBlock = () => {
		stripBlockStyles({ content, setAttributes });

		setShowInlineResetConfirm(false);
		setShowFullResetConfirm(false);
	};

	return {
		clearInlineFormatting,
		clearAllInlineFeatures,
		resetEntireBlock
	};
}
