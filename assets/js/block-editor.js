/**
 * Block Editor Integration for Typography Stylist
 * Adds custom format type for OpenType features
 */

// Import drag/resize utilities (CommonJS for browserify)
const { constrainToViewport, calculateDragDelta, calculateResize } = require('./modal-drag-resize.js');

// Shared font picker option builder + WP Font Library adoption helpers
const { buildFontOptions, isWpLibraryValue, wpSlugFromValue, adoptWpFont, resolveActiveFontFamily, resolveFontIdFromFamily } = require('./font-options.js');

// Convert-to-block capability resolution (why the Convert action is offered or not)
const { CONVERT_BLOCKED, resolveConvertCapability, shouldExplainConvertBlock, shouldExplainInNotice } = require('./convert-capability.js');
const { resolveWeightToWrite, buildConvertBlockAttributes, resolvePresetFontState, resolveParagraphStyleFontWeight, resolveSpanStoredFontWeight, resolveSpanExplicitFontId, resolveSetFontWeight } = require('./inline-apply-rules.js');
// A size this editor writes is new content and is written in the site's
// new-content unit: rem (#233), or px when the Options setting asks for it
// (#248, getNewFontSizeUnit). A size the author did not change keeps the
// unit the span already has (resolveSpanFontSizeUnit), so older spans are
// not rewritten.
const { parseFixedFontSize, resolveSpanFontSizeUnit, getNewFontSizeUnit } = require('./font-size-units.js');
// Case (#214): the same mapping as the block and the paragraph styles
const { normalizeTextCase, readInlineCase } = require('./text-case.js');
// Helpers shared with the Typography Stylist block's build (utils.js
// re-exports them). browserify can require utils.js itself, but that
// bundles all of it and runs its window.typostSharedUtils assignment a
// second time, so shared code lives in CommonJS modules (#357).
const { filterToolbarButtons } = require('./toolbar-buttons.js');
const { sanitizeFontVariationSettings } = require('./font-variation-settings.js');
const { getClosestWeight } = require('./font-weights.js');
// The inline editor's own modules (#357): the class below keeps the state
// and the lifecycle; these hold the logic and the modal's sections
const { createHookRegistry } = require('./inline-editor/hook-registry.js');
const { escapeHTML, hasHTMLTags, validateSelectionBounds, isFlagEnabled, sanitizeFontFamily, sanitizeCSSValue } = require('./inline-editor/sanitize.js');
const { getBlockInheritedFont, getBlockInheritedWeight, getSelectedBlockInheritedFont, getSelectedBlockInheritedWeight } = require('./inline-editor/block-dom.js');
const { findStyledSpanInContent, readSpanFeatures } = require('./inline-editor/span-reading.js');
const { isSelectionLost, findSelectionFormat, resolveRawFeatureSettings, isEmptyFormatState, buildFormatAttributes, buildPatchFromPending, applyPatchToRuns } = require('./inline-editor/apply-features.js');
const { resolveConvertTagName, buildPartialConvertContent, scheduleConvertFallback } = require('./inline-editor/convert-to-block.js');
const { createExtensionListeners, attachExtensionListeners, detachExtensionListeners } = require('./inline-editor/extension-listeners.js');
const { groupFeatures, getFilteredWeightOptions } = require('./inline-editor/feature-options.js');
const { InlineToolbar, ModalHeader, TipsNotice, HookPoint, ResizeHandles } = require('./inline-editor/modal-chrome.js');
const { WordBoundaryNotice, FontDetectionNotice, FontFamilyPanel, FontWeightPanel, FontStylePanel, CasePanel, FontSizePanel, LineHeightPanel, LetterSpacingPanel, PresetsPanel, FeaturesPanel, ConvertSection, ClearConfirmation, ModalActions } = require('./inline-editor/modal-panels.js');

// The IIFE that wrapped this file only bound `wp`; module scope is private
// under browserify and Jest, so bind it once here instead (#357).
const wp = window.wp;
const { registerFormatType, applyFormat, removeFormat, getActiveFormat, slice, getTextContent } = wp.richText;
const { Component, Fragment } = wp.element;
const { Modal } = wp.components;
const { __, sprintf } = wp.i18n;

const { compose, debounce } = wp.compose;

/**
 * Typography Stylist Hook System (inline-editor/hook-registry.js).
 * One registry per page: a script that loaded first keeps its own.
 *
 * @since 2.0.0
 */
window.typostHooks = window.typostHooks || createHookRegistry();

// Define the format type name
const FORMAT_TYPE = 'typost/features';

// Expose utilities for testing
if (typeof window !== 'undefined') {
    window.typostUtils = {
        escapeHTML,
        hasHTMLTags,
        validateSelectionBounds,
        sanitizeFontFamily,
        sanitizeCSSValue,
        sanitizeFontVariationSettings,
        getBlockInheritedFont,
        getBlockInheritedWeight,
        isFlagEnabled
    };
}

/**
 * Toolbar icon: a swash "T" — the launcher for the inline Typography
 * Stylist format popover. Source: assets/images/icons/toolbar-t.svg.
 *
 * The same mark the Typography Stylist block uses for its Quick Feature
 * Toggle button (blocks/typography-stylist/edit.js): one popover editor
 * per editing surface, one icon for both. The "TS" monogram in
 * blocks/typography-stylist/index.js is a different mark and identifies
 * the block itself, not this control.
 *
 * 24×24 matches the swash G and P supplied by the Glyphs Panel and
 * Paragraph Styles modules, so the toolbar group sits on one cap height.
 */
const TSIcon = () => (
    wp.element.createElement('svg', {
        width: 24,
        height: 24,
        viewBox: '0 0 256 256',
        xmlns: 'http://www.w3.org/2000/svg',
        'aria-hidden': 'true',
        focusable: 'false'
    },
        wp.element.createElement('path', {
            d: 'M86.93,19.59c51.57,0,99.2,30.44,125.69,30.44,12.4,0,13.25-12.96,22.26-12.96,5.92,0,8.74,3.95,8.74,7.89,0,10.43-16.06,26.21-48.19,26.21-10.71-.28-21.42-1.41-32.13-2.82v136.4c0,16.06,4.23,18.32,22.26,19.73v11.84h-94.41v-11.84c18.04-1.41,22.26-3.66,22.26-19.73V58.76c-18.6-3.95-34.94-7.61-48.47-7.61-20.01,0-35.23,10.71-35.23,30.15,0,9.58,4.79,18.04,12.68,18.04,10.15,0,12.4-16.63,30.44-16.63,12.68,0,22.54,10.15,22.54,22.83,0,16.63-13.25,28.75-34.94,28.75-26.21,0-50.16-18.6-50.16-52.98,0-37.76,35.79-61.72,76.65-61.72Z',
            fill: 'currentColor'
        })
    )
);

/**
 * Sequence backing the per-instance modal heading ids.
 *
 * The inline format control is a class component with no clientId to lean
 * on, and two instances can be mounted at once (one per rich-text field),
 * so the heading each dialog is named by has to be unique per instance.
 */
let typostInlineInstanceCount = 0;

/**
 * How long after the modal opens the word-boundary notice is announced.
 * Long enough for a screen reader to finish "Typography Stylist, dialog"
 * (NVDA needs well under half a second); short enough that the warning
 * still arrives before the author starts tabbing (see
 * scheduleWordBoundaryAnnouncement).
 */
const WORD_BOUNDARY_ANNOUNCE_DELAY = 800;

/**
 * Typography Features Component
 */
class TypographyFeaturesControl extends Component {
    constructor(props) {
        super(props);

        // Names this instance's modal. See typostInlineInstanceCount above.
        typostInlineInstanceCount += 1;
        this.modalTitleId = `typost-inline-title-${typostInlineInstanceCount}`;
        this.wordBoundaryNoticeId = `typost-inline-word-boundary-${typostInlineInstanceCount}`;
        // Pending deferred announcement of the word-boundary notice (see togglePopover)
        this._noticeSpeakTimer = null;

        // Property changes recorded since the last apply. When the selection
        // is mixed (multiple distinct typost formats), only these changes are
        // applied per-run — the rest of each run's formatting is preserved.
        this._pendingChanges = { keys: new Set(), featureToggles: [] };
        // Whether setFontWeight() ran in this popover session. A weight is
        // written onto the span only when the author picked one (or the
        // selection already stores one) — never the display default, which
        // lightened theme-bold headings on every feature toggle (QA E-2).
        this._authorPickedWeight = false;
        // An extension asked for the weight to be removed (a falsy
        // fontWeight on typost-apply-block-properties): both apply paths
        // strip data-fontweight/font-weight instead of writing '400'
        this._clearWeight = false;

        this.state = this._buildInitialState();

        this.togglePopover = this.togglePopover.bind(this);
        this.toggleFeature = this.toggleFeature.bind(this);
        this.applyPreset = this.applyPreset.bind(this);
        this.clearFeatures = this.clearFeatures.bind(this);
        this.handleClearClick = this.handleClearClick.bind(this);
        this.confirmClear = this.confirmClear.bind(this);
        this.cancelClear = this.cancelClear.bind(this);
        this.setFont = this.setFont.bind(this);
        this.setFontSize = this.setFontSize.bind(this);
        this.setFontSizeMin = this.setFontSizeMin.bind(this);
        this.setFontSizePreferred = this.setFontSizePreferred.bind(this);
        this.setFontSizeMax = this.setFontSizeMax.bind(this);
        this.setFontWeight = this.setFontWeight.bind(this);
        this.setFontStyle = this.setFontStyle.bind(this);
        this.setTextCase = this.setTextCase.bind(this);
        this.setFakeSmallCaps = this.setFakeSmallCaps.bind(this);
        this.setLetterSpacing = this.setLetterSpacing.bind(this);
        this.setLineHeight = this.setLineHeight.bind(this);
        this.validateSelection = this.validateSelection.bind(this);
        this.convertToBlock = this.convertToBlock.bind(this);

        this.applyFeatureFromPreview = this.applyFeatureFromPreview.bind(this);
        this.dismissTips = this.dismissTips.bind(this);
        // Modal drag/resize handlers
        this.initializeModalPosition = this.initializeModalPosition.bind(this);
        this.handleDragStart = this.handleDragStart.bind(this);
        this.handleDragMove = this.handleDragMove.bind(this);
        this.handleDragEnd = this.handleDragEnd.bind(this);
        this.handleResizeStart = this.handleResizeStart.bind(this);
        this.handleResizeMove = this.handleResizeMove.bind(this);
        this.handleResizeEnd = this.handleResizeEnd.bind(this);
        this.handleHeaderKeyDown = this.handleHeaderKeyDown.bind(this);

        // Create debounced apply functions (v2.0.0 - live preview)
        // These are created once in constructor and persist across renders
        this.debouncedApplySlider = debounce(this._doApplyFeatures.bind(this), 400);
        this.debouncedApplyDropdown = debounce(this._doApplyFeatures.bind(this), 300);
        this.debouncedApplyFontSize = debounce(this._doApplyFeatures.bind(this), 600);

        // Extension hooks (inline-editor/extension-listeners.js). Only
        // created here: componentDidMount() registers them and
        // componentWillUnmount() removes them. React may construct an
        // instance it never mounts (StrictMode does with SCRIPT_DEBUG on),
        // so the constructor registers nothing (#386).
        createExtensionListeners(this, FORMAT_TYPE);
    }

    /**
     * The initial state: the selection's own properties as the format
     * reports them, the choices stored for this session and browser, and
     * the modal defaults. Called once, from the constructor, after the
     * pending-change fields exist.
     *
     * @return {Object} Initial state
     */
    _buildInitialState() {
        // Check if user has disabled warning for this session
        let hideWarning = false;
        try {
            hideWarning = sessionStorage.getItem('typography_stylist_hide_clear_warning') === 'true';
        } catch (e) {
            // Session storage might not be available
        }

        // Check if user has dismissed the modal tips notice (persists per browser)
        let tipsDismissed = false;
        try {
            tipsDismissed = localStorage.getItem('typography_stylist_hide_modal_tips') === 'true';
        } catch (e) {
            // Local storage might not be available
        }

        const initialCase = this.getActiveCase();

        return {
            isOpen: false,
            selectedFeatures: this.getActiveFeatures() || [],
            selectedFont: this.resolveActiveFont(),
            selectedFontId: this.getActiveFontId() || 0,
            fontSize: this.getActiveFontSize() || 'inherit',
            fontSizeMin: this.getActiveFontSizeMin() || 16,
            fontSizePreferred: this.getActiveFontSizePreferred() || 24,
            fontSizeMax: this.getActiveFontSizeMax() || 32,
            fontWeight: this.getActiveFontWeight() || '400',
            fontStyle: this.getActiveFontStyle() || '',
            // Case (#214): '' Default, fake small caps allowed when unset
            textCase: initialCase.textCase,
            fakeSmallCaps: initialCase.fakeSmallCaps,
            letterSpacing: this.getActiveLetterSpacing() || 0,
            lineHeight: this.getActiveLineHeight() || 0,
            selectedText: '', // Extracted text for feature previews
            activePreset: null,
            wordBoundaryWarning: '',
            // Convert-to-block capability, recomputed on every popover open.
            // canConvert false + a reason of 'locked'/'parent' is explained
            // in the modal rather than silently hiding the action.
            canConvert: false,
            convertBlockedReason: CONVERT_BLOCKED.UNSUPPORTED,
            convertParentTitle: '',
            showClearConfirmation: false,
            dontShowClearWarning: hideWarning,
            tipsDismissed: tipsDismissed,
            // Inline features cached when popover opens (for inline editor toolbar)
            // Note: Typographic Stylist block sidebar (edit.js) uses useMemo for similar optimization
            inlineFeatures: [],
            // Font inherited from block's computed styles (when Default font is selected)
            blockInheritedFont: '',
            // Flag to track if font detection failed (no text element found)
            fontDetectionFailed: false,
            wpAdoptError: false,
            // Saved selection bounds (survive modal focus changes)
            savedSelectionStart: null,
            savedSelectionEnd: null,
            // Modal position and size (for draggable/resizable modal)
            modalX: 0,
            modalY: 0,
            modalWidth: 500,
            modalHeight: 600,
            // Drag state
            isDragging: false,
            dragStartX: 0,
            dragStartY: 0,
            // Resize state
            isResizing: false,
            resizeStartX: 0,
            resizeStartY: 0,
            resizeStartWidth: 0,
            resizeStartHeight: 0,
            resizeDirection: null,
            // Paragraph style ID (set by extension via event, 0 = no style)
            paragraphStyleId: 0,
            // Animation config ID (set by extension via event, 0 = none)
            animationId: 0,
            // Font variation settings (set by extension via event, '' = none)
            fontVariationSettings: this.getActiveFontVariationSettings() || ''
        };
    }

    /**
     * Get styled span element at current selection in Typographic Stylist blocks
     * Returns the span element if found, null otherwise
     * @private
     */
    getStyledSpanAtSelection() {
        const { value } = this.props;
        const { select } = wp.data;
        const selectedBlock = select('core/block-editor').getSelectedBlock();

        if (!selectedBlock || selectedBlock.name !== 'typost/block') {
            return null;
        }

        const content = selectedBlock.attributes.content || '';

        if (!value || value.start === undefined || value.end === undefined) {
            return null;
        }

        // The innermost styled span at the cursor or overlapping the
        // selection (inline-editor/span-reading.js)
        return findStyledSpanInContent(content, value.start, value.end);
    }

    /**
     * Get inline features from styled spans at current selection in Typographic Stylist blocks
     * Optimized version - only called when popover opens, not on every render
     * @return {Array} Array of feature codes from the styled span at selection
     * @private
     */
    getInlineFeaturesForTypostBlock() {
        return readSpanFeatures(this.getStyledSpanAtSelection());
    }

    /**
     * Get currently active features from format
     * Also checks for inline <span class="typost-styled"> elements in Typographic Stylist blocks
     * Uses cached inline features when popover is open for performance
     */
    getActiveFeatures() {
        const { value } = this.props;

        // First, try the standard format API (for inline editor formats)
        const activeFormat = getActiveFormat(value, FORMAT_TYPE);
        if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-features']) {
            return activeFormat.attributes['data-features'].split(',');
        }

        // Use cached inline features if popover is open (performance optimization)
        // Check for array type, not length - empty array [] is a valid cached result
        if (this.state && this.state.isOpen && Array.isArray(this.state.inlineFeatures)) {
            return this.state.inlineFeatures;
        }

        // Otherwise compute inline features for Typographic Stylist blocks
        return this.getInlineFeaturesForTypostBlock();
    }

    /**
     * Get currently active font from format
     * Also checks for inline <span class="typost-styled"> elements in Typographic Stylist blocks
     */
    getActiveFont() {
        const { value } = this.props;

        // First, try the standard format API
        const activeFormat = getActiveFormat(value, FORMAT_TYPE);
        if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-font']) {
            return activeFormat.attributes['data-font'];
        }

        // Check for styled span in Typographic Stylist block
        const styledSpan = this.getStyledSpanAtSelection();
        if (styledSpan) {
            const dataFont = styledSpan.getAttribute('data-font');
            if (dataFont) {
                return dataFont;
            }

            // Fallback: parse from style attribute
            const style = styledSpan.getAttribute('style') || '';
            const fontMatch = style.match(/font-family:\s*([^;]+)/);
            if (fontMatch) {
                return fontMatch[1].trim();
            }
        }

        return '';
    }

    /**
     * Get currently active font ID from format
     */
    getActiveFontId() {
        const { value } = this.props;

        // First, try the standard format API
        const activeFormat = getActiveFormat(value, FORMAT_TYPE);
        if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-font-id']) {
            return parseInt(activeFormat.attributes['data-font-id'], 10);
        }

        // Check for styled span in Typographic Stylist block
        const styledSpan = this.getStyledSpanAtSelection();
        if (styledSpan) {
            const dataFontId = styledSpan.getAttribute('data-font-id');
            if (dataFontId) {
                return parseInt(dataFontId, 10);
            }
        }

        return 0;
    }

    /**
     * Get currently active font size mode from format
     */
    getActiveFontSize() {
        const { value } = this.props;
        const activeFormat = getActiveFormat(value, FORMAT_TYPE);

        if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-fontsize']) {
            return activeFormat.attributes['data-fontsize'];
        }

        return 'inherit';
    }

    /**
     * Get currently active font size min from format
     */
    getActiveFontSizeMin() {
        const { value } = this.props;
        const activeFormat = getActiveFormat(value, FORMAT_TYPE);

        if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-fontsize-min']) {
            return parseInt(activeFormat.attributes['data-fontsize-min'], 10);
        }

        return 16;
    }

    /**
     * Get currently active font size preferred from format
     */
    getActiveFontSizePreferred() {
        const { value } = this.props;
        const activeFormat = getActiveFormat(value, FORMAT_TYPE);

        if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-fontsize-preferred']) {
            return parseInt(activeFormat.attributes['data-fontsize-preferred'], 10);
        }

        return 24;
    }

    /**
     * Get currently active font size max from format
     */
    getActiveFontSizeMax() {
        const { value } = this.props;
        const activeFormat = getActiveFormat(value, FORMAT_TYPE);

        if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-fontsize-max']) {
            return parseInt(activeFormat.attributes['data-fontsize-max'], 10);
        }

        return 32;
    }

    /**
     * Get currently active font weight from format
     */
    getActiveFontWeight() {
        return this.getExplicitFontWeight() || '400';
    }

    /**
     * The weight stored on the selection, or '' when there is none.
     *
     * getActiveFontWeight() hard-defaults to '400', which callers cannot
     * tell apart from a deliberate 400 — a distinction that matters when
     * deciding whether to fall back to the weight the block inherits from
     * the theme.
     *
     * @since 2.3.0
     * @return {string} Stored weight, or '' when the selection has none
     */
    getExplicitFontWeight() {
        const { value } = this.props;
        const activeFormat = getActiveFormat(value, FORMAT_TYPE);

        if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-fontweight']) {
            return activeFormat.attributes['data-fontweight'];
        }

        return '';
    }

    /**
     * The weight the selection should be treated as having.
     *
     * A heading is bold because the theme says so, so '400' — what
     * getActiveFontWeight() reports for text with no stored weight — is a
     * lie that anything acting on the selection would bake in: converting
     * the block lightened it, and a glyph inserted by the Glyphs panel
     * came out lighter than the headline around it.
     *
     * Precedence: a weight the author picked in this popover (it reaches
     * the span only after the debounced apply), then a weight stored on
     * the selection (one its paragraph style does not override, see
     * getStoredFontWeight), then the weight of the paragraph style on
     * the selection, then the weight actually rendering. The
     * style comes before the rendered weight because that is read from
     * the block element, which the style span does not change (#254).
     *
     * @since 2.3.0
     * @return {string} Weight to use
     */
    getEffectiveFontWeight() {
        return this.getSetFontWeight() || this.getBlockInheritedWeight() || this.state.fontWeight;
    }

    /**
     * The weight set on the selection: getEffectiveFontWeight() without
     * the rendered fallback.
     *
     * Persisting consumers (Paragraph Styles capture, diff and Detach)
     * read this as explicitFontWeight. A weight the text inherits from
     * the block or the theme is not the text's own, and writing it into a
     * style or onto the span would pin it there (#278).
     *
     * @since 2.3.3
     * @return {string} Weight, or '' when the selection inherits its weight
     */
    getSetFontWeight() {
        // A pick or a clear comes first: it reaches the span only after
        // the debounced apply, which then resets the pending changes
        // (PR #280 review). _clearWeight outlives the apply, so it counts
        // only while the weight change is pending.
        const pending = this._pendingChanges.keys.has('fontWeight');
        return resolveSetFontWeight({
            cleared: pending && !!this._clearWeight,
            stored: this.getStoredFontWeight(),
            picked: pending,
            pickedWeight: this.state.fontWeight,
            styleWeight: this.getParagraphStyleFontWeight()
        });
    }

    /**
     * The font set on the selection: a font the author picked in this
     * popover session, else the span's font, or its paragraph style's
     * font when the style's class renders it (resolveSpanExplicitFontId,
     * like the weight in getSetFontWeight()). Never the font the text
     * inherits from the block or the theme (getInheritedFontId) (#278).
     *
     * @since 2.3.3
     * @return {number} Font ID, or 0 when the selection has none of its own
     */
    getExplicitFontId() {
        const open = this.state && this.state.isOpen;
        if (open && this._pendingChanges.keys.has('font')) {
            return parseInt(this.state.selectedFontId, 10) || 0;
        }
        const { value } = this.props;
        const activeFormat = value ? getActiveFormat(value, FORMAT_TYPE) : null;
        if (activeFormat && activeFormat.attributes) {
            const attrs = activeFormat.attributes;
            return resolveSpanExplicitFontId({
                dataFontId: attrs['data-font-id'],
                styleAttr: attrs.style,
                styleId: attrs['data-style-id']
            }, window.typostData && window.typostData.paragraphStyles);
        }
        // No inline format at the selection: the popover's font (read
        // from the selection when it opened, or set by an apply event),
        // or a styled span in a Typography Stylist block
        if (open) {
            return parseInt(this.state.selectedFontId, 10) || 0;
        }
        return this.getActiveFontId() || 0;
    }

    /**
     * The selection's data-fontweight, unless its paragraph style
     * overrides it.
     *
     * Under a style the apply path keeps data-fontweight but writes no
     * inline font-weight, so the style's class renders instead (review
     * of #254). getExplicitFontWeight() stays raw: the apply path and
     * the weight select write its value back.
     *
     * @since 2.3.2
     * @return {string} Weight, or '' when none is stored or the style overrides it
     */
    getStoredFontWeight() {
        const { value } = this.props;
        const activeFormat = getActiveFormat(value, FORMAT_TYPE);
        const attrs = activeFormat && activeFormat.attributes ? activeFormat.attributes : {};
        return resolveSpanStoredFontWeight({
            dataWeight: attrs['data-fontweight'],
            styleAttr: attrs.style,
            styleId: attrs['data-style-id']
        }, window.typostData && window.typostData.paragraphStyles).stored;
    }

    /**
     * The weight the paragraph style on the selection sets, or ''.
     *
     * @since 2.3.2
     * @return {string} Weight, or '' when no style (or no style weight) applies
     */
    getParagraphStyleFontWeight() {
        const { value } = this.props;
        const activeFormat = getActiveFormat(value, FORMAT_TYPE);
        const styleId = activeFormat && activeFormat.attributes ? activeFormat.attributes['data-style-id'] : '';
        return resolveParagraphStyleFontWeight(window.typostData && window.typostData.paragraphStyles, styleId);
    }

    getActiveFontVariationSettings() {
        const { value } = this.props;
        const activeFormat = getActiveFormat(value, FORMAT_TYPE);

        if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-font-variation-settings']) {
            return activeFormat.attributes['data-font-variation-settings'];
        }

        return '';
    }

    /**
     * Get currently active font style (visual italic) from the format.
     * '' means inherit — note the core Italic (<em>) format is deliberately
     * NOT reported here: it is semantic emphasis, not span styling. It is
     * still honored for previews and the Glyphs panel face selection.
     */
    getActiveFontStyle() {
        const { value } = this.props;
        const activeFormat = getActiveFormat(value, FORMAT_TYPE);

        if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-fontstyle']) {
            return activeFormat.attributes['data-fontstyle'];
        }

        return '';
    }

    /**
     * The case stored on the active span (#214): data-textcase and
     * data-fakesmallcaps. '' (Default) and true when the span has none —
     * a theme's or a paragraph style's case is not the span's own.
     *
     * @return {{textCase: string, fakeSmallCaps: boolean}}
     */
    getActiveCase() {
        const { value } = this.props;
        const activeFormat = value ? getActiveFormat(value, FORMAT_TYPE) : null;
        return readInlineCase(activeFormat && activeFormat.attributes);
    }

    /**
     * The font style explicitly SET on the selection — the popover's live
     * Font Style choice while it is open, else the span's data-fontstyle.
     * Never the core Italic (<em>) format: that renders italic on its own,
     * so persisting consumers (paragraph style capture) must not treat it
     * as a chosen value — a style's CSS could neither reproduce it
     * elsewhere nor reset it (em's element rule outranks an inherited
     * font-style), so capturing it would bake phantom italic into styles.
     */
    getExplicitFontStyle() {
        if (this.state && this.state.isOpen) {
            return this.state.fontStyle || '';
        }
        return this.getActiveFontStyle() || '';
    }

    /**
     * The font style actually RENDERING at the selection — span styling
     * first, then the core Italic (<em>) format. Drives previews and the
     * Glyphs panel face variant.
     */
    getRenderedFontStyle() {
        const { value } = this.props;
        const own = this.state && this.state.fontStyle;
        if (own) {
            return own;
        }
        if (value && getActiveFormat(value, 'core/italic')) {
            return 'italic';
        }
        return '';
    }

    /**
     * Get block's inherited font-family from computed styles
     * (inline-editor/block-dom.js). Detects the current font applied by
     * theme or block settings.
     * @return {string} Font family string from computed styles, or empty string if not found
     */
    getBlockInheritedFont() {
        return getSelectedBlockInheritedFont();
    }

    /**
     * Resolve the plugin font ID of the font the block is *rendering* in,
     * for text carrying no typost font of its own.
     *
     * A theme that styles h2 in one of the plugin's fonts leaves no
     * data-font-id anywhere, so consumers that need a real font file (the
     * Glyphs panel) would otherwise get nothing and fall back to the first
     * font in the list — browsing a typeface the author never chose.
     *
     * @since 2.3.0
     * @return {number} Numeric font ID, or 0 when the rendered font is not a plugin font
     */
    getInheritedFontId() {
        const inheritedFamily = this.getBlockInheritedFont();
        if (!inheritedFamily) {
            return 0;
        }
        return resolveFontIdFromFamily(inheritedFamily, this.getFontIdMap());
    }

    /**
     * Get the block's rendered font-weight from computed styles
     * (inline-editor/block-dom.js).
     *
     * Used when converting to a Typography Stylist block: a core heading is
     * bold because the theme says so, not because of any stored attribute,
     * and the block would otherwise be created with the default 400 and
     * visibly lighten.
     *
     * @since 2.3.0
     * @return {string} Computed weight as a string (e.g. '700'), or '' if undetectable
     */
    getBlockInheritedWeight() {
        return getSelectedBlockInheritedWeight();
    }

    /**
     * Get currently active letter spacing from format
     * Also checks for inline <span class="typost-styled"> elements in Typographic Stylist blocks
     */
    getActiveLetterSpacing() {
        const { value } = this.props;

        // First, try the standard format API
        const activeFormat = getActiveFormat(value, FORMAT_TYPE);
        if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-letterspacing']) {
            return parseInt(activeFormat.attributes['data-letterspacing'], 10);
        }

        // Check for styled span in Typographic Stylist block
        const styledSpan = this.getStyledSpanAtSelection();
        if (styledSpan) {
            const dataSpacing = styledSpan.getAttribute('data-letterspacing');
            if (dataSpacing) {
                return parseInt(dataSpacing, 10);
            }

            // Fallback: parse from style attribute
            const style = styledSpan.getAttribute('style') || '';
            const spacingMatch = style.match(/letter-spacing:\s*([-\d.]+)em/);
            if (spacingMatch) {
                // Convert from em back to the integer value (multiply by 1000)
                return Math.round(parseFloat(spacingMatch[1]) * 1000);
            }
        }

        return 0;
    }

    /**
     * Get currently active line height from format
     * Also checks for inline <span class="typost-styled"> elements in Typographic Stylist blocks
     */
    getActiveLineHeight() {
        const { value } = this.props;

        // First, try the standard format API
        const activeFormat = getActiveFormat(value, FORMAT_TYPE);
        if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-lineheight']) {
            return parseFloat(activeFormat.attributes['data-lineheight']);
        }

        // Check for styled span in Typographic Stylist block
        const styledSpan = this.getStyledSpanAtSelection();
        if (styledSpan) {
            const dataLineHeight = styledSpan.getAttribute('data-lineheight');
            if (dataLineHeight) {
                return parseFloat(dataLineHeight);
            }

            // Fallback: parse from style attribute
            const style = styledSpan.getAttribute('style') || '';
            const lineHeightMatch = style.match(/line-height:\s*([\d.]+)/);
            if (lineHeightMatch) {
                return parseFloat(lineHeightMatch[1]);
            }
        }

        return 0;
    }

    /**
     * Get active paragraph style ID from format attributes.
     * Returns the style ID string if set, or 0 if no style is applied.
     */
    getActiveStyleId() {
        const { value } = this.props;

        const activeFormat = getActiveFormat(value, FORMAT_TYPE);
        if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-style-id']) {
            return activeFormat.attributes['data-style-id'];
        }

        // Check for styled span in Typographic Stylist block
        const styledSpan = this.getStyledSpanAtSelection();
        if (styledSpan) {
            const styleId = styledSpan.getAttribute('data-style-id');
            if (styleId) {
                return styleId;
            }
        }

        return 0;
    }

    /**
     * Get the animation config ID at the current selection (set by the
     * Animations extension via data-animation-id).
     */
    getActiveAnimationId() {
        const { value } = this.props;

        const activeFormat = getActiveFormat(value, FORMAT_TYPE);
        if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-animation-id']) {
            return parseInt(activeFormat.attributes['data-animation-id'], 10) || 0;
        }

        const styledSpan = this.getStyledSpanAtSelection();
        if (styledSpan) {
            const animationId = styledSpan.getAttribute('data-animation-id');
            if (animationId) {
                return parseInt(animationId, 10) || 0;
            }
        }

        return 0;
    }

    /**
     * Initialize modal position (center in viewport)
     */
    initializeModalPosition() {
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const modalWidth = 500;
        const modalHeight = 600;

        return {
            modalX: Math.max(0, (viewportWidth - modalWidth) / 2),
            modalY: Math.max(0, (viewportHeight - modalHeight) / 2),
            modalWidth,
            modalHeight
        };
    }

    /**
     * Toggle popover visibility
     */
    /**
     * Launch an extension's toolbar button (e.g. Glyphs) without opening
     * this editor's own modal first.
     *
     * Saves the selection bounds into state the same way togglePopover()
     * does, because _handleInsertContent falls back to them once the
     * extension's modal takes focus and collapses the live selection.
     *
     * @since 2.3.0
     * @param {Object} button Descriptor from typost_editor_toolbar_buttons
     */
    handleExtensionToolbarClick(button) {
        const { value } = this.props;
        let savedSelectionStart = null;
        let savedSelectionEnd = null;
        let selectedText = '';

        if (value) {
            savedSelectionStart = value.start;
            savedSelectionEnd = value.end;
            if (Number.isFinite(value.start) && Number.isFinite(value.end) && value.start !== value.end) {
                selectedText = getTextContent(slice(value, value.start, value.end));
            }
        }

        // With the modal closed, state still holds what the last modal
        // session left (or the defaults). Load the selection's own
        // properties, as opening the modal does, so the click context
        // state and an apply or Detach from the launched panel describe
        // the selected text: a paragraph style applied from the toolbar
        // otherwise dropped the selection's data-animation-id, and the
        // style browser showed no active style for it (#219 review).
        const fresh = !this.state.isOpen;
        if (fresh) {
            this._resetPendingChanges();
            this._authorPickedWeight = false;
            this._clearWeight = false;
        }

        // The click context is built after the commit, so the filter
        // reads the state set here
        this.setState(Object.assign({
            savedSelectionStart: savedSelectionStart,
            savedSelectionEnd: savedSelectionEnd
        }, fresh ? this.readSelectionProperties() : {}), () => this.launchExtensionButton(button, savedSelectionStart, savedSelectionEnd, selectedText));
    }

    /**
     * Call an extension toolbar button's onClick with the click context.
     * Split from handleExtensionToolbarClick() so it runs after the
     * selection's state is committed.
     *
     * @param {Object} button              Descriptor from typost_editor_toolbar_buttons
     * @param {?number} savedSelectionStart Selection start at the click
     * @param {?number} savedSelectionEnd   Selection end at the click
     * @param {string} selectedText        Selected text ('' for a caret)
     */
    launchExtensionButton(button, savedSelectionStart, savedSelectionEnd, selectedText) {
        // The format instance can unmount before the commit (the
        // selected block changed); its selection is stale then
        if (!this._isMounted) {
            return;
        }
        button.onClick({
            source: 'inline',
            savedSelectionStart: savedSelectionStart,
            savedSelectionEnd: savedSelectionEnd,
            selectedText: selectedText,
            state: window.typostHooks.applyFilters('typost_current_editor_state', {}, 'inline'),
            // The word-boundary notice this modal would have shown. A panel
            // opened from the toolbar bypasses it entirely, so it has to be
            // able to raise the same warning itself.
            accessibility: this.getSelectionAccessibility(savedSelectionStart, savedSelectionEnd),
            // No host modal was open, so nothing should reopen on close
            reopenHost: false
        });
    }

    /**
     * The selected text's own properties, as the modal loads them on
     * open. Shared with handleExtensionToolbarClick(), which launches a
     * panel without opening the modal. Call after _resetPendingChanges():
     * the weight reads a pending pick first.
     *
     * @return {Object} State fields for the selection
     */
    readSelectionProperties() {
        const activeCase = this.getActiveCase();
        return {
            selectedFeatures: this.getActiveFeatures() || [],
            selectedFont: this.resolveActiveFont(),
            selectedFontId: this.getActiveFontId() || 0,
            fontSize: this.getActiveFontSize() || 'inherit',
            fontSizeMin: this.getActiveFontSizeMin() || 16,
            fontSizePreferred: this.getActiveFontSizePreferred() || 24,
            fontSizeMax: this.getActiveFontSizeMax() || 32,
            // The rendered weight, so the select shows what the author sees
            // (700 on a theme-bold heading); it is written only when picked
            fontWeight: this.getEffectiveFontWeight() || '400',
            fontStyle: this.getActiveFontStyle() || '',
            textCase: activeCase.textCase,
            fakeSmallCaps: activeCase.fakeSmallCaps,
            letterSpacing: this.getActiveLetterSpacing() || 0,
            lineHeight: this.getActiveLineHeight() || 0,
            fontVariationSettings: this.getActiveFontVariationSettings() || '',
            paragraphStyleId: this.getActiveStyleId() || 0,
            animationId: this.getActiveAnimationId() || 0
        };
    }

    togglePopover() {
        const { value } = this.props;
        const { select } = wp.data;

        // Compute inline features when opening popover
        let computedInlineFeatures = [];
        let inheritedFont = '';
        let detectionFailed = false;
        let extractedText = '';
        let modalPosition = {};
        let selectionStart = null;
        let selectionEnd = null;
        let wordBoundaryWarning = '';
        let convertCapability = { canConvert: false, reason: CONVERT_BLOCKED.UNSUPPORTED, parentTitle: '' };

        if (!this.state.isOpen && value) {
            // Save selection bounds so they survive modal focus changes
            selectionStart = value.start;
            selectionEnd = value.end;
            // Extract selected text for feature previews
            if (value.start !== value.end) {
                const slicedValue = slice(value, value.start, value.end);
                extractedText = getTextContent(slicedValue);
            } else {
                extractedText = getTextContent(value);
            }

            // Compute inline features only when opening (performance optimization)
            computedInlineFeatures = this.getInlineFeaturesForTypostBlock();

            // Detect block's inherited font for preview (when Default font is selected)
            inheritedFont = this.getBlockInheritedFont();

            // Check if font detection failed (no font found and user hasn't selected a custom font)
            if (!inheritedFont && !this.getActiveFont()) {
                detectionFailed = true;
            }

            // Check word boundary when opening (v2.0.0 - now informational,
            // not blocking). Honours the Settings → Accessibility switch,
            // which the notice ignored until 2.3.0.
            wordBoundaryWarning = this.getSelectionAccessibility(selectionStart, selectionEnd).wordBoundaryWarning;

            // Convert capability is resolved on every open, not only when a
            // word-boundary warning fires: the Convert action is offered for
            // any convertible block, and the warning's own button reuses the
            // same answer.
            convertCapability = this.resolveConvertState();

            // Initialize modal position when opening
            modalPosition = this.initializeModalPosition();
        }

        const wasOpen = this.state.isOpen;

        // Fresh popover session: no property changes recorded yet
        this._resetPendingChanges();
        this._authorPickedWeight = false;
        this._clearWeight = false;

        this.setState(state => ({
            isOpen: !state.isOpen,
            ...this.readSelectionProperties(),
            selectedText: !state.isOpen ? extractedText : '',
            inlineFeatures: computedInlineFeatures,
            blockInheritedFont: inheritedFont,
            fontDetectionFailed: detectionFailed,
            wordBoundaryWarning: !state.isOpen ? wordBoundaryWarning : '',
            canConvert: convertCapability.canConvert,
            convertBlockedReason: convertCapability.reason,
            convertParentTitle: convertCapability.parentTitle,
            // Save selection bounds when opening, clear when closing
            savedSelectionStart: !state.isOpen ? selectionStart : null,
            savedSelectionEnd: !state.isOpen ? selectionEnd : null,
            // Reset modal position and drag/resize state
            ...(!state.isOpen && modalPosition),
            isDragging: false,
            isResizing: false,
            // Reset paragraph style ID (extension sets via event)
            paragraphStyleId: !state.isOpen ? (this.getActiveStyleId() || 0) : 0,
            animationId: !state.isOpen ? (this.getActiveAnimationId() || 0) : 0
        }), () => {
            // Fire lifecycle hooks for extensions
            if (!wasOpen && this.state.isOpen) {
                window.typostHooks.doAction('typost_inline_modal_opened', this.state);
                this.scheduleWordBoundaryAnnouncement();
            } else if (wasOpen && !this.state.isOpen) {
                this.cancelWordBoundaryAnnouncement();
                window.typostHooks.doAction('typost_inline_modal_closed');
            }
        });
    }

    /**
     * Announce the word-boundary notice AFTER the dialog has introduced
     * itself.
     *
     * The Notice component speaks its content through the a11y live
     * region the moment it mounts, which is the same tick the modal
     * takes focus — and NVDA read the ~45-word warning before "Typography
     * Stylist, dialog", so the author heard a wall of text before
     * learning what had opened (QA finding SR-1, seen on the Glyphs panel
     * and the tip notice here). The notice mounts silent (spokenMessage
     * '') and is queued here as a polite message once the title has had
     * time to be read.
     */
    scheduleWordBoundaryAnnouncement() {
        this.cancelWordBoundaryAnnouncement();
        const message = this.state.wordBoundaryWarning;
        if (!message || !window.wp || !wp.a11y || typeof wp.a11y.speak !== 'function') {
            return;
        }
        this._noticeSpeakTimer = setTimeout(() => {
            this._noticeSpeakTimer = null;
            if (this.state.isOpen && this.state.wordBoundaryWarning === message) {
                wp.a11y.speak(__('Accessibility Notice', 'typography-stylist') + '. ' + message, 'polite');
            }
        }, WORD_BOUNDARY_ANNOUNCE_DELAY);
    }

    cancelWordBoundaryAnnouncement() {
        if (this._noticeSpeakTimer) {
            clearTimeout(this._noticeSpeakTimer);
            this._noticeSpeakTimer = null;
        }
    }

    /**
     * Ask before a paragraph style replaces the selection's own styling.
     *
     * Returns true when there is nothing to replace or the author agreed,
     * false when they cancelled. The range is the live selection, or the
     * bounds saved when the modal took focus (the same fallback
     * _doApplyFeatures uses).
     *
     * A style just saved from the selection (savedFromSelection) was
     * built from the run's own values, so with one run it replaces
     * nothing the author can see and the question is skipped (#303).
     * A selection across runs still asks.
     *
     * @param {boolean} savedFromSelection Whether the style was saved from this selection
     */
    confirmParagraphStyleOverride(savedFromSelection) {
        const { value } = this.props;
        const { savedSelectionStart, savedSelectionEnd } = this.state;
        const shared = window.typostSharedUtils || {};
        if (!value || typeof shared.countInlineParagraphStyleConflicts !== 'function') {
            return true;
        }
        const selectionLost = isSelectionLost(value, savedSelectionStart, savedSelectionEnd);
        const start = selectionLost ? savedSelectionStart : value.start;
        const end = selectionLost ? savedSelectionEnd : value.end;
        const conflicts = shared.countInlineParagraphStyleConflicts(value.formats, start, end, FORMAT_TYPE);
        if (conflicts === 0) {
            return true;
        }
        if (savedFromSelection && typeof shared.isMixedFormatSelection === 'function' &&
            !shared.isMixedFormatSelection(value.formats, start, end, FORMAT_TYPE)) {
            return true;
        }
        return window.confirm(__('Some of the selected text has styling of its own (font, weight, size, spacing, or features). Applying the paragraph style replaces that styling so the whole selection matches the style. Continue?', 'typography-stylist'));
    }

    /**
     * Dismiss the usage tips notice and remember the choice per browser.
     */
    dismissTips() {
        this.setState({ tipsDismissed: true });
        try {
            localStorage.setItem('typography_stylist_hide_modal_tips', 'true');
        } catch (e) {
            // Local storage might not be available
        }
    }

    /**
     * Set font family (value can be font ID or font family string)
     */
    setFont(value) {
        this._recordChange('font');
        if (value === '') {
            // Reset to default
            this.setState({
                selectedFont: '',
                selectedFontId: 0
            }, () => {
                this.debouncedApplyDropdown();
            });
        } else if (isWpLibraryValue(value)) {
            // Unadopted WP Font Library font — adopt it (idempotently
            // allocates a numeric font_id), then apply like any other font
            const slug = wpSlugFromValue(value);
            const self = this;
            this.setState({ wpAdoptError: false });
            adoptWpFont(slug).then(font => {
                self.fontIdMap[font.font_id] = {
                    family: font.font_family,
                    fallbacks: font.fallbacks || '',
                    availableWeights: []
                };
                self.setState({
                    selectedFont: font.font_family,
                    selectedFontId: font.font_id
                }, () => {
                    self.debouncedApplyDropdown();
                });
            }).catch(() => {
                self.setState({ wpAdoptError: true });
            });
        } else {
            // Try to parse as ID (new system)
            const fontId = parseInt(value, 10);
            const fontData = this.fontIdMap && this.fontIdMap[fontId];
            if (!isNaN(fontId) && fontData) {
                const newState = {
                    selectedFont: fontData.family,
                    selectedFontId: fontId
                };

                // Validate current weight against new font's available weights
                const available = fontData.availableWeights;
                if (available && available.length > 0) {
                    const currentWeight = this.state.fontWeight || '400';
                    if (!available.includes(currentWeight)) {
                        newState.fontWeight = getClosestWeight(currentWeight, available);
                    }
                    // Auto-apply single weight (if not default 400)
                    if (available.length === 1 && this.state.fontWeight !== available[0]) {
                        newState.fontWeight = available[0];
                    }
                    if (newState.fontWeight !== undefined) {
                        this._recordChange('fontWeight');
                    }
                }

                this.setState(newState, () => {
                    this.debouncedApplyDropdown();
                });
            } else {
                // Old string-based system (backward compatibility)
                this.setState({
                    selectedFont: value,
                    selectedFontId: 0
                }, () => {
                    this.debouncedApplyDropdown();
                });
            }
        }
    }

    /**
     * Resolve a font ID to its family string.
     * Used by extension hooks to populate selectedFont from a fontId.
     */
    resolveFontFamily(fontId) {
        const id = parseInt(fontId, 10);
        if (!isNaN(id) && this.getFontIdMap()[id]) {
            return this.getFontIdMap()[id].family;
        }
        return '';
    }

    /**
     * fontIdMap is normally built lazily by getFontOptions() during modal
     * render; build it on demand for callers that run before first render.
     */
    getFontIdMap() {
        if (!this.fontIdMap) {
            this.fontIdMap = buildFontOptions(typostData).fontIdMap;
        }
        return this.fontIdMap;
    }

    /**
     * Active font family for previews: legacy data-font when present,
     * otherwise resolved from data-font-id (the v1.1.6+ span format).
     */
    resolveActiveFont() {
        return resolveActiveFontFamily(
            this.getActiveFont(),
            this.getActiveFontId(),
            this.getFontIdMap()
        );
    }

    /**
     * Record a property change for the next apply. On mixed selections the
     * apply patches only the recorded properties per formatting run.
     */
    _recordChange(key) {
        this._pendingChanges.keys.add(key);
    }

    _recordFeatureToggle(tag, enabled) {
        this._pendingChanges.featureToggles.push({ tag: tag, enabled: enabled });
    }

    /**
     * The unit the responsive size will be written in (#233), for the
     * zoom notice (#234). Same rule as the full rebuild in
     * _doApplyFeatures(): rem once the author changes the size,
     * otherwise the unit the span already has. When the modal holds
     * focus the live selection is collapsed, so read the format at the
     * saved selection, as the apply path does.
     */
    getZoomNoticeUnit() {
        const { value } = this.props;
        const { savedSelectionStart, savedSelectionEnd } = this.state;
        let format = null;
        if (value) {
            const selectionLost = isSelectionLost(value, savedSelectionStart, savedSelectionEnd);
            format = findSelectionFormat(value, selectionLost, savedSelectionStart, FORMAT_TYPE, getActiveFormat);
        }
        const attrs = (format && format.attributes) || {};
        return resolveSpanFontSizeUnit({
            sizeChanged: !!(this._pendingChanges && this._pendingChanges.keys.has('fontSize')),
            newUnit: getNewFontSizeUnit(),
            spanStyle: attrs.style,
            styleId: attrs['data-style-id'],
            styles: window.typostData && window.typostData.paragraphStyles
        });
    }

    _resetPendingChanges() {
        this._pendingChanges = { keys: new Set(), featureToggles: [] };
    }

    /**
     * Set font size mode
     */
    setFontSize(mode) {
        this._recordChange('fontSize');
        this.setState({
            fontSize: mode
        }, () => {
            this.debouncedApplyFontSize();
        });
    }

    /**
     * Set font size min
     */
    setFontSizeMin(value) {
        this._recordChange('fontSize');
        this.setState({
            fontSizeMin: value
        }, () => {
            this.debouncedApplyFontSize();
        });
    }

    /**
     * Set font size preferred
     */
    setFontSizePreferred(value) {
        this._recordChange('fontSize');
        this.setState({
            fontSizePreferred: value
        }, () => {
            this.debouncedApplyFontSize();
        });
    }

    /**
     * Set font size max
     */
    setFontSizeMax(value) {
        this._recordChange('fontSize');
        this.setState({
            fontSizeMax: value
        }, () => {
            this.debouncedApplyFontSize();
        });
    }

    /**
     * Set font weight
     */
    setFontWeight(value) {
        this._recordChange('fontWeight');
        this._authorPickedWeight = true;
        this._clearWeight = false;
        this.setState({
            fontWeight: value
        }, () => {
            this.debouncedApplyDropdown();
        });
    }

    /**
     * Set font style (visual italic — semantic emphasis stays <em>)
     */
    setFontStyle(value) {
        this._recordChange('fontStyle');
        this.setState({
            fontStyle: value
        }, () => {
            this.debouncedApplyDropdown();
        });
    }

    /**
     * Set the case (#214). Changes only how the text looks; the stored
     * text keeps the case the author typed.
     */
    setTextCase(value) {
        this._recordChange('textCase');
        this.setState({
            textCase: normalizeTextCase(value)
        }, () => {
            this.debouncedApplyDropdown();
        });
    }

    /**
     * Allow or forbid fake small caps (#214), for the two small caps cases
     */
    setFakeSmallCaps(value) {
        this._recordChange('textCase');
        this.setState({
            fakeSmallCaps: value !== false
        }, () => {
            this.debouncedApplyDropdown();
        });
    }

    /**
     * Set letter spacing
     */
    setLetterSpacing(value) {
        this._recordChange('letterSpacing');
        this.setState({
            letterSpacing: value
        }, () => {
            this.debouncedApplySlider();
        });
    }

    /**
     * Set line height
     */
    setLineHeight(value) {
        this._recordChange('lineHeight');
        this.setState({
            lineHeight: value
        }, () => {
            this.debouncedApplySlider();
        });
    }

    /**
     * Toggle individual feature
     */
    toggleFeature(featureId) {
        this.setState(state => {
            const features = [...state.selectedFeatures];
            const index = features.indexOf(featureId);

            if (index > -1) {
                features.splice(index, 1);
                this._recordFeatureToggle(featureId, false);
            } else {
                features.push(featureId);
                this._recordFeatureToggle(featureId, true);
            }

            return {
                selectedFeatures: features,
                activePreset: null
            };
        }, () => {
            this._doApplyFeatures(); // instant apply, no debounce
        });
    }

    /**
     * Resolve whether the current selection can be converted to a
     * Typography Stylist block, and why not when it cannot.
     *
     * Gathers the editor facts and hands them to the pure resolver, then
     * lets extensions override the answer through the
     * `typost_can_convert_to_block` filter. An extension that forces the
     * capability true also clears the reason, so no stale explanation is
     * rendered next to a working button.
     *
     * @return {{canConvert: boolean, reason: string, parentTitle: string}} Capability result.
     */
    resolveConvertState() {
        const { select } = wp.data;
        const editor = select('core/block-editor');
        const clientId = editor.getSelectedBlockClientId();

        if (!clientId) {
            return { canConvert: false, reason: CONVERT_BLOCKED.UNSUPPORTED, parentTitle: '' };
        }

        const blockName = editor.getBlockName(clientId);
        const rootClientId = editor.getBlockRootClientId(clientId);

        // Parent title is only used to make the "parent restricts its inner
        // blocks" message specific; an unregistered parent just yields ''.
        let parentTitle = '';
        if (rootClientId) {
            const parentType = wp.blocks.getBlockType(editor.getBlockName(rootClientId));
            parentTitle = (parentType && parentType.title) || '';
        }

        const capability = resolveConvertCapability({
            blockName: blockName,
            canRemove: !!editor.canRemoveBlock(clientId),
            canInsert: !!editor.canInsertBlockType('typost/block', rootClientId),
            parentTitle: parentTitle
        });

        /**
         * Filter the convert-to-block capability.
         *
         * @since 2.3.0
         * @param {boolean} canConvert Whether the Convert action is offered.
         * @param {object}  context    { clientId, blockName, rootClientId, reason, parentTitle }.
         */
        const filtered = !!window.typostHooks.applyFilters(
            'typost_can_convert_to_block',
            capability.canConvert,
            {
                clientId: clientId,
                blockName: blockName,
                rootClientId: rootClientId,
                reason: capability.reason,
                parentTitle: parentTitle
            }
        );

        if (filtered === capability.canConvert) {
            return capability;
        }

        return {
            canConvert: filtered,
            reason: filtered ? CONVERT_BLOCKED.NONE : CONVERT_BLOCKED.UNSUPPORTED,
            parentTitle: parentTitle
        };
    }

    /**
     * Build the user-facing explanation for a blocked conversion.
     *
     * Returns '' when there is nothing worth saying — the selection is
     * already a Typography Stylist block, or is not a convertible block
     * type, in which case no action is missing from the modal.
     *
     * @return {string} Explanation, or '' when none applies.
     */
    getConvertBlockedMessage(reason, parentTitle, inNotice = false) {
        const convertBlockedReason = reason !== undefined ? reason : this.state.convertBlockedReason;
        const convertParentTitle = parentTitle !== undefined ? parentTitle : this.state.convertParentTitle;

        // Inside the word-boundary notice the conversion was just
        // recommended, so an unsupported block type says why there is no
        // button (QA E-4); elsewhere that omission needs no explanation.
        const explains = inNotice ? shouldExplainInNotice(convertBlockedReason) : shouldExplainConvertBlock(convertBlockedReason);
        if (!explains) {
            return '';
        }

        if (convertBlockedReason === CONVERT_BLOCKED.UNSUPPORTED) {
            return __('Conversion is available for heading and paragraph blocks.', 'typography-stylist');
        }

        if (convertBlockedReason === CONVERT_BLOCKED.LOCKED) {
            return __('This block can’t be converted to a Typography Stylist block because it is locked, or part of a locked template or pattern.', 'typography-stylist');
        }

        if (convertParentTitle) {
            /* translators: %s: Title of the parent block, e.g. "Group". */
            return sprintf(
                __('This block can’t be converted here. The parent %s block only allows certain blocks inside it. Move the block out of it to convert.', 'typography-stylist'),
                convertParentTitle
            );
        }

        return __('This block can’t be converted here. Its parent block only allows certain blocks inside it. Move the block out of it to convert.', 'typography-stylist');
    }

    /**
     * The accessibility state of a selection, resolved fresh.
     *
     * Everything the word-boundary notice needs, in one object, so that
     * surfaces which never open this modal — the Glyphs panel launched
     * straight from the block toolbar — can show the same notice instead
     * of silently letting the author split a word.
     *
     * Resolved from the store rather than component state, because a
     * toolbar launch has not run togglePopover() and so has no fresh state
     * to read.
     *
     * @since 2.3.0
     * @param {number|null} start Selection start offset
     * @param {number|null} end   Selection end offset
     * @return {{wordBoundaryWarning: string, canConvert: boolean, convertBlockedMessage: string, settingsUrl: string}}
     */
    getSelectionAccessibility(start = null, end = null) {
        const result = {
            wordBoundaryWarning: '',
            canConvert: false,
            convertBlockedMessage: '',
            settingsUrl: (typostData.settingsUrl || '') + '&tab=accessibility'
        };

        // Site owners can turn the notice off in Settings → Accessibility
        if (isFlagEnabled(typostData.disableAccessibilityWarning)) {
            return result;
        }

        if (start !== null && end !== null && start !== end) {
            const validation = this.validateSelection(start, end);
            if (!validation.valid) {
                result.wordBoundaryWarning = validation.message;
            }
        }

        // Only resolve the conversion when there is a warning to attach it
        // to — the notice offers it as the fix, and resolving walks the
        // block tree.
        if (result.wordBoundaryWarning) {
            const capability = this.resolveConvertState();
            result.canConvert = capability.canConvert;
            result.convertBlockedMessage = capability.canConvert
                ? ''
                : this.getConvertBlockedMessage(capability.reason, capability.parentTitle, true);
        }

        return result;
    }

    /**
     * Validate selection to detect word boundary issues
     */
    validateSelection(explicitStart = null, explicitEnd = null) {
        const { value } = this.props;

        // Accept explicit start/end to support saved selection bounds
        const start = explicitStart !== null ? explicitStart : (value ? value.start : null);
        const end = explicitEnd !== null ? explicitEnd : (value ? value.end : null);

        if (!value || start === null || end === null || start === end) {
            return { valid: true };
        }

        // Check if we're inside a Typography Stylist block
        const { select } = wp.data;
        const selectedBlock = select('core/block-editor').getSelectedBlock();
        if (selectedBlock && selectedBlock.name === 'typost/block') {
            // Skip validation - Typography Stylist block already has proper accessibility
            return { valid: true };
        }

        // Get the full text and selection
        const fullText = getTextContent(value);

        // Check if selection breaks word boundaries
        const beforeChar = start > 0 ? fullText[start - 1] : ' ';
        const afterChar = end < fullText.length ? fullText[end] : ' ';
        const selectedText = fullText.substring(start, end);

        // Word boundary regex - letters/numbers are part of words
        const isWordChar = (char) => /[a-zA-Z0-9]/.test(char);

        // Check if we're breaking a word (selected text doesn't start/end at word boundaries)
        const breaksWordStart = isWordChar(beforeChar) && isWordChar(selectedText[0]);
        const breaksWordEnd = isWordChar(selectedText[selectedText.length - 1]) && isWordChar(afterChar);

        if (breaksWordStart || breaksWordEnd) {
            return {
                valid: false,
                message: __('Your selection breaks a word boundary. Screen readers usually read inline spans correctly. For the best accessibility, convert this block to a Typography Stylist block, which adds dedicated screen reader text.', 'typography-stylist')
            };
        }

        return { valid: true };
    }

    /**
     * Convert current heading/paragraph to Typography Stylist block, or update existing Typography Stylist block
     */
    convertToBlock() {
        const { value } = this.props;
        const { dispatch, select } = wp.data;
        const { createBlock } = wp.blocks;

        // Get the currently selected block
        const selectedBlockClientId = select('core/block-editor').getSelectedBlockClientId();
        if (!selectedBlockClientId) {
            return;
        }

        const currentBlock = select('core/block-editor').getBlock(selectedBlockClientId);
        if (!currentBlock) {
            return;
        }

        // Check if we're already in a Typography Stylist block
        const isAlreadyTypostBlock = currentBlock.name === 'typost/block';

        // Determine tag from block name (core/heading, core/paragraph, or existing Typographic Stylist block)
        const tagName = resolveConvertTagName(currentBlock);

        // A core heading is bold because the theme styles h2, not because
        // anything stored says 700 — and the block's fontWeight defaults to
        // '400', which save.js always emits, so a straight conversion
        // visibly lightens the heading.
        // With a partial selection the block itself keeps the weight it
        // renders at; the author's pick stays on the span (PR #194 review)
        const blockInheritedWeight = this.getBlockInheritedWeight() || (this._clearWeight ? '' : this.getExplicitFontWeight()) || '400';
        // After an explicit clear the stored weight is stale, so a whole-
        // block conversion takes the rendered weight instead of the value
        // getEffectiveFontWeight() would read back off the span
        const convertFontWeight = this._clearWeight
            ? blockInheritedWeight
            : this.getEffectiveFontWeight();
        // The weight the span itself gets (same rule as an apply, QA E-2)
        const spanWeight = resolveWeightToWrite({
            explicitWeight: this.getExplicitFontWeight(),
            authorPicked: this._authorPickedWeight,
            stateWeight: this.state.fontWeight,
            clearWeight: this._clearWeight
        });

        // Use saved selection bounds if current selection was lost due to modal focus
        const { savedSelectionStart, savedSelectionEnd } = this.state;
        const effectiveStart = (value.start === value.end && savedSelectionStart !== null) ? savedSelectionStart : value.start;
        const effectiveEnd = (value.start === value.end && savedSelectionEnd !== null) ? savedSelectionEnd : value.end;

        // When the conversion is blocked silently, apply the features
        // directly and say so (scheduleConvertFallback)
        const fallBack = () => {
            this._doApplyFeatures();
            dispatch('core/notices').createInfoNotice(
                __('Block could not be converted. Features were applied directly.', 'typography-stylist'),
                { type: 'snackbar', isDismissible: true }
            );
        };

        // A block with no text (only spaces, line breaks or empty elements)
        // becomes a block with its tag, the size unit and the theme's look:
        // nothing of this dialog's state and nothing of the source (#412).
        // Tested on the text the whole-block path below converts: a block
        // with no content attribute (a Pullquote) is judged by its RichText.
        // Required here, not at the top of the file, so this change stays
        // inside convertToBlock().
        const { isConvertSourceEmpty } = require('./inline-editor/convert-to-block.js');
        if (!isAlreadyTypostBlock && isConvertSourceEmpty(currentBlock.attributes.content, getTextContent(value))) {
            const emptyBlock = createBlock('typost/block', buildConvertBlockAttributes({
                emptySource: true,
                isNewBlock: true,
                tagName: tagName,
                fontSizeUnit: getNewFontSizeUnit()
            }));
            dispatch('core/block-editor').replaceBlocks(selectedBlockClientId, emptyBlock);
            scheduleConvertFallback(selectedBlockClientId, fallBack);
            this.setState({ isOpen: false });
            return;
        }

        // Check if there's a selection (partial text selected)
        if (effectiveStart !== effectiveEnd) {
            // User selected a portion of text - apply styling only to that portion.
            // Use the current block's HTML content to preserve existing spans.
            // String() matters: content can be a RichTextData object (WP 6.5+)
            const contentForBlock = buildPartialConvertContent({
                existingContent: String(currentBlock.attributes.content || ''),
                fullText: getTextContent(value),
                start: effectiveStart,
                end: effectiveEnd,
                state: this.state,
                spanWeight: spanWeight,
                sizeUnit: this.getZoomNoticeUnit(),
                clearWeight: this._clearWeight,
                shared: window.typostSharedUtils
            });

            // The span carries the selection's typography; the block itself
            // takes inherit defaults so the rest of the text is not restyled
            // (QA E-3). An existing block keeps its settings and gets the
            // new content only.
            if (isAlreadyTypostBlock) {
                dispatch('core/block-editor').updateBlockAttributes(selectedBlockClientId, buildConvertBlockAttributes({
                    partialSelection: true,
                    isNewBlock: false,
                    content: contentForBlock,
                    existingFeatures: currentBlock.attributes.features || []
                }));
            } else {
                const typostBlock = createBlock('typost/block', buildConvertBlockAttributes({
                    partialSelection: true,
                    isNewBlock: true,
                    content: contentForBlock,
                    tagName: tagName,
                    effectiveWeight: blockInheritedWeight,
                    fontSizeUnit: getNewFontSizeUnit()
                }));

                // Replace current block
                dispatch('core/block-editor').replaceBlocks(selectedBlockClientId, typostBlock);

                // Safety fallback: verify replacement succeeded
                scheduleConvertFallback(selectedBlockClientId, fallBack);
            }
        } else {
            // No selection - apply to entire block (original behavior).
            // String() matters: content can be a RichTextData object (WP 6.5+)
            const textContent = String(currentBlock.attributes.content || '') || getTextContent(value);

            // If already an Typography Stylist block, just update its attributes
            if (isAlreadyTypostBlock) {
                dispatch('core/block-editor').updateBlockAttributes(selectedBlockClientId, buildConvertBlockAttributes({
                    partialSelection: false,
                    isNewBlock: false,
                    content: textContent,
                    state: this.state
                }));
            } else {
                const typostBlock = createBlock('typost/block', buildConvertBlockAttributes({
                    partialSelection: false,
                    isNewBlock: true,
                    content: textContent,
                    tagName: tagName,
                    effectiveWeight: convertFontWeight,
                    fontSizeUnit: getNewFontSizeUnit(),
                    state: this.state
                }));

                // Replace current block
                dispatch('core/block-editor').replaceBlocks(selectedBlockClientId, typostBlock);

                // Safety fallback: verify replacement succeeded
                scheduleConvertFallback(selectedBlockClientId, fallBack);
            }
        }

        // Close popover
        this.setState({ isOpen: false });
    }

    /**
     * Core feature application logic (live preview auto-apply).
     *
     * A mixed selection gets a per-run patch of the changes made since
     * the last apply; any other selection a full rebuild of its span from
     * the popover state. inline-editor/apply-features.js builds both; the
     * reads and the pending-change resets stay here, in this order.
     */
    _doApplyFeatures() {
        const { value, onChange } = this.props;
        const { textCase, savedSelectionStart, savedSelectionEnd } = this.state;
        const caseValue = normalizeTextCase(textCase);

        // Check if selection was lost due to modal focus and we have saved bounds
        const selectionLost = isSelectionLost(value, savedSelectionStart, savedSelectionEnd);

        // Preserve raw feature settings (indexed alternates like "salt" 2,
        // set by extensions via data-feature-settings) across re-applies,
        // minus the clauses the toggles since the last apply override.
        // The format is read at the saved bounds when the live selection
        // collapsed due to modal focus.
        const activeFormatForRaw = findSelectionFormat(value, selectionLost, savedSelectionStart, FORMAT_TYPE, getActiveFormat);
        const rawFeatureSettings = resolveRawFeatureSettings(activeFormatForRaw, this._pendingChanges, window.typostSharedUtils || {});

        // MIXED SELECTIONS: when the range spans multiple distinct typost
        // formats (or formatted + plain text), stamping the full popover
        // state over it would wipe every per-run difference — the popover
        // state can't represent heterogeneity. Instead, patch ONLY the
        // properties changed since the last apply into each formatting run,
        // leaving everything else about each run untouched.
        const effectiveStart = selectionLost ? savedSelectionStart : value.start;
        const effectiveEnd = selectionLost ? savedSelectionEnd : value.end;
        const pending = this._pendingChanges;
        const hasPending = pending && (pending.keys.size > 0 || pending.featureToggles.length > 0);
        const shared = window.typostSharedUtils || {};

        if (hasPending && shared.isMixedFormatSelection && shared.patchTypostFormatAttributes &&
            Number.isFinite(effectiveStart) && Number.isFinite(effectiveEnd) && effectiveStart !== effectiveEnd &&
            shared.isMixedFormatSelection(value.formats, effectiveStart, effectiveEnd, FORMAT_TYPE)) {

            const patch = buildPatchFromPending(this.state, pending, this._clearWeight);
            this._resetPendingChanges();

            const runs = shared.computeTypostFormatRuns(value.formats, effectiveStart, effectiveEnd, FORMAT_TYPE);
            onChange(applyPatchToRuns(value, runs, patch, shared, { applyFormat, removeFormat }, FORMAT_TYPE));
            return;
        }
        // The unit of the size this rebuild writes (#233): a size the author
        // did not change keeps the unit the span has now — the rebuild
        // rewrites the whole style even when only a feature changed — and a
        // span leaving a paragraph style takes the style's unit. Read before
        // the pending changes are reset.
        const activeAttrs = (activeFormatForRaw && activeFormatForRaw.attributes) || {};
        const sizeUnit = resolveSpanFontSizeUnit({
            sizeChanged: !!(pending && pending.keys.has('fontSize')),
            spanStyle: activeAttrs.style,
            styleId: activeAttrs['data-style-id'],
            styles: window.typostData && window.typostData.paragraphStyles,
            newUnit: getNewFontSizeUnit()
        });
        if (pending) {
            this._resetPendingChanges();
        }

        // QA E-2: the weight actually written — the selection's own, or the
        // author's pick; never the display default / inherited value
        const weightToWrite = resolveWeightToWrite({
            explicitWeight: (activeFormatForRaw && activeFormatForRaw.attributes && activeFormatForRaw.attributes['data-fontweight']) || '',
            authorPicked: this._authorPickedWeight,
            stateWeight: this.state.fontWeight,
            clearWeight: this._clearWeight
        });
        const formatOptions = { weightToWrite, caseValue, rawFeatureSettings, sizeUnit };

        if (isEmptyFormatState(this.state, formatOptions)) {
            // Remove format if no features, font, font size, weight, letter spacing, or line height selected
            if (selectionLost) {
                onChange(removeFormat(value, FORMAT_TYPE, savedSelectionStart, savedSelectionEnd));
            } else {
                onChange(removeFormat(value, FORMAT_TYPE));
            }
        } else {
            const attributes = buildFormatAttributes(this.state, formatOptions);
            if (selectionLost) {
                onChange(applyFormat(value, {
                    type: FORMAT_TYPE,
                    attributes: attributes
                }, savedSelectionStart, savedSelectionEnd));
            } else {
                onChange(applyFormat(value, {
                    type: FORMAT_TYPE,
                    attributes: attributes
                }));
            }
        }

        // v2.0.0: Don't close modal on apply - modal stays open for live preview
    }


    /**
     * Apply preset
     */
    applyPreset(preset) {
        // Presets define a complete look — wholesale apply is intended
        this._resetPendingChanges();
        const fontState = resolvePresetFontState(preset, this.state, this.getFontIdMap());
        this.setState({
            selectedFeatures: preset.features,
            selectedFont: fontState.selectedFont,
            selectedFontId: fontState.selectedFontId,
            fontVariationSettings: fontState.fontVariationSettings,
            activePreset: preset.id
        }, () => {
            this._doApplyFeatures(); // instant apply, no debounce for presets
        });
    }

    /**
     * Handle clear button click - show confirmation if enabled
     */
    handleClearClick() {
        // Check if confirmation is enabled globally and not disabled for this session
        const showConfirmation = isFlagEnabled(typostData.showClearConfirmation) && !this.state.dontShowClearWarning;

        if (showConfirmation) {
            // Show confirmation modal
            this.setState({ showClearConfirmation: true });
        } else {
            // Clear immediately
            this.clearFeatures();
        }
    }

    /**
     * Confirm clear action
     */
    confirmClear() {
        try {
            // Attempt to clear features first
            this.clearFeatures();

            // Update setting only if user checked "don't show again" and clear succeeded
            if (this.state.dontShowClearWarning) {
                // Store in session storage so it persists for this session only
                try {
                    sessionStorage.setItem('typography_stylist_hide_clear_warning', 'true');
                } catch (e) {
                    // Session storage might not be available
                }
            }

            // Hide confirmation modal after successful clear
            this.setState({ showClearConfirmation: false });
        } catch (error) {
            // If clearing features fails, do not persist the "don't show again" preference
        }
    }

    /**
     * Cancel clear action
     */
    cancelClear() {
        this.setState({
            showClearConfirmation: false
        });
    }

    /**
     * Clear all features
     */
    clearFeatures() {
        const { value, onChange } = this.props;
        const { savedSelectionStart, savedSelectionEnd } = this.state;
        // Clearing removes the format wholesale by design — drop any
        // recorded property changes so a later apply doesn't resurrect them
        this._resetPendingChanges();
        const selectionLost = isSelectionLost(value, savedSelectionStart, savedSelectionEnd);

        if (selectionLost) {
            onChange(removeFormat(value, FORMAT_TYPE, savedSelectionStart, savedSelectionEnd));
        } else {
            onChange(removeFormat(value, FORMAT_TYPE));
        }
        this.setState({
            selectedFeatures: [],
            selectedFont: '',
            fontSize: 'inherit',
            fontSizeMin: 16,
            fontSizePreferred: 24,
            fontSizeMax: 32,
            fontWeight: '400',
            textCase: '',
            fakeSmallCaps: true,
            letterSpacing: 0,
            lineHeight: 0,
            activePreset: null
            // Note: Keep popover open (isOpen: true) so user can see cleared state
        });
    }

    /**
     * Get font options for select control
     */
    getFontOptions() {
        // Shared builder (assets/js/font-options.js) — includes the
        // WP Font Library group with wp:{slug} values for unadopted fonts
        const built = buildFontOptions(typostData);
        this.fontIdMap = built.fontIdMap;
        return built.options;
    }

    /**
     * Apply feature from preview button
     */
    applyFeatureFromPreview(featureId) {
        const { selectedFeatures } = this.state;

        // Add feature if not already active (idempotent operation)
        if (!selectedFeatures.includes(featureId)) {
            this._recordFeatureToggle(featureId, true);
            this.setState({
                selectedFeatures: [...selectedFeatures, featureId]
            }, () => {
                this._doApplyFeatures();
            });
        }
    }

    /**
     * Modal drag handlers
     */
    handleDragStart(e) {
        // Don't drag if clicking the close button
        // Any header button (Move panel, Close) is not a drag handle
        if (e.target.closest('.components-button')) {
            return;
        }

        // Only drag from header area
        if (!e.target.closest('.typost-modal-header')) {
            return;
        }

        e.preventDefault();
        e.stopPropagation();

        this.setState({
            isDragging: true,
            dragStartX: e.clientX,
            dragStartY: e.clientY
        });

        // Add global listeners
        document.addEventListener('mousemove', this.handleDragMove);
        document.addEventListener('mouseup', this.handleDragEnd);
    }

    handleDragMove(e) {
        if (!this.state.isDragging) return;

        const { dragStartX, dragStartY, modalX, modalY, modalWidth, modalHeight } = this.state;
        const { deltaX, deltaY } = calculateDragDelta(e, dragStartX, dragStartY);

        const newX = modalX + deltaX;
        const newY = modalY + deltaY;

        const constrained = constrainToViewport(newX, newY, modalWidth, modalHeight);

        this.setState({
            modalX: constrained.x,
            modalY: constrained.y,
            dragStartX: e.clientX,
            dragStartY: e.clientY
        });
    }

    handleDragEnd(e) {
        this.setState({ isDragging: false });
        document.removeEventListener('mousemove', this.handleDragMove);
        document.removeEventListener('mouseup', this.handleDragEnd);
    }

    /**
     * Modal resize handlers
     */
    handleResizeStart(e, direction) {
        e.preventDefault();
        e.stopPropagation();

        const { modalWidth, modalHeight, modalX, modalY } = this.state;

        this.setState({
            isResizing: true,
            resizeDirection: direction,
            resizeStartX: e.clientX,
            resizeStartY: e.clientY,
            resizeStartWidth: modalWidth,
            resizeStartHeight: modalHeight,
            resizeStartModalX: modalX,
            resizeStartModalY: modalY
        });

        document.addEventListener('mousemove', this.handleResizeMove);
        document.addEventListener('mouseup', this.handleResizeEnd);
    }

    handleResizeMove(e) {
        if (!this.state.isResizing) return;

        const {
            resizeDirection,
            resizeStartX,
            resizeStartY,
            resizeStartWidth,
            resizeStartHeight,
            resizeStartModalX,
            resizeStartModalY
        } = this.state;

        const newDimensions = calculateResize(e, resizeDirection, {
            startX: resizeStartX,
            startY: resizeStartY,
            startWidth: resizeStartWidth,
            startHeight: resizeStartHeight,
            startModalX: resizeStartModalX,
            startModalY: resizeStartModalY
        });

        this.setState({
            modalWidth: newDimensions.width,
            modalHeight: newDimensions.height,
            modalX: newDimensions.x,
            modalY: newDimensions.y
        });
    }

    handleResizeEnd(e) {
        this.setState({
            isResizing: false,
            resizeDirection: null
        });
        document.removeEventListener('mousemove', this.handleResizeMove);
        document.removeEventListener('mouseup', this.handleResizeEnd);
    }

    /**
     * Keyboard handler for arrow key positioning
     */
    handleHeaderKeyDown(e) {
        const STEP = 10;
        let { modalX, modalY } = this.state;
        let moved = false;

        switch (e.key) {
            case 'ArrowUp':
                modalY = Math.max(0, modalY - STEP);
                moved = true;
                break;
            case 'ArrowDown':
                modalY = Math.min(window.innerHeight - 100, modalY + STEP);
                moved = true;
                break;
            case 'ArrowLeft':
                modalX = Math.max(0, modalX - STEP);
                moved = true;
                break;
            case 'ArrowRight':
                modalX = Math.min(window.innerWidth - 100, modalX + STEP);
                moved = true;
                break;
        }

        if (moved) {
            e.preventDefault();
            this.setState({ modalX, modalY });
        }
    }

    /**
     * Register the extension listeners. React can run mount, unmount and
     * mount again on one instance (StrictMode with SCRIPT_DEBUG on), so
     * every registration here has its removal in componentWillUnmount()
     * (#386).
     */
    componentDidMount() {
        // The extension handlers act only while this is true (see
        // inline-editor/extension-bridge.js)
        this._isMounted = true;
        attachExtensionListeners(this, window.typostHooks, document);
    }

    componentDidUpdate(prevProps, prevState) {
        // The feature previews render in the picked font before it is
        // applied, so its Adobe Fonts kit must load now (#230: the editor
        // no longer loads every kit up front).
        const fontId = this.state.selectedFontId;
        if (this.state.isOpen && fontId && (fontId !== prevState.selectedFontId || !prevState.isOpen) &&
            window.typostFontKits && typeof window.typostFontKits.ensureFontId === 'function') {
            window.typostFontKits.ensureFontId(fontId);
        }
    }

    /**
     * Remove the event listeners, the extension listeners and the pending
     * debounced applies and announcement.
     */
    componentWillUnmount() {
        this._isMounted = false;
        this.cancelWordBoundaryAnnouncement();

        // Cleanup modal drag/resize event listeners
        document.removeEventListener('mousemove', this.handleDragMove);
        document.removeEventListener('mouseup', this.handleDragEnd);
        document.removeEventListener('mousemove', this.handleResizeMove);
        document.removeEventListener('mouseup', this.handleResizeEnd);

        // Cleanup debounced apply functions (v2.0.0 - live preview)
        this.debouncedApplySlider.cancel();
        this.debouncedApplyDropdown.cancel();
        this.debouncedApplyFontSize.cancel();

        // Extension hook listeners, filter and actions (registered in
        // componentDidMount)
        detachExtensionListeners(this);
    }

    /**
     * Render the toolbar buttons and, while open, the modal. Each
     * section is a function component in inline-editor/modal-panels.js
     * or modal-chrome.js; this method reads the state and wires the
     * handlers.
     */
    render() {
        const { isActive, isInTypostBlock = false } = this.props;
        const { isOpen, fontSize, canConvert } = this.state;
        // A fixed size (64, from a paragraph style) has no control in the
        // Font Size menu; it is shown as a disabled option (#255)
        const fixedSizePx = parseFixedFontSize(fontSize);
        const groupedFeatures = groupFeatures(typostData, this.state.selectedFontId || 0, window.typostSharedUtils);
        const presets = typostData.presets || [];
        // Also refreshes this.fontIdMap, which the weight options read
        const fontOptions = this.getFontOptions();
        // '' when the omission needs no explanation (already a Typography
        // Stylist block, or a block type with no conversion mapping).
        const convertBlockedMessage = canConvert ? '' : this.getConvertBlockedMessage();
        // The notice recommends converting, so there it also explains an
        // unsupported block type (QA E-4)
        const noticeBlockedMessage = canConvert ? '' : this.getConvertBlockedMessage(undefined, undefined, true);
        // Extension-registered toolbar buttons (v2.3.0). Rendered as real
        // ToolbarButtons so they join the toolbar's roving tabindex.
        const extensionButtons = filterToolbarButtons(
            window.typostHooks.applyFilters('typost_editor_toolbar_buttons', [], 'inline'),
            'inline'
        );

        return (
            <Fragment>
                {/* Only show button if NOT in a Typography Stylist block */}
                {!isInTypostBlock && (
                    <InlineToolbar
                        icon={TSIcon}
                        isActive={isActive}
                        onToggle={this.togglePopover}
                        extensionButtons={extensionButtons}
                        onExtensionClick={(button) => this.handleExtensionToolbarClick(button)}
                    />
                )}

                {isOpen && (
                    <Modal
                        // Core's header is hidden because this modal draws
                        // its own draggable one, which leaves the dialog
                        // unnamed unless it is pointed at that heading:
                        // core reads `aria.labelledby` exactly when `title`
                        // is empty.
                        title=""
                        aria={{ labelledby: this.modalTitleId }}
                        onRequestClose={this.togglePopover}
                        className={`typost-modal ${this.state.isDragging ? 'is-dragging' : ''} ${this.state.isResizing ? 'is-resizing' : ''}`}
                        isDismissible={true}
                        shouldCloseOnClickOutside={false}
                        shouldCloseOnEsc={true}
                        __experimentalHideHeader={true}
                        onMouseDown={(e) => {
                            // Only trigger drag if clicking on header, not content
                            if (e.target.classList.contains('typost-modal-header') ||
                                e.target.closest('.typost-modal-header')) {
                                this.handleDragStart(e);
                            }
                        }}
                        style={{
                            position: 'fixed',
                            top: `${this.state.modalY}px`,
                            left: `${this.state.modalX}px`,
                            width: `${this.state.modalWidth}px`,
                            height: `${this.state.modalHeight}px`,
                            maxWidth: 'none',
                            maxHeight: 'none',
                            transform: 'none'
                        }}
                    >
                        <ModalHeader
                            titleId={this.modalTitleId}
                            isDragging={this.state.isDragging}
                            onDragStart={this.handleDragStart}
                            onHeaderKeyDown={this.handleHeaderKeyDown}
                            onClose={this.togglePopover}
                        />

                        {/* Modal content wrapper with scroll.
                            tabIndex -1 on both scroll containers: browsers
                            put scrollable elements in the Tab order, and a
                            screen reader then reads the whole container —
                            NVDA spoke the entire modal (every heading, help
                            text and checkbox, ~600 words) at one Tab stop,
                            twice (QA finding SR-3). The controls inside are
                            still reachable and scroll the container into
                            view, which is what keyboard users need. */}
                        <div className="typost-modal-content" tabIndex={-1} style={{
                            height: `calc(${this.state.modalHeight}px - 60px)`,
                            overflowY: 'auto'
                        }}>
                            <div className="typost-popover-content">

                            <TipsNotice isDismissed={this.state.tipsDismissed} onDismiss={this.dismissTips} />

                            {/* Scrollable Content Wrapper (see the tabIndex note above) */}
                            <div className="typost-scrollable-content" tabIndex={-1}>

                            {this.renderModalSections({ fixedSizePx, groupedFeatures, presets, fontOptions, convertBlockedMessage, noticeBlockedMessage })}

                            </div>{/* End typost-scrollable-content */}
                        </div>{/* End typost-popover-content */}
                        </div>{/* End typost-modal-content */}

                        <ResizeHandles onResizeStart={this.handleResizeStart} />
                    </Modal>
                )}
            </Fragment>
        );
    }

    /**
     * The sections inside the modal's scrollable content, top to
     * bottom, with the extension hook points between them.
     *
     * @param {Object} computed Values render() computed for this render
     * @return {Array} Children of typost-scrollable-content
     */
    renderModalSections(computed) {
        const { fixedSizePx, groupedFeatures, presets, fontOptions, convertBlockedMessage, noticeBlockedMessage } = computed;
        const state = this.state;
        const { selectedFont, selectedFontId, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, fontWeight, letterSpacing, lineHeight, wordBoundaryWarning, canConvert, showClearConfirmation, dontShowClearWarning, fontDetectionFailed } = state;

        // Called here, in this render pass, at the point the inline weight
        // control used to call them: the filter is extension code, so it
        // runs before the sections render, as often, and under the same
        // conditions as before #357. The options are read only for the
        // default control.
        const weightControlType = window.typostHooks
            ? window.typostHooks.applyFilters('typost_weight_control', 'default', state.selectedFontId)
            : 'default';
        const weightOptions = weightControlType === 'default' ? getFilteredWeightOptions(state.selectedFontId, this.fontIdMap) : null;

        return [
            <WordBoundaryNotice
                key="word-boundary"
                warning={wordBoundaryWarning}
                noticeId={this.wordBoundaryNoticeId}
                canConvert={canConvert}
                blockedMessage={noticeBlockedMessage}
                onConvert={this.convertToBlock}
                settingsUrl={typostData.settingsUrl}
            />,
            // Extension hook point: top of modal (e.g., Paragraph Styles dropdown)
            <HookPoint key="modal-top" hook="typost_inline_modal_top" state={state} />,
            <FontDetectionNotice key="font-detection" failed={fontDetectionFailed} selectedFont={selectedFont} />,
            <FontFamilyPanel
                key="font"
                fontOptions={fontOptions}
                selectedFontId={selectedFontId}
                onChange={this.setFont}
                adoptError={state.wpAdoptError}
                onDismissAdoptError={() => this.setState({ wpAdoptError: false })}
            />,
            <FontWeightPanel
                key="weight"
                state={state}
                fontWeight={fontWeight}
                controlType={weightControlType}
                weightOptions={weightOptions}
                onChange={this.setFontWeight}
            />,
            // Extension hook point: after font controls (e.g., Variable Font
            // axes). Sits directly below the weight control so a variable
            // font's axis sliders stay grouped with the weight they extend.
            // key: remount (and re-fire the action) when the font changes
            <HookPoint key={`typost-afc-${state.selectedFontId || 'none'}`} hook="typost_inline_after_font_controls" state={state} />,
            <FontStylePanel key="font-style" fontStyle={state.fontStyle} onChange={this.setFontStyle} />,
            <CasePanel
                key="case"
                textCase={state.textCase}
                fakeSmallCaps={state.fakeSmallCaps}
                paragraphStyleId={state.paragraphStyleId}
                onChange={this.setTextCase}
                onFakeSmallCapsChange={this.setFakeSmallCaps}
            />,
            <FontSizePanel
                key="size"
                fontSize={fontSize}
                fontSizeMin={fontSizeMin}
                fontSizePreferred={fontSizePreferred}
                fontSizeMax={fontSizeMax}
                fixedSizePx={fixedSizePx}
                paragraphStyleId={state.paragraphStyleId}
                // Read only for the responsive sliders, as before #357
                sizeUnit={fontSize === 'responsive' ? this.getZoomNoticeUnit() : null}
                onSizeChange={this.setFontSize}
                onMinChange={this.setFontSizeMin}
                onPreferredChange={this.setFontSizePreferred}
                onMaxChange={this.setFontSizeMax}
            />,
            <LineHeightPanel key="line-height" lineHeight={lineHeight} onChange={this.setLineHeight} />,
            <LetterSpacingPanel key="letter-spacing" letterSpacing={letterSpacing} onChange={this.setLetterSpacing} />,
            <PresetsPanel key="presets" presets={presets} activePreset={state.activePreset} onApply={this.applyPreset} />,
            // Extension hook point: before features (e.g., Glyphs panel)
            <HookPoint key="before-features" hook="typost_inline_before_features" state={state} />,
            <FeaturesPanel
                key="features"
                groupedFeatures={groupedFeatures}
                selectedFeatures={state.selectedFeatures}
                // Use selected text or default sample text for feature preview
                previewText={state.selectedText || 'ffi ffl Th AE'}
                // Use selected font, or fallback to block's inherited font when Default is selected
                fontToUse={selectedFont || state.blockInheritedFont}
                renderedStyle={this.getRenderedFontStyle()}
                textCase={state.textCase}
                fakeSmallCaps={state.fakeSmallCaps}
                onToggle={this.toggleFeature}
                onApply={this.applyFeatureFromPreview}
            />,
            // Extension hook point: after features
            <HookPoint key="after-features" hook="typost_inline_after_features" state={state} />,
            <ConvertSection
                key="convert"
                wordBoundaryWarning={wordBoundaryWarning}
                canConvert={canConvert}
                blockedMessage={convertBlockedMessage}
                onConvert={this.convertToBlock}
            />,
            <ClearConfirmation
                key="clear-confirmation"
                show={showClearConfirmation}
                dontShowAgain={dontShowClearWarning}
                onDontShowAgainChange={(checked) => this.setState({ dontShowClearWarning: checked })}
                onConfirm={this.confirmClear}
                onCancel={this.cancelClear}
            />,
            // Extension hook point: bottom of modal
            <HookPoint key="modal-bottom" hook="typost_inline_modal_bottom" state={state} />,
            <ModalActions key="actions" hidden={showClearConfirmation} onClear={this.handleClearClick} onClose={this.togglePopover} />
        ];
    }
}

/**
 * Register the format type
 */
registerFormatType(FORMAT_TYPE, {
    title: __('Typography Stylist', 'typography-stylist'),
    tagName: 'span',
    className: 'typost-styled',
    attributes: {
        'data-features': 'data-features',
        'data-font': 'data-font',
        'data-font-id': 'data-font-id',
        'data-fontsize': 'data-fontsize',
        'data-fontsize-min': 'data-fontsize-min',
        'data-fontsize-preferred': 'data-fontsize-preferred',
        'data-fontsize-max': 'data-fontsize-max',
        'data-fontweight': 'data-fontweight',
        // Every attribute this editor writes must be registered here to
        // be readable after a reload: RichText keeps unregistered ones in
        // format.unregisteredAttributes, which getActiveFormat() callers
        // and applyFormat() rebuilds never see. data-fontstyle was
        // missing, so after a reload one feature toggle rebuilt an italic
        // span without its italic.
        'data-fontstyle': 'data-fontstyle',
        // Case (#214)
        'data-textcase': 'data-textcase',
        'data-fakesmallcaps': 'data-fakesmallcaps',
        'data-letterspacing': 'data-letterspacing',
        'data-lineheight': 'data-lineheight',
        'data-style-id': 'data-style-id',
        'data-font-variation-settings': 'data-font-variation-settings',
        // Raw font-feature-settings value for indexed alternates (e.g. "salt" 2)
        // that the comma-tag data-features format cannot express
        // (set by extensions such as the Glyphs Panel)
        'data-feature-settings': 'data-feature-settings',
        // Animation config reference on inline spans (set by the
        // Animations extension; rendered via its render_block transform)
        'data-animation-id': 'data-animation-id',
        'style': 'style',
        // Written by the removed "Add aria-label Attributes" option. Kept
        // so spans saved with it still parse as this format.
        'aria-label': 'aria-label'
    },
    edit: compose(
        wp.data.withSelect((select) => {
            const selectedBlock = select('core/block-editor').getSelectedBlock();
            return {
                isInTypostBlock: selectedBlock && selectedBlock.name === 'typost/block'
            };
        })
    )(function(props) {
        return (
            <TypographyFeaturesControl {...props} />
        );
    })
});

/**
 * New Typography Stylist blocks from the inserter store the site's size
 * unit (#248) and start with the tag the author chose last (#410).
 *
 * Installed here rather than in the block script because typostData is
 * localized on this handle; the block script has no guaranteed order
 * relative to it. Variations are stored by block name, so registering
 * before the block type exists is fine. Blocks created in code (the
 * transforms, Convert to block) pass the unit and the tag themselves. The
 * block's heading level menu updates the variation when the author picks a
 * tag (rememberNewBlockTag), and a pick in another tab updates it here
 * through the storage event. See assets/js/new-block-tag.js.
 */
const { installNewBlockVariation } = require('./new-block-tag.js');
installNewBlockVariation();
