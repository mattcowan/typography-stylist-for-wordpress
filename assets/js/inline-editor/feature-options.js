/**
 * Option lists of the inline editor's modal: features grouped by category,
 * the category titles, the translated weight options, and the style of a
 * feature's preview button.
 *
 * Moved out of TypographyFeaturesControl (groupFeatures, getCategoryTitle,
 * getFilteredWeightOptions, renderFeatureToggle) in block-editor.js (#357).
 * The block's getFilteredWeightOptions() in utils.js is not the same: its
 * labels are not translated.
 *
 * @since 2.4.0
 */
const { caseStyleObject } = require('../text-case.js');

/**
 * Group the features this font shows by category.
 *
 * @param {Object} data   typostData (features, fontFeatureVisibility)
 * @param {number} fontId Selected font ID (0 = no per-font filter)
 * @param {Object} shared window.typostSharedUtils (filterFeaturesByVisibility), or undefined
 * @return {Object} Features keyed by category, in first-seen order
 */
function groupFeatures(data, fontId, shared) {
    const allFeatures = data.features || [];
    const visibilityMap = data.fontFeatureVisibility || {};

    // Filter by per-font visibility if the utility is available
    const features = (shared && shared.filterFeaturesByVisibility)
        ? shared.filterFeaturesByVisibility(allFeatures, fontId, visibilityMap)
        : allFeatures;

    const grouped = {};
    features.forEach(feature => {
        const category = feature.category || 'other';
        if (!grouped[category]) {
            grouped[category] = [];
        }
        grouped[category].push(feature);
    });

    return grouped;
}

/**
 * Get category title
 *
 * @param {string} category Category key
 * @return {string} Translated title, or the key itself when unknown
 */
function getCategoryTitle(category) {
    const { __ } = wp.i18n;
    const titles = {
        'ligatures': __('Ligatures', 'typography-stylist'),
        'stylistic-sets': __('Stylistic Sets', 'typography-stylist'),
        'alternates': __('Swashes & Alternates', 'typography-stylist'),
        'decorative': __('Decorative', 'typography-stylist'),
        'numerals': __('Numerals & Figures', 'typography-stylist'),
        'capitals': __('Capitals & Case', 'typography-stylist'),
        'positional': __('Positional Forms', 'typography-stylist'),
        'super-sub': __('Superscript & Ordinals', 'typography-stylist'),
        'other': __('Other Features', 'typography-stylist')
    };

    return titles[category] || category;
}

/**
 * Get filtered weight options based on the selected font's available weights.
 * Returns all weights if no font is selected or font has no restrictions.
 *
 * @param {number} fontId    Selected font ID
 * @param {Object} fontIdMap Font ID -> { availableWeights }
 * @return {Array<{label: string, value: string}>} Options
 */
function getFilteredWeightOptions(fontId, fontIdMap) {
    const { __ } = wp.i18n;
    const ALL_WEIGHTS = [
        { label: __('100 (Thin)', 'typography-stylist'), value: '100' },
        { label: __('200 (Extra Light)', 'typography-stylist'), value: '200' },
        { label: __('300 (Light)', 'typography-stylist'), value: '300' },
        { label: __('400 (Normal)', 'typography-stylist'), value: '400' },
        { label: __('500 (Medium)', 'typography-stylist'), value: '500' },
        { label: __('600 (Semi Bold)', 'typography-stylist'), value: '600' },
        { label: __('700 (Bold)', 'typography-stylist'), value: '700' },
        { label: __('800 (Extra Bold)', 'typography-stylist'), value: '800' },
        { label: __('900 (Black)', 'typography-stylist'), value: '900' }
    ];

    if (!fontId || !fontIdMap || !fontIdMap[fontId]) {
        return ALL_WEIGHTS;
    }

    const available = fontIdMap[fontId].availableWeights;
    if (!available || available.length === 0) {
        return ALL_WEIGHTS;
    }

    return ALL_WEIGHTS.filter(w => available.includes(w.value));
}

/**
 * Style of a feature's preview button: with this feature AND all currently
 * selected features, in the font the text shows.
 *
 * @param {string}   featureId        The feature
 * @param {string[]} selectedFeatures Features already selected
 * @param {string}   fontToUse        Selected font, or the block's inherited font
 * @param {string}   renderedStyle    Rendered font style ('' for none)
 * @param {string}   textCase         Chosen case
 * @param {boolean}  fakeSmallCaps    Fake small caps allowed
 * @return {Object} React style object
 */
function buildFeaturePreviewStyle(featureId, selectedFeatures, fontToUse, renderedStyle, textCase, fakeSmallCaps) {
    // Build preview styles - with this feature AND all currently selected features
    const allPreviewFeatures = [...new Set([featureId, ...selectedFeatures])];
    const previewStyle = {
        fontFeatureSettings: allPreviewFeatures.map(f => `"${f}" 1`).join(', ')
    };
    // Use selected font, or fallback to block's inherited font when Default is selected
    if (fontToUse) {
        previewStyle.fontFamily = fontToUse;
    }

    // Render the italic face when the selection is italic — the live
    // popover Font Style choice first, then the span's data-fontstyle,
    // then the editor's own Italic <em> format. Italic faces carry
    // their own glyphs and feature sets.
    if (renderedStyle) {
        previewStyle.fontStyle = renderedStyle;
    }
    // The chosen case (#214): smcp, c2sc and case look different on capitals
    Object.assign(previewStyle, caseStyleObject(textCase, fakeSmallCaps));
    return previewStyle;
}

module.exports = {
    groupFeatures: groupFeatures,
    getCategoryTitle: getCategoryTitle,
    getFilteredWeightOptions: getFilteredWeightOptions,
    buildFeaturePreviewStyle: buildFeaturePreviewStyle
};
