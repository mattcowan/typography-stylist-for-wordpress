/**
 * Typography Stylist Block - the Accessibility panel in the block sidebar.
 *
 * Moved out of edit.js unchanged (#356). A render function, not a component:
 * Edit calls it at the place in its render where this markup was, so
 * the markup and every filter and translation call in it are evaluated
 * exactly when and as often as before. It must not call hooks: it runs inside
 * Edit's render, some calls only on a condition
 * (__tests__/render-functions-no-hooks.test.js).
 */

import { PanelBody, SelectControl, TextControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { screenReaderClassForSelect } from '../../utils';

/**
 * The screen reader class for the hidden plain-text copy of the block.
 *
 * @param {Object} props Values, state and handlers from Edit, by name.
 * @return {Element} The panel.
 */
export default function renderAccessibilityPanel(props) {
	const {
		screenReaderClassControl, setAttributes, setScreenReaderCustomMode
	} = props;

	return (
		<PanelBody title={__('Accessibility', 'typography-stylist')} initialOpen={false}>
			{/* Derived from the stored class so the custom field stays open while typing. */}
			<SelectControl
				label={__('Screen Reader Class', 'typography-stylist')}
				value={screenReaderClassControl.selectValue}
				options={[
					{ label: 'visually-hidden', value: 'visually-hidden' },
					{ label: 'sr-only', value: 'sr-only' },
					{ label: 'screen-reader-text', value: 'screen-reader-text' },
					{ label: __('Custom', 'typography-stylist'), value: 'custom' }
				]}
				onChange={(value) => {
					setScreenReaderCustomMode(value === 'custom');
					setAttributes({ screenReaderClass: screenReaderClassForSelect(value) });
				}}
			/>
			{screenReaderClassControl.isCustom && (
				<TextControl
					label={__('Custom Class Name', 'typography-stylist')}
					value={screenReaderClassControl.customValue}
					onChange={(value) => setAttributes({ screenReaderClass: value })}
					help={__('Enter your theme’s screen reader class.', 'typography-stylist')}
				/>
			)}
			<p className="description">
				{__('The selected class hides the screen reader copy of the text from view. The plugin includes styles for visually-hidden, sr-only, and screen-reader-text. For a custom class, make sure your theme defines it.', 'typography-stylist')}
			</p>
		</PanelBody>
	);
}
