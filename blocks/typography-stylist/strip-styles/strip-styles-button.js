/**
 * Typography Stylist Block - "Remove all styling" in the block toolbar (#411).
 *
 * A real component (it keeps the confirmation's open state), rendered as
 * <StripStylesButton /> at the end of the block's BlockControls in edit.js.
 * It lives here, not in components/, because the files there are render
 * functions that must not call hooks
 * (__tests__/render-functions-no-hooks.test.js).
 *
 * The button runs the same action as "Reset Entire Block" in the sidebar
 * (strip-styles.js), which Edit passes in as onStrip. When the Options tab's
 * "clear confirmation" setting is on (typostData.showClearConfirmation), a
 * dialog asks first. The dialog is a Modal: it has a name (its title) and a
 * description (the body text, through aria-describedby), takes
 * focus when it opens, closes on Escape and Cancel, and returns focus to the
 * button when it closes. Its class name starts with "typost-", so the
 * plugin's modal focus guard (installModalFocusGuard() in utils.js) keeps
 * focus inside it. It has no Notice, so nothing is spoken before its name.
 */

import { ToolbarGroup, ToolbarButton, Modal, Button } from '@wordpress/components';
import { useState } from '@wordpress/element';
import { useInstanceId } from '@wordpress/compose';
import { __ } from '@wordpress/i18n';
import { isFlagEnabled } from '../../../assets/js/inline-editor/sanitize.js';

/**
 * Toolbar icon: a "T" with an eraser. Draft artwork (#411); the final mark
 * may replace it.
 */
const StripStylesIcon = () => (
	<svg width={24} height={24} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
		<path d="M4 4h12v2.5h-4.75V19h-2.5V6.5H4z" fill="currentColor" />
		<path d="M17.6 11.4l3.9 3.9-4.2 4.2h-3.6l-1.9-1.9zm-3.3 6.6h2.4l.9-.9-1.8-1.8-1.6 1.6z" fill="currentColor" />
	</svg>
);

/**
 * Whether the action asks first: the Options tab's "clear confirmation"
 * setting. Parsed with isFlagEnabled(), because a localized value can arrive
 * as the string "0" (project CLAUDE.md, "Boolean flags in typostData").
 *
 * @param {Object} [data] window.typostData
 * @return {boolean} True when a confirmation dialog opens first
 */
export function shouldConfirmStripStyles(data) {
	return isFlagEnabled(data ? data.showClearConfirmation : undefined);
}

/**
 * The toolbar group with the button and its confirmation dialog.
 *
 * @param {Object}   props
 * @param {Function} props.onStrip Removes all styling from the block
 * @return {Element} The toolbar group
 */
export default function StripStylesButton({ onStrip }) {
	const [isConfirmOpen, setIsConfirmOpen] = useState(false);
	// The dialog's description (aria-describedby: Modal's `aria` prop, there
	// since WordPress 5.8 and before)
	const descriptionId = `typost-strip-styles-description-${useInstanceId(StripStylesButton)}`;
	const asksFirst = shouldConfirmStripStyles(window.typostData);

	const handleClick = () => {
		if (shouldConfirmStripStyles(window.typostData)) {
			setIsConfirmOpen(true);
			return;
		}
		onStrip();
	};

	// The Modal returns focus to the button it was opened from when it closes
	const closeConfirm = () => setIsConfirmOpen(false);
	const confirm = () => {
		setIsConfirmOpen(false);
		onStrip();
	};

	return (
		<ToolbarGroup>
			<ToolbarButton
				icon={StripStylesIcon}
				label={__('Remove all styling', 'typography-stylist')}
				aria-haspopup={asksFirst ? 'dialog' : undefined}
				onClick={handleClick}
				className="typost-strip-styles-button"
			/>
			{isConfirmOpen && (
				<Modal
					title={__('Remove all styling?', 'typography-stylist')}
					onRequestClose={closeConfirm}
					className="typost-strip-styles-modal"
					aria={{ describedby: descriptionId }}
				>
					<p id={descriptionId} style={{ marginTop: 0, maxWidth: '36em' }}>
						{__('This removes all styling from the block: text formats such as bold and italic, the inline features, the block-level settings (font, size, features, spacing, and more), the paragraph style, colors, text alignment and the extra CSS class. The text stays, with its links, line breaks, footnotes, images, subscript and superscript. To undo, press Ctrl+Z (Cmd+Z on Mac).', 'typography-stylist')}
					</p>
					<div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
						<Button variant="tertiary" onClick={closeConfirm}>
							{__('Cancel', 'typography-stylist')}
						</Button>
						<Button variant="primary" isDestructive onClick={confirm}>
							{__('Remove styling', 'typography-stylist')}
						</Button>
					</div>
				</Modal>
			)}
		</ToolbarGroup>
	);
}
