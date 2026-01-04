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
		const isInside = isCursor && found && cursorStart >= spanStart && cursorStart < spanEnd; // Fixed: < instead of <=
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

	// Collect ALL features from this span and any nested ots-styled spans
	// This handles the case where font-size/weight wraps feature spans:
	// <span data-fontsize="..." class="ots-styled"><span data-features="ss01" class="ots-styled">M</span></span>
	const allFeatures = new Set();

	// Extract features from data attribute (preferred - faster and more reliable)
	const dataFeatures = smallestMatchingSpan.getAttribute('data-features');
	if (dataFeatures) {
		dataFeatures.split(',').forEach(f => {
			const trimmed = f.trim();
			if (trimmed) allFeatures.add(trimmed);
		});
	}

	// ALSO check for ots-styled spans INSIDE this one (nested case)
	// This fixes detection when font-sizing wraps a feature-styled span
	// BUT only include features if cursor is ACTUALLY inside the nested span
	const nestedStyledSpans = smallestMatchingSpan.querySelectorAll('span.ots-styled');
	for (const nested of nestedStyledSpans) {
		// Calculate the text position range for this nested span
		const nestedWalker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
		let nestedStart = 0;
		let nestedEnd = 0;
		let nestedFound = false;
		let nestedOffset = 0;

		let nestedNode;
		while ((nestedNode = nestedWalker.nextNode())) {
			const nestedNodeLength = nestedNode.nodeValue.length;

			if (nested.contains(nestedNode)) {
				if (!nestedFound) {
					nestedStart = nestedOffset;
					nestedFound = true;
				}
				nestedEnd = nestedOffset + nestedNodeLength;
			}

			nestedOffset += nestedNodeLength;
		}

		// Only include features if cursor is inside this nested span
		const isCursor = cursorStart === cursorEnd;
		const isInsideNested = isCursor && nestedFound && cursorStart >= nestedStart && cursorStart < nestedEnd;
		const overlapsNested = !isCursor && nestedFound && cursorStart < nestedEnd && cursorEnd > nestedStart;

		if (nestedFound && (isInsideNested || overlapsNested)) {
			const nestedFeatures = nested.getAttribute('data-features');
			if (nestedFeatures) {
				nestedFeatures.split(',').forEach(f => {
					const trimmed = f.trim();
					if (trimmed) allFeatures.add(trimmed);
				});
			}
		}
	}

	// If we found features from data attributes, return them
	if (allFeatures.size > 0) {
		return Array.from(allFeatures);
	}

	// Fallback: parse from style attribute
	// For backward compatibility with content created before data-features attribute was added
	// All new content (since this attribute was introduced) will have data-features set
	const style = smallestMatchingSpan.getAttribute('style') || '';
	const featureMatch = style.match(/font-feature-settings:\s*([^;]+)/);

	if (featureMatch) {
		// Parse feature codes from CSS and collect into Set
		const styleFeaturesSet = new Set();
		featureMatch[1]
			.split(',')
			.forEach(f => {
				const match = f.trim().match(/["']([^"']+)["']|&quot;([^&]+)&quot;/);
				if (match) {
					const feature = match[1] || match[2];
					if (feature) {
						styleFeaturesSet.add(feature);
					}
				}
			});

		// Also check nested spans for style-based features (fallback)
		// Collect all style-based features from nested spans, consistent with data-attribute logic
		for (const nested of nestedStyledSpans) {
			const nestedStyle = nested.getAttribute('style') || '';
			const nestedMatch = nestedStyle.match(/font-feature-settings:\s*([^;]+)/);
			if (nestedMatch) {
				nestedMatch[1]
					.split(',')
					.forEach(f => {
						const match = f.trim().match(/["']([^"']+)["']|&quot;([^&]+)&quot;/);
						if (match) {
							const feature = match[1] || match[2];
							if (feature) {
								styleFeaturesSet.add(feature);
							}
						}
					});
			}
		}

		// Return combined style-based features if any were found
		if (styleFeaturesSet.size > 0) {
			return Array.from(styleFeaturesSet);
		}
	}

	return [];
}

/**
 * Apply or merge styling to a selection, avoiding nested ots-styled spans
 *
 * This function checks if the selected range is already inside an ots-styled span.
 * If yes, it merges the new attributes into the existing span.
 * If no, it creates a new span wrapper.
 *
 * @param {Range} range - DOM range representing the selection
 * @param {Object} attributes - Attributes to apply (data-features, data-fontsize, etc.)
 * @param {string} styleString - CSS style string to apply
 * @param {Document} doc - Document context for creating elements
 * @return {boolean} True if successful, false otherwise
 */
export function applyOrMergeStyling(range, attributes, styleString, doc) {
	try {
		// Check if the range is entirely within a single ots-styled span
		let commonAncestor = range.commonAncestorContainer;

		// If the common ancestor is a text node, get its parent element
		if (commonAncestor.nodeType === Node.TEXT_NODE) {
			commonAncestor = commonAncestor.parentElement;
		}

		// Find the closest ots-styled span (if any)
		const existingSpan = commonAncestor.closest('span.ots-styled');

		if (existingSpan) {
			// Check if the entire selection is within this span
			const isEntirelyWithin = existingSpan.contains(range.startContainer) &&
			                        existingSpan.contains(range.endContainer);

			if (isEntirelyWithin) {
				// Merge attributes into existing span
				Object.keys(attributes).forEach(key => {
					if (key === 'data-features') {
						// Merge features (combine existing + new, deduplicate)
						const existingFeatures = existingSpan.getAttribute('data-features') || '';
						const existingArray = existingFeatures ? existingFeatures.split(',').map(f => f.trim()) : [];
						const newFeatures = attributes[key] ? attributes[key].split(',').map(f => f.trim()) : [];
						const combined = [...new Set([...existingArray, ...newFeatures])].filter(f => f);
						if (combined.length > 0) {
							existingSpan.setAttribute('data-features', combined.join(','));
						}
					} else {
						// For other attributes, new value overwrites old
						existingSpan.setAttribute(key, attributes[key]);
					}
				});

				// Merge styles
				const existingStyle = existingSpan.getAttribute('style') || '';
				const newStyleObj = {};

				// Parse existing styles
				existingStyle.split(';').forEach(rule => {
					const [prop, value] = rule.split(':').map(s => s.trim());
					if (prop && value) {
						newStyleObj[prop] = value;
					}
				});

				// Parse new styles (overwrite existing)
				styleString.split(';').forEach(rule => {
					const [prop, value] = rule.split(':').map(s => s.trim());
					if (prop && value) {
						newStyleObj[prop] = value;
					}
				});

				// Rebuild style string
				const mergedStyle = Object.entries(newStyleObj)
					.map(([prop, value]) => `${prop}: ${value}`)
					.join('; ');

				existingSpan.setAttribute('style', mergedStyle);

				return true; // Successfully merged
			}
		}

		// No existing span found or selection spans multiple elements - create new wrapper
		const span = doc.createElement('span');
		span.className = 'ots-styled';

		Object.keys(attributes).forEach(key => {
			span.setAttribute(key, attributes[key]);
		});

		if (styleString) {
			span.setAttribute('style', styleString);
		}

		range.surroundContents(span);
		return true;

	} catch (error) {
		// eslint-disable-next-line no-console
		if (typeof console !== 'undefined' && console.error) {
			console.error('OTS Block - Failed to apply or merge styling:', error);
		}
		return false;
	}
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

/**
 * Analyze inline features in HTML content for block conversion
 *
 * This function determines whether inline OpenType features should be extracted
 * to block-level during conversion, or preserved as inline spans.
 *
 * Rules:
 * - If no inline features exist, return 'none' coverage
 * - If inline features cover less than 100% of text, return 'partial' coverage
 * - If inline features cover 100% AND all have the same features, extract to block level
 * - If inline features cover 100% BUT have different features, keep inline (mixed)
 *
 * @param {string} htmlContent - HTML content to analyze
 * @return {Object} Analysis result with:
 *   - hasInlineFeatures {boolean} - Whether any ots-styled spans with features exist
 *   - coverage {string} - 'none', 'partial', or 'full'
 *   - commonFeatures {Array<string>} - Features common to all text (if full coverage)
 *   - shouldExtractToBlock {boolean} - Whether features should be extracted to block level
 */
export function analyzeInlineFeatures(htmlContent) {
	// Default result for no features
	const defaultResult = {
		hasInlineFeatures: false,
		coverage: 'none',
		commonFeatures: [],
		shouldExtractToBlock: false
	};

	if (!htmlContent || typeof htmlContent !== 'string') {
		return defaultResult;
	}

	try {
		// Parse HTML
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
		const container = doc.body.firstChild;

		// Get total text length
		const totalText = container.textContent || '';
		const totalLength = totalText.trim().length;

		if (totalLength === 0) {
			return defaultResult;
		}

		// Find all ots-styled spans that have OpenType features
		const styledSpans = Array.from(container.querySelectorAll('span.ots-styled')).filter(span => {
			const features = span.getAttribute('data-features');
			return features && features.trim().length > 0;
		});

		if (styledSpans.length === 0) {
			return defaultResult;
		}

		// Calculate how much text is covered by styled spans with features
		let coveredLength = 0;
		const featureSets = [];

		styledSpans.forEach(span => {
			const spanText = span.textContent || '';
			const spanLength = spanText.trim().length;
			coveredLength += spanLength;

			// Extract features from this span
			const featuresAttr = span.getAttribute('data-features') || '';
			const features = featuresAttr.split(',').map(f => f.trim()).filter(f => f);
			featureSets.push(features.sort().join(',')); // Sort for comparison
		});

		// Determine coverage
		const coverageRatio = coveredLength / totalLength;
		let coverage = 'none';

		if (coverageRatio === 0) {
			coverage = 'none';
		} else if (coverageRatio < 0.95) { // Allow small rounding errors
			coverage = 'partial';
		} else {
			coverage = 'full';
		}

		// If not full coverage, return partial result
		if (coverage !== 'full') {
			return {
				hasInlineFeatures: true,
				coverage: coverage,
				commonFeatures: [],
				shouldExtractToBlock: false
			};
		}

		// Full coverage - check if all spans have the same features
		const uniqueFeatureSets = [...new Set(featureSets)];

		if (uniqueFeatureSets.length === 1) {
			// All spans have the same features - extract to block level
			const commonFeaturesAttr = styledSpans[0].getAttribute('data-features') || '';
			const commonFeatures = commonFeaturesAttr.split(',').map(f => f.trim()).filter(f => f);

			return {
				hasInlineFeatures: true,
				coverage: 'full',
				commonFeatures: commonFeatures,
				shouldExtractToBlock: true
			};
		} else {
			// Full coverage but mixed features - keep inline
			return {
				hasInlineFeatures: true,
				coverage: 'full',
				commonFeatures: [],
				shouldExtractToBlock: false
			};
		}

	} catch (error) {
		// eslint-disable-next-line no-console
		if (typeof console !== 'undefined' && console.error) {
			console.error('OTS Block - Failed to analyze inline features:', error);
		}
		return defaultResult;
	}
}

/**
 * Strip inline OpenType feature spans from HTML content
 *
 * Removes all <span class="ots-styled"> elements while preserving their text content
 * and any other non-ots-styled markup.
 *
 * Used during block conversion when features should be extracted to block level.
 *
 * @param {string} htmlContent - HTML content with inline ots-styled spans
 * @return {string} HTML content with ots-styled spans removed
 */
export function stripInlineFeatures(htmlContent) {
	if (!htmlContent || typeof htmlContent !== 'string') {
		return htmlContent || '';
	}

	try {
		// Parse HTML
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
		const container = doc.body.firstChild;

		// Find all ots-styled spans (including nested ones)
		const styledSpans = container.querySelectorAll('span.ots-styled');

		// Remove each span while keeping its content
		styledSpans.forEach(span => {
			// Get parent node before removing
			const parent = span.parentNode;

			if (parent) {
				// Move all child nodes out of the span
				while (span.firstChild) {
					parent.insertBefore(span.firstChild, span);
				}

				// Remove the now-empty span
				parent.removeChild(span);
			}
		});

		// Return the cleaned HTML
		return container.innerHTML;

	} catch (error) {
		// eslint-disable-next-line no-console
		if (typeof console !== 'undefined' && console.error) {
			console.error('OTS Block - Failed to strip inline features:', error);
		}
		return htmlContent;
	}
}
