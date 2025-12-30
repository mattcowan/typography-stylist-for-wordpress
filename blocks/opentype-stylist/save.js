/**
 * OpenType Stylist Block - Save Component (Frontend Render)
 */

import { RichText } from '@wordpress/block-editor';

export default function save({ attributes }) {
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

	// Build inline style
	const buildStyle = () => {
		const styleArray = [];

		if (features.length > 0) {
			styleArray.push(`font-feature-settings: ${features.map(f => `"${f}" 1`).join(', ')}`);
		}

		if (fontFamily) {
			styleArray.push(`font-family: ${fontFamily}`);
		}

		if (fontWeight) {
			styleArray.push(`font-weight: ${fontWeight}`);
		}

		if (letterSpacing !== 0) {
			styleArray.push(`letter-spacing: ${letterSpacing / 1000}em`);
		}

		if (fontSize === 'responsive') {
			styleArray.push(`font-size: clamp(${fontSizeMin}px, ${fontSizePreferred / 16}rem + ${((fontSizeMax - fontSizeMin) / (1920 - 320)) * 100}vw, ${fontSizeMax}px)`);
		}

		if (textAlign) {
			styleArray.push(`text-align: ${textAlign}`);
		}

		return styleArray.join('; ');
	};

	const styleString = buildStyle();

	// Get clean text content (strip HTML tags for screen reader version)
	const cleanText = content.replace(/<[^>]*>/g, '');

	// Parse style string into object
	const styleObj = {};
	if (styleString) {
		styleString.split(';').forEach(rule => {
			const [property, value] = rule.split(':').map(s => s.trim());
			if (property && value) {
				// Convert CSS property to camelCase
				const camelProp = property.replace(/-([a-z])/g, (g) => g[1].toUpperCase());
				styleObj[camelProp] = value;
			}
		});
	}

	return (
		<div className="wp-block-opentype-stylist">
			{/* Screen reader accessible text (hidden visually, maintains semantic heading structure) */}
			<RichText.Content
				tagName={tagName}
				value={cleanText}
				className={screenReaderClass || 'visually-hidden'}
			/>

			{/* Visually styled text (hidden from screen readers) */}
			<RichText.Content
				tagName={tagName}
				value={content}
				style={styleObj}
				className="ots-styled"
				aria-hidden="true"
				data-font={fontFamily || undefined}
			/>
		</div>
	);
}
