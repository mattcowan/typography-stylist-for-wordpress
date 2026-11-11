/**
 * Text offsets in serialized RichText HTML
 *
 * Maps the text nodes (and <br> elements) of a DOM container to the
 * character offsets a WordPress RichText value uses, where each <br>
 * counts as one position.
 *
 * Shared by the inline editor (assets/js/block-editor.js, bundled with
 * browserify) and the Typography Stylist block (blocks/typography-stylist/,
 * bundled with wp-scripts; utils.js re-exports both functions). The inline
 * editor kept its own copy of buildTextOffsetMap() until #357, because the
 * two builds were thought not to share code.
 *
 * @since 2.4.0
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
function buildTextOffsetMap(container, docContext) {
	return walkTextOffsets(container, docContext).text;
}

/**
 * Offsets of the <br> elements inside a container, in the same coordinate
 * space as buildTextOffsetMap(): each break occupies one position, as it
 * does in a WordPress RichText value. Kept apart from the text map because
 * that map's consumers read entry.text and entry.node.nodeValue.
 *
 * @param {Element}  container  Container element
 * @param {Document} docContext Document that owns the container
 * @returns {Array<{node: Element, start: number, end: number}>}
 */
function buildBreakOffsetMap(container, docContext) {
	return walkTextOffsets(container, docContext).breaks;
}

function walkTextOffsets(container, docContext) {
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
	const breaks = [];
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
			breaks.push({ node: node, start: currentOffset, end: currentOffset + 1 });
			currentOffset += 1;
		}
	}

	return { text: map, breaks: breaks };
}

module.exports = {
	buildTextOffsetMap: buildTextOffsetMap,
	buildBreakOffsetMap: buildBreakOffsetMap
};
