/**
 * Convert to block: the content and the safety fallback of
 * TypographyFeaturesControl.convertToBlock() in block-editor.js.
 *
 * Moved out of block-editor.js (#357). The component still reads the
 * selection, the weights and the block, and dispatches the block changes;
 * these functions build the new content and schedule the fallback.
 *
 * @since 2.4.0
 */
const { buildInlineFontSizeValue, buildInlineFontSizeAttributes } = require('../font-size-units.js');
const { caseDeclarations, buildInlineCaseAttributes } = require('../text-case.js');
const { sanitizeFontVariationSettings } = require('../font-variation-settings.js');
const { escapeHTML, escapeAttribute, hasHTMLTags, sanitizeFontFamily, sanitizeCSSValue } = require('./sanitize.js');
const { isEmptyBlockContent } = require('../theme-look.js');

/**
 * The tag of the Typography Stylist block a conversion creates or keeps.
 *
 * @param {Object} block The selected block
 * @return {string} 'h1'…'h6' or 'p' (default 'h2')
 */
function resolveConvertTagName(block) {
    // Determine tag from block name (core/heading, core/paragraph, or existing Typographic Stylist block)
    let tagName = 'h2';
    if (block.name === 'typost/block') {
        tagName = block.attributes.tagName || 'h2';
    } else if (block.name === 'core/heading' && block.attributes.level) {
        tagName = `h${block.attributes.level}`;
    } else if (block.name === 'core/paragraph') {
        tagName = 'p';
    }
    return tagName;
}

/**
 * Whether the block a conversion starts from has no text (#412).
 *
 * Tested on the same text the whole-block conversion uses: the block's
 * content attribute, or, when the block has none (a Pullquote, or any block
 * whose text is not in `content`), the text of the RichText that holds the
 * caret. Testing the content attribute alone treated such a block as empty
 * and replaced its text with an empty block (review of #412).
 *
 * @param {*}      blockContent The block's content attribute (string,
 *                              RichTextData or undefined)
 * @param {string} valueText    The text of the RichText value (getTextContent(value))
 * @return {boolean} True when there is no text to convert
 */
function isConvertSourceEmpty(blockContent, valueText) {
    const content = String(blockContent || '');
    if (content) {
        return isEmptyBlockContent(content);
    }
    // getTextContent(value) is plain text, not markup: '<b>' is text
    return isEmptyBlockContent(escapeHTML(String(valueText || '')));
}

/**
 * The attributes and the style of the span a partial conversion wraps the
 * selection in.
 *
 * Both branches of buildPartialConvertContent() write the span from these
 * parts, so text with tags and plain text get the same span (#454). The
 * attributes are the ones the block's Quick Feature Toggles write for the
 * same settings: data-font-id (no data-font family name: the toggles do
 * not write it, and rendering keys off the ID), data-fontweight,
 * data-fontstyle, data-letterspacing, data-lineheight and
 * data-font-variation-settings, so the block reads the selection's
 * settings back from the span. A raw feature value (an indexed alternate
 * such as "salt" 2) is kept in data-feature-settings and leads the
 * font-feature-settings value, as the inline editor's apply writes it
 * (buildFormatAttributes() in apply-features.js).
 *
 * Every value is sanitized here. The caller escapes the attribute values
 * when it serializes them.
 *
 * @param {Object} state              Component state
 * @param {string} spanWeight         Weight the span gets ('' for none)
 * @param {string} sizeUnit           Unit of the size (getZoomNoticeUnit())
 * @param {string} [rawFeatureSettings] Raw feature value of the selection
 *                                    (resolveRawFeatureSettings()), or ''
 * @return {{attributes: Object, styleString: string, sizeAttributes: ?Object, caseAttributes: Object}} Span parts;
 *         attributes holds every data attribute of the span, in the order
 *         of the style declarations (sizeAttributes and caseAttributes are
 *         also in it)
 */
function buildConvertSpanParts(state, spanWeight, sizeUnit, rawFeatureSettings) {
    // Build style string for the selected portion
    const { selectedFeatures, selectedFont, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, letterSpacing, lineHeight } = state;
    const styleArray = [];
    const attributes = {};

    // Sanitize each feature ID to prevent injection; an ID that sanitizes
    // to nothing is dropped
    const sanitizedFeatures = (selectedFeatures || []).map(f => sanitizeCSSValue(f)).filter(f => f);
    // The raw value keeps its quotes; a ';' or an angle bracket could add a
    // declaration or end the markup
    const raw = rawFeatureSettings ? String(rawFeatureSettings).replace(/[;<>]/g, '').trim() : '';
    if (raw || sanitizedFeatures.length > 0) {
        // Raw clauses first; a toggled tag the raw value does not name is
        // appended with 1 (as buildFormatAttributes() writes it)
        const extraTags = raw ? sanitizedFeatures.filter(f => raw.indexOf(`"${f}"`) === -1) : sanitizedFeatures;
        const plain = extraTags.map(f => `"${f}" 1`).join(', ');
        if (raw) {
            attributes['data-feature-settings'] = raw;
        }
        if (sanitizedFeatures.length > 0) {
            attributes['data-features'] = sanitizedFeatures.join(',');
        }
        styleArray.push(`font-feature-settings: ${raw ? (plain ? `${raw}, ${plain}` : raw) : plain}`);
    }
    // A font ID that is not a positive number is no ID
    const fontId = parseInt(state.selectedFontId, 10) || 0;
    if (fontId > 0) {
        // Modern format: CSS variable keyed by numeric font ID (drives
        // frontend @font-face detection like every other span)
        attributes['data-font-id'] = String(fontId);
        styleArray.push(`font-family: var(--font-${fontId})`);
    } else if (selectedFont) {
        const sanitizedFont = sanitizeFontFamily(selectedFont);
        styleArray.push(`font-family: ${sanitizedFont}`);
    }
    if (spanWeight) {
        const sanitizedWeight = sanitizeCSSValue(spanWeight);
        attributes['data-fontweight'] = sanitizedWeight;
        styleArray.push(`font-weight: ${sanitizedWeight}`);
    }
    // Visual italic (semantic emphasis stays <em>)
    const sanitizedFontStyle = sanitizeCSSValue(state.fontStyle);
    if (sanitizedFontStyle) {
        attributes['data-fontstyle'] = sanitizedFontStyle;
        styleArray.push(`font-style: ${sanitizedFontStyle}`);
    }
    // Thousandths of an em, as the controls store it; 0 (or a value that is
    // not a number) is no spacing
    const sanitizedSpacing = parseFloat(letterSpacing) || 0;
    if (sanitizedSpacing !== 0) {
        attributes['data-letterspacing'] = String(sanitizedSpacing);
        styleArray.push(`letter-spacing: ${sanitizedSpacing / 1000}em`);
    }
    const sanitizedLineHeight = parseFloat(lineHeight) || 0;
    if (sanitizedLineHeight > 0) {
        attributes['data-lineheight'] = String(sanitizedLineHeight);
        styleArray.push(`line-height: ${sanitizedLineHeight}`);
    }
    // The size is written as in an apply: a fixed size (64, from a
    // paragraph style) as a length, not dropped, in the unit the
    // rebuild would use — a size the author did not change keeps
    // the span's unit (#255, review)
    const minPx = parseFloat(fontSizeMin) || 16;
    const prefPx = parseFloat(fontSizePreferred) || 24;
    const maxPx = parseFloat(fontSizeMax) || 32;
    const sizeValue = buildInlineFontSizeValue(fontSize, minPx, prefPx, maxPx, sizeUnit);
    // data-fontsize lets the block read the size back (#255, review)
    const sizeAttributes = sizeValue ? buildInlineFontSizeAttributes(fontSize, minPx, prefPx, maxPx) : null;
    if (sizeValue) {
        Object.assign(attributes, sizeAttributes);
        styleArray.push(`font-size: ${sizeValue}`);
    }
    // Case (#214): the span keeps the selection's case, as an apply writes it
    const caseAttributes = buildInlineCaseAttributes(state.textCase, state.fakeSmallCaps);
    Object.assign(attributes, caseAttributes);
    caseDeclarations(state.textCase, state.fakeSmallCaps).forEach(([property, declared]) => {
        styleArray.push(`${property}: ${declared}`);
    });
    // Variable font axes: '' for a value that is not a valid list of axes
    const safeFontVariationSettings = sanitizeFontVariationSettings(state.fontVariationSettings);
    if (safeFontVariationSettings) {
        attributes['data-font-variation-settings'] = safeFontVariationSettings;
        styleArray.push(`font-variation-settings: ${safeFontVariationSettings}`);
    }

    return { attributes: attributes, styleString: styleArray.join('; '), sizeAttributes: sizeAttributes, caseAttributes: caseAttributes };
}

/**
 * The block content of a partial conversion: the existing content with the
 * selection wrapped in a span that carries the selection's typography.
 *
 * @param {Object}  args
 * @param {string}  args.existingContent The block's HTML content
 * @param {string}  args.fullText        The block's text
 * @param {number}  args.start           Selection start
 * @param {number}  args.end             Selection end
 * @param {Object}  args.state           Component state
 * @param {string}  args.spanWeight      Weight the span gets ('' for none)
 * @param {string}  args.sizeUnit        Unit of the size
 * @param {boolean} args.clearWeight     An extension asked for the weight to be removed
 * @param {Object}  args.shared          window.typostSharedUtils (or undefined)
 * @param {string}  [args.rawFeatureSettings] Raw feature value of the selection, or ''
 * @return {string} Content for the block
 */
function buildPartialConvertContent(args) {
    const { existingContent, fullText, start, end, state, spanWeight, clearWeight, shared } = args;
    // One attribute map for both branches (#454)
    const { attributes, styleString } = buildConvertSpanParts(state, spanWeight, args.sizeUnit, args.rawFeatureSettings);

    // If we have existing HTML content with spans, we need to preserve it
    if (hasHTMLTags(existingContent)) {
        // A copy: the applier's merge writes into the object it is given
        const spanAttributes = Object.assign({}, attributes);

        // Apply over the existing HTML with the shared span-preserving
        // applier: selections crossing span boundaries are extracted and
        // re-wrapped with every surrounding span intact (the old
        // surroundContents call threw on ANY cross-span selection and
        // fell back to a plain-text rebuild that destroyed all existing
        // styling — exactly the selections the convert button exists for)
        // An explicit clear (a falsy fontWeight from an extension)
        // must reach the enclosing span too: the applier only wraps
        // a new span and never strips a property from the span
        // around it, so the old weight would stay in force
        // (PR #194 re-review)
        let convertSource = existingContent;
        if (clearWeight && shared && shared.removePropertyFromSelection) {
            const cleared = shared.removePropertyFromSelection(existingContent, start, end, 'data-fontweight', 'font-weight');
            if (cleared.success) {
                convertSource = cleared.content;
            }
        }
        const applied = (shared && shared.applyStylingSafeStringMethod)
            ? shared.applyStylingSafeStringMethod(convertSource, start, end, spanAttributes, styleString)
            : { success: false };

        // On failure, convert with the content untouched rather than
        // ever rebuilding from plain text — no styling is worth losing
        return applied.success ? applied.content : convertSource;
    }

    // No existing HTML, use simple text replacement
    const beforeText = fullText.substring(0, start);
    const selectedText = fullText.substring(start, end);
    const afterText = fullText.substring(end);
    // The same attributes as the branch above, written in the same way as
    // the shared applier writes a new span (an empty value is left out), so
    // the content is the one the applier would write on the escaped text.
    // Every value is escaped (#369, #454): a feature's quotes ("dlig" 1)
    // ended the style attribute early, and the browser read
    // `font-feature-settings: ` with no value. The quotes are written as
    // &quot;, as the DOM serializer writes them for the block's own controls
    // (applyStylingSafeStringMethod() in the branch above).
    const attributeString = Object.keys(attributes)
        .filter((key) => attributes[key] !== null && attributes[key] !== undefined && attributes[key] !== '')
        .map((key) => ` ${key}="${escapeAttribute(attributes[key])}"`)
        .join('');
    const styleAttribute = styleString ? ` style="${escapeAttribute(styleString)}"` : '';
    return escapeHTML(beforeText) +
        `<span class="typost-styled"${attributeString}${styleAttribute}>${escapeHTML(selectedText)}</span>` +
        escapeHTML(afterText);
}

/**
 * Safety fallback: verify the replacement succeeded.
 *
 * replaceBlocks removes the old block and creates a new one with a different
 * clientId. If the old block is gone, the replacement succeeded (even if the
 * user deselected within the timeout window). Only fall back when the old
 * block still exists, meaning replaceBlocks was silently blocked (e.g., by
 * pattern locking), and the selection is not a Typography Stylist block.
 *
 * @param {string}   clientId   The replaced block's client ID
 * @param {Function} onFallback Called when the conversion did not happen
 */
function scheduleConvertFallback(clientId, onFallback) {
    setTimeout(() => {
        const blockEditorSelect = wp.data.select('core/block-editor');
        const oldBlock = blockEditorSelect.getBlock(clientId);

        if (!oldBlock) {
            return;
        }

        const selectedAfter = blockEditorSelect.getSelectedBlock();
        if (!selectedAfter || selectedAfter.name !== 'typost/block') {
            onFallback();
        }
    }, 100);
}

module.exports = {
    resolveConvertTagName: resolveConvertTagName,
    isConvertSourceEmpty: isConvertSourceEmpty,
    buildConvertSpanParts: buildConvertSpanParts,
    buildPartialConvertContent: buildPartialConvertContent,
    scheduleConvertFallback: scheduleConvertFallback
};
