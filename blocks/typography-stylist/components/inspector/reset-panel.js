/**
 * Typography Stylist Block - the Reset Features panel in the block sidebar.
 *
 * Moved out of edit.js unchanged (#356), with renderResetPanelContent(),
 * which only this panel calls. It is a render function, not a component:
 * Edit calls it at the place in its render where this markup was, so the
 * markup and every translation call in it are evaluated exactly when and as
 * often as before. It must not call hooks: it runs inside Edit's render
 * (__tests__/render-functions-no-hooks.test.js).
 *
 * Keyboard focus (#420): each button here removes itself from the page when
 * it is pressed, so each one also says where focus goes next, through
 * `resetFocus` (hooks/use-reset-panel-focus.js, called in Edit). A
 * confirmation that opens focuses its "Cancel", the least destructive
 * choice; "Cancel" carries the question and the message as its description
 * (aria-describedby), so a screen reader reads them with the button. The
 * emoji before each question is aria-hidden: it is decoration, and a screen
 * reader would read its name first.
 * "Cancel", "Yes, Clear" and "Yes, Reset All" give focus back to the button
 * that opened the confirmation; both openers always render. This needs the
 * action to close the confirmation in the same event: the opener is not
 * rendered while the confirmation is open, so a request made before the close
 * finds nothing. clearAllInlineFeatures() therefore always closes it, also
 * when there is nothing to clear (#455).
 */

import { Button, PanelBody } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

// When Edit passes no resetFocus: focus is not moved
const NO_FOCUS = { targetRef: () => undefined, focusAfterRender: () => {} };

/**
 * Clear the inline features or reset the whole block, each after a
 * confirmation.
 *
 * @param {Object} props Values, state and handlers from Edit, by name.
 *                       `clientId` makes the description ids unique;
 *                       `resetFocus` is the return of useResetPanelFocus().
 * @return {Element} The panel.
 */
export default function renderResetPanel(props) {
	const {
		showInlineResetConfirm, setShowInlineResetConfirm, showFullResetConfirm, setShowFullResetConfirm,
		clearAllInlineFeatures, resetEntireBlock, clientId
	} = props;
	const { targetRef, focusAfterRender } = props.resetFocus || NO_FOCUS;
	const inlineTitleId = `typost-reset-inline-title-${clientId}`;
	const inlineMessageId = `typost-reset-inline-message-${clientId}`;
	const fullTitleId = `typost-reset-full-title-${clientId}`;
	const fullMessageId = `typost-reset-full-message-${clientId}`;

	// Render reset panel content based on confirmation state
	const renderResetPanelContent = () => {
		// Show confirmation for clearing inline features
		if (showInlineResetConfirm) {
			return (
				<div style={{ padding: '16px', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px' }}>
					<p id={inlineTitleId} style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, color: '#856404' }}>
						<span aria-hidden="true">⚠️</span> {__('Are you sure?', 'typography-stylist')}
					</p>
					<p id={inlineMessageId} style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#856404' }}>
						{__('This will remove all inline features (typost-styled spans) from this block. Block-level settings will remain.', 'typography-stylist')}
					</p>
					<div style={{ display: 'flex', gap: '8px' }}>
						<Button
							variant="primary"
							isDestructive
							onClick={() => {
								clearAllInlineFeatures();
								focusAfterRender('inlineOpener');
							}}
							style={{ flex: 1 }}
						>
							{__('Yes, Clear', 'typography-stylist')}
						</Button>
						<Button
							ref={targetRef('inlineCancel')}
							variant="secondary"
							aria-describedby={`${inlineTitleId} ${inlineMessageId}`}
							onClick={() => {
								setShowInlineResetConfirm(false);
								focusAfterRender('inlineOpener');
							}}
							style={{ flex: 1 }}
						>
							{__('Cancel', 'typography-stylist')}
						</Button>
					</div>
				</div>
			);
		}

		// Show confirmation for full reset
		if (showFullResetConfirm) {
			return (
				<div style={{ padding: '16px', backgroundColor: '#ffe5e5', border: '1px solid #dc3232', borderRadius: '4px' }}>
					<p id={fullTitleId} style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, color: '#a00' }}>
						<span aria-hidden="true">🚨</span> {__('Reset Entire Block?', 'typography-stylist')}
					</p>
					<p id={fullMessageId} style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#a00' }}>
						{/* The same text as the toolbar's "Remove all styling"
						    dialog (strip-styles-button.js): the same action (#411) */}
						{__('This removes all styling from the block: text formats such as bold and italic, the inline features, the block-level settings (font, size, features, spacing, and more), the paragraph style, colors, text alignment and the extra CSS class. The text stays, with its links, line breaks, footnotes, images, subscript and superscript. To undo, press Ctrl+Z (Cmd+Z on Mac).', 'typography-stylist')}
					</p>
					<div style={{ display: 'flex', gap: '8px' }}>
						<Button
							variant="primary"
							isDestructive
							onClick={() => {
								resetEntireBlock();
								focusAfterRender('fullOpener');
							}}
							style={{ flex: 1 }}
						>
							{__('Yes, Reset All', 'typography-stylist')}
						</Button>
						<Button
							ref={targetRef('fullCancel')}
							variant="secondary"
							aria-describedby={`${fullTitleId} ${fullMessageId}`}
							onClick={() => {
								setShowFullResetConfirm(false);
								focusAfterRender('fullOpener');
							}}
							style={{ flex: 1 }}
						>
							{__('Cancel', 'typography-stylist')}
						</Button>
					</div>
				</div>
			);
		}

		// Default: show both reset buttons
		return (
			<>
				<Button
					ref={targetRef('inlineOpener')}
					variant="secondary"
					isDestructive
					onClick={() => {
						setShowInlineResetConfirm(true);
						focusAfterRender('inlineCancel');
					}}
					style={{ marginBottom: '12px', width: '100%', justifyContent: 'center' }}
				>
					{__('Clear Individual Features', 'typography-stylist')}
				</Button>
				<p style={{ fontSize: '11px', color: '#666', margin: '0 0 16px 0' }}>
					{__('Removes all inline features (typost-styled spans) but keeps block-level settings.', 'typography-stylist')}
				</p>

				<Button
					ref={targetRef('fullOpener')}
					variant="secondary"
					isDestructive
					onClick={() => {
						setShowFullResetConfirm(true);
						focusAfterRender('fullCancel');
					}}
					style={{ width: '100%', justifyContent: 'center' }}
				>
					{__('Reset Entire Block', 'typography-stylist')}
				</Button>
				<p style={{ fontSize: '11px', color: '#666', margin: '8px 0 0 0' }}>
					{__('Removes all styling, so the block looks as the theme styles a heading or paragraph. The text and its links stay. Same as “Remove all styling” in the block toolbar.', 'typography-stylist')}
				</p>
			</>
		);
	};

	return (
		<PanelBody title={__('Reset Features', 'typography-stylist')} initialOpen={false}>
			<p style={{ fontSize: '12px', color: '#757575', marginTop: 0, marginBottom: '16px' }}>
				{__('Clear features and styling applied to this block.', 'typography-stylist')}
			</p>

			{renderResetPanelContent()}
		</PanelBody>
	);
}
