/**
 * Typography Stylist Block - the Font Style panel in the block sidebar.
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

/**
 * Block font style (visual italic).
 *
 * @param {Object} props Values, state and handlers from Edit, by name.
 * @return {Element} The panel.
 */
export default function renderFontStylePanel(props) {
	const {
		fontStyle, setAttributes
	} = props;

	return (
		<PanelBody title={__('Font Style', 'typography-stylist')} initialOpen={false}>
			<SelectControl
				value={fontStyle}
				options={[
					{ label: __('Inherit', 'typography-stylist'), value: '' },
					{ label: __('Normal (upright)', 'typography-stylist'), value: 'normal' },
					{ label: __('Italic', 'typography-stylist'), value: 'italic' }
				]}
				onChange={(value) => setAttributes({ fontStyle: value })}
				help={__('Visual style only. This uses the font’s italic face and does not add emphasis. To add semantic emphasis that screen readers can announce, use the editor’s Italic button instead.', 'typography-stylist')}
			/>
		</PanelBody>
	);
}
