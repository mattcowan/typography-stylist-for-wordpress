/**
 * Typography Stylist Block - remove all styling from a block (#411).
 *
 * The one action behind "Remove all styling" in the block toolbar
 * (strip-styles-button.js) and "Reset Entire Block" in the sidebar
 * (qft/reset-actions.js): the content loses its inline formats
 * (strip-content.js) and the block goes back to the theme's look
 * (assets/js/theme-look.js), in one setAttributes call, so one undo step
 * restores the block.
 */

import { speak } from '@wordpress/a11y';
import { __ } from '@wordpress/i18n';
import { buildThemeLookAttributes } from '../../../assets/js/theme-look.js';
import { stripBlockContent } from './strip-content';

/**
 * The attribute changes that remove all styling from a block.
 *
 * Kept: the text, its line breaks and links, the tag, the wide or full width
 * setting, the anchor, the size unit and the screen reader class (see
 * THEME_LOOK_KEPT_ATTRIBUTES).
 *
 * @param {*} content The block's content
 * @return {Object} Attributes for one setAttributes() call
 */
export function buildStripStylesAttributes(content) {
	return {
		...buildThemeLookAttributes(),
		content: stripBlockContent(content)
	};
}

/**
 * Remove all styling from a block and tell a screen reader user.
 *
 * @param {Object}   args
 * @param {*}        args.content       The block's content
 * @param {Function} args.setAttributes The block's setAttributes
 */
export function stripBlockStyles({ content, setAttributes }) {
	setAttributes(buildStripStylesAttributes(content));
	speak(__('All styling removed from the block.', 'typography-stylist'), 'polite');
}
