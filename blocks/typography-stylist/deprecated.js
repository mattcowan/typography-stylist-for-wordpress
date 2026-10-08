/**
 * Typography Stylist Block - Deprecated save versions
 *
 * v1: the save format before fit-to-width sizing. Frozen verbatim copy of
 * the pre-fit save() (including its local helpers) — never edit this copy;
 * add a new deprecation entry instead. For "inherit" and "responsive"
 * sizes, and for any block with a styleClass, the current save output is
 * byte-identical to this one, so those blocks validate against the current
 * save directly.
 *
 * Fixed px sizes (a numeric fontSize such as "24" with no styleClass) are
 * the exception: this copy writes no font-size for them, while the current
 * save writes `font-size: 24px` (#218). Blocks saved before that fix match
 * this entry, not the current save, so this entry is the live validation
 * path for them. The upgrade does not mark the post as changed: the new
 * markup is stored only when the author edits any block and saves (a
 * title-only save keeps the stored content).
 *
 * v2: the save format before rem font sizes (#233). Frozen verbatim copy of
 * the save() that wrote every size in px, with the utils.js helpers it
 * called copied beside it — never edit this copy either. The current save
 * writes sizes in the block's fontSizeUnit, which defaults to 'rem', so
 * every block with a size and no styleClass that was saved before #233
 * matches this entry, not the current save. Both entries' migrate() sets
 * fontSizeUnit to 'px', so those blocks keep writing px after the upgrade
 * and after any later edit. A block with no size (inherit) or with a
 * styleClass writes no block-level size and validates against the current
 * save directly; it gets the 'rem' default, so a size set on it later is
 * new content and is written in rem. Exception: a fit-to-width block writes
 * its per-line cap (min(…cqi, Npx)) also under a styleClass, so a capped
 * fit block with a styleClass matches v2 and is migrated to px like any
 * other sized block. A styleClass block that validates directly keeps
 * showing the style's size; when it leaves the style (Detach, or a deleted
 * style), edit.js gives it the style's unit (resolveDetachFontSizeUnit).
 *
 * Order matters: [v2, v1]. Core tries the entries in order and runs only
 * the migrate() of the entry that matched, so v1 needs its own.
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

// Attribute schema at the time of v1, plus the two fit keys. Core keeps only
// the attributes in this schema when a block validates through v1, so
// without them a fixed px block (#218) that still stores a fit cap or fit
// line sizes from earlier fit use lost both on the next save. v1Save never
// reads them, so they change no output.
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
	animationConfigId: { type: 'number', default: 0 },
	fitLineSizes: { type: 'array', default: [] },
	fitMaxSize: { type: 'number', default: 0 }
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
	// todo/archive/refactor-style-string-helpers.md.
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

// apiVersion is required. Core builds a deprecated block type without the
// current apiVersion (it is a deprecated-entry key), so an entry that omits
// it is treated as API version 1, and core adds the generated
// `wp-block-typost-block` class to the root element. The output then never
// matches stored HTML, and this entry validated nothing until #218 found it.
// The block has been apiVersion 3 since before v1 was the live save.
const v1 = {
	apiVersion: 3,
	attributes: v1Attributes,
	supports: v1Supports,
	save: v1Save,
	migrate: keepPxFontSizes
};

// ===== v2: before rem font sizes (#233) =====

// Blocks saved before #233 wrote px. Core keeps only the attributes in a
// deprecation's schema, and neither schema has fontSizeUnit, so without
// this the attribute comes back undefined and is not stored. 'px' is
// stored explicitly, so the block keeps px for good.
function keepPxFontSizes(attributes) {
	return { ...attributes, fontSizeUnit: 'px' };
}

// The block.json attribute schema just before fontSizeUnit was added.
const v2Attributes = {
	content: { type: 'string', default: '' },
	tagName: { type: 'string', default: 'h2' },
	features: { type: 'array', default: [] },
	fontFamily: { type: 'string', default: '' },
	fontId: { type: 'number', default: 0 },
	fontSize: { type: 'string', default: 'inherit' },
	fontSizeMin: { type: 'number', default: 16 },
	fontSizePreferred: { type: 'number', default: 32 },
	fontSizeMax: { type: 'number', default: 64 },
	fitLineSizes: { type: 'array', default: [] },
	fitMaxSize: { type: 'number', default: 0 },
	initialHang: { type: 'number', default: 0 },
	fitLineHangs: { type: 'array', default: [] },
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

// Unchanged since v1.
const v2Supports = v1Supports;

// Frozen copies of the utils.js helpers v2Save called, renamed with a v2
// prefix. RESPONSIVE_FONT_*_VIEWPORT and sanitizeFontVariationSettings
// above are already frozen copies with the same bodies.

const V2_INITIAL_HANG_MAX = 1;

const V2_NUMERIC_STRING = /^\s*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?\s*$/;

function v2NormalizeHang(value) {
	// Accept what PHP is_numeric() accepts (the PHP sanitizer is the twin):
	// Number() alone would read '0x1A' as 26 and true as 1.
	if (typeof value === 'string' ? !V2_NUMERIC_STRING.test(value) : typeof value !== 'number') {
		return 0;
	}
	const n = Number(value);
	// Below 0.0005 rounds to 0, and String() would print such a value in
	// exponent form ('1e-7'), which the textual shift below cannot read.
	if (!isFinite(n) || n < 0.0005) {
		return 0;
	}
	// Shift the decimal point textually rather than multiplying by 1000, so
	// a half-step such as 0.1235 rounds up as PHP's round() does (the
	// multiplication gives 123.49999…). Same form as roundLineHeight() in
	// the Paragraph Styles module.
	return Number(Math.round(Number(Math.min(n, V2_INITIAL_HANG_MAX) + 'e3')) + 'e-3');
}

function v2SplitContentIntoLines(html) {
	if (!html) {
		return [''];
	}

	try {
		const parser = new DOMParser();
		const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
		const container = doc.body.firstChild;

		const brs = container.querySelectorAll('br');
		if (!brs.length) {
			return [container.innerHTML];
		}

		const scratch = doc.createElement('div');
		const serializeRange = (range) => {
			scratch.innerHTML = '';
			scratch.appendChild(range.cloneContents());
			return scratch.innerHTML;
		};

		const lines = [];
		let prevBr = null;

		brs.forEach(br => {
			const range = doc.createRange();
			if (prevBr) {
				range.setStartAfter(prevBr);
			} else {
				range.setStart(container, 0);
			}
			range.setEndBefore(br);
			lines.push(serializeRange(range));
			prevBr = br;
		});

		const lastRange = doc.createRange();
		lastRange.setStartAfter(prevBr);
		lastRange.setEnd(container, container.childNodes.length);
		lines.push(serializeRange(lastRange));

		return lines;
	} catch (error) {
		return [html];
	}
}

function v2BuildFitFontSize(ratio, fitMaxSize) {
	if (!(ratio > 0)) {
		return '';
	}
	const cqi = `calc(${ratio} * 100cqi)`;
	return fitMaxSize > 0 ? `min(${cqi}, ${fitMaxSize}px)` : cqi;
}

function v2BuildFitLineOpenTag(ratio, fitMaxSize, fitLineHangs, index) {
	const declarations = [];
	const size = v2BuildFitFontSize(ratio, fitMaxSize);
	if (size) {
		declarations.push(`font-size:${size}`);
	}
	const hang = index > 0 && Array.isArray(fitLineHangs) ? v2NormalizeHang(fitLineHangs[index]) : 0;
	if (hang > 0) {
		declarations.push(`--typost-line-hang:${hang}`);
	}
	return declarations.length
		? `<span class="typost-line" style="${declarations.join(';')}">`
		: '<span class="typost-line">';
}

function v2BuildFitLinesHtml(content, fitLineSizes, fitMaxSize, fitLineHangs) {
	const lines = v2SplitContentIntoLines(content);
	const sizes = Array.isArray(fitLineSizes) ? fitLineSizes : [];

	return lines.map((lineHtml, i) => (
		`${v2BuildFitLineOpenTag(sizes[i], fitMaxSize, fitLineHangs, i)}${lineHtml}</span>`
	)).join('');
}

function v2Save({ attributes }) {
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
		fitLineSizes,
		fitMaxSize,
		initialHang,
		fitLineHangs,
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

		// Fit-to-width: per-line sizes are emitted on the typost-line spans
		// (cqi units); the block-level clamp is the fallback for browsers
		// without container-query support, which drop the calc(...cqi)
		// declaration and let lines inherit this size.
		if (fontSize === 'fit') {
			styleArray.push(`font-size: clamp(${fontSizeMin}px, ${fontSizePreferred / 16}rem + ${((fontSizeMax - fontSizeMin) / (RESPONSIVE_FONT_MAX_VIEWPORT - RESPONSIVE_FONT_MIN_VIEWPORT)) * 100}vw, ${fontSizeMax}px)`);
		}

		// Fixed px size (kept from a paragraph style saved in the inline
		// editor, after Detach or after a deleted style's class is cleared).
		// Same test as buildStyle() in edit.js, so both sides render it.
		// Zero means "no size", as in the paragraph style CSS generators.
		// Blocks saved before this branch existed carry no font-size and
		// validate through the v1 deprecation and are upgraded the next time
		// the post is saved after a block edit.
		if (/^\d+(\.\d+)?$/.test(String(fontSize)) && Number(fontSize) > 0) {
			styleArray.push(`font-size: ${fontSize}px`);
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
	// todo/archive/refactor-style-string-helpers.md.
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
	// supplies the value, like every other typography property. Absent at
	// 0, so blocks saved before this attribute existed serialize unchanged.
	const hang = v2NormalizeHang(initialHang);
	if (!styleClass && hang > 0) {
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
	// except the fixed px font-size above, which v1 never wrote (#218).
	const isFit = fontSize === 'fit';
	const visualValue = isFit ? v2BuildFitLinesHtml(content, fitLineSizes, fitMaxSize, fitLineHangs) : content;
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

// apiVersion 3 for the same reason as v1.
const v2 = {
	apiVersion: 3,
	attributes: v2Attributes,
	supports: v2Supports,
	save: v2Save,
	migrate: keepPxFontSizes
};

export default [ v2, v1 ];
