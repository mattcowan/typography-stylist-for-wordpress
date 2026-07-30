/**
 * Typography Stylist Block - Deprecated save versions
 *
 * v1: the save format before fit-to-width sizing. Frozen verbatim copy of
 * the pre-fit save() (including its local helpers) — never edit this copy;
 * add a new deprecation entry instead. For fontSize values other than
 * "fit" the current save output is byte-identical to this one, so existing
 * published blocks validate against the current save directly and this
 * entry is a pure safety net.
 */

import { RichText } from '@wordpress/block-editor';

// Viewport breakpoints for responsive font sizing
const RESPONSIVE_FONT_MIN_VIEWPORT = 320;  // Mobile baseline
const RESPONSIVE_FONT_MAX_VIEWPORT = 1920; // Desktop baseline

// Validate and sanitize font-variation-settings value.
// Ensures each entry matches the "axis" number format (e.g. "wght" 700, "wdth" 100).
// Returns empty string for invalid input.
const sanitizeFontVariationSettings = (value) => {
	if (!value) return '';
	const str = String(value).trim();
	if (!str) return '';
	// Split on commas and validate each entry
	const entries = str.split(',').map(e => e.trim()).filter(Boolean);
	const validEntries = [];
	for (const entry of entries) {
		// Match: quoted 4-char tag + numeric value (int or float, optional negative)
		const match = entry.match(/^["']([a-zA-Z][a-zA-Z0-9 ]{0,3})["']\s+(-?\d+(?:\.\d+)?)$/);
		if (!match) return '';
		validEntries.push(`"${match[1]}" ${match[2]}`);
	}
	return validEntries.join(', ');
};

// Attribute schema at the time of v1 (no fitLineSizes/fitMaxSize)
const v1Attributes = {
	content: { type: 'string', default: '' },
	tagName: { type: 'string', default: 'h2' },
	features: { type: 'array', default: [] },
	fontFamily: { type: 'string', default: '' },
	fontId: { type: 'number', default: 0 },
	fontSize: { type: 'string', default: 'inherit' },
	fontSizeMin: { type: 'number', default: 16 },
	fontSizePreferred: { type: 'number', default: 32 },
	fontSizeMax: { type: 'number', default: 64 },
	fontWeight: { type: 'string', default: '400' },
	fontStyle: { type: 'string', default: '' },
	letterSpacing: { type: 'number', default: 0 },
	lineHeight: { type: 'number', default: 0 },
	screenReaderClass: { type: 'string', default: 'visually-hidden' },
	textAlign: { type: 'string' },
	styleClass: { type: 'string', default: '' },
	fontVariationSettings: { type: 'string', default: '' },
	layeredConfigId: { type: 'number', default: 0 },
	animationConfigId: { type: 'number', default: 0 }
};

const v1Supports = {
	html: false,
	align: ['wide', 'full'],
	anchor: true,
	color: {
		text: true,
		background: true,
		link: false
	},
	spacing: {
		margin: true,
		padding: true
	},
	typography: {
		fontSize: false,
		lineHeight: true
	},
	__experimentalTextAlign: true
};

function v1Save({ attributes }) {
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
		fontStyle,
		letterSpacing,
		lineHeight,
		screenReaderClass,
		textAlign,
		styleClass,
		fontVariationSettings,
		layeredConfigId,
		animationConfigId
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

		// Visual italic only (font-style) — semantic emphasis stays <em>, added
		// via the editor's own Italic button. Empty default keeps existing
		// blocks' save output byte-identical (block validation).
		if (fontStyle) {
			styleArray.push(`font-style: ${fontStyle}`);
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
			const safeFVS = sanitizeFontVariationSettings(fontVariationSettings);
			if (safeFVS) {
				styleArray.push(`font-variation-settings: ${safeFVS}`);
			}
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

	// Parse style string into object.
	// Intentionally NOT migrated to utils.js parseStyleString(): this parse
	// feeds the serialized save output, which must stay byte-stable for block
	// validation of already-published posts — a future change to the shared
	// parser must never be able to shift save markup. See
	// todo/refactor-style-string-helpers.md.
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
				data-animation-config-id={animationConfigId || undefined}
			/>
		</div>
	);
}

const v1 = {
	attributes: v1Attributes,
	supports: v1Supports,
	save: v1Save
};

export default [ v1 ];
