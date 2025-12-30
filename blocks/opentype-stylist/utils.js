/**
 * OpenType Stylist - Shared Utility Functions
 *
 * Pure functions extracted for reuse across edit.js, block-editor.js, and tests.
 * These functions have no side effects and can be tested independently.
 */

/**
 * Parse inline features from HTML content at a specific cursor position
 *
 * Finds styled spans in HTML content and extracts OpenType features from the
 * smallest (innermost) span that contains the cursor position.
 *
 * @param {string} htmlContent - HTML content to parse
 * @param {number} cursorStart - Cursor/selection start offset (in text, not HTML)
 * @param {number} cursorEnd - Cursor/selection end offset (in text, not HTML)
 * @return {Array<string>} Array of feature codes (e.g., ['ss02', 'liga'])
 */
export function parseInlineFeaturesAtCursor(htmlContent, cursorStart, cursorEnd) {
	if (!htmlContent || cursorStart === undefined || cursorEnd === undefined) {
		return [];
	}

	// Parse HTML to find styled spans
	const parser = new DOMParser();
	const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
	const container = doc.body.firstChild;
	const styledSpans = container.querySelectorAll('span.ots-styled');

	// Find the smallest (innermost) span that matches the cursor/selection
	let smallestMatchingSpan = null;
	let smallestSpanSize = Infinity;

	for (const span of styledSpans) {
		// Find this span's position in the text
		const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
		let spanStart = 0;
		let spanEnd = 0;
		let found = false;
		let offset = 0;

		let node;
		while ((node = walker.nextNode())) {
			const nodeLength = node.nodeValue.length;

			// Check if this text node is inside our span
			if (span.contains(node)) {
				if (!found) {
					spanStart = offset;
					found = true;
				}
				spanEnd = offset + nodeLength;
			}

			offset += nodeLength;
		}

		// Check if the cursor/selection overlaps with this span
		const isCursor = cursorStart === cursorEnd;
		const isInside = isCursor && found && cursorStart >= spanStart && cursorStart <= spanEnd;
		const overlaps = !isCursor && found && cursorStart < spanEnd && cursorEnd > spanStart;

		if (found && (isInside || overlaps)) {
			const spanSize = spanEnd - spanStart;

			// Keep track of the smallest matching span
			if (spanSize < smallestSpanSize) {
				smallestMatchingSpan = span;
				smallestSpanSize = spanSize;
			}
		}
	}

	if (!smallestMatchingSpan) {
		return [];
	}

	// Extract features from data attribute (preferred - faster and more reliable)
	const dataFeatures = smallestMatchingSpan.getAttribute('data-features');
	if (dataFeatures) {
		return dataFeatures.split(',');
	}

	// Fallback: parse from style attribute
	// For backward compatibility with content created before data-features attribute was added
	// All new content (since this attribute was introduced) will have data-features set
	const style = smallestMatchingSpan.getAttribute('style') || '';
	const featureMatch = style.match(/font-feature-settings:\s*([^;]+)/);

	if (featureMatch) {
		// Parse feature codes from CSS
		const featuresParsed = featureMatch[1]
			.split(',')
			.map(f => {
				const match = f.trim().match(/["']([^"']+)["']|&quot;([^&]+)&quot;/);
				return match;
			})
			.filter(m => m)
			.map(m => m[1] || m[2]);

		return featuresParsed;
	}

	return [];
}

/**
 * Detect block's computed font from DOM
 *
 * Finds a block's RichText element in the DOM and extracts its computed font-family.
 * Handles iframe context detection for WordPress block editor.
 *
 * @param {string} clientId - Block's client ID
 * @param {string} elementSelector - CSS selector for the text element (e.g., '.ots-block-content')
 * @return {string} Computed font-family (with quotes removed) or empty string if not found
 */
export function detectBlockComputedFont(clientId, elementSelector = '.ots-block-content') {
	if (!clientId) {
		return '';
	}

	try {
		// WordPress editor content is in an iframe
		const editorIframe = typeof document !== 'undefined' ? document.querySelector('iframe[name="editor-canvas"]') : null;
		const targetDocument = editorIframe?.contentDocument || (typeof document !== 'undefined' ? document : null);
		const targetWindow = editorIframe?.contentWindow || (typeof window !== 'undefined' ? window : null);

		if (!targetDocument || !targetWindow) {
			return '';
		}

		// Find the block wrapper in the correct document context
		const blockWrapper = targetDocument.querySelector(`[data-block="${clientId}"]`);
		if (!blockWrapper) {
			return '';
		}

		// Find the RichText element
		const richTextElement = blockWrapper.querySelector(elementSelector);
		if (!richTextElement) {
			return '';
		}

		// Get computed styles using the correct window context
		const computedStyle = targetWindow.getComputedStyle(richTextElement);
		const detectedFont = computedStyle.getPropertyValue('font-family');

		// Return the font (removing quotes)
		return detectedFont ? detectedFont.replace(/['"]/g, '') : '';
	} catch (error) {
		// eslint-disable-next-line no-console
		if (typeof console !== 'undefined' && console.error) {
			console.error('OTS Block - Failed to detect computed font:', error);
		}
		return '';
	}
}
