/**
 * Typography Stylist Block - the Font Size panel in the block sidebar.
 *
 * Moved out of edit.js unchanged (#356). A render function, not a component:
 * Edit calls it at the place in its render where this markup was, so
 * the markup and every filter and translation call in it are evaluated
 * exactly when and as often as before. It must not call hooks: it runs inside
 * Edit's render, some calls only on a condition
 * (__tests__/render-functions-no-hooks.test.js).
 */

import { Notice, PanelBody, RangeControl, SelectControl, ToggleControl } from '@wordpress/components';
import { __ } from '@wordpress/i18n';
import ZoomNotice from '../zoom-notice';
import { hasBlockTextIndent, isValidFontSizeRange } from '../../utils';

/**
 * Block font size: inherit, responsive (clamp) or fit to width, with the
 * size sliders and their notices.
 *
 * @param {Object} props Values, state and handlers from Edit, by name.
 * @return {Element} The panel.
 */
export default function renderFontSizePanel(props) {
	const {
		attributes, blockFontSizeUnit, fitMaxSize, fontSize, fontSizeMax, fontSizeMin, fontSizePreferred,
		formatSizeReadout, setAttributes, sizePreviewUnit
	} = props;

	return (
		<PanelBody title={__('Font Size', 'typography-stylist')} initialOpen={false}>
			<SelectControl
				value={fontSize}
				options={[
					{ label: __('Inherit', 'typography-stylist'), value: 'inherit' },
					{ label: __('Responsive (Fluid)', 'typography-stylist'), value: 'responsive' },
					{ label: __('Fit to width', 'typography-stylist'), value: 'fit' }
				]}
				onChange={(value) => setAttributes({ fontSize: value })}
				help={
					fontSize === 'responsive'
						? __('Responsive mode uses CSS clamp() with separate sizes for mobile, tablet, and desktop viewports.', 'typography-stylist')
						: fontSize === 'fit'
							// Rem blocks grow with browser zoom and wrap there (#235)
							? (blockFontSizeUnit === 'rem'
								? __('Each line is sized to span the full block width, live while you edit. When a reader zooms in, lines grow and wrap so the text stays readable. The block controls the size, so inline font sizes on selections are ignored.', 'typography-stylist')
								: __('Each line is sized to span the full block width, live while you edit. Lines never wrap. The block controls the size, so inline font sizes on selections are ignored.', 'typography-stylist'))
							: undefined
				}
			/>

			{fontSize === 'fit' && (
				<>
					<ToggleControl
						label={__('Maximum font size', 'typography-stylist')}
						checked={fitMaxSize > 0}
						onChange={(checked) => setAttributes({ fitMaxSize: checked ? 120 : 0 })}
						help={__('Cap how large short lines can grow on wide screens.', 'typography-stylist')}
					/>
					{fitMaxSize > 0 && (
						<RangeControl
							label={__('Maximum size (px)', 'typography-stylist')}
							value={fitMaxSize}
							onChange={(value) => setAttributes({ fitMaxSize: value })}
							min={8}
							max={400}
							step={1}
							help={formatSizeReadout(fitMaxSize, blockFontSizeUnit)}
						/>
					)}
					{/* style.css keeps fit lines unindented (#348) */}
					{hasBlockTextIndent(attributes.style) && (
						<p style={{ fontSize: '12px', color: '#757575', marginTop: '8px', marginBottom: '8px' }}>
							{__('Fit to width does not use the Line indent setting. Each line fills the width of the block.', 'typography-stylist')}
						</p>
					)}
					<p style={{ fontSize: '12px', color: '#757575', marginTop: '8px', marginBottom: '8px' }}>
						{__('Fallback size for browsers without container query support:', 'typography-stylist')}
					</p>
				</>
			)}

			{(fontSize === 'responsive' || fontSize === 'fit') && (
				<>
					<RangeControl
						label={__('Mobile (320px and up)', 'typography-stylist')}
						value={fontSizeMin}
						onChange={(value) => setAttributes({ fontSizeMin: value })}
						min={8}
						max={120}
						step={1}
						help={formatSizeReadout(fontSizeMin, sizePreviewUnit)}
					/>
					<RangeControl
						label={__('Intermediate', 'typography-stylist')}
						value={fontSizePreferred}
						onChange={(value) => setAttributes({ fontSizePreferred: value })}
						min={8}
						max={120}
						step={1}
						help={formatSizeReadout(fontSizePreferred, sizePreviewUnit)}
					/>
					<RangeControl
						label={__('Large (up to 1920px)', 'typography-stylist')}
						value={fontSizeMax}
						onChange={(value) => setAttributes({ fontSizeMax: value })}
						min={8}
						max={120}
						step={1}
						help={formatSizeReadout(fontSizeMax, sizePreviewUnit)}
					/>
					{!isValidFontSizeRange(fontSizeMin, fontSizePreferred, fontSizeMax) && (
						<Notice status="warning" isDismissible={false}>
							{__('Note: Font sizes are out of order. Mobile should be ≤ Intermediate ≤ Large for expected behavior.', 'typography-stylist')}
						</Notice>
					)}
					{/* Fit uses these values only as its no-container-query fallback */}
					{fontSize === 'responsive' && <ZoomNotice min={fontSizeMin} preferred={fontSizePreferred} max={fontSizeMax} unit={sizePreviewUnit} />}
				</>
			)}
		</PanelBody>
	);
}
