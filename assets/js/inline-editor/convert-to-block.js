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
const { escapeHTML, escapeAttribute, hasHTMLTags, sanitizeFontFamily, sanitizeCSSValue } = require('./sanitize.js');

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
 * The style declarations and extra attributes of the span a partial
 * conversion wraps the selection in.
 *
 * @param {Object} state      Component state
 * @param {string} spanWeight Weight the span gets ('' for none)
 * @param {string} sizeUnit   Unit of the size (getZoomNoticeUnit())
 * @return {{styleString: string, sizeAttributes: ?Object, caseAttributes: Object}} Span parts
 */
function buildConvertSpanParts(state, spanWeight, sizeUnit) {
    // Build style string for the selected portion
    const { selectedFeatures, selectedFont, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, letterSpacing, lineHeight } = state;
    const styleArray = [];

    if (selectedFeatures.length > 0) {
        // Sanitize each feature ID to prevent injection
        const sanitizedFeatures = selectedFeatures.map(f => sanitizeCSSValue(f));
        styleArray.push(`font-feature-settings: ${sanitizedFeatures.map(f => `"${f}" 1`).join(', ')}`);
    }
    if (state.selectedFontId) {
        // Modern format: CSS variable keyed by numeric font ID (drives
        // frontend @font-face detection like every other span)
        styleArray.push(`font-family: var(--font-${parseInt(state.selectedFontId, 10)})`);
    } else if (selectedFont) {
        const sanitizedFont = sanitizeFontFamily(selectedFont);
        styleArray.push(`font-family: ${sanitizedFont}`);
    }
    if (spanWeight) {
        const sanitizedWeight = sanitizeCSSValue(spanWeight);
        styleArray.push(`font-weight: ${sanitizedWeight}`);
    }
    if (letterSpacing !== 0) {
        const sanitizedSpacing = parseFloat(letterSpacing) || 0;
        styleArray.push(`letter-spacing: ${sanitizedSpacing / 1000}em`);
    }
    if (lineHeight && lineHeight !== 0) {
        const sanitizedLineHeight = parseFloat(lineHeight) || 0;
        if (sanitizedLineHeight > 0) {
            styleArray.push(`line-height: ${sanitizedLineHeight}`);
        }
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
        styleArray.push(`font-size: ${sizeValue}`);
    }
    // Case (#214): the span keeps the selection's case, as an apply writes it
    const caseAttributes = buildInlineCaseAttributes(state.textCase, state.fakeSmallCaps);
    caseDeclarations(state.textCase, state.fakeSmallCaps).forEach(([property, declared]) => {
        styleArray.push(`${property}: ${declared}`);
    });

    return { styleString: styleArray.join('; '), sizeAttributes: sizeAttributes, caseAttributes: caseAttributes };
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
 * @return {string} Content for the block
 */
function buildPartialConvertContent(args) {
    const { existingContent, fullText, start, end, state, spanWeight, clearWeight, shared } = args;
    const { selectedFeatures } = state;
    const { styleString, sizeAttributes, caseAttributes } = buildConvertSpanParts(state, spanWeight, args.sizeUnit);

    // If we have existing HTML content with spans, we need to preserve it
    if (hasHTMLTags(existingContent)) {
        // Build the new span's attributes in the modern format
        const spanAttributes = Object.assign({}, sizeAttributes, caseAttributes);
        if (selectedFeatures.length > 0) {
            spanAttributes['data-features'] = selectedFeatures.map(f => sanitizeCSSValue(f)).join(',');
        }
        if (state.selectedFontId) {
            spanAttributes['data-font-id'] = String(state.selectedFontId);
        }
        if (spanWeight) {
            spanAttributes['data-fontweight'] = String(spanWeight);
        }

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
    const extraAttributes = Object.assign({}, sizeAttributes, caseAttributes);
    const sizeAttributeString = Object.keys(extraAttributes)
        .map((key) => ` ${key}="${escapeAttribute(extraAttributes[key])}"`)
        .join('');
    return escapeHTML(beforeText) +
        `<span class="typost-styled" data-features="${selectedFeatures.join(',')}"${sizeAttributeString} style="${styleString}">${escapeHTML(selectedText)}</span>` +
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
    buildConvertSpanParts: buildConvertSpanParts,
    buildPartialConvertContent: buildPartialConvertContent,
    scheduleConvertFallback: scheduleConvertFallback
};
