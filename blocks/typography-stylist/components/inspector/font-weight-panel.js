/**
 * Typography Stylist Block - the Font Weight panel in the block sidebar.
 *
 * Moved out of edit.js unchanged (#356). A render function, not a component:
 * Edit calls it at the place in its render where this markup was, so
 * the markup and every filter and translation call in it are evaluated
 * exactly when and as often as before. It must not call hooks: it runs inside
 * Edit's render, some calls only on a condition
 * (__tests__/render-functions-no-hooks.test.js).
 */

import { PanelBody, SelectControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { buildSidebarWeightOptions, shouldShowWeightPanel } from '../../strip-styles/theme-default-weight';

/**
 * Block font weight, limited to the weights the font has, after a "Theme
 * default" option (fontWeight '', no weight of its own; #411). An extension can
 * replace the control (typost_weight_control filter) or hide it.
 *
 * @param {Object} props Values, state and handlers from Edit, by name.
 * @return {Element} The panel, or null when there is nothing to choose.
 */
export default function renderFontWeightPanel(props) {
	const {
		fontId, fontVariationSettings, fontWeight, getFilteredWeightOptions, setAttributes
	} = props;

	const weightControlType = window.typostHooks
		? window.typostHooks.applyFilters('typost_weight_control', 'default', fontId)
		: 'default';

	// 'hidden': suppress the weight control entirely (no wrapper, no hook)
	if (weightControlType === 'hidden') return null;

	if (weightControlType !== 'default') {
		return (
			<PanelBody title={__('Font Weight', 'typography-stylist')} initialOpen={false}>
				{/* key: remount (and re-fire the action) when the font changes */}
				<div key={`typost-weight-${fontId || 'none'}`} className="typost-hook-point" data-hook="typost_weight_control" ref={(el) => {
					if (el && !el._hooked) {
						el._hooked = true;
						window.typostHooks.doAction('typost_weight_control', el, { fontId, fontWeight, fontVariationSettings: fontVariationSettings || '' });
					}
				}} />
			</PanelBody>
		);
	}

	const sidebarWeightOptions = getFilteredWeightOptions(fontId, false);
	if (!shouldShowWeightPanel(sidebarWeightOptions)) return null;
	// "Theme default" ('') is the weight a block with no weight of its own
	// stores (after Remove all styling, #411): without it the select showed
	// its first option for ''. Choosing it writes '' again.
	return (
		<PanelBody title={__('Font Weight', 'typography-stylist')} initialOpen={false}>
			<SelectControl
				label={__('Font Weight', 'typography-stylist')}
				hideLabelFromVision
				value={fontWeight}
				options={buildSidebarWeightOptions(sidebarWeightOptions, __('Theme default', 'typography-stylist'))}
				onChange={(value) => setAttributes({ fontWeight: value })}
			/>
		</PanelBody>
	);
}
