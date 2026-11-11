/**
 * Typography Stylist Block - the Case panel in the block sidebar.
 *
 * Moved out of edit.js unchanged (#356). A render function, not a component:
 * Edit calls it at the place in its render where this markup was, so
 * the markup and every filter and translation call in it are evaluated
 * exactly when and as often as before. It must not call hooks: it runs inside
 * Edit's render, some calls only on a condition
 * (__tests__/render-functions-no-hooks.test.js).
 */

import { PanelBody, SelectControl, ToggleControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import { isSmallCapsCase, normalizeTextCase } from '../../utils';

/**
 * Block text case and the fake small caps option (#214).
 *
 * @param {Object} props Values, state and handlers from Edit, by name.
 * @return {Element} The panel.
 */
export default function renderCasePanel(props) {
	const {
		fakeSmallCaps, setAttributes, textCase
	} = props;

	return (
		<PanelBody title={__('Case', 'typography-stylist')} initialOpen={false}>
			<SelectControl
				label={__('Case', 'typography-stylist')}
				hideLabelFromVision
				value={normalizeTextCase(textCase)}
				options={[
					{ label: __('Default', 'typography-stylist'), value: '' },
					{ label: __('Normal', 'typography-stylist'), value: 'none' },
					{ label: __('All Caps', 'typography-stylist'), value: 'uppercase' },
					{ label: __('Lowercase', 'typography-stylist'), value: 'lowercase' },
					{ label: __('Title Case', 'typography-stylist'), value: 'capitalize' },
					{ label: __('Small Caps', 'typography-stylist'), value: 'small-caps' },
					{ label: __('All Small Caps', 'typography-stylist'), value: 'all-small-caps' }
				]}
				onChange={(value) => setAttributes({ textCase: normalizeTextCase(value) })}
				help={
					// The All Caps note is help text too, so the select's
					// aria-describedby carries it to screen readers
					normalizeTextCase(textCase) === 'capitalize'
					? __('Capitalizes the first letter of every word, including short words such as “of” and “the”, and the letter after a hyphen.', 'typography-stylist')
					: (normalizeTextCase(textCase) === 'uppercase'
						? __('All caps are harder to read in long text, so keep them for short labels. Screen readers read this block’s original text, but when All Caps is applied to text in other blocks, some screen readers spell out short all-caps words letter by letter, as abbreviations.', 'typography-stylist')
						: __('Changes how the text looks only. The text keeps the case you typed. Default keeps the case the theme sets; Normal removes it.', 'typography-stylist'))}
			/>
			{isSmallCapsCase(textCase) && (
				<ToggleControl
					label={__('Allow fake small caps', 'typography-stylist')}
					checked={fakeSmallCaps !== false}
					onChange={(value) => setAttributes({ fakeSmallCaps: value })}
					help={fakeSmallCaps !== false
						? __('When the font has no small caps, the browser makes them by shrinking capitals.', 'typography-stylist')
						: __('When the font has no small caps, the text stays in normal case.', 'typography-stylist')}
				/>
			)}
		</PanelBody>
	);
}
