/**
 * Typography Stylist Block - Save Component (Frontend Render)
 */

import { RichText } from '@wordpress/block-editor';

// Viewport breakpoints for responsive font sizing
const RESPONSIVE_FONT_MIN_VIEWPORT = 320;  // Mobile baseline
const RESPONSIVE_FONT_MAX_VIEWPORT = 1920; // Desktop baseline

export default function save({ attributes }) {
	const {
		content,
		tagName,
		features,
		fontFamily,
		fontId,
		fontSize,
		fontSizeMin,
		fontSizePreferred,
		fontSizeMax,
		fontWeight,
		letterSpacing,
		lineHeight,
		screenReaderClass,
		textAlign,
		styleClass,
		fontVariationSettings,
		layeredConfigId
	} = attributes;

	// Build inline style — skipped when styleClass is set (CSS class provides styling)
	const buildStyle = () => {
		const styleArray = [];

		// When a styleClass is active, only output textAlign (layout, not typography)
		if (styleClass) {
			if (textAlign) {
				styleArray.push(`text-align: ${textAlign}`);
			}
			return styleArray.join('; ');
		}

		if (features.length > 0) {
			styleArray.push(`font-feature-settings: ${features.map(f => `"${f}" 1`).join(', ')}`);
		}

		// Use CSS variable if fontId is present, otherwise fall back to fontFamily
		if (fontId) {
			styleArray.push(`font-family: var(--font-${fontId})`);
		} else if (fontFamily) {
			styleArray.push(`font-family: ${fontFamily}`);
		}

		if (fontWeight) {
			styleArray.push(`font-weight: ${fontWeight}`);
		}

		if (letterSpacing !== 0) {
			styleArray.push(`letter-spacing: ${letterSpacing / 1000}em`);
		}

		if (lineHeight !== 0) {
			styleArray.push(`line-height: ${lineHeight}`);
		}

		if (fontSize === 'responsive') {
			styleArray.push(`font-size: clamp(${fontSizeMin}px, ${fontSizePreferred / 16}rem + ${((fontSizeMax - fontSizeMin) / (RESPONSIVE_FONT_MAX_VIEWPORT - RESPONSIVE_FONT_MIN_VIEWPORT)) * 100}vw, ${fontSizeMax}px)`);
		}

		if (fontVariationSettings) {
			styleArray.push(`font-variation-settings: ${fontVariationSettings}`);
		}

		if (textAlign) {
			styleArray.push(`text-align: ${textAlign}`);
		}

		return styleArray.join('; ');
	};

	const styleString = buildStyle();

	// Get clean text content (strip HTML tags for screen reader version)
	// Replace <br> tags (with or without attributes, including self-closing forms like <br />) with
	// spaces first to prevent word concatenation before stripping all remaining HTML tags.
	const cleanText = content
		.replace(/<br\b[^>]*>/gi, ' ')
		.replace(/<[^>]*>/g, '');

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

	// Derive style ID from styleClass.
	// Expected format: styleClass contains a token "typost-ps-<number>" (e.g., "typost-ps-1"),
	// and the numeric part is used as the styleId. If the pattern is not present, styleId
	// will be undefined and no data-style-id attribute will be emitted.
	const styleIdMatch = styleClass ? styleClass.match(/typost-ps-(\d+)/) : null;
	const styleId = styleIdMatch ? styleIdMatch[1] : undefined;

	return (
		<div className="wp-block-typost">
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
				className={styleClass ? `typost-styled ${styleClass}` : 'typost-styled'}
				aria-hidden="true"
				data-font={fontFamily || undefined}
				data-font-id={fontId || undefined}
				data-style-id={styleId}
				data-layered-config-id={layeredConfigId || undefined}
			/>
		</div>
	);
}
