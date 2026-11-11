/**
 * Typography Stylist Block - the Letter Spacing panel in the block sidebar.
 *
 * Moved out of edit.js unchanged (#356). A render function, not a component:
 * Edit calls it at the place in its render where this markup was, so
 * the markup and every filter and translation call in it are evaluated
 * exactly when and as often as before. It must not call hooks: it runs inside
 * Edit's render, some calls only on a condition
 * (__tests__/render-functions-no-hooks.test.js).
 */

import { PanelBody, RangeControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

/**
 * Block-level letter spacing.
 *
 * @param {Object} props Values, state and handlers from Edit, by name.
 * @return {Element} The panel.
 */
export default function renderLetterSpacingPanel(props) {
	const {
		letterSpacing, setAttributes
	} = props;

	return (
		<PanelBody title={__('Letter Spacing', 'typography-stylist')} initialOpen={false}>
			<p style={{ fontSize: '12px', color: '#757575', marginTop: 0, marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #ddd' }}>
				{__('This control applies letter spacing to the entire block. To change the letter spacing of selected text, select it and click “Typography Stylist Features” in the block toolbar.', 'typography-stylist')}
			</p>
			<RangeControl
				value={letterSpacing}
				onChange={(value) => setAttributes({ letterSpacing: value })}
				min={-200}
				max={200}
				step={1}
				help={letterSpacing === 0 ? __('Normal', 'typography-stylist') : `${letterSpacing / 1000}em`}
				allowReset
				resetFallbackValue={0}
			/>
		</PanelBody>
	);
}
