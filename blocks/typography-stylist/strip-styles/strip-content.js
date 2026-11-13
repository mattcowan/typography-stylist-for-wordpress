/**
 * Typography Stylist Block - the content of a block with all styling removed
 * (#411).
 *
 * Removes every Typography Stylist span and every inline format, and keeps
 * the text, the line breaks and the links (the `<a>` element with the
 * attributes core's link format writes, not its styling). Used by "Remove
 * all styling" in the block toolbar and by "Reset Entire Block" in the
 * sidebar (strip-styles.js).
 *
 * What happens to each inline format RichText allows in this block:
 *
 * - Removed, text kept: Typography Stylist spans, bold, italic, underline,
 *   strikethrough, inline code, keyboard input, highlight and text color
 *   (`mark.has-inline-color`), and any other element (an unknown span, a
 *   pasted `<font>`, `<del>` or `<ins>`).
 * - Kept, with the formats inside it removed and only the attributes in
 *   KEPT_ATTRIBUTES: links, subscript and superscript (removing them changes
 *   the text: 10<sup>3</sup> would read 103), language (`bdo` with lang and
 *   dir: removing it changes how the text is read and in which direction it
 *   is shown), abbreviations (`abbr`: the title holds the expansion) and notes
 *   (`mark.wp-note`: the note in the editor points at it).
 * - Kept exactly as they are, attributes and all: inline images (core's image
 *   format writes their size as a style; src, alt and class are the image),
 *   footnote anchors (`sup[data-fn]`, written by core and not editable as
 *   text; the Footnotes block lists them by their ID) and formulas (`math`,
 *   `svg`: their markup is the content). Nothing is added to them, so markup
 *   that was inert stays inert; `script` and `style` inside them still go.
 * - Dropped with their content: `script` and `style` (no text a reader
 *   sees). A `template` writes nothing either: DOMParser keeps its content
 *   out of childNodes, so unwrapping it leaves nothing.
 *
 * Comments are dropped. The result is written as RichText writes content:
 * text with `&` and `<` escaped, attributes with escapeAttribute(), so the
 * stored string is what the editor would store after an edit.
 */

import { escapeAttribute, escapeEditableHTML } from '@wordpress/escape-html';

// Elements removed with their content
const DROPPED = new Set(['script', 'style']);

// Elements kept, with the formats inside them removed
const KEPT = new Set(['a', 'br', 'sub', 'sup', 'bdo', 'abbr']);

// Elements without an end tag
const VOID = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'source', 'track', 'wbr']);

/**
 * Whether an element is kept exactly as it is, with everything inside it.
 *
 * @param {Element} el Element
 * @return {boolean} True for inline images, formulas and footnote anchors
 */
function isKeptWhole(el) {
	const name = el.localName;
	return name === 'img' || name === 'math' || name === 'svg' || (name === 'sup' && el.hasAttribute('data-fn'));
}

/**
 * Whether an element is kept, with the formats inside it removed.
 *
 * @param {Element} el Element
 * @return {boolean} True for links, line breaks, subscript, superscript,
 *                   language, abbreviations and notes
 */
function isKept(el) {
	return KEPT.has(el.localName) || (el.localName === 'mark' && el.classList.contains('wp-note'));
}

/**
 * The attributes a kept element keeps: the ones WordPress's own format for
 * that element writes and reads back (read in WordPress 7.1.3,
 * format-library: core/link `url` → href, `type` → data-type, `id` →
 * data-id, `_id` → id, `target`, `rel`; core/language `lang`, `dir`;
 * core/subscript and core/superscript none; the editor's core/note
 * `data-id`). `abbr` keeps its `title`, the expansion. Everything else goes:
 * `style`, `class` (the link's own CSS classes too: styling), event
 * attributes and the plugin's `data-*`. A note keeps exactly
 * `class="wp-note"`, which is what makes it a note.
 */
const KEPT_ATTRIBUTES = {
	// Core's link attributes, plus the ones that carry meaning, not styling:
	// the accessible name and description, the title, the language of the
	// target and the download name (round 2 review)
	a: ['href', 'target', 'rel', 'id', 'data-type', 'data-id', 'aria-label', 'aria-describedby', 'title', 'hreflang', 'download', 'lang'],
	br: [],
	sub: [],
	sup: [],
	bdo: ['lang', 'dir'],
	abbr: ['title'],
	mark: ['data-id'],
};

/**
 * The element's start tag.
 *
 * @param {Element}   el      Element
 * @param {?string[]} allowed Attribute names to keep, or null for every
 *                            attribute (an element kept whole)
 * @return {string} `<name attr="value">`
 */
function startTag(el, allowed) {
	let tag = '<' + el.localName;
	if (allowed && el.localName === 'mark') {
		tag += ' class="wp-note"';
	}
	Array.prototype.forEach.call(el.attributes, (attr) => {
		if (allowed && !allowed.includes(attr.name)) {
			return;
		}
		tag += ` ${attr.name}="${escapeAttribute(attr.value)}"`;
	});
	return tag + '>';
}

/**
 * Serialize a node, removing the formats when `strip` is true.
 *
 * @param {Node}    node  Node
 * @param {boolean} strip Remove inline formats inside this node
 * @return {string} HTML
 */
function serialize(node, strip) {
	if (node.nodeType === 3) {
		return escapeEditableHTML(node.nodeValue);
	}
	if (node.nodeType !== 1) {
		// Comments, processing instructions
		return '';
	}
	const name = node.localName;
	if (DROPPED.has(name)) {
		return '';
	}
	const keepWhole = !strip || isKeptWhole(node);
	const children = () => Array.prototype.map.call(node.childNodes, (child) => serialize(child, !keepWhole)).join('');
	if (keepWhole || isKept(node)) {
		return startTag(node, keepWhole ? null : KEPT_ATTRIBUTES[name]) + (VOID.has(name) ? '' : children() + `</${name}>`);
	}
	// Any other element: keep its text, drop the element
	return children();
}

/**
 * The block content with every Typography Stylist span and inline format
 * removed. Text, line breaks and links stay; see the file comment for each
 * format.
 *
 * Safe with any input: unclosed markup is closed as a browser would close
 * it, entities are decoded and written again, and DOMParser runs no script
 * and loads nothing. Accepts a RichTextData object (WordPress 6.5+).
 *
 * @param {*} html Block content
 * @return {string} The stripped content ('' for an empty, null or undefined input)
 */
export function stripBlockContent(html) {
	const source = (html === null || html === undefined) ? '' : String(html);
	if (source === '') {
		return '';
	}
	const body = new DOMParser().parseFromString(`<!DOCTYPE html><html><body>${source}</body></html>`, 'text/html').body;
	if (!body) {
		return '';
	}
	return Array.prototype.map.call(body.childNodes, (child) => serialize(child, true)).join('');
}

export default stripBlockContent;
