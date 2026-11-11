/**
 * Typography Stylist Block - the Reset Features panel in the block sidebar.
 *
 * Moved out of edit.js unchanged (#356), with renderResetPanelContent(),
 * which only this panel calls. It is a render function, not a component:
 * Edit calls it at the place in its render where this markup was, so the
 * markup and every translation call in it are evaluated exactly when and as
 * often as before. It must not call hooks: it runs inside Edit's render
 * (__tests__/render-functions-no-hooks.test.js).
 */

import { Button, PanelBody } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

/**
 * Clear the inline features or reset the whole block, each after a
 * confirmation.
 *
 * @param {Object} props Values, state and handlers from Edit, by name.
 * @return {Element} The panel.
 */
export default function renderResetPanel(props) {
	const {
		showInlineResetConfirm, setShowInlineResetConfirm, showFullResetConfirm, setShowFullResetConfirm,
		clearAllInlineFeatures, resetEntireBlock
	} = props;

	// Render reset panel content based on confirmation state
	const renderResetPanelContent = () => {
		// Show confirmation for clearing inline features
		if (showInlineResetConfirm) {
			return (
				<div style={{ padding: '16px', backgroundColor: '#fff3cd', border: '1px solid #ffc107', borderRadius: '4px' }}>
					<p style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, color: '#856404' }}>
						⚠️ {__('Are you sure?', 'typography-stylist')}
					</p>
					<p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#856404' }}>
						{__('This will remove all inline features (typost-styled spans) from this block. Block-level settings will remain.', 'typography-stylist')}
					</p>
					<div style={{ display: 'flex', gap: '8px' }}>
						<Button
							variant="primary"
							isDestructive
							onClick={clearAllInlineFeatures}
							style={{ flex: 1 }}
						>
							{__('Yes, Clear', 'typography-stylist')}
						</Button>
						<Button
							variant="secondary"
							onClick={() => setShowInlineResetConfirm(false)}
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
					<p style={{ margin: '0 0 12px 0', fontSize: '13px', fontWeight: 600, color: '#a00' }}>
						🚨 {__('Reset Entire Block?', 'typography-stylist')}
					</p>
					<p style={{ margin: '0 0 16px 0', fontSize: '12px', color: '#a00' }}>
						{__('This resets the whole block. It removes the inline features and all block-level settings (font, features, spacing, and more). To undo, press Ctrl+Z (Cmd+Z on Mac).', 'typography-stylist')}
					</p>
					<div style={{ display: 'flex', gap: '8px' }}>
						<Button
							variant="primary"
							isDestructive
							onClick={resetEntireBlock}
							style={{ flex: 1 }}
						>
							{__('Yes, Reset All', 'typography-stylist')}
						</Button>
						<Button
							variant="secondary"
							onClick={() => setShowFullResetConfirm(false)}
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
					variant="secondary"
					isDestructive
					onClick={() => setShowInlineResetConfirm(true)}
					style={{ marginBottom: '12px', width: '100%', justifyContent: 'center' }}
				>
					{__('Clear Individual Features', 'typography-stylist')}
				</Button>
				<p style={{ fontSize: '11px', color: '#666', margin: '0 0 16px 0' }}>
					{__('Removes all inline features (typost-styled spans) but keeps block-level settings.', 'typography-stylist')}
				</p>

				<Button
					variant="secondary"
					isDestructive
					onClick={() => setShowFullResetConfirm(true)}
					style={{ width: '100%', justifyContent: 'center' }}
				>
					{__('Reset Entire Block', 'typography-stylist')}
				</Button>
				<p style={{ fontSize: '11px', color: '#666', margin: '8px 0 0 0' }}>
					{__('Clears the inline features and the block-level settings (font, features, spacing, and more).', 'typography-stylist')}
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
