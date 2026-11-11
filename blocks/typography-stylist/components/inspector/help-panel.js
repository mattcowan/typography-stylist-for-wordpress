/**
 * Typography Stylist Block - the Help and Tips panel in the block sidebar.
 *
 * Moved out of edit.js unchanged (#356). A render function, not a component:
 * Edit calls it at the place in its render where this markup was, so
 * the markup and every filter and translation call in it are evaluated
 * exactly when and as often as before. It must not call hooks: it runs inside
 * Edit's render, some calls only on a condition
 * (__tests__/render-functions-no-hooks.test.js).
 */

import { PanelBody } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

/**
 * Static help text about the sidebar and the Quick Feature Toggles.
 *
 * @return {Element} The panel.
 */
export default function renderHelpPanel() {
	return (
		<PanelBody title={__('Help & Tips', 'typography-stylist')} initialOpen={false}>
			<p style={{ fontSize: '13px', lineHeight: '1.6', marginTop: 0 }}>
				{__('The Typography Stylist block provides two levels of control:', 'typography-stylist')}
			</p>
			<ul style={{ fontSize: '13px', lineHeight: '1.6', marginLeft: '16px', listStyleType: 'disc' }}>
				<li><strong>{__('Sidebar controls:', 'typography-stylist')}</strong> {__('Apply settings to the entire block (font, size, weight, features).', 'typography-stylist')}</li>
				<li><strong>{__('Quick Feature Toggles:', 'typography-stylist')}</strong> {__('To style individual words or phrases, select the text and click “Typography Stylist Features” in the block toolbar.', 'typography-stylist')}</li>
			</ul>
			<p style={{ fontSize: '13px', lineHeight: '1.6' }}>
				{__('The block automatically adds a plain text copy of its content for screen readers. No extra setup is needed.', 'typography-stylist')}
			</p>
			<p style={{ fontSize: '12px', lineHeight: '1.5', color: '#757575' }}>
				{__('Tip: By default, fonts added in Settings → Typography Stylist load only on pages that use them.', 'typography-stylist')}
			</p>
		</PanelBody>
	);
}
