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
 * letterSpacing, lineHeight, plus span boundaries (spanText, spanStart, spanEnd).
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
			fontSize: null,
			fontSizeMin: null,
			fontSizePreferred: null,
			fontSizeMax: null,
			letterSpacing: null,
			lineHeight: null,
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

			// Walk up to parent span.typost-styled (if any)
			// Use parentElement.closest() to skip the current span and find the next ancestor
			if (currentSpan.parentElement) {
				currentSpan = currentSpan.parentElement.closest('span.typost-styled');
			} else {
				currentSpan = null;
			}
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
		spanWithProperty.setAttribute(propertyDataAttr, newValue);

		// Update style attribute
		const existingStyle = spanWithProperty.getAttribute('style') || '';
		const styleObj = {};
		existingStyle.split(';').forEach(rule => {
			const [prop, val] = rule.split(':').map(s => s.trim());
			if (prop && val) styleObj[prop] = val;
		});
		styleObj[styleProperty] = styleValue;
		spanWithProperty.setAttribute('style', Object.entries(styleObj).map(([p, v]) => `${p}: ${v}`).join('; '));

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

		// Parse parent styles into object
		const parentStyleObj = {};
		if (parentAttrs.style) {
			parentAttrs.style.split(';').forEach(rule => {
				const [prop, val] = rule.split(':').map(s => s.trim());
				if (prop && val) parentStyleObj[prop] = val;
			});
		}

		// Parse new styles and merge with parent styles
		const newStyleObj = {};
		newStyleString.split(';').forEach(rule => {
			const [prop, val] = rule.split(':').map(s => s.trim());
			if (prop && val) newStyleObj[prop] = val;
		});
		const mergedStyleObj = { ...parentStyleObj, ...newStyleObj };
		const mergedStyleString = Object.entries(mergedStyleObj).map(([p, v]) => `${p}: ${v}`).join('; ');

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

		// Build replacement HTML
		let html = '';
		if (segments.before.length > 0) {
			html += `<span class="typost-styled"`;
			for (let key in parentAttrs) {
				if (key !== 'class' && key !== 'style') html += ` ${key}="${parentAttrs[key]}"`;
			}
			html += ` style="${parentAttrs.style || ''}">${segments.before.join('')}</span>`;
		}

		html += `<span class="typost-styled"`;
		const mergedAttrs = { ...parentAttrs, ...newAttributes };
		for (let key in mergedAttrs) {
			if (key !== 'class' && key !== 'style') html += ` ${key}="${mergedAttrs[key]}"`;
		}
		html += ` style="${mergedStyleString}">${segments.selection.join('')}</span>`;

		if (segments.after.length > 0) {
			html += `<span class="typost-styled"`;
			for (let key in parentAttrs) {
				if (key !== 'class' && key !== 'style') html += ` ${key}="${parentAttrs[key]}"`;
			}
			html += ` style="${parentAttrs.style || ''}">${segments.after.join('')}</span>`;
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
		let mergedFeatures = [];
		let preservedAttributes = {};

		// Check if the range is entirely within a single typost-styled span
		let commonAncestor = range.commonAncestorContainer;

		// If the common ancestor is a text node, get its parent element
		if (commonAncestor.nodeType === Node.TEXT_NODE) {
			commonAncestor = commonAncestor.parentElement;
		}

		// Find the closest typost-styled span (if any)
		let existingSpan = commonAncestor.closest('span.typost-styled');

		// Validate nesting depth before creating nested spans
		if (commonAncestor) {
			const depthCheck = validateNestingDepth(commonAncestor);
			if (!depthCheck.valid) {
				// Don't create deeply nested spans
				return false;
			}
		}

		if (existingSpan) {
			// Check if the entire selection is within this span
			const isEntirelyWithin = existingSpan.contains(range.startContainer) &&
			                        existingSpan.contains(range.endContainer);

			if (isEntirelyWithin) {
				// Check if selection covers ENTIRE span text (not just within it)
				const spanText = existingSpan.textContent || '';
				const selectedText = range.toString();
				const isSelectingEntireSpan = (spanText === selectedText);

				// If NOT selecting entire span, DON'T merge - fall through to create nested span
				if (!isSelectingEntireSpan) {
					// Selection is partial - should create nested span or split
					// Fall through to default behavior (range.surroundContents)
					existingSpan = null; // Force creation of new span
				} else {
					// Selection covers entire span - safe to merge

					// PRESERVE existing inline attributes that caller isn't explicitly setting
					// This prevents losing inline font-family when applying line-height, etc.
					const attributesToPreserve = ['data-font-id', 'data-fontsize', 'data-fontsize-min', 'data-fontsize-preferred', 'data-fontsize-max', 'data-fontweight', 'data-letterspacing', 'data-lineheight'];
					preservedAttributes = {};  // Reset for this merge operation
					attributesToPreserve.forEach(attr => {
						if (!attributes.hasOwnProperty(attr) && existingSpan.hasAttribute(attr)) {
							// Copy existing attribute value so it won't be lost during merge
							attributes[attr] = existingSpan.getAttribute(attr);
							preservedAttributes[attr] = true;
						}
					});

					// ALWAYS preserve existing features and merge with new ones
					const existingFeatures = existingSpan.getAttribute('data-features') || '';
					const existingFeaturesArray = existingFeatures ? existingFeatures.split(',').map(f => f.trim()).filter(f => f) : [];

					// Merge attributes into existing span
					Object.keys(attributes).forEach(key => {
						if (key === 'data-features') {
							// Merge features (combine existing + new, deduplicate)
							const newFeatures = attributes[key] ? attributes[key].split(',').map(f => f.trim()) : [];
							const combined = [...new Set([...existingFeaturesArray, ...newFeatures])].filter(f => f);
							if (combined.length > 0) {
								existingSpan.setAttribute('data-features', combined.join(','));
								mergedFeatures = combined;
							}
						} else {
							// For other attributes, new value overwrites old (or preserved value)
							if (attributes[key] !== null && attributes[key] !== undefined && attributes[key] !== '') {
								existingSpan.setAttribute(key, attributes[key]);
							}
						}
					});

					// If we didn't merge features but there are existing features, preserve them in mergedFeatures
					if (mergedFeatures.length === 0 && existingFeaturesArray.length > 0) {
						mergedFeatures = existingFeaturesArray;
					}
				}
			}

			if (existingSpan && isEntirelyWithin) {

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

				// Map of data attributes to their corresponding style properties
				// Used to prevent overwriting styles for preserved attributes
				const stylePropertyMap = {
					'data-font-id': 'font-family',
					'data-fontweight': 'font-weight',
					'data-fontsize': 'font-size',
					'data-letterspacing': 'letter-spacing',
					'data-lineheight': 'line-height'
				};

				// Parse new styles (overwrite existing, EXCEPT for preserved attributes)
				styleString.split(';').forEach(rule => {
					const [prop, value] = rule.split(':').map(s => s.trim());
					if (prop && value) {
						// Special case: always override font-family when setting new font
						if (prop === 'font-family' && attributes.hasOwnProperty('data-font-id')) {
							newStyleObj[prop] = value;
							return;
						}

						// Check if this style property corresponds to a preserved attribute
						let shouldPreserveExisting = false;
						for (const [dataAttr, styleProp] of Object.entries(stylePropertyMap)) {
							if (preservedAttributes[dataAttr] && prop === styleProp) {
								shouldPreserveExisting = true;
								break;
							}
						}

						// Only overwrite if not preserved
						if (!shouldPreserveExisting) {
							newStyleObj[prop] = value;
						}
					}
				});

				// CRITICAL FIX: If we merged features, rebuild font-feature-settings with ALL features
			if (mergedFeatures.length > 0) {
				const featureSettings = mergedFeatures.map(f => `"${f}" 1`).join(', ');
				newStyleObj['font-feature-settings'] = featureSettings;
			}

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
		span.className = 'typost-styled';

		Object.keys(attributes).forEach(key => {
			span.setAttribute(key, attributes[key]);
		});

		if (styleString) {
			span.setAttribute('style', styleString);
		}

		range.surroundContents(span);
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
			// Only merge if the entire span's text is being selected, otherwise create nested span
			const isInTypostSpan = parent.classList && parent.classList.contains('typost-styled');
			const isSelectingEntireSpanText = isInTypostSpan && before === '' && after === '';
			let span;

			if (isSelectingEntireSpanText) {
				// Preserve existing span and merge attributes (entire text is selected)
				span = parent;

				// PRESERVE existing inline attributes that caller isn't explicitly setting
				const attributesToPreserve = ['data-font-id', 'data-fontsize', 'data-fontsize-min', 'data-fontsize-preferred', 'data-fontsize-max', 'data-fontweight', 'data-letterspacing', 'data-lineheight'];
				const preservedAttributes = {};
				attributesToPreserve.forEach(attr => {
					if (!attributes.hasOwnProperty(attr) && span.hasAttribute(attr)) {
						attributes[attr] = span.getAttribute(attr);
						preservedAttributes[attr] = true;
					}
				});

				// ALWAYS preserve existing features and merge with new ones
				const existingFeatures = span.getAttribute('data-features') || '';
				const existingFeaturesArray = existingFeatures ? existingFeatures.split(',').map(f => f.trim()).filter(f => f) : [];
				let mergedFeatures = [];

				// Merge new attributes
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
						const value = attributes[key];
						if (value !== null && value !== undefined && value !== '') {
							span.setAttribute(key, String(value));
						}
					}
				});

				// If we didn't merge features but there are existing features, preserve them
				if (mergedFeatures.length === 0 && existingFeaturesArray.length > 0) {
					mergedFeatures = existingFeaturesArray;
				}

				// Merge styles (preserve existing + add new)
				if (styleString) {
					const existingStyle = span.getAttribute('style') || '';
					const newStyleObj = {};

					// Parse existing styles
					existingStyle.split(';').forEach(rule => {
						const [prop, value] = rule.split(':').map(s => s.trim());
						if (prop && value) {
							newStyleObj[prop] = value;
						}
					});

					// Map of data attributes to their corresponding style properties
					const stylePropertyMap = {
						'data-font-id': 'font-family',
						'data-fontweight': 'font-weight',
						'data-fontsize': 'font-size',
						'data-letterspacing': 'letter-spacing',
						'data-lineheight': 'line-height'
					};

					// Parse new styles (don't overwrite preserved attributes)
					styleString.split(';').forEach(rule => {
						const [prop, value] = rule.split(':').map(s => s.trim());
						if (prop && value) {
							// Special case: always override font-family when setting new font
							if (prop === 'font-family' && attributes.hasOwnProperty('data-font-id')) {
								newStyleObj[prop] = value;
								return;
							}

							// Check if this style property corresponds to a preserved attribute
							let shouldPreserveExisting = false;
							for (const [dataAttr, styleProp] of Object.entries(stylePropertyMap)) {
								if (preservedAttributes[dataAttr] && prop === styleProp) {
									shouldPreserveExisting = true;
									break;
								}
							}

							// Only overwrite if not preserved
							if (!shouldPreserveExisting) {
								newStyleObj[prop] = value;
							}
						}
					});

					// CRITICAL: Rebuild font-feature-settings with ALL features (existing + new)
					if (mergedFeatures.length > 0) {
						const featureSettings = mergedFeatures.map(f => `"${f}" 1`).join(', ');
						newStyleObj['font-feature-settings'] = featureSettings;
					}

					const mergedStyle = Object.entries(newStyleObj)
						.map(([prop, value]) => `${prop}: ${value}`)
						.join('; ');
					span.setAttribute('style', mergedStyle);
				}

				// Text stays the same, we're just updating attributes
				return { success: true, content: container.innerHTML, error: null };
			} else {
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
		return defaultResult;
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

	if (capturedSelection && typeof capturedSelection.start === 'number' && typeof capturedSelection.end === 'number') {
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

	// Parse and update style attribute
	const currentStyle = span.getAttribute('style') || '';
	const styleObj = {};

	currentStyle.split(';').forEach(rule => {
		const [prop, value] = rule.split(':').map(s => s.trim());
		if (prop && value && prop !== styleProperty) {
			styleObj[prop] = value;
		}
	});

	// Rebuild style string if there are remaining styles, otherwise remove style attribute
	if (Object.keys(styleObj).length > 0) {
		const newStyle = Object.entries(styleObj)
			.map(([prop, value]) => `${prop}: ${value}`)
			.join('; ');
		span.setAttribute('style', newStyle);
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

	const hasAnyAttributes = hasFeatures || hasFontId || hasFontSize ||
	                         hasFontWeight || hasLetterSpacing || hasLineHeight;

	if (!hasAnyAttributes && Object.keys(styleObj).length === 0) {
		return true; // Signal to unwrap span
	}

	return false;
}

/**
 * Remove specific property from selected text's spans
 * Unwraps spans that have no remaining attributes
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
 * @since 1.4.0
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

// Expose utility functions for cross-module use (block-editor.js uses CommonJS/Browserify)
if (typeof window !== 'undefined') {
	window.typostSharedUtils = {
		buildTextOffsetMap,
		parseInlineStylesAtCursor,
		parseInlineFeaturesAtCursor,
		parseInlineFontFamilyAtCursor,
		filterFeaturesByVisibility
	};
}
