/**
 * OpenType Stylist Block - Editor Component
 */

import { __ } from '@wordpress/i18n';
import {
	useBlockProps,
	InspectorControls,
	BlockControls,
	AlignmentToolbar,
	RichText
} from '@wordpress/block-editor';
import {
	PanelBody,
	ToggleControl,
	SelectControl,
	RangeControl,
	TextControl,
	ToolbarGroup,
	ToolbarDropdownMenu
} from '@wordpress/components';

export default function Edit({ attributes, setAttributes }) {
	const {
		content,
		tagName,
		features,
		fontFamily,
		fontSize,
		fontSizeMin,
		fontSizePreferred,
		fontSizeMax,
		fontWeight,
		letterSpacing,
		screenReaderClass,
		textAlign
	} = attributes;

	const blockProps = useBlockProps({
		className: 'wp-block-opentype-stylist'
	});

	// Get available features from localized data
	const availableFeatures = window.otsData?.features || [];
	const groupedFeatures = {};
	availableFeatures.forEach(feature => {
		const category = feature.category || 'other';
		if (!groupedFeatures[category]) {
			groupedFeatures[category] = [];
		}
		groupedFeatures[category].push(feature);
	});

	// Get font options
	const fontOptions = [];
	const fonts = window.otsData?.fonts || [];
	const adobeFonts = window.otsData?.adobeFonts || [];
	const manualFonts = window.otsData?.manualFonts || [];

	// Add uploaded fonts
	fonts.forEach(font => {
		if (font.font_faces && font.font_faces.length > 0) {
			const families = [...new Set(font.font_faces.map(face => face.family))];
			families.forEach(family => {
				const fontValue = font.fallbacks ? `${family}, ${font.fallbacks}` : family;
				fontOptions.push({
					label: `📁 ${family}`,
					value: fontValue
				});
			});
		}
	});

	// Add Adobe fonts
	adobeFonts.forEach(font => {
		if (font.font_families && font.font_families.length > 0) {
			font.font_families.forEach(family => {
				const fontValue = font.fallbacks ? `${family}, ${font.fallbacks}` : family;
				fontOptions.push({
					label: `🅰️ ${family}`,
					value: fontValue
				});
			});
		}
	});

	// Add manual fonts
	manualFonts.forEach(font => {
		if (font.font_family) {
			const fontValue = font.fallbacks ? `${font.font_family}, ${font.fallbacks}` : font.font_family;
			fontOptions.push({
				label: `⚙️ ${font.name}`,
				value: fontValue
			});
		}
	});

	// Toggle feature
	const toggleFeature = (featureId) => {
		const newFeatures = [...features];
		const index = newFeatures.indexOf(featureId);
		if (index > -1) {
			newFeatures.splice(index, 1);
		} else {
			newFeatures.push(featureId);
		}
		setAttributes({ features: newFeatures });
	};

	// Build inline style for preview
	const buildStyle = () => {
		const styles = {};

		if (features.length > 0) {
			styles.fontFeatureSettings = features.map(f => `"${f}" 1`).join(', ');
		}

		if (fontFamily) {
			styles.fontFamily = fontFamily;
		}

		if (fontWeight) {
			styles.fontWeight = fontWeight;
		}

		if (letterSpacing !== 0) {
			styles.letterSpacing = `${letterSpacing / 1000}em`;
		}

		if (fontSize === 'responsive') {
			styles.fontSize = `clamp(${fontSizeMin}px, ${fontSizePreferred / 16}rem + ${((fontSizeMax - fontSizeMin) / (1920 - 320)) * 100}vw, ${fontSizeMax}px)`;
		}

		if (textAlign) {
			styles.textAlign = textAlign;
		}

		return styles;
	};

	// Category titles
	const getCategoryTitle = (category) => {
		const titles = {
			'ligatures': __('Ligatures', 'opentype-stylist'),
			'stylistic-sets': __('Stylistic Sets', 'opentype-stylist'),
			'alternates': __('Swashes & Alternates', 'opentype-stylist'),
			'decorative': __('Decorative', 'opentype-stylist'),
			'other': __('Other Features', 'opentype-stylist')
		};
		return titles[category] || category;
	};

	return (
		<>
			<BlockControls>
				<ToolbarGroup>
					<ToolbarDropdownMenu
						icon="heading"
						label={__('Change heading level', 'opentype-stylist')}
						controls={[
							{
								title: __('Heading 1', 'opentype-stylist'),
								isActive: tagName === 'h1',
								onClick: () => setAttributes({ tagName: 'h1' })
							},
							{
								title: __('Heading 2', 'opentype-stylist'),
								isActive: tagName === 'h2',
								onClick: () => setAttributes({ tagName: 'h2' })
							},
							{
								title: __('Heading 3', 'opentype-stylist'),
								isActive: tagName === 'h3',
								onClick: () => setAttributes({ tagName: 'h3' })
							},
							{
								title: __('Heading 4', 'opentype-stylist'),
								isActive: tagName === 'h4',
								onClick: () => setAttributes({ tagName: 'h4' })
							},
							{
								title: __('Heading 5', 'opentype-stylist'),
								isActive: tagName === 'h5',
								onClick: () => setAttributes({ tagName: 'h5' })
							},
							{
								title: __('Heading 6', 'opentype-stylist'),
								isActive: tagName === 'h6',
								onClick: () => setAttributes({ tagName: 'h6' })
							},
							{
								title: __('Paragraph', 'opentype-stylist'),
								isActive: tagName === 'p',
								onClick: () => setAttributes({ tagName: 'p' })
							},
							{
								title: __('Div', 'opentype-stylist'),
								isActive: tagName === 'div',
								onClick: () => setAttributes({ tagName: 'div' })
							}
						]}
					/>
				</ToolbarGroup>
				<AlignmentToolbar
					value={textAlign}
					onChange={(newAlign) => setAttributes({ textAlign: newAlign })}
				/>
			</BlockControls>

			<InspectorControls>
				{fontOptions.length > 0 && (
					<PanelBody title={__('Font Family', 'opentype-stylist')} initialOpen={false}>
						<SelectControl
							value={fontFamily}
							options={[
								{ label: __('(Default)', 'opentype-stylist'), value: '' },
								...fontOptions
							]}
							onChange={(value) => setAttributes({ fontFamily: value })}
						/>
					</PanelBody>
				)}

				<PanelBody title={__('Font Weight', 'opentype-stylist')} initialOpen={false}>
					<SelectControl
						value={fontWeight}
						options={[
							{ label: __('100 - Thin', 'opentype-stylist'), value: '100' },
							{ label: __('200 - Extra Light', 'opentype-stylist'), value: '200' },
							{ label: __('300 - Light', 'opentype-stylist'), value: '300' },
							{ label: __('400 - Normal', 'opentype-stylist'), value: '400' },
							{ label: __('500 - Medium', 'opentype-stylist'), value: '500' },
							{ label: __('600 - Semi Bold', 'opentype-stylist'), value: '600' },
							{ label: __('700 - Bold', 'opentype-stylist'), value: '700' },
							{ label: __('800 - Extra Bold', 'opentype-stylist'), value: '800' },
							{ label: __('900 - Black', 'opentype-stylist'), value: '900' }
						]}
						onChange={(value) => setAttributes({ fontWeight: value })}
					/>
				</PanelBody>

				<PanelBody title={__('Letter Spacing', 'opentype-stylist')} initialOpen={false}>
					<RangeControl
						value={letterSpacing}
						onChange={(value) => setAttributes({ letterSpacing: value })}
						min={-200}
						max={200}
						step={1}
						help={letterSpacing === 0 ? __('Normal', 'opentype-stylist') : `${letterSpacing / 1000}em`}
						allowReset
						resetFallbackValue={0}
					/>
				</PanelBody>

				<PanelBody title={__('Font Size', 'opentype-stylist')} initialOpen={false}>
					<SelectControl
						value={fontSize}
						options={[
							{ label: __('Inherit', 'opentype-stylist'), value: 'inherit' },
							{ label: __('Responsive (Fluid)', 'opentype-stylist'), value: 'responsive' }
						]}
						onChange={(value) => setAttributes({ fontSize: value })}
					/>

					{fontSize === 'responsive' && (
						<>
							<RangeControl
								label={__('Minimum Size (mobile)', 'opentype-stylist')}
								value={fontSizeMin}
								onChange={(value) => setAttributes({ fontSizeMin: value })}
								min={8}
								max={120}
								step={1}
								help={`${fontSizeMin}px`}
							/>
							<RangeControl
								label={__('Preferred Size (tablet)', 'opentype-stylist')}
								value={fontSizePreferred}
								onChange={(value) => setAttributes({ fontSizePreferred: value })}
								min={8}
								max={120}
								step={1}
								help={`${fontSizePreferred}px`}
							/>
							<RangeControl
								label={__('Maximum Size (desktop)', 'opentype-stylist')}
								value={fontSizeMax}
								onChange={(value) => setAttributes({ fontSizeMax: value })}
								min={8}
								max={120}
								step={1}
								help={`${fontSizeMax}px`}
							/>
						</>
					)}
				</PanelBody>

				<PanelBody title={__('OpenType Features', 'opentype-stylist')} initialOpen={true}>
					{Object.entries(groupedFeatures).map(([category, categoryFeatures]) => (
						<div key={category} className="ots-feature-category">
							<h4>{getCategoryTitle(category)}</h4>
							{categoryFeatures.map(feature => (
								<ToggleControl
									key={feature.id}
									label={feature.name}
									help={feature.description}
									checked={features.includes(feature.id)}
									onChange={() => toggleFeature(feature.id)}
								/>
							))}
						</div>
					))}
				</PanelBody>

				<PanelBody title={__('Accessibility', 'opentype-stylist')} initialOpen={false}>
					<SelectControl
						label={__('Screen Reader Class', 'opentype-stylist')}
						value={screenReaderClass}
						options={[
							{ label: 'visually-hidden', value: 'visually-hidden' },
							{ label: 'sr-only', value: 'sr-only' },
							{ label: 'screen-reader-text', value: 'screen-reader-text' },
							{ label: __('Custom', 'opentype-stylist'), value: 'custom' }
						]}
						onChange={(value) => setAttributes({ screenReaderClass: value })}
					/>
					{screenReaderClass === 'custom' && (
						<TextControl
							label={__('Custom Class Name', 'opentype-stylist')}
							value={screenReaderClass}
							onChange={(value) => setAttributes({ screenReaderClass: value })}
							help={__('Enter your theme\'s screen reader class', 'opentype-stylist')}
						/>
					)}
					<p className="description">
						{__('The selected class will be used to hide duplicate text for screen readers. Make sure this class is defined in your theme.', 'opentype-stylist')}
					</p>
				</PanelBody>
			</InspectorControls>

			<div {...blockProps}>
				<RichText
					tagName={tagName}
					value={content}
					onChange={(value) => setAttributes({ content: value })}
					placeholder={__('Add text with advanced typography...', 'opentype-stylist')}
					style={buildStyle()}
					className="ots-block-content"
				/>
			</div>
		</>
	);
}
