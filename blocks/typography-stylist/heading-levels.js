/**
 * The tags of the block's "Change heading level" menu, with their names and
 * icons (#409).
 *
 * The tag values come from assets/js/new-block-tag.js (HEADING_LEVEL_TAGS),
 * which the remembered new-block tag (#410) also reads, so the menu and the
 * remembered tag accept the same tags. This module adds each tag's name and
 * icon. The toolbar button is built from it in
 * components/heading-level-toolbar.js.
 *
 * @since 2.4.0
 */

import { __, sprintf } from '@wordpress/i18n';
import { HEADING_LEVEL_TAGS } from '../../assets/js/new-block-tag.js';

/**
 * PLACEHOLDER ICONS. The final artwork is a swash outline for each tag, in
 * the style of the swash "T", "G" and "P" of the toolbar
 * (assets/images/icons/toolbar-t.svg, -g.svg, -p.svg). Its sources go into
 * assets/images/icons/ beside those (for example toolbar-h1.svg …
 * toolbar-h6.svg, toolbar-paragraph.svg, toolbar-div.svg), as outlines only:
 * no font ships for an icon.
 *
 * To put the artwork in, replace the path data below with the `d` of each
 * source file (and HEADING_LEVEL_ICON_VIEWBOX, if the sources use another
 * viewBox). Nothing else changes: the button, the menu and the tests read
 * the icons from here. Each icon is one filled path in currentColor, like
 * the "T", "G" and "P".
 *
 * Each icon is drawn as ONE <path> with the default (nonzero) fill rule.
 * Flatten a compound shape into one path, and do not rely on
 * fill-rule="evenodd" in the source: the counters of a "4", a "6" or a "P"
 * would be filled. Keep the letters at the height of the "T", "G" and "P"
 * (about y 20 to 236 in a 256 viewBox), so the toolbar group keeps one cap
 * height.
 *
 * The placeholders are block letters ("H" and a digit, a pilcrow for
 * Paragraph, "DIV"), drawn as paths because SVG text depends on the fonts
 * of the computer. They fill y 20 to 236 of the viewBox, the height of the
 * "T", "G" and "P" (measured in the toolbar: 20–237, 19–235, 20–231), so
 * the toolbar group keeps one cap height.
 */
export const HEADING_LEVEL_ICON_VIEWBOX = '0 0 256 256';

// Strokes of the placeholder letters, as rectangles (all clockwise, so they
// join under the nonzero fill rule)
const H = 'M24 20h28v216h-28zM88 20h28v216h-28zM24 114h92v28h-92z';
const SEGMENT = {
	top: 'M140 20h92v28h-92z',
	upperRight: 'M204 20h28v122h-28z',
	lowerRight: 'M204 114h28v122h-28z',
	bottom: 'M140 208h92v28h-92z',
	lowerLeft: 'M140 114h28v122h-28z',
	upperLeft: 'M140 20h28v122h-28z',
	middle: 'M140 114h92v28h-92z'
};
const digit = (...segments) => segments.map((name) => SEGMENT[name]).join('');

export const HEADING_LEVEL_ICON_PATHS = {
	h1: H + 'M180 20h28v216h-28zM156 20h52v28h-52zM156 208h76v28h-76z',
	h2: H + digit('top', 'upperRight', 'middle', 'lowerLeft', 'bottom'),
	h3: H + digit('top', 'upperRight', 'lowerRight', 'bottom') + 'M164 114h68v28h-68z',
	h4: H + digit('upperLeft', 'upperRight', 'middle', 'lowerRight'),
	h5: H + digit('top', 'upperLeft', 'middle', 'lowerRight', 'bottom'),
	h6: H + digit('top', 'upperLeft', 'middle', 'lowerLeft', 'lowerRight', 'bottom'),
	// A pilcrow, as core uses for paragraphs (a "P" would look like the
	// Paragraph Styles button beside it)
	p: 'M117 144A62 62 0 0 1 117 20zM117 20h28v216h-28zM169 20h28v216h-28zM117 20h80v28h-80z',
	// "DIV"
	div: 'M16 20H56L80 44V212L56 236H16zM38 42V214H47L58 203V53L47 42z' +
		'M96 20h64v22h-64zM96 214h64v22h-64zM117 20h22v216h-22z' +
		'M176 20H198L208 184L218 20H240L220 236H196z'
};

/**
 * The icon of one tag: a 24 × 24 inline SVG in currentColor, hidden from the
 * accessibility tree (the button and the menu items carry the name).
 *
 * @param {string} tag Tag value (h1 … h6, p, div)
 * @return {Element|null} The SVG element, or null for a tag with no icon
 */
export function renderHeadingLevelIcon(tag) {
	const d = Object.prototype.hasOwnProperty.call(HEADING_LEVEL_ICON_PATHS, tag) ? HEADING_LEVEL_ICON_PATHS[tag] : null;
	if (!d) {
		return null;
	}
	return (
		<svg
			width={24}
			height={24}
			viewBox={HEADING_LEVEL_ICON_VIEWBOX}
			xmlns="http://www.w3.org/2000/svg"
			aria-hidden="true"
			focusable="false"
			className={`typost-heading-level-icon typost-heading-level-icon--${tag}`}
		>
			<path d={d} fill="currentColor" />
		</svg>
	);
}

/**
 * The name of each tag, translated at call time (render), as the menu
 * always did. Literal strings, so the translation tools find them.
 *
 * @return {Object} Tag value → name
 */
function getHeadingLevelNames() {
	return {
		h1: __('Heading 1', 'typography-stylist'),
		h2: __('Heading 2', 'typography-stylist'),
		h3: __('Heading 3', 'typography-stylist'),
		h4: __('Heading 4', 'typography-stylist'),
		h5: __('Heading 5', 'typography-stylist'),
		h6: __('Heading 6', 'typography-stylist'),
		p: __('Paragraph', 'typography-stylist'),
		div: __('Div', 'typography-stylist')
	};
}

/**
 * The menu's tags in menu order, each with its name and icon.
 *
 * @return {{value: string, name: string, icon: Element}[]} The tags
 */
export function getHeadingLevels() {
	const names = getHeadingLevelNames();
	return HEADING_LEVEL_TAGS.map((value) => ({
		value,
		name: names[value],
		icon: renderHeadingLevelIcon(value)
	}));
}

/**
 * The menu entry of a tag, or null for a tag the menu does not have (a
 * hand-edited block can store any string).
 *
 * @param {*} tag Stored tagName
 * @return {{value: string, name: string, icon: Element}|null} The entry
 */
export function findHeadingLevel(tag) {
	return getHeadingLevels().find((level) => level.value === tag) || null;
}

/**
 * What the toolbar button shows for the block's tag, and its accessible
 * name.
 *
 * The icon is the only place a sighted author sees the tag, so the name
 * carries it too ("Change heading level (current: Heading 4)"); the tooltip
 * shows the same text. A tag the menu does not have keeps the "heading"
 * dashicon the button showed before #409 and names the stored value, so a
 * hand-edited block still has a working menu. No tag at all (undefined) is
 * the block.json default, h2.
 *
 * @param {*} tagName The block's tagName attribute
 * @return {{icon: (Element|string), label: string}} Button icon and name
 */
export function getHeadingLevelButton(tagName) {
	const tag = tagName === undefined || tagName === null || tagName === '' ? 'h2' : String(tagName);
	const level = findHeadingLevel(tag);
	return {
		icon: level ? level.icon : 'heading',
		label: sprintf(
			/* translators: %s: the block's current tag, for example "Heading 2", "Paragraph" or "Div" */
			__('Change heading level (current: %s)', 'typography-stylist'),
			level ? level.name : tag
		)
	};
}
