/**
 * The block toolbar's "Change heading level" button and menu (#409, #410).
 *
 * A render function, called by Edit as renderHeadingLevelToolbar({...}), so
 * it must not call hooks (__tests__/render-functions-no-hooks.test.js).
 *
 * The button shows the icon of the block's current tag and names the tag
 * (getHeadingLevelButton). The menu lists every tag with its icon and name;
 * the current one is marked (is-active) and, as in core's heading level
 * menu, exposed as a checked menuitemradio. Picking a tag writes tagName as
 * before and remembers it for the next block from the inserter
 * (rememberNewBlockTag; Heading 1 is not remembered).
 *
 * @since 2.4.0
 */

import { __ } from '@wordpress/i18n';
import { ToolbarGroup, ToolbarDropdownMenu } from '@wordpress/components';
import { getHeadingLevels, getHeadingLevelButton } from '../heading-levels';
import { rememberNewBlockTag } from '../../../assets/js/new-block-tag.js';

/**
 * The menu's controls for a block.
 *
 * @param {string}   tagName       The block's tagName attribute
 * @param {Function} setAttributes The block's setAttributes
 * @return {Object[]} Controls for ToolbarDropdownMenu
 */
export function buildHeadingLevelControls(tagName, setAttributes) {
	return getHeadingLevels().map((level) => ({
		title: level.name,
		icon: level.icon,
		isActive: tagName === level.value,
		role: 'menuitemradio',
		onClick: () => {
			setAttributes({ tagName: level.value });
			rememberNewBlockTag(level.value);
		}
	}));
}

/**
 * @param {Object}   props
 * @param {string}   props.tagName       The block's tagName attribute
 * @param {Function} props.setAttributes The block's setAttributes
 * @return {Element} The toolbar group
 */
export default function renderHeadingLevelToolbar({ tagName, setAttributes }) {
	const button = getHeadingLevelButton(tagName);
	return (
		<ToolbarGroup>
			<ToolbarDropdownMenu
				icon={button.icon}
				label={button.label}
				menuProps={{ 'aria-label': __('Change heading level', 'typography-stylist') }}
				controls={buildHeadingLevelControls(tagName, setAttributes)}
			/>
		</ToolbarGroup>
	);
}
