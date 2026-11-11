/**
 * Typography Stylist Block - the OpenType Features panel in the block sidebar.
 *
 * Moved out of edit.js unchanged (#356). A render function, not a component:
 * Edit calls it at the place in its render where this markup was, so
 * the markup and every filter and translation call in it are evaluated
 * exactly when and as often as before. It must not call hooks: it runs inside
 * Edit's render, some calls only on a condition
 * (__tests__/render-functions-no-hooks.test.js).
 */

import { PanelBody, ToggleControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';

/**
 * Block-level OpenType feature toggles, grouped by category.
 *
 * @param {Object} props Values, state and handlers from Edit, by name.
 * @return {Element} The panel.
 */
export default function renderFeaturesPanel(props) {
	const {
		features, getCategoryTitle, groupedFeatures, toggleBlockFeature
	} = props;

	return (
		<PanelBody title={__('OpenType Features', 'typography-stylist')} initialOpen={true}>
			<p style={{ fontSize: '12px', color: '#757575', marginTop: 0, marginBottom: '8px' }}>
				{__('OpenType features are advanced typographic capabilities built into font files, like ligatures and stylistic alternates. Not all fonts support all features.', 'typography-stylist')}
			</p>
			<p style={{ fontSize: '12px', color: '#757575', marginTop: 0, marginBottom: '16px', paddingBottom: '12px', borderBottom: '1px solid #ddd' }}>
				{__('These controls apply features to the entire block. To apply features to selected text, select it and click “Typography Stylist Features” in the block toolbar.', 'typography-stylist')}
			</p>
			{Object.entries(groupedFeatures).map(([category, categoryFeatures]) => (
				<div key={category} className="typost-feature-category">
					<h4>{getCategoryTitle(category)}</h4>
					{categoryFeatures.map(feature => (
						<ToggleControl
							key={feature.id}
							label={feature.name}
							help={feature.description}
							checked={features.includes(feature.id)}
							onChange={() => toggleBlockFeature(feature.id)}
						/>
					))}
				</div>
			))}
		</PanelBody>
	);
}
