/**
 * Read styled spans out of a Typography Stylist block's HTML content, for
 * the inline editor's getters when the selection is inside such a block.
 *
 * Moved out of TypographyFeaturesControl.getStyledSpanAtSelection() and
 * getInlineFeaturesForTypostBlock() in block-editor.js (#357).
 *
 * @since 2.4.0
 */
const { buildTextOffsetMap } = require('../text-offsets.js');

/**
 * The innermost styled span (the smallest one) that holds the cursor, or
 * that overlaps the selection.
 *
 * @param {string} content HTML content of the block
 * @param {number} start   Selection start offset
 * @param {number} end     Selection end offset
 * @return {Element|null} The span, in a detached parsed document, or null
 */
function findStyledSpanInContent(content, start, end) {
    // Allow cursor position (start === end) as well as selections
    // This lets us detect features at the cursor position

    // Parse the HTML to find styled spans
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
    const container = doc.body.firstChild;

    // Find all styled spans
    const styledSpans = container.querySelectorAll('span.typost-styled');

    // Find the smallest (most specific/innermost) span that matches
    let smallestMatchingSpan = null;
    let smallestSpanSize = Infinity;

    // Build offset map once (accounts for <br> line breaks)
    const textNodeMap = buildTextOffsetMap(container, doc);

    // Calculate character offset for each span
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

        // Check if the selection overlaps with this span
        // For cursor position (start === end), check if cursor is inside the span
        // For selection (start !== end), check if selection overlaps with span
        const isCursor = start === end;
        const isInside = isCursor && found && start >= spanStart && start <= spanEnd;
        const overlaps = !isCursor && found && start < spanEnd && end > spanStart;

        if (found && (isInside || overlaps)) {
            const spanSize = spanEnd - spanStart;

            // Keep track of the smallest matching span
            if (spanSize < smallestSpanSize) {
                smallestMatchingSpan = span;
                smallestSpanSize = spanSize;
            }
        }
    }

    return smallestMatchingSpan;
}

/**
 * The feature tags a styled span carries: data-features, else (content
 * from before that attribute existed) the tags in its
 * font-feature-settings declaration.
 *
 * @param {Element|null} styledSpan Span from findStyledSpanInContent()
 * @return {string[]} Feature tags
 */
function readSpanFeatures(styledSpan) {
    if (styledSpan) {
        // Extract features from data attribute (preferred - faster and more reliable)
        const dataFeatures = styledSpan.getAttribute('data-features');
        if (dataFeatures) {
            return dataFeatures.split(',');
        }

        // Fallback: parse from style attribute
        // For backward compatibility with content created before data-features attribute was added
        // All new content (created after this change) will have data-features set
        const style = styledSpan.getAttribute('style') || '';
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
    }

    return [];
}

module.exports = {
    findStyledSpanInContent: findStyledSpanInContent,
    readSpanFeatures: readSpanFeatures
};
