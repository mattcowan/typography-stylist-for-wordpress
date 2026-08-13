/**
 * Typography Stylist - Shared Utility Functions
 *
 * Pure functions extracted for reuse across edit.js, block-editor.js, and tests.
 * These functions have no side effects and can be tested independently.
 */

/**
 * Build a text offset map from a DOM container, accounting for <br> elements.
 *
 * Designed to match WordPress RichText's offset system, where each <br> element
 * (inserted via Shift+Enter) counts as 1 character position. Without this adjustment,
 * offsets from wp.data selectionStart.offset / selectionEnd.offset would be misaligned
 * with text node positions, causing styles to be applied to the wrong character.
 *
 * Returns only text node entries — <br> elements increment the running offset by 1
 * but do not produce entries in the returned array, since they cannot be split or
 * wrapped in <span> elements. Callers iterate the returned entries to find or wrap
 * text at a given offset range.
 *
 * @param {Node} container - DOM node to walk
 * @param {Document} docContext - Document context for creating the TreeWalker
 * @return {Array<{node: Node, start: number, end: number, text: string}>} Text node map with BR-adjusted offsets
 */
export function buildTextOffsetMap(container, docContext) {
	const walker = docContext.createTreeWalker(
		container,
		NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
		{
			acceptNode: function (node) {
				if (node.nodeType === Node.TEXT_NODE) {
					return NodeFilter.FILTER_ACCEPT;
				}
				if (node.nodeName === 'BR') {
					return NodeFilter.FILTER_ACCEPT;
				}
				// Skip other elements but still visit their children
				return NodeFilter.FILTER_SKIP;
			}
		}
	);

	const map = [];
	let currentOffset = 0;
	let node;

	while ((node = walker.nextNode())) {
		if (node.nodeType === Node.TEXT_NODE) {
			const text = node.nodeValue || '';
			map.push({
				node: node,
				start: currentOffset,
				end: currentOffset + text.length,
				text: text
			});
			currentOffset += text.length;
		} else if (node.nodeName === 'BR') {
			// BR counts as 1 character position to match WordPress RichText offsets
			currentOffset += 1;
		}
	}

	return map;
}

/**
 * Get the effective text length of a DOM node, counting <br> elements as 1 character.
 *
 * Unlike node.textContent.length which returns 0 for <br> elements,
 * this function counts each <br> as 1 character position to match
 * WordPress RichText's offset system.
 *
 * @param {Node} node - DOM node to measure
 * @return {number} Effective text length including BR characters
 */
export function getEffectiveTextLength(node) {
	if (node.nodeType === Node.TEXT_NODE) {
		return (node.textContent || '').length;
	}
	if (node.nodeName === 'BR') {
		return 1;
	}
	let length = 0;
	for (let i = 0; i < node.childNodes.length; i++) {
		length += getEffectiveTextLength(node.childNodes[i]);
	}
	return length;
}

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
	const styledSpans = container.querySelectorAll('span.typost-styled');

	// Find the smallest (innermost) span that matches the cursor/selection
	let smallestMatchingSpan = null;
	let smallestSpanSize = Infinity;

	// Build offset map once, reuse for all spans
	const textNodeMap = buildTextOffsetMap(container, doc);

	for (const span of styledSpans) {
		// Find this span's position in the text using pre-built map
		let spanStart = 0;
		let spanEnd = 0;
		let found = false;

		for (const entry of textNodeMap) {
			if (span.contains(entry.node)) {
				if (!found) {
					spanStart = entry.start;
					found = true;
				}
				spanEnd = entry.end;
			}
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

	// Collect ALL features from this span and any nested typost-styled spans
	// This handles the case where font-size/weight wraps feature spans:
	// <span data-fontsize="..." class="typost-styled"><span data-features="ss01" class="typost-styled">M</span></span>
	const allFeatures = new Set();

	// Extract features from data attribute (preferred - faster and more reliable)
	const dataFeatures = smallestMatchingSpan.getAttribute('data-features');
	if (dataFeatures) {
		dataFeatures.split(',').forEach(f => {
			const trimmed = f.trim();
			if (trimmed) allFeatures.add(trimmed);
		});
	}

	// ALSO check for typost-styled spans INSIDE this one (nested case)
	// This fixes detection when font-sizing wraps a feature-styled span
	// BUT only include features if cursor is ACTUALLY inside the nested span
	const nestedStyledSpans = smallestMatchingSpan.querySelectorAll('span.typost-styled');
	for (const nested of nestedStyledSpans) {
		// Calculate the text position range for this nested span using pre-built map
		let nestedStart = 0;
		let nestedEnd = 0;
		let nestedFound = false;

		for (const entry of textNodeMap) {
			if (nested.contains(entry.node)) {
				if (!nestedFound) {
					nestedStart = entry.start;
					nestedFound = true;
				}
				nestedEnd = entry.end;
			}
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
 * Parse inline font family ID at cursor position
 * Returns the font ID from the data-font-id attribute of the innermost span at the cursor
 * Used for showing correct font in feature previews
 *
 * @param {string} htmlContent - HTML content to parse
 * @param {number} cursorStart - Start offset of cursor/selection
 * @param {number} cursorEnd - End offset of cursor/selection
 * @returns {string|null} Font ID or null if no inline font found
 */
export function parseInlineFontFamilyAtCursor(htmlContent, cursorStart, cursorEnd) {
	if (!htmlContent || cursorStart === undefined || cursorEnd === undefined) {
		return null;
	}

	// Parse HTML to find styled spans with font-family
	const parser = new DOMParser();
	const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
	const container = doc.body.firstChild;
	const styledSpans = container.querySelectorAll('span[data-font-id]');

	// Find the smallest (innermost) span with data-font-id that matches the cursor/selection
	let smallestMatchingSpan = null;
	let smallestSpanSize = Infinity;

	// Build offset map once, reuse for all spans
	const textNodeMap = buildTextOffsetMap(container, doc);

	for (const span of styledSpans) {
		// Find this span's position in the text using pre-built map
		let spanStart = 0;
		let spanEnd = 0;
		let found = false;

		for (const entry of textNodeMap) {
			if (span.contains(entry.node)) {
				if (!found) {
					spanStart = entry.start;
					found = true;
				}
				spanEnd = entry.end;
			}
		}

		// Check if the cursor/selection overlaps with this span
		const isCursor = cursorStart === cursorEnd;
		const isInside = isCursor && found && cursorStart >= spanStart && cursorStart < spanEnd;
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
		return null;
	}

	// Return the font family ID
	return smallestMatchingSpan.getAttribute('data-font-id');
}

/**
 * Parse ALL inline style properties from HTML content at a specific cursor position
 *
 * Unified parser that detects features, fontId, fontWeight, fontSize (+ breakpoints),
 * letterSpacing, lineHeight, fitScale, fitShift, plus span boundaries
 * (spanText, spanStart, spanEnd).
 *
 * @param {string} htmlContent - HTML content to parse
 * @param {number} cursorStart - Cursor/selection start offset (in text, not HTML)
 * @param {number} cursorEnd - Cursor/selection end offset (in text, not HTML)
 * @return {Object|null} Object with all properties, or null if no styled span at cursor
 */
export function parseInlineStylesAtCursor(htmlContent, cursorStart, cursorEnd) {
	if (!htmlContent || cursorStart === undefined || cursorEnd === undefined) {
		return null;
	}

	try {
		// Parse HTML
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
		const container = doc.body.firstChild;

		// Get all typost-styled spans
		const spans = container.querySelectorAll('span.typost-styled');
		if (!spans.length) {
			return null;
		}

		// Build text offset map (accounts for <br> line breaks)
		const textNodeMap = buildTextOffsetMap(container, doc);

		// Find spans that overlap cursor position
		let smallestMatchingSpan = null;
		let smallestSpanLength = Infinity;
		let spanStart = 0;
		let spanEnd = 0;

		spans.forEach(span => {
			// Calculate span's text range
			let spanTextStart = Infinity;
			let spanTextEnd = -1;

			textNodeMap.forEach(({ node, start, end }) => {
				if (span.contains(node)) {
					spanTextStart = Math.min(spanTextStart, start);
					spanTextEnd = Math.max(spanTextEnd, end);
				}
			});

			// Check if cursor overlaps this span
			// For collapsed cursor: cursorStart >= spanTextStart && cursorStart < spanTextEnd
			// For selection: cursorStart < spanTextEnd && cursorEnd > spanTextStart
			const overlaps = (cursorStart === cursorEnd)
				? (cursorStart >= spanTextStart && cursorStart < spanTextEnd)
				: (cursorStart < spanTextEnd && cursorEnd > spanTextStart);

			if (overlaps) {
				const spanLength = spanTextEnd - spanTextStart;
				// Keep the smallest (innermost) matching span
				// When lengths are equal, prefer the span that is a descendant of the current smallest
				const isSmallerOrInner = spanLength < smallestSpanLength ||
					(spanLength === smallestSpanLength && smallestMatchingSpan && smallestMatchingSpan.contains(span));

				if (isSmallerOrInner) {
					smallestMatchingSpan = span;
					smallestSpanLength = spanLength;
					spanStart = spanTextStart;
					spanEnd = spanTextEnd;
				}
			}
		});

		if (!smallestMatchingSpan) {
			return null;
		}

		// Extract properties from the innermost span and walk UP to collect inherited properties
		const result = {
			features: [],
			fontId: null,
			fontWeight: null,
			fontStyle: null,
			fontSize: null,
			fontSizeMin: null,
			fontSizePreferred: null,
			fontSizeMax: null,
			letterSpacing: null,
			lineHeight: null,
			fitScale: null,
			fitShift: null,
			fontVariationSettings: null,
			spanText: smallestMatchingSpan.textContent || '',
			spanStart: spanStart,
			spanEnd: spanEnd
		};

		// Walk up from innermost span to collect properties
		let currentSpan = smallestMatchingSpan;
		while (currentSpan) {
			// Features - ONLY from innermost span (not inherited)
			if (currentSpan === smallestMatchingSpan) {
				const featuresAttr = currentSpan.getAttribute('data-features');
				if (featuresAttr) {
					result.features = featuresAttr.split(',').map(f => f.trim()).filter(f => f);
				} else {
					// Fallback: parse from style attribute
					const style = currentSpan.getAttribute('style') || '';
					const featureMatch = style.match(/font-feature-settings:\s*([^;]+)/);
					if (featureMatch) {
						const featureStr = featureMatch[1];
						const features = [];
						const regex = /"([^"]+)"\s+1/g;
						let match;
						while ((match = regex.exec(featureStr))) {
							features.push(match[1]);
						}
						result.features = features;
					}
				}
			}

			// FontId - inherited from first ancestor that has it
			if (result.fontId === null) {
				const fontId = currentSpan.getAttribute('data-font-id');
				if (fontId) {
					result.fontId = fontId;
				}
			}

			// FontWeight - inherited from first ancestor that has it
			if (result.fontWeight === null) {
				const fontWeight = currentSpan.getAttribute('data-fontweight');
				if (fontWeight) {
					result.fontWeight = fontWeight;
				}
			}

			// FontStyle - inherited from first ancestor that has it
			if (result.fontStyle === null) {
				const fontStyle = currentSpan.getAttribute('data-fontstyle');
				if (fontStyle) {
					result.fontStyle = fontStyle;
				}
			}

			// FontSize - inherited from first ancestor that has it
			if (result.fontSize === null) {
				const fontSize = currentSpan.getAttribute('data-fontsize');
				if (fontSize) {
					result.fontSize = fontSize;
					// Also get breakpoints if responsive
					if (fontSize === 'responsive') {
						const min = currentSpan.getAttribute('data-fontsize-min');
						const preferred = currentSpan.getAttribute('data-fontsize-preferred');
						const max = currentSpan.getAttribute('data-fontsize-max');
						if (min) result.fontSizeMin = parseInt(min, 10);
						if (preferred) result.fontSizePreferred = parseInt(preferred, 10);
						if (max) result.fontSizeMax = parseInt(max, 10);
					}
				}
			}

			// LetterSpacing - inherited from first ancestor that has it
			if (result.letterSpacing === null) {
				const letterSpacingAttr = currentSpan.getAttribute('data-letterspacing');
				if (letterSpacingAttr) {
					result.letterSpacing = parseInt(letterSpacingAttr, 10);
				} else {
					// Fallback: parse from style attribute
					const style = currentSpan.getAttribute('style') || '';
					const lsMatch = style.match(/letter-spacing:\s*([-\d.]+)em/);
					if (lsMatch) {
						result.letterSpacing = Math.round(parseFloat(lsMatch[1]) * 1000);
					}
				}
			}

			// LineHeight - inherited from first ancestor that has it
			if (result.lineHeight === null) {
				const lineHeightAttr = currentSpan.getAttribute('data-lineheight');
				if (lineHeightAttr) {
					result.lineHeight = parseFloat(lineHeightAttr);
				} else {
					// Fallback: parse from style attribute
					const style = currentSpan.getAttribute('style') || '';
					const lhMatch = style.match(/line-height:\s*([\d.]+)/);
					if (lhMatch) {
						result.lineHeight = parseFloat(lhMatch[1]);
					}
				}
			}

			// FitScale - inherited from first ancestor that has it. Data-attr
			// only: a bare "font-size: Nem" declaration is ambiguous (could be
			// a hand-authored size), so no style-string fallback.
			if (result.fitScale === null) {
				const fitScaleAttr = currentSpan.getAttribute('data-fitscale');
				if (fitScaleAttr) {
					const parsed = parseFloat(fitScaleAttr);
					if (!isNaN(parsed)) {
						result.fitScale = parsed;
					}
				}
			}

			// FitShift - inherited from first ancestor that has it (data-attr only)
			if (result.fitShift === null) {
				const fitShiftAttr = currentSpan.getAttribute('data-fitshift');
				if (fitShiftAttr) {
					const parsed = parseFloat(fitShiftAttr);
					if (!isNaN(parsed)) {
						result.fitShift = parsed;
					}
				}
			}

			// FontVariationSettings - inherited from first ancestor that has it
			if (result.fontVariationSettings === null) {
				const fvsAttr = currentSpan.getAttribute('data-font-variation-settings');
				if (fvsAttr) {
					result.fontVariationSettings = fvsAttr;
				}
			}

			// Walk up to parent span.typost-styled (if any)
			// Use parentElement.closest() to skip the current span and find the next ancestor
			if (currentSpan.parentElement) {
				currentSpan = currentSpan.parentElement.closest('span.typost-styled');
			} else {
				currentSpan = null;
			}
		}

		// FontStyle fallback: semantic italic (<em>/<i>) around the selection
		// still renders the italic face — previews must know about it
		if (result.fontStyle === null && smallestMatchingSpan.closest('em, i')) {
			result.fontStyle = 'italic';
		}

		return result;

	} catch (error) {
		return null;
	}
}

/**
 * Update a span property in-place (for collapsed cursor)
 *
 * @param {string} htmlContent - HTML content
 * @param {number} cursorOffset - Cursor position
 * @param {string} propertyDataAttr - Data attribute to check (e.g., 'data-letterspacing')
 * @param {string} newValue - New attribute value
 * @param {string} styleProperty - CSS property name
 * @param {string} styleValue - CSS value
 * @return {Object} { success: boolean, content: string }
 */
export function updateSpanPropertyInPlace(htmlContent, cursorOffset, propertyDataAttr, newValue, styleProperty, styleValue) {
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
		const container = doc.body.firstChild;

		// Find span at cursor that has the property
		const spans = container.querySelectorAll('span.typost-styled');
		if (!spans.length) {
			return { success: false, content: htmlContent };
		}

		// Build text offset map (accounts for <br> line breaks)
		const textNodeMap = buildTextOffsetMap(container, doc);

		// Find span at cursor
		let targetSpan = null;
		spans.forEach(span => {
			let spanStart = Infinity, spanEnd = -1;
			textNodeMap.forEach(({ node, start, end }) => {
				if (span.contains(node)) {
					spanStart = Math.min(spanStart, start);
					spanEnd = Math.max(spanEnd, end);
				}
			});
			if (cursorOffset >= spanStart && cursorOffset < spanEnd) {
				if (!targetSpan) targetSpan = span;
			}
		});

		if (!targetSpan) {
			return { success: false, content: htmlContent };
		}

		// Walk up to find span that HAS the property, or use innermost span if none found
		let spanWithProperty = null;
		let current = targetSpan;
		while (current) {
			if (current.hasAttribute(propertyDataAttr)) {
				spanWithProperty = current;
				break;
			}
			current = current.parentElement?.closest('span.typost-styled');
		}

		// If no span has the property yet, add it to the innermost span at cursor
		if (!spanWithProperty) {
			spanWithProperty = targetSpan;
		}

		// Update the property
		const previousValue = spanWithProperty.getAttribute(propertyDataAttr);
		spanWithProperty.setAttribute(propertyDataAttr, newValue);

		// A font CHANGE leaves any legacy family-name attribute stale
		// (rendering keys off data-font-id since v1.1.6); same-font re-applies
		// keep a still-accurate data-font
		if (propertyDataAttr === 'data-font-id' && String(newValue) !== String(previousValue || '')) {
			spanWithProperty.removeAttribute('data-font');
		}

		// Update style attribute
		const styleObj = parseStyleString(spanWithProperty.getAttribute('style'));
		styleObj[styleProperty] = styleValue;
		spanWithProperty.setAttribute('style', buildStyleString(styleObj));

		return { success: true, content: container.innerHTML };
	} catch (error) {
		return { success: false, content: htmlContent };
	}
}

/**
 * Split span into segments (for partial selection with same property)
 *
 * @param {string} htmlContent - HTML content
 * @param {number} startOffset - Selection start
 * @param {number} endOffset - Selection end
 * @param {string} propertyDataAttr - Data attribute to check
 * @param {Object} newAttributes - Attributes for selection segment
 * @param {string} newStyleString - Style for selection segment
 * @return {Object} { success: boolean, content: string }
 */
export function splitSpanAndApply(htmlContent, startOffset, endOffset, propertyDataAttr, newAttributes, newStyleString) {
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
		const container = doc.body.firstChild;

		// Find parent span with the property
		const spans = container.querySelectorAll('span.typost-styled');
		if (!spans.length) {
			return { success: false, content: htmlContent };
		}

		// Build text offset map (accounts for <br> line breaks)
		const textNodeMap = buildTextOffsetMap(container, doc);

		// Find parent span that has the property and overlaps selection
		let parentSpan = null;
		let parentStart = 0, parentEnd = 0;

		spans.forEach(span => {
			if (!span.hasAttribute(propertyDataAttr)) return;

			let spanStart = Infinity, spanEnd = -1;
			textNodeMap.forEach(({ node, start, end }) => {
				if (span.contains(node)) {
					spanStart = Math.min(spanStart, start);
					spanEnd = Math.max(spanEnd, end);
				}
			});

			const overlaps = startOffset < spanEnd && endOffset > spanStart;
			if (overlaps && !parentSpan) {
				parentSpan = span;
				parentStart = spanStart;
				parentEnd = spanEnd;
			}
		});

		if (!parentSpan) {
			return { success: false, content: htmlContent };
		}

		// Check if selection covers entire span
		if (startOffset <= parentStart && endOffset >= parentEnd) {
			return { success: false, content: htmlContent };
		}

		// Check for nested child spans crossing boundaries
		const childSpans = parentSpan.querySelectorAll('span.typost-styled');
		for (let child of childSpans) {
			let childStart = Infinity, childEnd = -1;
			textNodeMap.forEach(({ node, start, end }) => {
				if (child.contains(node)) {
					childStart = Math.min(childStart, start);
					childEnd = Math.max(childEnd, end);
				}
			});
			// Child is safe if entirely within one segment
			const entirelyInBefore = childEnd <= startOffset;
			const entirelyInSelection = childStart >= startOffset && childEnd <= endOffset;
			const entirelyInAfter = childStart >= endOffset;
			const isEntirelyWithinOneSegment = entirelyInBefore || entirelyInSelection || entirelyInAfter;

			if (!isEntirelyWithinOneSegment) {
				return { success: false, content: htmlContent };
			}
		}

		// Clone parent attributes and parse styles
		const parentAttrs = {};
		for (let attr of parentSpan.attributes) {
			parentAttrs[attr.name] = attr.value;
		}

		// Parse parent + new styles and merge (new wins per property)
		const parentStyleObj = parseStyleString(parentAttrs.style);
		const newStyleObj = parseStyleString(newStyleString);
		const mergedStyleObj = { ...parentStyleObj, ...newStyleObj };
		const mergedAttrs = { ...parentAttrs, ...newAttributes };

		// Variation-axis values are font-specific: when this apply CHANGES the
		// font, the parent's axis settings must not carry into the new-font
		// segment (the before/after segments keep the old font and keep theirs)
		if (newAttributes['data-font-id'] !== undefined &&
			String(newAttributes['data-font-id']) !== String(parentAttrs['data-font-id'] || '')) {
			delete mergedAttrs['data-font-variation-settings'];
			delete mergedStyleObj['font-variation-settings'];
			// The legacy family-name attribute would likewise go stale on the
			// new-font segment (rendering keys off data-font-id since v1.1.6)
			if (newAttributes['data-font'] === undefined) {
				delete mergedAttrs['data-font'];
			}
		}
		const mergedStyleString = buildStyleString(mergedStyleObj);

		// Split by iterating through parent's childNodes and tracking text offsets
		const selStart = startOffset - parentStart;
		const selEnd = endOffset - parentStart;
		let currentPos = 0;
		const segments = { before: [], selection: [], after: [] };

		// Classify an atomic (unsplittable) node into a segment by its position
		function classifyAtomicNode(html, nodeStart, nodeLength) {
			const nodeEnd = nodeStart + nodeLength;
			if (nodeEnd <= selStart) {
				segments.before.push(html);
			} else if (nodeStart >= selEnd) {
				segments.after.push(html);
			} else if (nodeStart >= selStart && nodeEnd <= selEnd) {
				segments.selection.push(html);
			}
			// If node spans boundaries, it was already rejected by boundary check
			currentPos += nodeLength;
		}

		function processNode(node) {
			if (node.nodeType === Node.TEXT_NODE) {
				const text = node.textContent || '';
				const nodeStart = currentPos;
				const nodeEnd = currentPos + text.length;

				// Determine which segment(s) this text belongs to
				if (nodeEnd <= selStart) {
					segments.before.push(text);
				} else if (nodeStart >= selEnd) {
					segments.after.push(text);
				} else if (nodeStart >= selStart && nodeEnd <= selEnd) {
					segments.selection.push(text);
				} else {
					// Text spans multiple segments - split it
					if (nodeStart < selStart) {
						segments.before.push(text.substring(0, selStart - nodeStart));
					}
					const inSelStart = Math.max(0, selStart - nodeStart);
					const inSelEnd = Math.min(text.length, selEnd - nodeStart);
					if (inSelEnd > inSelStart) {
						segments.selection.push(text.substring(inSelStart, inSelEnd));
					}
					if (nodeEnd > selEnd) {
						segments.after.push(text.substring(selEnd - nodeStart));
					}
				}
				currentPos += text.length;
			} else if (node.nodeName === 'BR') {
				classifyAtomicNode(node.outerHTML, currentPos, 1);
			} else if (node.nodeType === Node.ELEMENT_NODE) {
				classifyAtomicNode(node.outerHTML, currentPos, getEffectiveTextLength(node));
			}
		}

		Array.from(parentSpan.childNodes).forEach(processNode);

		// Build replacement HTML. Attribute values MUST be escaped — variation
		// and feature settings contain double quotes ('"wght" 628') that would
		// otherwise terminate the attribute and corrupt the span.
		const escapeAttr = (value) => String(value)
			.replace(/&/g, '&amp;')
			.replace(/"/g, '&quot;');
		const spanOpen = (attrs, styleValue) => {
			let open = `<span class="typost-styled"`;
			for (let key in attrs) {
				if (key !== 'class' && key !== 'style') open += ` ${key}="${escapeAttr(attrs[key])}"`;
			}
			return open + ` style="${escapeAttr(styleValue || '')}">`;
		};

		let html = '';
		if (segments.before.length > 0) {
			html += spanOpen(parentAttrs, parentAttrs.style) + `${segments.before.join('')}</span>`;
		}

		html += spanOpen(mergedAttrs, mergedStyleString) + `${segments.selection.join('')}</span>`;

		if (segments.after.length > 0) {
			html += spanOpen(parentAttrs, parentAttrs.style) + `${segments.after.join('')}</span>`;
		}

		// Replace parent span
		const tempDiv = doc.createElement('div');
		tempDiv.innerHTML = html;
		parentSpan.replaceWith(...tempDiv.childNodes);

		return { success: true, content: container.innerHTML };
	} catch (error) {
		return { success: false, content: htmlContent };
	}
}

/**
 * Parse a CSS style string into a property→value object.
 *
 * The canonical style parser for the plugin (see
 * todo/refactor-style-string-helpers.md). Splits declarations on ';' and each
 * declaration on the FIRST ':' only — values containing colons survive intact.
 * Property names are trimmed and lowercased; malformed declarations are
 * skipped. Duplicate properties collapse to the last value at the first
 * position (plugin-generated styles never contain duplicates).
 *
 * NOTE: save.js keeps its own inline parse on purpose — save output must stay
 * byte-stable for block validation.
 *
 * @since 2.2.0
 * @param {string} styleString CSS style string (e.g. "font-size: 20px; font-weight: 700")
 * @return {Object} Property→value map (insertion order preserved)
 */
export function parseStyleString(styleString) {
	const styleObj = {};
	String(styleString || '').split(';').forEach((decl) => {
		const colon = decl.indexOf(':');
		if (colon <= 0) {
			return;
		}
		const prop = decl.slice(0, colon).trim().toLowerCase();
		const value = decl.slice(colon + 1).trim();
		if (prop && value) {
			styleObj[prop] = value;
		}
	});
	return styleObj;
}

/**
 * Build a CSS style string from a property→value object.
 *
 * Inverse of parseStyleString(): "prop: value" pairs joined with "; ".
 *
 * @since 2.2.0
 * @param {Object} styleObj Property→value map
 * @return {string} CSS style string ('' for an empty object)
 */
export function buildStyleString(styleObj) {
	return Object.entries(styleObj || {})
		.map(([prop, value]) => `${prop}: ${value}`)
		.join('; ');
}

/**
 * Resolve the block-level font-family value for editor rendering.
 *
 * Must stay in parity with save.js: fontId wins and emits the CSS variable
 * (so font replacements keep working), the fontFamily string is the fallback
 * for legacy/custom fonts. The editor previously gated on the fontFamily
 * STRING attribute alone, so a block carrying only fontId — valid content the
 * frontend renders correctly — showed the theme's inherited font in the
 * editor, and fit measurement measured the wrong font's advance widths.
 *
 * @since 2.3.0
 * @param {number|string} fontId     Numeric font id attribute. Judged by JS
 *                                   truthiness, same as save.js: any falsy
 *                                   value (0, '', null, undefined) is unset,
 *                                   and a truthy string ('42', even '0')
 *                                   emits the variable — parity over lint.
 * @param {string}        fontFamily Font family string attribute
 * @return {string} CSS font-family value, or '' when neither is set
 */
export function resolveBlockFontFamilyStyle(fontId, fontFamily) {
	if (fontId) {
		return `var(--font-${fontId})`;
	}
	return fontFamily || '';
}

/**
 * Validate nesting depth before applying styling
 * Prevents creating excessive nesting (max 3 levels)
 *
 * @param {Element} element - Starting element to check depth from
 * @return {Object} { valid: boolean, depth: number, error: string|null }
 */
export function validateNestingDepth(element) {
	let depth = 0;
	let current = element;
	const MAX_DEPTH = 3; // Conservative limit - can increase if approach proves reliable

	while (current && current.classList && current.classList.contains('typost-styled')) {
		depth++;
		if (depth > MAX_DEPTH) {
			return {
				valid: false,
				depth: depth,
				error: `Maximum nesting depth (${MAX_DEPTH}) exceeded`
			};
		}
		current = current.parentElement;
	}

	return { valid: true, depth: depth, error: null };
}

/**
 * Whether a NEW nested typost-styled span may be created under this element.
 *
 * validateNestingDepth() validates an existing chain (depth 3 passes); this
 * asks the forward-looking question — creating a child span adds a level, so
 * an element already at depth 3 must refuse. Used by every wrap/nest path so
 * the max-3 rule holds regardless of which application strategy runs.
 *
 * @since 2.2.0
 * @param {Element} element Element the new span would be created under
 * @return {boolean}
 */
export function canCreateNestedSpan(element) {
	const check = validateNestingDepth(element);
	return check.valid && check.depth < 3;
}

/**
 * Merge new styling into an existing typost-styled span (entire-span apply).
 *
 * The single home for the merge rules previously duplicated between
 * applyOrMergeStyling() and applyStylingSafeStringMethod():
 * - attributes the caller doesn't set are preserved (font, sizes, weight,
 *   spacing, line-height, fit scale/shift), including their style declarations;
 * - data-features merge and deduplicate; font-feature-settings rebuilds from
 *   the merged set, honoring raw indexed alternates in data-feature-settings
 *   (e.g. '"salt" 2' — plain '"tag" 1' entries are added only for tags the
 *   raw value doesn't already cover);
 * - a font CHANGE (explicit data-font-id differing from the span's) removes
 *   font-variation-settings (axis values are font-specific) and any legacy
 *   data-font family name (it would go stale; rendering keys off data-font-id).
 *
 * Mutates both the span and the passed attributes object (preservation writes
 * into it — callers construct fresh attribute literals per call).
 *
 * @since 2.2.0
 * @param {Element} span        Existing typost-styled span (entire text selected)
 * @param {Object}  attributes  Attributes to apply
 * @param {string}  styleString CSS style string to apply
 * @return {boolean} Always true (kept for caller return-contract symmetry)
 */
export function mergeTypostSpanStyling(span, attributes, styleString) {
	// Font change detection must precede preservation (preservation may copy
	// the span's own font id into attributes, which is not a "change")
	const fontChanging = Object.prototype.hasOwnProperty.call(attributes, 'data-font-id') &&
		attributes['data-font-id'] !== null && attributes['data-font-id'] !== undefined &&
		String(attributes['data-font-id']) !== String(span.getAttribute('data-font-id') || '');

	// PRESERVE existing inline attributes that caller isn't explicitly setting
	// This prevents losing inline font-family when applying line-height, etc.
	const attributesToPreserve = ['data-font-id', 'data-fontsize', 'data-fontsize-min', 'data-fontsize-preferred', 'data-fontsize-max', 'data-fontweight', 'data-fontstyle', 'data-letterspacing', 'data-lineheight', 'data-fitscale', 'data-fitshift'];
	const preservedAttributes = {};
	attributesToPreserve.forEach(attr => {
		if (!Object.prototype.hasOwnProperty.call(attributes, attr) && span.hasAttribute(attr)) {
			attributes[attr] = span.getAttribute(attr);
			preservedAttributes[attr] = true;
		}
	});

	// ALWAYS preserve existing features and merge with new ones
	const existingFeatures = span.getAttribute('data-features') || '';
	const existingFeaturesArray = existingFeatures ? existingFeatures.split(',').map(f => f.trim()).filter(f => f) : [];
	let mergedFeatures = [];

	Object.keys(attributes).forEach(key => {
		if (key === 'data-features') {
			// Merge features (combine existing + new, deduplicate)
			const newFeatures = attributes[key] ? attributes[key].split(',').map(f => f.trim()) : [];
			const combined = [...new Set([...existingFeaturesArray, ...newFeatures])].filter(f => f);
			if (combined.length > 0) {
				span.setAttribute('data-features', combined.join(','));
				mergedFeatures = combined;
			}
		} else {
			// For other attributes, new value overwrites old (or preserved value)
			if (attributes[key] !== null && attributes[key] !== undefined && attributes[key] !== '') {
				span.setAttribute(key, String(attributes[key]));
			}
		}
	});

	// If we didn't merge features but there are existing features, keep them for the style rebuild
	if (mergedFeatures.length === 0 && existingFeaturesArray.length > 0) {
		mergedFeatures = existingFeaturesArray;
	}

	if (fontChanging) {
		span.removeAttribute('data-font-variation-settings');
		// The legacy family-name attribute goes stale on a font change — the
		// QFT passes only data-font-id, so drop it unless explicitly re-set
		if (!Object.prototype.hasOwnProperty.call(attributes, 'data-font')) {
			span.removeAttribute('data-font');
		}
	}

	// Style merge — also runs on feature-only merges so font-feature-settings
	// rebuilds even without a style string
	if (styleString || mergedFeatures.length > 0 || fontChanging) {
		const newStyleObj = parseStyleString(span.getAttribute('style'));

		// Map of data attributes to their corresponding style properties
		// Used to prevent overwriting styles for preserved attributes
		const stylePropertyMap = {
			'data-font-id': 'font-family',
			'data-fontweight': 'font-weight',
			'data-fontstyle': 'font-style',
			'data-fontsize': 'font-size',
			'data-letterspacing': 'letter-spacing',
			'data-lineheight': 'line-height',
			'data-fitscale': 'font-size',
			'data-fitshift': 'vertical-align'
		};

		Object.entries(parseStyleString(styleString)).forEach(([prop, value]) => {
			// Special case: always override font-family when setting new font
			if (prop === 'font-family' && Object.prototype.hasOwnProperty.call(attributes, 'data-font-id')) {
				newStyleObj[prop] = value;
				return;
			}
			let shouldPreserveExisting = false;
			for (const [dataAttr, styleProp] of Object.entries(stylePropertyMap)) {
				if (preservedAttributes[dataAttr] && prop === styleProp) {
					shouldPreserveExisting = true;
					break;
				}
			}
			if (!shouldPreserveExisting) {
				newStyleObj[prop] = value;
			}
		});

		// Rebuild font-feature-settings from the merged feature set, honoring
		// raw indexed alternates (data-feature-settings)
		if (mergedFeatures.length > 0) {
			const raw = (attributes['data-feature-settings'] || span.getAttribute('data-feature-settings') || '');
			const plain = mergedFeatures
				.filter(f => raw.indexOf(`"${f}"`) === -1)
				.map(f => `"${f}" 1`)
				.join(', ');
			newStyleObj['font-feature-settings'] = raw ? (plain ? `${raw}, ${plain}` : raw) : plain;
		}

		if (fontChanging) {
			delete newStyleObj['font-variation-settings'];
		}

		span.setAttribute('style', buildStyleString(newStyleObj));
	}

	return true;
}

/**
 * Apply or merge styling to a selection, avoiding nested typost-styled spans
 *
 * This function checks if the selected range is already inside an typost-styled span.
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
		// Check if the range is entirely within a single typost-styled span
		let commonAncestor = range.commonAncestorContainer;

		// If the common ancestor is a text node, get its parent element
		if (commonAncestor.nodeType === Node.TEXT_NODE) {
			commonAncestor = commonAncestor.parentElement;
		}

		// Find the closest typost-styled span (if any)
		const existingSpan = commonAncestor.closest('span.typost-styled');

		if (existingSpan) {
			// Check if the entire selection is within this span
			const isEntirelyWithin = existingSpan.contains(range.startContainer) &&
			                        existingSpan.contains(range.endContainer);

			if (isEntirelyWithin) {
				// Merge only when the selection covers the ENTIRE span text;
				// a partial selection falls through to create a nested span
				const spanText = existingSpan.textContent || '';
				const selectedText = range.toString();
				if (spanText === selectedText) {
					return mergeTypostSpanStyling(existingSpan, attributes, styleString);
				}
			}
		}

		// No merge target — a new wrapper span will be created. Refuse when
		// that would exceed the nesting limit (merges above are always fine)
		if (commonAncestor && !canCreateNestedSpan(commonAncestor)) {
			return false;
		}

		// No existing span found or selection spans multiple elements - create new wrapper
		const span = doc.createElement('span');
		span.className = 'typost-styled';

		Object.keys(attributes).forEach(key => {
			span.setAttribute(key, attributes[key]);
		});

		if (styleString) {
			span.setAttribute('style', styleString);
		}

		range.surroundContents(span);
		// Make the applied properties win inside any wrapped styled spans
		// (their own declarations would otherwise override the wrapper's)
		overrideStylingInDescendantSpans(span, attributes, styleString);
		return true;

	} catch (error) {
		return false;
	}
}

/**
 * Validate that a DOM Range matches the expected text selection
 *
 * Prevents bugs where invalid ranges wrap entire content instead of selection.
 *
 * @param {Range} range - The DOM range to validate
 * @param {string} expectedText - The text we expect the range to contain
 * @param {number} expectedLength - Expected character count
 * @return {Object} { valid: boolean, reason: string }
 */
export function validateRangeMatchesSelection(range, expectedText, expectedLength) {
	if (!range) {
		return { valid: false, reason: 'Range is null' };
	}

	if (!expectedText || expectedLength === 0) {
		return { valid: false, reason: 'Empty selection' };
	}

	try {
		const rangeText = range.toString();

		// Check exact match
		if (rangeText === expectedText) {
			return { valid: true, reason: 'Exact match' };
		}

		// Check trimmed match (handles whitespace differences)
		if (rangeText.trim() === expectedText.trim()) {
			return { valid: true, reason: 'Trimmed match' };
		}

		// Check length match (handles HTML entities)
		if (rangeText.length === expectedLength) {
			return { valid: true, reason: 'Length match' };
		}

		return {
			valid: false,
			reason: `Mismatch: expected "${expectedText}" (${expectedLength} chars), got "${rangeText}" (${rangeText.length} chars)`
		};
	} catch (error) {
		return { valid: false, reason: `Error: ${error.message}` };
	}
}

/**
 * Apply styling using string manipulation (fallback when Range fails)
 *
 * This method works by:
 * 1. Finding text nodes and their positions
 * 2. Locating the exact text node containing the selection
 * 3. Manually splitting it and inserting a span
 *
 * @param {string} htmlContent - The HTML content
 * @param {number} startOffset - Start character offset
 * @param {number} endOffset - End character offset
 * @param {Object} attributes - Attributes to set on span
 * @param {string} styleString - CSS style string
 * @return {Object} { success: boolean, content: string, error: string|null }
 */
export function applyStylingSafeStringMethod(htmlContent, startOffset, endOffset, attributes, styleString) {
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
		const container = doc.body.firstChild;

		// Build text position map (accounts for <br> line breaks)
		const textMap = buildTextOffsetMap(container, doc);

		// Find affected text nodes
		const affectedNodes = textMap.filter(item =>
			item.start < endOffset && item.end > startOffset
		);

		if (affectedNodes.length === 0) {
			return { success: false, content: htmlContent, error: 'No text nodes in range' };
		}

		// Handle single text node case (most common, including single-letter bug)
		if (affectedNodes.length === 1) {
			const nodeInfo = affectedNodes[0];
			const textNode = nodeInfo.node;
			const parent = textNode.parentNode;

			// Calculate offsets within this text node
			const nodeRelativeStart = Math.max(0, startOffset - nodeInfo.start);
			const nodeRelativeEnd = Math.min(nodeInfo.text.length, endOffset - nodeInfo.start);

			// Split: before | selected | after
			const before = nodeInfo.text.substring(0, nodeRelativeStart);
			const selected = nodeInfo.text.substring(nodeRelativeStart, nodeRelativeEnd);
			const after = nodeInfo.text.substring(nodeRelativeEnd);

			// Check if parent is already a typost-styled span AND we're selecting the entire text
			// Only merge if the entire SPAN's text is selected — the textContent
			// comparison guards spans with element children, where before/after
			// being empty for this text node doesn't mean the whole span is selected
			const isInTypostSpan = parent.classList && parent.classList.contains('typost-styled');
			const isSelectingEntireSpanText = isInTypostSpan && before === '' && after === '' &&
				parent.textContent === selected;
			let span;

			if (isSelectingEntireSpanText) {
				// Entire span selected — shared merge (same rules as the Range method)
				mergeTypostSpanStyling(parent, attributes, styleString);
				return { success: true, content: container.innerHTML, error: null };
			} else {
				// A new nested span would be created — honor the nesting limit
				if (!canCreateNestedSpan(parent)) {
					return { success: false, content: htmlContent, error: 'Maximum nesting depth exceeded' };
				}

				// Build new span
				span = doc.createElement('span');
				span.className = 'typost-styled';

				Object.keys(attributes).forEach(key => {
					const value = attributes[key];
					if (value !== null && value !== undefined && value !== '') {
						span.setAttribute(key, String(value));
					}
				});

				if (styleString) {
					span.setAttribute('style', styleString);
				}

				span.textContent = selected;
			}

			// Replace text node with: before + span + after (only if we created a new span)
			if (!isSelectingEntireSpanText) {
				if (before) {
					parent.insertBefore(doc.createTextNode(before), textNode);
				}
				parent.insertBefore(span, textNode);
				if (after) {
					parent.insertBefore(doc.createTextNode(after), textNode);
				}
				parent.removeChild(textNode);
			}

			return { success: true, content: container.innerHTML, error: null };
		}

		// Multi-node selection - handle by preserving DOM structure
		// When selection spans multiple text nodes (e.g., plain text "M" + feature span "a"),
		// we need to wrap the ENTIRE DOM structure, not just text content.

		try {
			const firstNode = affectedNodes[0].node;
			const lastNode = affectedNodes[affectedNodes.length - 1].node;

			// Find common ancestor that contains all affected nodes
			let commonParent = firstNode.parentNode;
			while (commonParent && !commonParent.contains(lastNode)) {
				commonParent = commonParent.parentNode;
			}

			if (!commonParent) {
				return { success: false, content: htmlContent, error: 'No common parent found' };
			}

			// The wrapper is a new span under commonParent — honor the nesting limit
			if (!canCreateNestedSpan(commonParent)) {
				return { success: false, content: htmlContent, error: 'Maximum nesting depth exceeded' };
			}

			// Create range that encompasses all affected content
			const multiRange = doc.createRange();
			multiRange.setStart(firstNode, Math.max(0, startOffset - affectedNodes[0].start));
			const lastNodeOffset = Math.min(
				lastNode.length || 0,
				endOffset - affectedNodes[affectedNodes.length - 1].start
			);
			multiRange.setEnd(lastNode, lastNodeOffset);

			// Extract content (preserves nested structure)
			const fragment = multiRange.extractContents();

			// Wrap in new span
			const wrapper = doc.createElement('span');
			wrapper.className = 'typost-styled';
			Object.keys(attributes).forEach(key => {
				const value = attributes[key];
				if (value !== null && value !== undefined && value !== '') {
					wrapper.setAttribute(key, String(value));
				}
			});
			if (styleString) {
				wrapper.setAttribute('style', styleString);
			}

			wrapper.appendChild(fragment);
			multiRange.insertNode(wrapper);

			// Make the applied properties win inside any wrapped styled spans
			// (their own declarations would otherwise override the wrapper's)
			overrideStylingInDescendantSpans(wrapper, attributes, styleString);

			// Clean up any empty spans left behind by extractContents()
			const allSpans = container.querySelectorAll('span.typost-styled');
			allSpans.forEach(span => {
				if (!span.textContent || span.textContent.trim().length === 0) {
					span.remove();
				}
			});

			return { success: true, content: container.innerHTML, error: null };

		} catch (error) {
			return { success: false, content: htmlContent, error: `Multi-node error: ${error.message}` };
		}

	} catch (error) {
		return { success: false, content: htmlContent, error: error.message };
	}
}

/**
 * Detect block's computed font from DOM
 *
 * Finds a block's RichText element in the DOM and extracts its computed font-family.
 * Handles iframe context detection for WordPress block editor.
 *
 * @param {string} clientId - Block's client ID
 * @param {string} elementSelector - CSS selector for the text element (e.g., '.typost-block-content')
 * @return {string} Computed font-family (with quotes removed) or empty string if not found
 */
export function detectBlockComputedFont(clientId, elementSelector = '.typost-block-content') {
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
		return '';
	}
}

/**
 * Detect the font-weight a block is actually rendering at.
 *
 * Themes make headings bold through CSS (`h2 { font-weight: 700 }`), never
 * through a stored attribute, so this is the only way to know what a core
 * heading looks like before converting it to a Typography Stylist block —
 * whose fontWeight attribute defaults to 400 and is always emitted, silently
 * lightening the text.
 *
 * The selector list covers both DOM shapes: WordPress 6.5+ puts data-block on
 * the text element itself, older versions wrap it.
 *
 * @since 2.3.0
 * @param {string} clientId - Block client ID
 * @param {string} elementSelector - Selector for the text element
 * @return {string} Computed weight as a numeric string (e.g. '700'), or '' when undetectable
 */
export function detectBlockComputedWeight(clientId, elementSelector = '.typost-block-content') {
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

		const blockWrapper = targetDocument.querySelector(`[data-block="${clientId}"]`);
		if (!blockWrapper) {
			return '';
		}

		const textElement = blockWrapper.matches(elementSelector)
			? blockWrapper
			: blockWrapper.querySelector(elementSelector);
		if (!textElement) {
			return '';
		}

		const weight = targetWindow.getComputedStyle(textElement).getPropertyValue('font-weight');
		if (!weight) {
			return '';
		}

		// Some platforms report keywords; map them so the result is always a
		// valid block attribute value.
		const keywords = { normal: '400', bold: '700', bolder: '700', lighter: '300' };
		const normalized = String(weight).trim().toLowerCase();
		if (keywords[normalized]) {
			return keywords[normalized];
		}
		return /^\d+$/.test(normalized) ? normalized : '';
	} catch (error) {
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
 *   - hasInlineFeatures {boolean} - Whether any typost-styled spans with features exist
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

		// Find all typost-styled spans that have OpenType features
		const styledSpans = Array.from(container.querySelectorAll('span.typost-styled')).filter(span => {
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

		// Extraction strips the spans entirely, so it is only safe when the
		// spans carry NOTHING besides the feature tags being lifted. A span
		// with a font, weight, size, spacing, or raw feature-settings value
		// (indexed glyph alternates) must be preserved inline — extraction
		// would silently destroy that styling. Note: querySelectorAll over
		// the container also catches styling-only spans that the coverage
		// scan above ignores (it only counts spans with data-features).
		const allTypostSpans = Array.from(container.querySelectorAll('span.typost-styled'));
		const spansCarryOnlyFeatures = allTypostSpans.every((span) => {
			const extraDataAttr = Array.prototype.some.call(span.attributes, (attr) =>
				attr.name.indexOf('data-') === 0 && attr.name !== 'data-features');
			if (extraDataAttr) {
				return false;
			}
			// Any style beyond font-feature-settings is span-only styling too
			const styleObj = parseStyleString(span.getAttribute('style'));
			delete styleObj['font-feature-settings'];
			return Object.keys(styleObj).length === 0;
		});

		// Full coverage - check if all spans have the same features
		const uniqueFeatureSets = [...new Set(featureSets)];

		if (uniqueFeatureSets.length === 1 && spansCarryOnlyFeatures) {
			// All spans have the same features and nothing else - extract to block level
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
		return defaultResult;
	}
}

/**
 * Detect whether a text range renders italic via <em>/<i> markup alone.
 *
 * parseInlineStylesAtCursor() only reports fontStyle when a typost-styled
 * span overlaps the selection — plain emphasized text (`<em>word</em>`) has
 * no such span, but its italic face is still what consumers like the Glyphs
 * panel should load. Returns 'italic' only when EVERY text node overlapping
 * the range sits inside an <em>/<i>, so a selection straddling the emphasis
 * boundary (mixed faces) reports null.
 *
 * @since 2.2.0
 * @param {string} htmlContent Block content HTML
 * @param {number} start Selection start offset
 * @param {number} end Selection end offset (may equal start for a caret)
 * @return {'italic'|null}
 */
export function detectEmItalicAtRange(htmlContent, start, end) {
	if (!htmlContent || typeof start !== 'number' || !isFinite(start)) {
		return null;
	}
	if (typeof end !== 'number' || !isFinite(end)) {
		end = start;
	}
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
		const container = doc.body.firstChild;
		if (!container.querySelector('em, i')) {
			return null;
		}
		const textNodeMap = buildTextOffsetMap(container, doc);
		let sawNode = false;
		for (const entry of textNodeMap) {
			const overlaps = (start === end)
				? (start >= entry.start && start < entry.end)
				: (start < entry.end && end > entry.start);
			if (!overlaps) {
				continue;
			}
			sawNode = true;
			const parent = entry.node.parentElement;
			if (!parent || !parent.closest('em, i')) {
				return null;
			}
		}
		return sawNode ? 'italic' : null;
	} catch (error) {
		return null;
	}
}

/**
 * Strip inline OpenType feature spans from HTML content
 *
 * Removes all <span class="typost-styled"> elements while preserving their text content
 * and any other non-typost-styled markup.
 *
 * Used during block conversion when features should be extracted to block level.
 *
 * @param {string} htmlContent - HTML content with inline typost-styled spans
 * @return {string} HTML content with typost-styled spans removed
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

		// Find all typost-styled spans (including nested ones)
		const styledSpans = container.querySelectorAll('span.typost-styled');

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
		return htmlContent;
	}
}

/**
 * Resolve the target text range for content insertion in the Typography Stylist
 * block (Quick Feature Toggles context).
 *
 * Priority order:
 * 1. capturedSelection — offsets captured before the QFT modal stole focus
 * 2. Block editor selection — when it belongs to this block
 * 3. End of content — degraded fallback (append)
 *
 * Offsets are clamped to [0, textLength] and normalized so start <= end.
 *
 * @param {Object|null} capturedSelection - {start, end} captured at modal open, or null
 * @param {Object|null} selectionStart - Block editor selection start {clientId, offset}
 * @param {Object|null} selectionEnd - Block editor selection end {clientId, offset}
 * @param {string} clientId - This block's client ID
 * @param {number} textLength - Plain text length of the block content
 * @return {{start: number, end: number}} Insertion range
 */
export function resolveQftInsertionRange(capturedSelection, selectionStart, selectionEnd, clientId, textLength) {
	const clamp = (n) => Math.max(0, Math.min(typeof n === 'number' && isFinite(n) ? n : 0, textLength));

	let start = null;
	let end = null;

	if (capturedSelection && Number.isFinite(capturedSelection.start) && Number.isFinite(capturedSelection.end)) {
		start = capturedSelection.start;
		end = capturedSelection.end;
	} else if (
		selectionStart && selectionEnd &&
		selectionStart.clientId === clientId &&
		selectionEnd.clientId === clientId
	) {
		start = selectionStart.offset || 0;
		end = selectionEnd.offset || 0;
	} else {
		start = textLength;
		end = textLength;
	}

	start = clamp(start);
	end = clamp(end);
	if (start > end) {
		const tmp = start;
		start = end;
		end = tmp;
	}

	return { start, end };
}

/**
 * Resolve the target text range for APPLYING styling in the Typography
 * Stylist block's Quick Feature Toggles.
 *
 * Deliberately a sibling of resolveQftInsertionRange, not a generalization:
 * insertion prefers the captured selection and degrades to append; applying
 * prefers the LIVE selection (the author may have re-selected while the
 * popover is open) and degrades to null (block-level/no-op is then the
 * caller's explicit decision, never an accident of lost focus).
 *
 * Priority order:
 * 1. Live block-editor selection in this block with an expanded range
 * 2. capturedSelection — offsets captured when the QFT popover opened,
 *    surviving the focus loss that collapses the live selection
 * 3. Live collapsed selection (caret) in this block — preserves the
 *    caret-based update-in-place behaviors
 * 4. null — no usable selection information
 *
 * @since 2.2.0
 * @param {Object|null} selectionStart - Block editor selection start {clientId, offset}
 * @param {Object|null} selectionEnd - Block editor selection end {clientId, offset}
 * @param {string} clientId - This block's client ID
 * @param {Object|null} capturedSelection - {start, end} captured at popover open, or null
 * @return {{start: number, end: number}|null} Apply range, or null
 */
export function resolveQftApplyRange(selectionStart, selectionEnd, clientId, capturedSelection) {
	const liveInBlock = selectionStart && selectionEnd &&
		selectionStart.clientId === clientId &&
		selectionEnd.clientId === clientId;
	const liveStart = liveInBlock ? (selectionStart.offset || 0) : null;
	const liveEnd = liveInBlock ? (selectionEnd.offset || 0) : null;

	if (liveInBlock && liveStart !== liveEnd) {
		return liveStart <= liveEnd
			? { start: liveStart, end: liveEnd }
			: { start: liveEnd, end: liveStart };
	}

	if (capturedSelection &&
		Number.isFinite(capturedSelection.start) && Number.isFinite(capturedSelection.end) &&
		capturedSelection.start !== capturedSelection.end) {
		return capturedSelection.start <= capturedSelection.end
			? { start: capturedSelection.start, end: capturedSelection.end }
			: { start: capturedSelection.end, end: capturedSelection.start };
	}

	if (liveInBlock) {
		return { start: liveStart, end: liveEnd };
	}

	return null;
}

/**
 * Resolve an expanded selection range inside this block from the block
 * editor's selectionStart/selectionEnd.
 *
 * Both ends must belong to this block: a selection that starts here and ends
 * in a sibling block is not a range this block may act on. A collapsed caret
 * returns null — callers that want the caret use resolveQftApplyRange().
 * Reversed offsets (selecting right-to-left) are normalized.
 *
 * @since 2.3.0
 * @param {Object|null} selectionStart - Block editor selection start {clientId, offset}
 * @param {Object|null} selectionEnd - Block editor selection end {clientId, offset}
 * @param {string} clientId - This block's client ID
 * @return {{start: number, end: number}|null} Normalized range, or null when there is no selection in this block
 */
export function resolveBlockSelectionRange(selectionStart, selectionEnd, clientId) {
	if (!selectionStart || !selectionEnd) {
		return null;
	}
	if (selectionStart.clientId !== clientId || selectionEnd.clientId !== clientId) {
		return null;
	}
	const start = selectionStart.offset || 0;
	const end = selectionEnd.offset || 0;
	if (start === end) {
		return null;
	}
	return start < end ? { start, end } : { start: end, end: start };
}

/**
 * Build the shared editor-state object that the `typost_current_editor_state`
 * filter answers with for the 'qft' editor.
 *
 * Extracted so the state provider and the extension toolbar buttons (which
 * hand extensions a state snapshot directly, without going through the
 * filter) can never drift apart.
 *
 * @since 2.3.0
 * @param {Object} s - Raw block state (the qftStateRef payload in edit.js)
 * @return {Object} Editor state for extensions
 */
export function buildQftEditorState(s) {
	const source = s || {};
	const styleIdMatch = source.styleClass ? String(source.styleClass).match(/typost-ps-(\d+)/) : null;
	// Prefer the font of the inline span at the cursor (stored as a string
	// data-font-id) over the block-level font, so consumers like the Glyphs
	// panel reflect the actually-selected font. With neither set, fall back to
	// the font the block inherits from the theme — text with no plugin font is
	// still rendering in something, and reporting 0 leaves consumers to guess.
	const activeFontId = source.inlineFontId
		? parseInt(source.inlineFontId, 10)
		: (source.fontId || source.inheritedFontId || 0);

	return {
		editorType: 'qft',
		fontId: activeFontId,
		// Effective style at the selection wins over the block attribute
		fontStyle: source.inlineFontStyle || source.fontStyle || '',
		fontWeight: source.fontWeight,
		fontSize: source.fontSize,
		fontSizeMin: source.fontSizeMin,
		fontSizePreferred: source.fontSizePreferred,
		fontSizeMax: source.fontSizeMax,
		fitMaxSize: source.fitMaxSize || 0,
		letterSpacing: source.letterSpacing,
		lineHeight: source.lineHeight,
		features: source.features,
		paragraphStyleId: styleIdMatch ? parseInt(styleIdMatch[1], 10) : 0,
		fontVariationSettings: source.fontVariationSettings || '',
		layeredConfigId: source.layeredConfigId || 0,
		animationConfigId: source.animationConfigId || 0,
		content: source.content || '',
		tagName: source.tagName || 'h2'
	};
}

/**
 * Filter extension-registered toolbar button descriptors down to the ones a
 * given editor should render, dropping malformed entries.
 *
 * A descriptor without an `editors` array is offered in every editor.
 *
 * @since 2.3.0
 * @param {Array} buttons - Descriptors returned by the typost_editor_toolbar_buttons filter
 * @param {string} editor - Editor key ('qft' or 'inline')
 * @return {Array} Valid descriptors for this editor
 */
export function filterToolbarButtons(buttons, editor) {
	if (!Array.isArray(buttons)) {
		return [];
	}
	return buttons.filter((button) => {
		if (!button || !button.id || typeof button.onClick !== 'function') {
			return false;
		}
		if (Array.isArray(button.editors)) {
			return button.editors.indexOf(editor) !== -1;
		}
		return true;
	});
}

/**
 * Checks if font size values are in valid order
 * Does not adjust values - only returns true/false
 *
 * @param {number} min - Minimum font size
 * @param {number} preferred - Preferred font size
 * @param {number} max - Maximum font size
 * @return {boolean} True if min <= preferred <= max
 */
export function isValidFontSizeRange(min, preferred, max) {
	return min <= preferred && preferred <= max;
}

/**
 * Debounce function - delays function execution until after delay milliseconds
 * have elapsed since the last time it was invoked
 *
 * @param {Function} func - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @return {Function} - Debounced function with cancel method
 */
export function debounce(func, delay) {
	let timeoutId;

	const debounced = function(...args) {
		clearTimeout(timeoutId);
		timeoutId = setTimeout(() => {
			func.apply(this, args);
		}, delay);
	};

	debounced.cancel = () => {
		clearTimeout(timeoutId);
	};

	return debounced;
}

/**
 * Remove specific property from a typost-styled span
 * Checks if span should be unwrapped after removal
 *
 * @param {HTMLElement} span - The span element to modify
 * @param {string} dataAttribute - Data attribute to remove (e.g., 'data-letterspacing')
 * @param {string} styleProperty - Style property to remove (e.g., 'letter-spacing')
 * @return {boolean} - True if span should be unwrapped (no attributes remain)
 */
export function removePropertyFromSpan(span, dataAttribute, styleProperty) {
	// Remove data attribute
	span.removeAttribute(dataAttribute);

	// For responsive font-size, also remove related breakpoint attributes
	if (dataAttribute === 'data-fontsize') {
		span.removeAttribute('data-fontsize-min');
		span.removeAttribute('data-fontsize-preferred');
		span.removeAttribute('data-fontsize-max');
	}

	// Parse the style, drop the removed property, rebuild (or remove when empty)
	const styleObj = parseStyleString(span.getAttribute('style'));
	delete styleObj[styleProperty];

	if (Object.keys(styleObj).length > 0) {
		span.setAttribute('style', buildStyleString(styleObj));
	} else {
		span.removeAttribute('style');
	}

	// Check if any typost attributes remain
	const hasFeatures = span.getAttribute('data-features');
	const hasFontId = span.getAttribute('data-font-id');
	const hasFontSize = span.getAttribute('data-fontsize');
	const hasFontWeight = span.getAttribute('data-fontweight');
	const hasLetterSpacing = span.getAttribute('data-letterspacing');
	const hasLineHeight = span.getAttribute('data-lineheight');
	const hasFitScale = span.getAttribute('data-fitscale');
	const hasFitShift = span.getAttribute('data-fitshift');

	// data-style-id counts: a paragraph style applied to a selection renders
	// entirely through the CSS class it implies, so a span carrying only that
	// has no inline style of its own — unwrapping it because "nothing is left"
	// would silently drop the style when some other property is removed.
	const hasStyleId = span.getAttribute('data-style-id');

	const hasAnyAttributes = hasFeatures || hasFontId || hasFontSize ||
	                         hasFontWeight || hasLetterSpacing || hasLineHeight ||
	                         hasFitScale || hasFitShift || hasStyleId;

	if (!hasAnyAttributes && Object.keys(styleObj).length === 0) {
		return true; // Signal to unwrap span
	}

	return false;
}

/**
 * Remove specific property from selected text's spans
 * Unwraps spans that have no remaining attributes
 *
 * A collapsed range (startOffset === endOffset) removes the property from
 * the span at the caret — walking up to the ancestor that carries it —
 * mirroring how updateSpanPropertyInPlace applies at a caret.
 *
 * @param {string} htmlContent - Block HTML content
 * @param {number} startOffset - Selection start offset
 * @param {number} endOffset - Selection end offset
 * @param {string} dataAttribute - Data attribute to remove (e.g., 'data-letterspacing')
 * @param {string} styleProperty - Style property to remove (e.g., 'letter-spacing')
 * @return {Object} - { success: boolean, content: string }
 */
export function removePropertyFromSelection(htmlContent, startOffset, endOffset, dataAttribute, styleProperty) {
	if (!htmlContent) {
		return { success: false, content: htmlContent };
	}

	const parser = new DOMParser();
	const doc = parser.parseFromString(`<div>${htmlContent}</div>`, 'text/html');
	const container = doc.body.firstChild;

	// Build text offset map (accounts for <br> line breaks)
	const textNodeMap = buildTextOffsetMap(container, doc);
	const spansAtSelection = new Set();

	if (startOffset === endOffset) {
		// Collapsed caret: no text node can overlap a zero-width range, so
		// find the innermost span containing the caret instead — same
		// spanStart <= caret < spanEnd convention as updateSpanPropertyInPlace,
		// the apply-side counterpart — then walk up to the first ancestor that
		// actually carries the attribute.
		let targetSpan = null;
		let targetSize = Infinity;
		container.querySelectorAll('span.typost-styled').forEach(span => {
			let spanStart = Infinity, spanEnd = -1;
			textNodeMap.forEach(({ node, start, end }) => {
				if (span.contains(node)) {
					spanStart = Math.min(spanStart, start);
					spanEnd = Math.max(spanEnd, end);
				}
			});
			if (startOffset >= spanStart && startOffset < spanEnd && (spanEnd - spanStart) < targetSize) {
				targetSpan = span;
				targetSize = spanEnd - spanStart;
			}
		});
		let current = targetSpan;
		while (current && !current.getAttribute(dataAttribute)) {
			current = current.parentElement ? current.parentElement.closest('span.typost-styled') : null;
		}
		if (current) {
			spansAtSelection.add(current);
		}
	} else {
		// Walk through text nodes and find spans that overlap with selection
		for (const entry of textNodeMap) {
			// Check if this text node overlaps with selection
			if (entry.end > startOffset && entry.start < endOffset) {
				// Find typost-styled spans containing this text node
				let parent = entry.node.parentElement;
				while (parent && parent !== container) {
					if (parent.classList && parent.classList.contains('typost-styled')) {
						if (parent.getAttribute(dataAttribute)) {
							spansAtSelection.add(parent);
						}
					}
					parent = parent.parentElement;
				}
			}
		}
	}

	// Remove property from each span found in selection
	spansAtSelection.forEach(span => {
		const shouldUnwrap = removePropertyFromSpan(span, dataAttribute, styleProperty);

		if (shouldUnwrap && span.parentNode) {
			// Unwrap span - move children to parent
			while (span.firstChild) {
				span.parentNode.insertBefore(span.firstChild, span);
			}
			span.parentNode.removeChild(span);
		}
	});

	return {
		success: true,
		content: container.innerHTML
	};
}

/**
 * Standard CSS font weight options.
 */
export const ALL_WEIGHT_OPTIONS = [
	{ label: '100 - Thin', value: '100' },
	{ label: '200 - Extra Light', value: '200' },
	{ label: '300 - Light', value: '300' },
	{ label: '400 - Normal', value: '400' },
	{ label: '500 - Medium', value: '500' },
	{ label: '600 - Semi Bold', value: '600' },
	{ label: '700 - Bold', value: '700' },
	{ label: '800 - Extra Bold', value: '800' },
	{ label: '900 - Black', value: '900' }
];

/**
 * Get filtered font weight options based on a font's available weights.
 *
 * @param {number|string} targetFontId   The font ID to check weights for.
 * @param {Object}        fontIdMap      Map of font ID to font data (must include availableWeights).
 * @param {boolean}       includeInherit Whether to include an "Inherit from block" option.
 * @return {Array} Filtered weight options array with { label, value } objects.
 */
export function getFilteredWeightOptions(targetFontId, fontIdMap, includeInherit = false) {
	const options = includeInherit
		? [{ label: 'Inherit from block', value: 'inherit' }]
		: [];

	if (!targetFontId || !fontIdMap || !fontIdMap[targetFontId]) {
		return options.concat(ALL_WEIGHT_OPTIONS);
	}

	const available = fontIdMap[targetFontId].availableWeights;
	if (!available || available.length === 0) {
		return options.concat(ALL_WEIGHT_OPTIONS);
	}

	return options.concat(ALL_WEIGHT_OPTIONS.filter(w => available.includes(w.value)));
}

/**
 * Get the closest available weight to the given weight.
 *
 * @param {string} currentWeight    The current weight value (e.g., '400').
 * @param {Array}  availableWeights Array of available weight strings (e.g., ['200', '700']).
 * @return {string} The closest available weight.
 */
export function getClosestWeight(currentWeight, availableWeights) {
	if (!availableWeights || availableWeights.length === 0) return currentWeight;
	if (availableWeights.includes(currentWeight)) return currentWeight;

	const current = parseInt(currentWeight, 10);
	let closest = availableWeights[0];
	let minDiff = Math.abs(current - parseInt(closest, 10));

	for (const w of availableWeights) {
		const diff = Math.abs(current - parseInt(w, 10));
		if (diff < minDiff) {
			minDiff = diff;
			closest = w;
		}
	}
	return closest;
}

/**
 * Filter the full features list to only those enabled for a given font.
 *
 * @since 2.0.0
 * @param {Array}  allFeatures   Full array of feature objects from typostData.features
 * @param {number} fontId        Numeric font ID (0 or falsy = no filter applied)
 * @param {Object} visibilityMap typostData.fontFeatureVisibility keyed by font_id
 * @returns {Array} Filtered feature objects (same references, not copies)
 */
export function filterFeaturesByVisibility(allFeatures, fontId, visibilityMap) {
	if (!fontId || !visibilityMap) return allFeatures;
	const entry = visibilityMap[fontId];
	if (!entry || !Array.isArray(entry.disabled_features) || entry.disabled_features.length === 0) {
		return allFeatures;
	}
	return allFeatures.filter(f => !entry.disabled_features.includes(f.id));
}

/**
 * Merge an extension insertion's format attributes with the typost format the
 * insertion replaces, so unrelated styling survives.
 *
 * When an extension (e.g. the Glyphs Panel) inserts a glyph that needs its own
 * typost-styled span, applyFormat REPLACES any typost format on the inserted
 * range. The extension payload only expresses what it owns (features, font,
 * sometimes weight) — without a merge, the sizing/spacing of the span the
 * glyph lands in is lost. This carries over every inherited data-* attribute
 * and style declaration the payload doesn't set itself.
 *
 * Rules:
 * - Incoming attributes always win per-key.
 * - Identity/feature attributes (data-features, data-feature-settings,
 *   data-font, data-font-id) are owned by the payload and never inherited.
 * - Style declarations merge by property name; font-family and
 *   font-feature-settings are owned by the payload. font-variation-settings
 *   is inherited only when the font is unchanged (axes are font-specific).
 *
 * @since 2.2.0
 * @param {Object|null} incoming  Attributes from the insertion payload
 * @param {Object|null} inherited Attributes of the typost format being replaced
 * @returns {Object|null} Merged attributes (incoming unchanged when nothing to merge)
 */
export function mergeInsertionFormatAttributes(incoming, inherited) {
	if (!incoming || typeof incoming !== 'object') {
		return incoming;
	}
	if (!inherited || typeof inherited !== 'object') {
		return incoming;
	}

	const OWNED_ATTRS = ['data-features', 'data-feature-settings', 'data-font', 'data-font-id', 'style'];
	const merged = { ...incoming };

	Object.keys(inherited).forEach((key) => {
		if (OWNED_ATTRS.includes(key) || merged[key] !== undefined) {
			return;
		}
		if (key.indexOf('data-') === 0) {
			merged[key] = inherited[key];
		}
	});

	// Style declarations: incoming first, then inherited properties it doesn't set
	const sameFont =
		String(incoming['data-font-id'] || '') !== '' &&
		String(incoming['data-font-id']) === String(inherited['data-font-id'] || '');
	const ownedProps = ['font-family', 'font-feature-settings'];
	if (!sameFont) {
		// Variation axes are font-specific — don't carry them to a different font
		ownedProps.push('font-variation-settings');
	}

	const mergedStyle = parseStyleString(incoming.style);
	Object.entries(parseStyleString(inherited.style)).forEach(([prop, value]) => {
		if (!(prop in mergedStyle) && !ownedProps.includes(prop)) {
			mergedStyle[prop] = value;
		}
	});

	const styleOut = buildStyleString(mergedStyle);
	if (styleOut) {
		merged.style = styleOut;
	} else {
		delete merged.style;
	}

	return merged;
}

/**
 * Split a rich-text range into runs of identical typost formatting.
 *
 * Each run is a maximal span of consecutive characters whose typost format
 * attributes are identical (including "no typost format" runs, attributes:
 * null). Used to apply a single property change per-run across a mixed
 * selection instead of stamping one uniform format over everything.
 *
 * @since 2.2.0
 * @param {Array}  formats    value.formats from @wordpress/rich-text (per-char format arrays)
 * @param {number} start      Range start offset
 * @param {number} end        Range end offset (exclusive)
 * @param {string} formatType Format type name (e.g. 'typost/features')
 * @returns {Array} [{ start, end, attributes|null }]
 */
export function computeTypostFormatRuns(formats, start, end, formatType) {
	const runs = [];
	if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
		return runs;
	}
	const attrsAt = (i) => {
		const list = formats && formats[i];
		if (!list || !list.find) {
			return null;
		}
		const format = list.find((f) => f && f.type === formatType);
		return format ? (format.attributes || {}) : null;
	};
	let runStart = start;
	let runAttrs = attrsAt(start);
	let runKey = runAttrs === null ? null : JSON.stringify(runAttrs);
	for (let i = start + 1; i < end; i++) {
		const attrs = attrsAt(i);
		const key = attrs === null ? null : JSON.stringify(attrs);
		if (key !== runKey) {
			runs.push({ start: runStart, end: i, attributes: runAttrs });
			runStart = i;
			runAttrs = attrs;
			runKey = key;
		}
	}
	runs.push({ start: runStart, end: end, attributes: runAttrs });
	return runs;
}

/**
 * Whether a range covers more than one distinct typost formatting run.
 *
 * A mixed selection is one where a wholesale format apply would destroy
 * per-run differences (the "select all + change font wipes my settings" bug).
 *
 * @since 2.2.0
 * @param {Array}  formats    value.formats from @wordpress/rich-text
 * @param {number} start      Range start offset
 * @param {number} end        Range end offset (exclusive)
 * @param {string} formatType Format type name
 * @returns {boolean}
 */
export function isMixedFormatSelection(formats, start, end, formatType) {
	return computeTypostFormatRuns(formats, start, end, formatType).length > 1;
}

/**
 * Patch a typost format's attributes with a single property change,
 * preserving everything the change doesn't touch.
 *
 * @since 2.2.0
 * @param {Object|null} existingAttrs Format attributes of the run (null = unformatted)
 * @param {Object} patch { dataAttrs: {name: value|null}, styleDecls: {prop: value|null},
 *                         featureToggles: [{tag, enabled}] } — null values remove
 * @returns {Object|null} New attributes, or null when nothing meaningful remains
 *                        (caller should remove the format from the run)
 */
export function patchTypostFormatAttributes(existingAttrs, patch) {
	const attrs = { ...(existingAttrs || {}) };
	const styleDecls = { ...((patch && patch.styleDecls) || {}) };

	// Feature toggles edit the run's own feature set (add/remove one tag),
	// then rebuild the font-feature-settings declaration — honoring any raw
	// indexed alternates stored in data-feature-settings
	const toggles = (patch && patch.featureToggles) || [];
	if (toggles.length > 0) {
		const features = (attrs['data-features'] || '')
			.split(',')
			.map((t) => t.trim())
			.filter(Boolean);
		toggles.forEach((toggle) => {
			const index = features.indexOf(toggle.tag);
			if (toggle.enabled && index === -1) {
				features.push(toggle.tag);
			}
			if (!toggle.enabled && index > -1) {
				features.splice(index, 1);
			}
		});
		if (features.length > 0) {
			attrs['data-features'] = features.join(',');
		} else {
			delete attrs['data-features'];
		}
		const raw = attrs['data-feature-settings'] || '';
		const plain = features
			.filter((tag) => raw.indexOf(`"${tag}"`) === -1)
			.map((tag) => `"${tag}" 1`)
			.join(', ');
		const combined = raw ? (plain ? `${raw}, ${plain}` : raw) : plain;
		styleDecls['font-feature-settings'] = combined || null;
	}

	// Data attributes: set, or remove when null/empty
	const dataAttrs = (patch && patch.dataAttrs) || {};
	Object.keys(dataAttrs).forEach((name) => {
		const value = dataAttrs[name];
		if (value === null || value === undefined || value === '') {
			delete attrs[name];
		} else {
			attrs[name] = String(value);
		}
	});

	// Style: replace/remove patched declarations, keep the rest verbatim
	const styleObj = parseStyleString(attrs.style);
	Object.keys(styleDecls).forEach((prop) => {
		if (styleDecls[prop]) {
			styleObj[prop] = styleDecls[prop];
		} else {
			delete styleObj[prop];
		}
	});
	const styleOut = buildStyleString(styleObj);
	if (styleOut) {
		attrs.style = styleOut;
	} else {
		delete attrs.style;
	}

	const hasData = Object.keys(attrs).some((key) => key.indexOf('data-') === 0);
	return hasData ? attrs : null;
}

/**
 * After wrapping a multi-span selection in a new typost-styled span, make the
 * wrapped property actually take effect inside descendant spans.
 *
 * Without this, applying e.g. a font over a selection containing styled spans
 * produces an outer span whose font-family is overridden by every inner span's
 * own font-family — the change looks like it did nothing. For each single-value
 * property the wrapper applies, the same property is removed from descendant
 * spans (so the wrapper cascades); feature settings instead MERGE into
 * descendants that declare their own (an inner font-feature-settings
 * declaration replaces the outer one wholesale in CSS, so the wrapper's tags
 * must be added to it). Descendants left with no attributes are unwrapped.
 *
 * @since 2.2.0
 * @param {Element} wrapper     The newly created wrapping span
 * @param {Object}  attributes  The attributes applied to the wrapper
 * @param {string}  styleString The style string applied to the wrapper
 */
export function overrideStylingInDescendantSpans(wrapper, attributes, styleString) {
	const appliedDecls = parseStyleString(styleString);

	// Single-value properties cascade from the wrapper once descendants stop
	// declaring them; map each to the data attributes that must go with it
	const cascadeProps = {
		'font-family': ['data-font-id', 'data-font'],
		'font-weight': ['data-fontweight'],
		'font-style': ['data-fontstyle'],
		'font-size': ['data-fontsize', 'data-fontsize-min', 'data-fontsize-preferred', 'data-fontsize-max', 'data-fitscale'],
		'letter-spacing': ['data-letterspacing'],
		'line-height': ['data-lineheight'],
		'vertical-align': ['data-fitshift'],
		'font-variation-settings': ['data-font-variation-settings']
	};
	const strippedProps = Object.keys(cascadeProps).filter((prop) => prop in appliedDecls);
	// Axis values are font-specific: a font change also invalidates them
	if ('font-family' in appliedDecls && strippedProps.indexOf('font-variation-settings') === -1) {
		strippedProps.push('font-variation-settings');
	}

	const appliedFeatures = (attributes && attributes['data-features'] ? String(attributes['data-features']) : '')
		.split(',')
		.map((t) => t.trim())
		.filter(Boolean);

	Array.prototype.slice.call(wrapper.querySelectorAll('span.typost-styled')).forEach((span) => {
		strippedProps.forEach((prop) => {
			cascadeProps[prop].forEach((attr) => span.removeAttribute(attr));
		});

		const kept = [];
		Object.entries(parseStyleString(span.getAttribute('style'))).forEach(([prop, valueIn]) => {
			let value = valueIn;
			if (strippedProps.indexOf(prop) !== -1) {
				return; // wrapper provides it now
			}
			if (prop === 'font-feature-settings' && appliedFeatures.length > 0) {
				// Inner declaration replaces the outer one in CSS — merge the
				// wrapper's tags in so they apply here too
				const missing = appliedFeatures.filter((tag) => value.indexOf(`"${tag}"`) === -1);
				if (missing.length > 0) {
					value += ', ' + missing.map((tag) => `"${tag}" 1`).join(', ');
					const own = (span.getAttribute('data-features') || '')
						.split(',')
						.map((t) => t.trim())
						.filter(Boolean);
					appliedFeatures.forEach((tag) => {
						if (own.indexOf(tag) === -1) {
							own.push(tag);
						}
					});
					span.setAttribute('data-features', own.join(','));
				}
			}
			kept.push(`${prop}: ${value}`);
		});
		if (kept.length > 0) {
			span.setAttribute('style', kept.join('; '));
		} else {
			span.removeAttribute('style');
		}

		// Nothing left on this span? Unwrap it to keep nesting flat
		const hasData = Array.prototype.some.call(span.attributes, (a) => a.name.indexOf('data-') === 0);
		if (!hasData && !span.getAttribute('style')) {
			const parent = span.parentNode;
			while (span.firstChild) {
				parent.insertBefore(span.firstChild, span);
			}
			parent.removeChild(span);
		}
	});
}

/**
 * Validate and sanitize a font-variation-settings value.
 *
 * Ensures each comma-separated entry matches the "axis" number format
 * (e.g. "wght" 700, "wdth" 100) and normalizes quoting. Returns '' for
 * any invalid input — the value can arrive via the public
 * typost-apply-block-properties CustomEvent (extensions), so it must
 * never reach a style string unvalidated (e.g. '"wght" 700; color:red'
 * would smuggle extra declarations in).
 *
 * Same rules as the inline-format editor's sanitizer (block-editor.js);
 * save.js and deprecated.js intentionally keep their own frozen copies
 * for save-output byte-stability.
 *
 * @param {string} value - font-variation-settings string
 * @return {string} Validated and normalized value, or empty string
 */
export function sanitizeFontVariationSettings(value) {
	if (!value) return '';
	const str = String(value).trim();
	if (!str) return '';
	const entries = str.split(',').map(e => e.trim()).filter(Boolean);
	const validEntries = [];
	for (const entry of entries) {
		const match = entry.match(/^["']([a-zA-Z][a-zA-Z0-9 ]{0,3})["']\s+(-?\d+(?:\.\d+)?)$/);
		if (!match) return '';
		validEntries.push(`"${match[1]}" ${match[2]}`);
	}
	return validEntries.join(', ');
}

// ===== Fit-to-width sizing (fontSize: "fit") =====

// Viewport breakpoints for the responsive clamp() fallback — must stay in
// sync with the constants of the same name in edit.js and save.js.
const RESPONSIVE_FONT_MIN_VIEWPORT = 320;  // Mobile baseline
const RESPONSIVE_FONT_MAX_VIEWPORT = 1920; // Desktop baseline

/**
 * Split serialized RichText HTML into visual-line HTML strings on <br>
 * boundaries. Elements straddling a boundary (a styled span containing a
 * <br>) are cloned into both lines with all their attributes, via
 * Range.cloneContents(). The <br> elements themselves are not included in
 * any line.
 *
 * @param {string} html - Serialized RichText content
 * @return {string[]} One HTML string per visual line ('' for empty lines)
 */
export function splitContentIntoLines(html) {
	if (!html) {
		return [''];
	}

	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
		const container = doc.body.firstChild;

		const brs = container.querySelectorAll('br');
		if (!brs.length) {
			return [container.innerHTML];
		}

		const scratch = doc.createElement('div');
		const serializeRange = (range) => {
			scratch.innerHTML = '';
			scratch.appendChild(range.cloneContents());
			return scratch.innerHTML;
		};

		const lines = [];
		let prevBr = null;

		brs.forEach(br => {
			const range = doc.createRange();
			if (prevBr) {
				range.setStartAfter(prevBr);
			} else {
				range.setStart(container, 0);
			}
			range.setEndBefore(br);
			lines.push(serializeRange(range));
			prevBr = br;
		});

		const lastRange = doc.createRange();
		lastRange.setStartAfter(prevBr);
		lastRange.setEnd(container, container.childNodes.length);
		lines.push(serializeRange(lastRange));

		return lines;
	} catch (error) {
		return [html];
	}
}

/**
 * Compute the fit-to-width ratio for one line.
 *
 * R = referenceSize / measuredWidth, so that font-size: calc(R * 100cqi)
 * renders the line exactly as wide as its container (line width scales
 * linearly with font-size). Rounded to 4 decimals to keep serialization
 * stable; worst-case rendered-width error is sub-pixel.
 *
 * @param {number} referenceSize - Font size the line was measured at (px)
 * @param {number} measuredWidth - Natural width of the line at that size (px)
 * @return {number|null} Ratio rounded to 4 decimals, or null when unmeasurable
 */
export function computeFitRatio(referenceSize, measuredWidth) {
	if (!(referenceSize > 0) || !(measuredWidth > 0)) {
		return null;
	}
	return Math.round((referenceSize / measuredWidth) * 10000) / 10000;
}

/**
 * Build the CSS font-size value for a fit-to-width line.
 *
 * The ratio is interpolated as a bare multiplier (`calc(R * 100cqi)`)
 * rather than pre-multiplied, so the emitted string is exactly the stored
 * attribute value — no float artifacts, byte-stable for block validation.
 *
 * @param {number} ratio - Per-line ratio from computeFitRatio()
 * @param {number} fitMaxSize - Optional cap in px (0 = no cap)
 * @return {string} CSS font-size value, or '' when ratio is unusable
 */
export function buildFitFontSize(ratio, fitMaxSize) {
	if (!(ratio > 0)) {
		return '';
	}
	const cqi = `calc(${ratio} * 100cqi)`;
	return fitMaxSize > 0 ? `min(${cqi}, ${fitMaxSize}px)` : cqi;
}

/**
 * Compose the per-line wrapper HTML for a fit-to-width block's FRONTEND
 * markup (save.js): typost-line wrappers with no separators — display:
 * block does the line breaking. The editor's fit editing value is built
 * by wrapFitLines instead, which keeps the <br> separators so rich-text
 * offsets stay flat-model-identical. Lines without a valid ratio get no
 * font-size and inherit the block-level fallback clamp.
 *
 * @param {string} content - Serialized RichText content
 * @param {number[]} fitLineSizes - Per-line ratios (index = visual line)
 * @param {number} fitMaxSize - Optional cap in px (0 = no cap)
 * @return {string} HTML with each line wrapped in span.typost-line
 */
export function buildFitLinesHtml(content, fitLineSizes, fitMaxSize) {
	const lines = splitContentIntoLines(content);
	const sizes = Array.isArray(fitLineSizes) ? fitLineSizes : [];

	return lines.map((lineHtml, i) => {
		const size = buildFitFontSize(sizes[i], fitMaxSize);
		return size
			? `<span class="typost-line" style="font-size:${size}">${lineHtml}</span>`
			: `<span class="typost-line">${lineHtml}</span>`;
	}).join('');
}

/**
 * Wrap flat br-model content into the fit-mode EDITING value fed to
 * RichText: each non-empty visual line wrapped in span.typost-line with
 * its per-line font-size, joined with '<br>'. Unlike buildFitLinesHtml
 * (frontend/preview markup, no separators, display:block lines), the
 * <br> separators are KEPT so the rich-text record's text is byte-identical
 * to the flat model ("line1\nline2") — every stored selection offset and
 * the whole QFT offset convention carry over unchanged.
 *
 * Empty lines are NOT wrapped: a zero-length span cannot exist as a
 * format in the rich-text record — create() turns it into an
 * object-replacement character that would occupy a text position and
 * shift every following offset by one.
 *
 * @param {string} content - Flat serialized RichText content (br-model)
 * @param {number[]} fitLineSizes - Per-line ratios (index = visual line)
 * @param {number} fitMaxSize - Optional cap in px (0 = no cap)
 * @return {string} Wrapped editing value for RichText
 */
export function wrapFitLines(content, fitLineSizes, fitMaxSize) {
	if (!content) {
		return '';
	}
	const lines = splitContentIntoLines(content);
	const sizes = Array.isArray(fitLineSizes) ? fitLineSizes : [];

	return lines.map((lineHtml, i) => {
		if (!lineHtml) {
			return '';
		}
		const size = buildFitFontSize(sizes[i], fitMaxSize);
		return size
			? `<span class="typost-line" style="font-size:${size}">${lineHtml}</span>`
			: `<span class="typost-line">${lineHtml}</span>`;
	}).join('<br>');
}

/**
 * Inverse of wrapFitLines: strip the span.typost-line wrappers from a
 * RichText onChange value, leaving flat br-model content for the stored
 * attribute. Only the wrappers are removed — inner markup, <br>s (both
 * the line separators and any the rich-text ops placed inside/around a
 * wrapper), and everything else pass through verbatim. Adjacent wrappers
 * with no <br> between them (rich-text's backspace-merge shape)
 * concatenate naturally into one line.
 *
 * @param {string} html - Wrapped editing value from RichText onChange
 * @return {string} Flat br-model content
 */
export function unwrapFitLines(html) {
	if (!html) {
		return '';
	}
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
		const container = doc.body.firstChild;

		container.querySelectorAll('span.typost-line').forEach(wrapper => {
			while (wrapper.firstChild) {
				wrapper.parentNode.insertBefore(wrapper.firstChild, wrapper);
			}
			wrapper.parentNode.removeChild(wrapper);
		});

		return container.innerHTML;
	} catch (error) {
		return html;
	}
}

/**
 * Remove data-fontsize attributes from spans that carry data-fitscale.
 *
 * A span cannot meaningfully hold both: the style attribute has one
 * font-size declaration (the fit-scale applier overwrites it with Nem),
 * and the fit-mode neutralization rule
 * (.typost-fit .typost-line [data-fontsize] { font-size: inherit !important })
 * would kill the scale. Called by the fit-scale applier after a
 * successful apply so the two attributes never durably share a span.
 *
 * @since 2.2.3
 * @param {string} content - Serialized RichText content
 * @return {string} Content with conflicting data-fontsize attrs removed
 */
export function stripRedundantFontSizeAttrs(content) {
	if (!content || content.indexOf('data-fitscale') === -1) {
		return content;
	}
	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
		const container = doc.body.firstChild;
		container.querySelectorAll('span.typost-styled[data-fitscale][data-fontsize]').forEach(span => {
			['data-fontsize', 'data-fontsize-min', 'data-fontsize-preferred', 'data-fontsize-max']
				.forEach(attr => span.removeAttribute(attr));
		});
		return container.innerHTML;
	} catch (error) {
		return content;
	}
}

/**
 * Build the responsive clamp() font-size expression.
 *
 * IMPORTANT: this must reproduce the legacy inline expression (edit.js /
 * save.js) byte-for-byte — including float artifacts like
 * 1.8124999999999998vw — because save output must stay byte-stable for
 * block validation of already-published posts. The template and arithmetic
 * are copied verbatim; a byte-identity test locks it in.
 *
 * @param {number} fontSizeMin - Mobile size (px, at 320px viewport)
 * @param {number} fontSizePreferred - Preferred size (px, drives rem base)
 * @param {number} fontSizeMax - Desktop size (px, at 1920px viewport)
 * @return {string} clamp() expression
 */
export function buildResponsiveClamp(fontSizeMin, fontSizePreferred, fontSizeMax) {
	return `clamp(${fontSizeMin}px, ${fontSizePreferred / 16}rem + ${((fontSizeMax - fontSizeMin) / (RESPONSIVE_FONT_MAX_VIEWPORT - RESPONSIVE_FONT_MIN_VIEWPORT)) * 100}vw, ${fontSizeMax}px)`;
}

// Expose utility functions for cross-module use (block-editor.js uses CommonJS/Browserify)
if (typeof window !== 'undefined') {
	window.typostSharedUtils = {
		buildTextOffsetMap,
		parseInlineStylesAtCursor,
		parseInlineFeaturesAtCursor,
		parseInlineFontFamilyAtCursor,
		filterFeaturesByVisibility,
		mergeInsertionFormatAttributes,
		computeTypostFormatRuns,
		isMixedFormatSelection,
		patchTypostFormatAttributes,
		parseStyleString,
		buildStyleString,
		applyStylingSafeStringMethod
	};
}
