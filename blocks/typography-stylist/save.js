/**
 * Typography Stylist Block - Save Component (Frontend Render)
 */

import { RichText } from '@wordpress/block-editor';
import { buildFitLinesHtml, normalizeHang, buildResponsiveClamp, formatFontSizeLength, resolveFontSizeUnit, caseDeclarations, normalizeTextCase, overrideKeysToMap } from './utils';

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
		fontSizeUnit,
		fitLineSizes,
		fitMaxSize,
		fitWordSizes,
		initialHang,
		fitLineHangs,
		textCase,
		fakeSmallCaps,
		fontWeight,
		fontStyle,
		letterSpacing,
		lineHeight,
		screenReaderClass,
		textAlign,
		styleClass,
		overrideKeys,
		fontVariationSettings,
		layeredConfigId,
		animationConfigId
	} = attributes;

	// Sizes are entered in px and written in the block's unit (#233). New
	// blocks default to rem; blocks saved before the attribute existed get
	// 'px' from the deprecations' migrate(), so they keep writing px.
	const unit = resolveFontSizeUnit(fontSizeUnit);

	// Under a styleClass the style's CSS class renders the typography, and
	// only the settings the author changed on top of the style (#451, the
	// overrideKeys attribute) are written inline. An empty list writes only
	// textAlign (layout, not typography), the same bytes as before #451.
	// Without a styleClass every setting is written.
	const overridden = styleClass ? overrideKeysToMap(overrideKeys) : null;
	const writes = (key) => !overridden || !!overridden[key];

	// Build inline style
	const buildStyle = () => {
		const styleArray = [];

		if (features.length > 0 && writes('features')) {
			styleArray.push(`font-feature-settings: ${features.map(f => `"${f}" 1`).join(', ')}`);
		} else if (overridden && overridden.features) {
			// No features on top of a style that has some (#451)
			styleArray.push('font-feature-settings: normal');
		}

		// Use CSS variable if fontId is present, otherwise fall back to fontFamily
		if (writes('fontId')) {
			if (fontId) {
				styleArray.push(`font-family: var(--font-${fontId})`);
			} else if (fontFamily) {
				styleArray.push(`font-family: ${fontFamily}`);
			}
		}

		if (fontWeight && writes('fontWeight')) {
			styleArray.push(`font-weight: ${fontWeight}`);
		}

		// Visual italic only (font-style) — semantic emphasis stays <em>, added
		// via the editor's own Italic button. Empty default keeps existing
		// blocks' save output byte-identical (block validation).
		// On top of a style, Inherit, no letter spacing, no line height and
		// no axes are written as `normal` (#451 round 1), so they win over
		// the class as the editor previews them
		if (fontStyle && writes('fontStyle')) {
			styleArray.push(`font-style: ${fontStyle}`);
		} else if (overridden && overridden.fontStyle) {
			styleArray.push('font-style: normal');
		}

		if (letterSpacing !== 0 && writes('letterSpacing')) {
			styleArray.push(`letter-spacing: ${letterSpacing / 1000}em`);
		} else if (overridden && overridden.letterSpacing) {
			styleArray.push('letter-spacing: normal');
		}

		if (lineHeight !== 0 && writes('lineHeight')) {
			styleArray.push(`line-height: ${lineHeight}`);
		} else if (overridden && overridden.lineHeight) {
			styleArray.push('line-height: normal');
		}

		// Case (#214). Default ('') writes nothing, so blocks saved before
		// the attribute existed serialize unchanged (block validation). On
		// top of a style, Default is written as Normal, as the editor
		// previews it: an inline style cannot fall back to the theme past
		// the class rule.
		if (writes('textCase')) {
			caseDeclarations(overridden ? (normalizeTextCase(textCase) || 'none') : textCase, fakeSmallCaps).forEach(([property, value]) => {
				styleArray.push(`${property}: ${value}`);
			});
		}

		if (fontSize === 'responsive' && writes('fontSize')) {
			styleArray.push(`font-size: ${buildResponsiveClamp(fontSizeMin, fontSizePreferred, fontSizeMax, unit)}`);
		}

		// Fit-to-width: per-line sizes are emitted on the typost-line spans
		// (cqi units); the block-level clamp is the fallback for browsers
		// without container-query support, which drop the calc(...cqi)
		// declaration and let lines inherit this size.
		if (fontSize === 'fit' && writes('fontSize')) {
			styleArray.push(`font-size: ${buildResponsiveClamp(fontSizeMin, fontSizePreferred, fontSizeMax, unit)}`);
		}

		// Fixed size, entered in px (kept from a paragraph style saved in the
		// inline editor, after Detach or after a deleted style's class is
		// cleared). Same test as buildStyle() in edit.js, so both sides
		// render it. Zero means "no size", as in the paragraph style CSS
		// generators. Blocks saved before this branch existed carry no
		// font-size and validate through the v1 deprecation and are upgraded
		// the next time the post is saved after a block edit.
		if (writes('fontSize') && /^\d+(\.\d+)?$/.test(String(fontSize)) && Number(fontSize) > 0) {
			styleArray.push(`font-size: ${formatFontSizeLength(fontSize, unit)}`);
		}

		if (fontVariationSettings && writes('fontVariationSettings')) {
			const safeFVS = sanitizeFontVariationSettings(fontVariationSettings);
			if (safeFVS) {
				styleArray.push(`font-variation-settings: ${safeFVS}`);
			}
		} else if (overridden && overridden.fontVariationSettings) {
			styleArray.push('font-variation-settings: normal');
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
	// docs/decisions/archive/refactor-style-string-helpers.md.
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

	// Hanging initial (#242). A custom property, read by the ::first-letter
	// rule in style.css, because an inline style cannot reach a
	// pseudo-element. Set on the object directly: the camelCase parse above
	// would mangle a leading '--'. Under a styleClass the style's CSS class
	// supplies the value, like every other typography property, unless the
	// author changed the hang on top of the style (#451): that value is
	// written even at 0, so no hang on one block cancels the style's hang,
	// as the editor previews it. Absent at 0 otherwise, so blocks saved
	// before this attribute existed serialize unchanged.
	const hang = normalizeHang(initialHang);
	if (overridden ? overridden.initialHang : hang > 0) {
		styleObj['--typost-hang'] = String(hang);
	}

	// Derive style ID from styleClass.
	// Expected format: styleClass contains a token "typost-ps-<number>" (e.g., "typost-ps-1"),
	// and the numeric part is used as the styleId. If the pattern is not present, styleId
	// will be undefined and no data-style-id attribute will be emitted.
	const styleIdMatch = styleClass ? styleClass.match(/typost-ps-(\d+)/) : null;
	const styleId = styleIdMatch ? styleIdMatch[1] : undefined;

	// Fit-to-width: wrap each visual line (split on <br>) in a
	// span.typost-line carrying its cqi font-size. The typost-fit class
	// establishes the container (container-type: inline-size in style.css)
	// and the rule that neutralizes inline data-fontsize spans. Non-fit
	// output below is byte-identical to the pre-fit save (block validation),
	// except the fixed font-size above, which v1 never wrote (#218), and
	// rem sizes (#233), which the v2 deprecation covers.
	const isFit = fontSize === 'fit';
	const visualValue = isFit ? buildFitLinesHtml(content, fitLineSizes, fitMaxSize, fitLineHangs, unit, fitWordSizes) : content;
	const visualClassName = (isFit ? 'typost-styled typost-fit' : 'typost-styled') + (styleClass ? ` ${styleClass}` : '');

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
				value={visualValue}
				style={styleObj}
				className={visualClassName}
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
