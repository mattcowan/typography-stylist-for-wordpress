/**
 * Typography Stylist Block - the Font Family panel in the block sidebar.
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
import { adoptWpFont, isWpLibraryValue, wpSlugFromValue } from '../../../../assets/js/font-options.js';
import { FontPicker } from '../../../../assets/js/font-picker.js';
import { resolveFontPickWeight } from '../../../../assets/js/font-weights.js';
import { detectBlockComputedWeight } from '../../utils';

/**
 * Block font family. Edit renders it only when there are fonts to choose
 * from.
 *
 * @param {Object} props Values, state and handlers from Edit, by name.
 * @return {Element} The panel.
 */
export default function renderFontFamilyPanel(props) {
	const {
		clientId, fontFamily, fontId, fontIdMap, fontOptions, fontWeight, setAttributes
	} = props;

	return (
		<PanelBody title={__('Font Family', 'typography-stylist')} initialOpen={false}>
			<FontPicker
				// The panel title is the visible heading; the
				// control still needs its own accessible name.
				label={__('Font Family', 'typography-stylist')}
				hideLabelFromVision
				placeholder={__('(Default)', 'typography-stylist')}
				value={fontId ? String(fontId) : (fontFamily || '')}
				options={fontOptions}
				onChange={(value) => {
					if (value === '') {
						setAttributes({ fontFamily: '', fontId: 0 });
					} else if (isWpLibraryValue(value)) {
						// Unadopted WP Font Library font — adopt first
						// (idempotently allocates a font_id), then store
						// fontId exactly like any other source
						adoptWpFont(wpSlugFromValue(value)).then((font) => {
							fontIdMap[font.font_id] = {
								family: font.font_family,
								fallbacks: font.fallbacks || '',
								availableWeights: []
							};
							setAttributes({
								fontFamily: font.font_family,
								fontId: font.font_id
							});
						}).catch(() => {});
					} else {
						// Try to parse as ID (new system)
						const selectedFontId = parseInt(value, 10);
						if (!isNaN(selectedFontId) && fontIdMap[selectedFontId]) {
							// New ID-based system
							const fontData = fontIdMap[selectedFontId];
							const newAttrs = {
								fontFamily: fontData.family,
								fontId: selectedFontId
							};

							// Validate weight against new font's available weights.
							// A block with no weight of its own ('') is placed at
							// the weight its text renders at now (#411 review): it
							// keeps '' when the font has that weight, else gets the
							// closest. Any other weight: getClosestWeight(), and
							// the only weight of a one-weight font, as before.
							const available = fontData.availableWeights;
							const rendered = fontWeight === '' ? detectBlockComputedWeight(clientId) : '';
							const nextWeight = resolveFontPickWeight(fontWeight, available, rendered);
							if (nextWeight !== fontWeight) {
								newAttrs.fontWeight = nextWeight;
							}

							setAttributes(newAttrs);
						} else {
							// Old string-based system (backward compatibility)
							setAttributes({
								fontFamily: value,
								fontId: 0
							});
						}
					}
				}}
			/>
		</PanelBody>
	);
}
