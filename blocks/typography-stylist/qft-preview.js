/**
 * Typography Stylist Block - live preview helpers for the Quick Feature
 * Toggles: a temporary span that previews spacing and size on the selected
 * text before the change is applied, and the cleanup that keeps it out of
 * saved content.
 *
 * Moved out of edit.js unchanged (#356). getRangeForOffsets and
 * applyPreviewStyles were closures inside Edit that read nothing from it, so
 * they live at module level now.
 */

import { buildTextOffsetMap } from './utils';

// Utility: Remove preview spans from content (prevents saving temporary preview state)
const removePreviewSpans = (htmlContent) => {
	if (!htmlContent) return htmlContent;

	const parser = new DOMParser();
	const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
	const container = doc.body.firstChild;

	// Find all preview spans and unwrap them (preserving child nodes)
	const previewSpans = container.querySelectorAll('span.typost-preview-temp');
	previewSpans.forEach(span => {
		const parent = span.parentNode;
		if (!parent) return;

		// Move all child nodes out of the span (preserves nested elements)
		while (span.firstChild) {
			parent.insertBefore(span.firstChild, span);
		}

		// Remove the now-empty span
		parent.removeChild(span);
	});

	return container.innerHTML;
};

// Helper to create a Range for the given linear text offsets within a container
// Uses buildTextOffsetMap to account for <br> line breaks in offset calculations
const getRangeForOffsets = (rootNode, startOffset, endOffset, docContext) => {
	const textMap = buildTextOffsetMap(rootNode, document);
	let rangeStartNode = null;
	let rangeStartOffset = 0;
	let rangeEndNode = null;
	let rangeEndOffset = 0;

	for (const entry of textMap) {
		if (entry.end > startOffset && !rangeStartNode) {
			rangeStartNode = entry.node;
			rangeStartOffset = startOffset - entry.start;
		}

		if (entry.end >= endOffset && !rangeEndNode) {
			rangeEndNode = entry.node;
			rangeEndOffset = endOffset - entry.start;
			break;
		}
	}

	if (!rangeStartNode || !rangeEndNode) {
		return null;
	}

	const range = docContext.createRange();
	range.setStart(rangeStartNode, rangeStartOffset);
	range.setEnd(rangeEndNode, rangeEndOffset);

	return range;
};

/**
 * Apply preview styling to selected text by wrapping with temporary span
 * Handles multiple concurrent preview properties (letter-spacing, line-height, font-size)
 *
 * @param {Object} params
 * @param {string} params.content - Current block content
 * @param {Object} params.selectionStart - Selection start position
 * @param {Object} params.selectionEnd - Selection end position
 * @param {string} params.clientId - Block client ID
 * @param {Object} params.styles - CSS styles to apply { 'letter-spacing': '0.05em', 'line-height': 2.0, ... }
 * @param {Function} params.setAttributes - Block setAttributes function
 * @param {Object} params.originalContentRef - Reference to original content before preview
 * @returns {boolean} - True if preview was applied successfully
 */
const applyPreviewStyles = ({
	content,
	selectionStart,
	selectionEnd,
	clientId,
	styles,
	setAttributes,
	originalContentRef
}) => {
	// Validation checks
	if (!content || !selectionStart || !selectionEnd || !clientId) {
		return false;
	}

	if (selectionStart.clientId !== clientId || selectionEnd.clientId !== clientId) {
		return false;
	}

	const start = selectionStart.offset || 0;
	const end = selectionEnd.offset || 0;

	if (start === end) {
		return false;
	}

	// Store original content if not already stored
	if (!originalContentRef.current) {
		originalContentRef.current = content;
	}

	// Parse ORIGINAL content (prevents nested preview spans)
	const parser = new DOMParser();
	const doc = parser.parseFromString(`<div>${originalContentRef.current}</div>`, 'text/html');
	const container = doc.body.firstChild;

	const range = getRangeForOffsets(container, start, end, doc);

	if (!range) {
		return false;
	}

	try {
		const span = doc.createElement('span');
		span.className = 'typost-preview-temp';

		// Build style string from ALL active preview values
		const styleString = Object.entries(styles)
			.filter(([_, value]) => value !== null && value !== undefined && value !== '')
			.map(([prop, value]) => `${prop}: ${value}`)
			.join('; ');

		if (styleString) {
			span.style.cssText = styleString;
		}

		range.surroundContents(span);
		const previewContent = container.innerHTML;
		setAttributes({ content: previewContent });

		return true;
	} catch (e) {
		// Range cannot be wrapped (e.g., intersects element boundaries)
		// Silently fail for preview - user can still apply manually
		return false;
	}
};

export { removePreviewSpans, getRangeForOffsets, applyPreviewStyles };
