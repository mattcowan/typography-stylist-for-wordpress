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

/**
 * Block font family. Edit renders it only when there are fonts to choose
 * from.
 *
 * @param {Object} props Values, state and handlers from Edit, by name.
 * @return {Element} The panel.
 */
export default function renderFontFamilyPanel(props) {
	const {
		fontFamily, fontId, fontIdMap, fontOptions, fontWeight, getClosestWeight, setAttributes
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

							// Validate weight against new font's available weights
							const available = fontData.availableWeights;
							if (available && available.length > 0) {
								if (!available.includes(fontWeight)) {
									newAttrs.fontWeight = getClosestWeight(fontWeight, available);
								}
								if (available.length === 1 && fontWeight !== available[0]) {
									newAttrs.fontWeight = available[0];
								}
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
