/**
 * Typography Stylist Block - the Line Height panel in the block sidebar.
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
 * Block-level line height.
 *
 * @param {Object} props Values, state and handlers from Edit, by name.
 * @return {Element} The panel.
 */
export default function renderLineHeightPanel(props) {
	const {
		lineHeight, setAttributes
	} = props;

	return (
		<PanelBody title={__('Line Height', 'typography-stylist')} initialOpen={false}>
			<p style={{ fontSize: '12px', color: '#757575', marginTop: 0, marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #ddd' }}>
				{__('This control applies line height to the entire block. To change the line height of selected text, select it and click “Typography Stylist Features” in the block toolbar.', 'typography-stylist')}
			</p>
			<RangeControl
				value={lineHeight === 0 ? 1.5 : lineHeight}
				onChange={(value) => setAttributes({ lineHeight: value })}
				min={0.5}
				max={3}
				step={0.1}
				help={lineHeight === 0 ? __('Currently using browser default', 'typography-stylist') : lineHeight}
				allowReset
				resetFallbackValue={0}
				marks={[
					{ value: 1.5, label: '1.5' }
				]}
				renderTooltipContent={(value) => lineHeight === 0 ? __('Browser default', 'typography-stylist') : value}
			/>
		</PanelBody>
	);
}
