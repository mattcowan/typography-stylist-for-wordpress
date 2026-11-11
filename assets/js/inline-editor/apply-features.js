/**
 * Apply and patch paths of the inline editor: the format attributes a full
 * rebuild writes, and the per-run patch a mixed selection gets.
 *
 * Moved out of TypographyFeaturesControl._doApplyFeatures() and
 * _buildPatchFromPending() in block-editor.js (#357). The functions are pure:
 * the component reads its state and instance fields, calls them, and resets
 * its pending changes in the same order as before.
 *
 * @since 2.4.0
 */
const { caseDeclarations, buildInlineCaseAttributes, buildInlineCasePatch } = require('../text-case.js');
const { buildInlineFontSizeValue, buildInlineFontSizeAttributes, getNewFontSizeUnit } = require('../font-size-units.js');
const { sanitizeFontVariationSettings } = require('../font-variation-settings.js');

/**
 * Whether the live selection collapsed because the modal took focus, while
 * the bounds saved when it opened still cover a range. The apply, clear and
 * zoom-unit paths then work on the saved bounds.
 *
 * @param {Object}  value               RichText value (start, end)
 * @param {?number} savedSelectionStart Saved start
 * @param {?number} savedSelectionEnd   Saved end
 * @return {boolean} Whether to use the saved bounds
 */
function isSelectionLost(value, savedSelectionStart, savedSelectionEnd) {
    return value.start === value.end && savedSelectionStart !== null && savedSelectionEnd !== null && savedSelectionStart !== savedSelectionEnd;
}

/**
 * The inline format at the selection. When the live selection collapsed
 * due to modal focus, the format must be read at the saved bounds —
 * getActiveFormat() looks at the collapsed caret, which may sit outside the
 * styled span.
 *
 * @param {Object}   value               RichText value
 * @param {boolean}  selectionLost       From isSelectionLost()
 * @param {?number}  savedSelectionStart Saved start
 * @param {string}   formatType          Format type name
 * @param {Function} getActiveFormat     wp.richText.getActiveFormat
 * @return {Object|undefined} The format, if any
 */
function findSelectionFormat(value, selectionLost, savedSelectionStart, formatType, getActiveFormat) {
    if (selectionLost) {
        const formatsAtSaved = (value.formats && value.formats[savedSelectionStart]) || [];
        return formatsAtSaved.find((format) => format.type === formatType);
    }
    return getActiveFormat(value, formatType);
}

/**
 * Raw feature settings (indexed alternates like "salt" 2, set by
 * extensions via data-feature-settings) to keep across re-applies — the
 * comma-tag data-features format cannot express them. The toggles made
 * since the last apply override the raw value's clauses for their tags: a
 * "swsh" 0 written by the Glyphs Panel base cell would otherwise keep
 * winning over the popover toggle.
 *
 * @param {Object|undefined} format          Format at the selection
 * @param {?Object}          pendingChanges  { keys, featureToggles }
 * @param {Object}           shared          window.typostSharedUtils (or {})
 * @return {string} Raw settings, or ''
 */
function resolveRawFeatureSettings(format, pendingChanges, shared) {
    let rawFeatureSettings = (format && format.attributes && format.attributes['data-feature-settings']) || '';
    if (rawFeatureSettings && shared.pruneRawFeatureSettings && pendingChanges) {
        pendingChanges.featureToggles.forEach((toggle) => {
            rawFeatureSettings = shared.pruneRawFeatureSettings(rawFeatureSettings, toggle.tag, toggle.enabled);
        });
    }
    return rawFeatureSettings;
}

/**
 * Convert features array to CSS string
 *
 * @param {string[]} features Feature tags
 * @return {string} font-feature-settings value
 */
function featuresToCSS(features) {
    return features.map(f => `"${f}" 1`).join(', ');
}

/**
 * Whether the popover state describes no styling at all, so the apply
 * removes the format instead of writing an empty span.
 *
 * @param {Object} state Component state
 * @param {Object} opts  { weightToWrite, caseValue, rawFeatureSettings }
 * @return {boolean} Whether nothing is set
 */
function isEmptyFormatState(state, opts) {
    const { selectedFeatures, selectedFont, fontSize, fontStyle, letterSpacing, lineHeight, paragraphStyleId, animationId, fontVariationSettings } = state;
    return selectedFeatures.length === 0 && !selectedFont && fontSize === 'inherit' && !opts.weightToWrite && !fontStyle && !opts.caseValue && letterSpacing === 0 && lineHeight === 0 && !paragraphStyleId && !animationId && !fontVariationSettings && !opts.rawFeatureSettings;
}

/**
 * The attributes of the span a full rebuild writes: data attributes for
 * every set property, and the inline style unless a paragraph style is
 * active (its CSS class renders the span then; the data attributes stay for
 * font detection).
 *
 * @param {Object} state Component state
 * @param {Object} opts  { weightToWrite, caseValue, rawFeatureSettings, sizeUnit }
 * @return {Object} Format attributes
 */
function buildFormatAttributes(state, opts) {
    const { selectedFeatures, selectedFont, selectedFontId, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, fontStyle, fakeSmallCaps, letterSpacing, lineHeight, paragraphStyleId, animationId, fontVariationSettings } = state;
    const { weightToWrite, caseValue, rawFeatureSettings, sizeUnit } = opts;
    // Build attributes
    const attributes = {};
    let styleString = '';
    // Appends one declaration, '; '-separated, unless a style is active
    const declare = (declaration) => {
        if (styleString) styleString += '; ';
        styleString += declaration;
    };

    // When a paragraph style is active, the CSS class provides rendering.
    // We still set data attributes for font detection but skip inline style.
    const hasActiveStyle = paragraphStyleId && paragraphStyleId !== 0;

    if (hasActiveStyle) {
        attributes['data-style-id'] = String(paragraphStyleId);
    }

    // Animation config reference (Animations extension) — the
    // extension's render_block transform consumes it on the frontend
    if (animationId) {
        attributes['data-animation-id'] = String(animationId);
    }

    // Add features. Raw feature settings (indexed alternates) take
    // precedence; toggled tags not already present are appended.
    if (rawFeatureSettings || selectedFeatures.length > 0) {
        let cssValue;
        if (rawFeatureSettings) {
            attributes['data-feature-settings'] = rawFeatureSettings;
            const extraTags = selectedFeatures.filter((tag) => rawFeatureSettings.indexOf('"' + tag + '"') === -1);
            cssValue = rawFeatureSettings + (extraTags.length > 0 ? ', ' + featuresToCSS(extraTags) : '');
        } else {
            cssValue = featuresToCSS(selectedFeatures);
        }
        if (selectedFeatures.length > 0) {
            attributes['data-features'] = selectedFeatures.join(',');
        }
        if (!hasActiveStyle) {
            styleString += `font-feature-settings: ${cssValue}`;
        }
    }

    // Add font family - use CSS variable if fontId is available
    if (selectedFontId) {
        attributes['data-font'] = selectedFont;
        attributes['data-font-id'] = String(selectedFontId);
        if (!hasActiveStyle) {
            declare(`font-family: var(--font-${selectedFontId})`);
        }
    } else if (selectedFont) {
        attributes['data-font'] = selectedFont;
        if (!hasActiveStyle) {
            declare(`font-family: ${selectedFont}`);
        }
    }

    // Add font weight — only a stored or author-picked one (QA E-2)
    if (weightToWrite) {
        attributes['data-fontweight'] = weightToWrite;
        if (!hasActiveStyle) {
            declare(`font-weight: ${weightToWrite}`);
        }
    }

    // Add font style (visual italic — semantic emphasis stays <em>)
    if (fontStyle) {
        attributes['data-fontstyle'] = fontStyle;
        if (!hasActiveStyle) {
            declare(`font-style: ${fontStyle}`);
        }
    }

    // Add case (#214) — how the letters look; the text keeps its case
    if (caseValue) {
        Object.assign(attributes, buildInlineCaseAttributes(caseValue, fakeSmallCaps));
        if (!hasActiveStyle) {
            caseDeclarations(caseValue, fakeSmallCaps).forEach(([property, declared]) => {
                declare(`${property}: ${declared}`);
            });
        }
    }

    // Add letter spacing
    if (letterSpacing !== 0) {
        attributes['data-letterspacing'] = letterSpacing.toString();
        if (!hasActiveStyle) {
            declare(`letter-spacing: ${letterSpacing / 1000}em`);
        }
    }

    // Add line height
    if (lineHeight !== 0) {
        attributes['data-lineheight'] = lineHeight.toString();
        if (!hasActiveStyle) {
            declare(`line-height: ${lineHeight}`);
        }
    }

    // Add font size. 'fit' (from a fit-mode paragraph style) has no
    // inline meaning — spans serialize its fallback clamp as responsive.
    // A fixed size (64, from a paragraph style) is written as a
    // length in the span's unit, not as a clamp() of the sliders,
    // which showed it at their 32px (#255).
    const sizeValue = buildInlineFontSizeValue(fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, sizeUnit);
    if (sizeValue) {
        Object.assign(attributes, buildInlineFontSizeAttributes(fontSize, fontSizeMin, fontSizePreferred, fontSizeMax));

        if (!hasActiveStyle) {
            declare(`font-size: ${sizeValue}`);
        }
    }

    // Add font variation settings (variable font axes)
    if (fontVariationSettings) {
        const safeFontVariationSettings = sanitizeFontVariationSettings(fontVariationSettings);
        if (safeFontVariationSettings) {
            attributes['data-font-variation-settings'] = safeFontVariationSettings;
            if (!hasActiveStyle) {
                declare(`font-variation-settings: ${safeFontVariationSettings}`);
            }
        }
    }

    // Only set inline style when no paragraph style is active
    if (!hasActiveStyle) {
        attributes['style'] = styleString;
    }

    return attributes;
}

/**
 * Translate the pending property changes into a per-run patch for
 * patchTypostFormatAttributes(): data attributes + style declarations
 * to set (or null to remove), plus feature add/remove toggles.
 *
 * @param {Object}  state       Component state
 * @param {Object}  pending     { keys: Set, featureToggles: [] }
 * @param {boolean} clearWeight An extension asked for the weight to be removed
 * @return {{dataAttrs: Object, styleDecls: Object, featureToggles: Array}} Patch
 */
function buildPatchFromPending(state, pending, clearWeight) {
    const { selectedFont, selectedFontId, fontWeight, fontStyle, letterSpacing, lineHeight, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, fontVariationSettings } = state;
    const dataAttrs = {};
    const styleDecls = {};

    if (pending.keys.has('font')) {
        if (selectedFontId) {
            dataAttrs['data-font'] = selectedFont;
            dataAttrs['data-font-id'] = String(selectedFontId);
            styleDecls['font-family'] = `var(--font-${selectedFontId})`;
        } else if (selectedFont) {
            dataAttrs['data-font'] = selectedFont;
            dataAttrs['data-font-id'] = null;
            styleDecls['font-family'] = selectedFont;
        } else {
            dataAttrs['data-font'] = null;
            dataAttrs['data-font-id'] = null;
            styleDecls['font-family'] = null;
        }
        // Axis values are font-specific — a font change invalidates them
        dataAttrs['data-font-variation-settings'] = null;
        styleDecls['font-variation-settings'] = null;
    }
    if (pending.keys.has('fontWeight')) {
        // An explicit clear removes the weight from every run
        dataAttrs['data-fontweight'] = clearWeight ? null : fontWeight;
        styleDecls['font-weight'] = clearWeight ? null : fontWeight;
    }
    if (pending.keys.has('fontStyle')) {
        dataAttrs['data-fontstyle'] = fontStyle || null;
        styleDecls['font-style'] = fontStyle || null;
    }
    if (pending.keys.has('textCase')) {
        // Every case attribute and declaration is set or removed, so
        // a run that had another case keeps none of it (#214)
        const casePatch = buildInlineCasePatch(state.textCase, state.fakeSmallCaps);
        Object.assign(dataAttrs, casePatch.dataAttrs);
        Object.assign(styleDecls, casePatch.styleDecls);
    }
    if (pending.keys.has('letterSpacing')) {
        dataAttrs['data-letterspacing'] = letterSpacing !== 0 ? String(letterSpacing) : null;
        styleDecls['letter-spacing'] = letterSpacing !== 0 ? `${letterSpacing / 1000}em` : null;
    }
    if (pending.keys.has('lineHeight')) {
        dataAttrs['data-lineheight'] = lineHeight !== 0 ? String(lineHeight) : null;
        styleDecls['line-height'] = lineHeight !== 0 ? String(lineHeight) : null;
    }
    if (pending.keys.has('fontSize')) {
        // 'fit' (from a fit-mode paragraph style) has no inline
        // meaning — spans serialize its fallback clamp as responsive.
        // A fixed size is a length and has no slider values (#255), so
        // those are removed (null) like every attribute of no size.
        const sizeValue = buildInlineFontSizeValue(fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, getNewFontSizeUnit());
        const sizeAttrs = (sizeValue && buildInlineFontSizeAttributes(fontSize, fontSizeMin, fontSizePreferred, fontSizeMax)) || {};
        ['data-fontsize', 'data-fontsize-min', 'data-fontsize-preferred', 'data-fontsize-max'].forEach((key) => {
            dataAttrs[key] = sizeAttrs[key] || null;
        });
        styleDecls['font-size'] = sizeValue;
    }
    if (pending.keys.has('fontVariationSettings')) {
        const safeSettings = sanitizeFontVariationSettings(fontVariationSettings || '');
        dataAttrs['data-font-variation-settings'] = safeSettings || null;
        styleDecls['font-variation-settings'] = safeSettings || null;
    }

    return {
        dataAttrs: dataAttrs,
        styleDecls: styleDecls,
        featureToggles: pending.featureToggles.slice()
    };
}

/**
 * Patch each formatting run of a mixed selection: only the properties
 * changed since the last apply, leaving everything else about each run
 * untouched. A run whose patch leaves nothing loses the format.
 *
 * @param {Object} value      RichText value
 * @param {Array}  runs       From computeTypostFormatRuns()
 * @param {Object} patch      From buildPatchFromPending()
 * @param {Object} shared     window.typostSharedUtils (patchTypostFormatAttributes)
 * @param {Object} richText   { applyFormat, removeFormat }
 * @param {string} formatType Format type name
 * @return {Object} The new value
 */
function applyPatchToRuns(value, runs, patch, shared, richText, formatType) {
    let newValue = value;
    runs.forEach((run) => {
        const patchedAttrs = shared.patchTypostFormatAttributes(run.attributes, patch);
        if (patchedAttrs) {
            newValue = richText.applyFormat(newValue, {
                type: formatType,
                attributes: patchedAttrs
            }, run.start, run.end);
        } else if (run.attributes) {
            newValue = richText.removeFormat(newValue, formatType, run.start, run.end);
        }
    });
    return newValue;
}

module.exports = {
    isSelectionLost: isSelectionLost,
    findSelectionFormat: findSelectionFormat,
    resolveRawFeatureSettings: resolveRawFeatureSettings,
    featuresToCSS: featuresToCSS,
    isEmptyFormatState: isEmptyFormatState,
    buildFormatAttributes: buildFormatAttributes,
    buildPatchFromPending: buildPatchFromPending,
    applyPatchToRuns: applyPatchToRuns
};
