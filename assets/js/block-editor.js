/**
 * Block Editor Integration for Typography Stylist
 * Adds custom format type for OpenType features
 */

// Import drag/resize utilities (CommonJS for browserify)
const { constrainToViewport, calculateDragDelta, calculateResize } = require('./modal-drag-resize.js');

// Shared font picker option builder + WP Font Library adoption helpers
const { buildFontOptions, isWpLibraryValue, wpSlugFromValue, adoptWpFont, resolveActiveFontFamily, resolveFontIdFromFamily } = require('./font-options.js');
const { FontPicker } = require('./font-picker.js');

// Convert-to-block capability resolution (why the Convert action is offered or not)
const { CONVERT_BLOCKED, resolveConvertCapability, shouldExplainConvertBlock } = require('./convert-capability.js');

// Viewport breakpoints for responsive font sizing
const RESPONSIVE_FONT_MIN_VIEWPORT = 320;  // Mobile baseline
const RESPONSIVE_FONT_MAX_VIEWPORT = 1920; // Desktop baseline

(function(wp) {
    const { registerFormatType, toggleFormat, applyFormat, removeFormat, getActiveFormat, slice, getTextContent, insert } = wp.richText;
    const { BlockControls } = wp.blockEditor;
    const { ToolbarGroup, ToolbarButton } = wp.components;
    const { Component, Fragment } = wp.element;
    const { Popover, Button, ButtonGroup, ToggleControl, SelectControl, PanelBody, RangeControl, Modal, CheckboxControl, Notice } = wp.components;
    const { __, sprintf } = wp.i18n;
    const { compose, debounce } = wp.compose;

    /**
     * Typography Stylist Hook System
     *
     * Lightweight action/filter system for extension plugins.
     * Mirrors WordPress PHP hooks. Extensions register callbacks
     * that fire at specific points in the editor lifecycle.
     *
     * @since 2.0.0
     */
    window.typostHooks = window.typostHooks || {
        _actions: {},
        _filters: {},
        addAction: function(name, callback, priority) {
            priority = priority || 10;
            this._actions[name] = this._actions[name] || [];
            this._actions[name].push({ callback: callback, priority: priority });
            this._actions[name].sort(function(a, b) { return a.priority - b.priority; });
        },
        doAction: function(name) {
            var args = Array.prototype.slice.call(arguments, 1);
            (this._actions[name] || []).forEach(function(h) { h.callback.apply(null, args); });
        },
        addFilter: function(name, callback, priority) {
            priority = priority || 10;
            this._filters[name] = this._filters[name] || [];
            this._filters[name].push({ callback: callback, priority: priority });
            this._filters[name].sort(function(a, b) { return a.priority - b.priority; });
        },
        applyFilters: function(name, value) {
            var args = Array.prototype.slice.call(arguments, 1);
            (this._filters[name] || []).forEach(function(h) {
                args[0] = h.callback.apply(null, args);
            });
            return args[0];
        },
        removeAction: function(name, callback) {
            if (!this._actions[name]) return;
            this._actions[name] = this._actions[name].filter(function(h) {
                return h.callback !== callback;
            });
        },
        removeFilter: function(name, callback) {
            if (!this._filters[name]) return;
            this._filters[name] = this._filters[name].filter(function(h) {
                return h.callback !== callback;
            });
        }
    };

    // Define the format type name
    const FORMAT_TYPE = 'typost/features';

    /**
     * Shared utility functions
     * These are extracted here so tests can import and verify the actual implementation
     */

    /**
     * HTML-escape text to prevent XSS
     * @param {string} text - Text to escape
     * @return {string} HTML-escaped text
     */
    function escapeHTML(text) {
        if (!text) return '';
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Check if content contains actual HTML tags (not just < characters)
     * @param {string} content - Content to check
     * @return {boolean} True if content contains HTML tags
     */
    function hasHTMLTags(content) {
        if (!content) return false;
        return /<[^>]+>/.test(content);
    }

    /**
     * Validate selection bounds
     * @param {number} start - Selection start offset
     * @param {number} end - Selection end offset
     * @param {number} textLength - Total text length
     * @return {object} Validation result with valid flag and optional error message
     */
    function validateSelectionBounds(start, end, textLength) {
        if (start < 0 || end < 0) {
            return { valid: false, error: 'Selection offsets cannot be negative' };
        }
        if (start > end) {
            return { valid: false, error: 'Start offset cannot be greater than end offset' };
        }
        if (end > textLength) {
            return { valid: false, error: 'Selection end exceeds text length' };
        }
        return { valid: true };
    }

    /**
     * Read a boolean flag out of typostData.
     *
     * These options are stored as '1'/'0' strings and wp_localize_script()
     * stringifies whatever it is handed, so an uncast '0' arrives as the
     * string "0" — truthy in JavaScript, which silently inverted every such
     * setting. PHP now casts them, but a localized-data transient written
     * before that fix can still hold the old strings for up to an hour, so
     * treat "0" and "false" as off here too.
     *
     * @since 2.3.0
     * @param {*} value Raw value from typostData
     * @return {boolean} Whether the flag is on
     */
    function isFlagEnabled(value) {
        if (value === undefined || value === null || value === false) {
            return false;
        }
        if (typeof value === 'string') {
            const normalized = value.trim().toLowerCase();
            return normalized !== '' && normalized !== '0' && normalized !== 'false';
        }
        return !!value;
    }

    /**
     * Filter extension-registered toolbar button descriptors down to the ones
     * this editor should render, dropping malformed entries. A descriptor with
     * no `editors` array is offered in every editor.
     *
     * Duplicated from blocks/typography-stylist/utils.js (separate build
     * pipelines, same reason the hook system above is duplicated); that copy is
     * the one covered by unit tests.
     *
     * @since 2.3.0
     * @param {Array} buttons - Descriptors from the typost_editor_toolbar_buttons filter
     * @param {string} editor - Editor key ('qft' or 'inline')
     * @return {Array} Valid descriptors for this editor
     */
    function filterToolbarButtons(buttons, editor) {
        if (!Array.isArray(buttons)) {
            return [];
        }
        return buttons.filter(function(button) {
            if (!button || !button.id || typeof button.onClick !== 'function') {
                return false;
            }
            if (Array.isArray(button.editors)) {
                return button.editors.indexOf(editor) !== -1;
            }
            return true;
        });
    }

    /**
     * Sanitize font family value to prevent CSS injection
     * Removes characters that could break out of CSS style strings
     * @param {string} font - Font family name
     * @return {string} Sanitized font family name
     */
    function sanitizeFontFamily(font) {
        if (!font) return '';
        // Remove quotes, semicolons, and angle brackets that could break style string or inject HTML
        return font.replace(/["';<>]/g, '');
    }

    /**
     * Sanitize CSS value to prevent injection
     * @param {string|number} value - CSS value
     * @return {string} Sanitized CSS value
     */
    function sanitizeCSSValue(value) {
        if (value === null || value === undefined) return '';
        const stringValue = String(value);
        // Remove dangerous characters that could break out of CSS
        return stringValue.replace(/[;<>"']/g, '');
    }

    /**
     * Validate and sanitize font-variation-settings value.
     * Ensures each entry matches "axis" number format (e.g. "wght" 700, "wdth" 100).
     * Returns empty string for invalid input.
     * @param {string} value - font-variation-settings string
     * @return {string} Validated and normalized value, or empty string
     */
    function sanitizeFontVariationSettings(value) {
        if (!value) return '';
        var str = String(value).trim();
        if (!str) return '';
        var entries = str.split(',').map(function(e) { return e.trim(); }).filter(Boolean);
        var validEntries = [];
        for (var i = 0; i < entries.length; i++) {
            var match = entries[i].match(/^["']([a-zA-Z][a-zA-Z0-9 ]{0,3})["']\s+(-?\d+(?:\.\d+)?)$/);
            if (!match) return '';
            validEntries.push('"' + match[1] + '" ' + match[2]);
        }
        return validEntries.join(', ');
    }

    /**
     * Build a text offset map from a DOM container, accounting for <br> elements.
     *
     * Designed to match WordPress RichText's offset system, where each <br> element
     * (inserted via Shift+Enter) counts as 1 character position. Without this adjustment,
     * offsets from wp.richText value.start / value.end would be misaligned with text
     * node positions, causing styles to be applied to the wrong character.
     *
     * Returns only text node entries — <br> elements increment the running offset by 1
     * but do not produce entries in the returned array, since they cannot be split or
     * wrapped in <span> elements.
     *
     * @param {Node} container - DOM node to walk
     * @param {Document} docContext - Document context for creating the TreeWalker
     * @return {Array<{node: Node, start: number, end: number, text: string}>}
     */
    function buildTextOffsetMap(container, docContext) {
        var walker = docContext.createTreeWalker(
            container,
            NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT,
            {
                acceptNode: function(node) {
                    if (node.nodeType === Node.TEXT_NODE) {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    if (node.nodeName === 'BR') {
                        return NodeFilter.FILTER_ACCEPT;
                    }
                    return NodeFilter.FILTER_SKIP;
                }
            }
        );

        var map = [];
        var currentOffset = 0;
        var node;

        while ((node = walker.nextNode())) {
            if (node.nodeType === Node.TEXT_NODE) {
                var text = node.nodeValue || '';
                map.push({
                    node: node,
                    start: currentOffset,
                    end: currentOffset + text.length,
                    text: text
                });
                currentOffset += text.length;
            } else if (node.nodeName === 'BR') {
                currentOffset += 1;
            }
        }

        return map;
    }

    /**
     * Find the element that actually renders a block's text, so computed
     * styles can be read from it.
     *
     * @param {string} blockClientId - Block's client ID
     * @param {string} blockName - Block type name (e.g., 'core/heading')
     * @param {Document} targetDocument - Document to query (defaults to document)
     * @return {Element|null} The text element, or null when it cannot be found
     */
    function findBlockTextElement(blockClientId, blockName, targetDocument) {
        if (!blockClientId || !blockName) {
            return null;
        }

        const doc = targetDocument || document;

        // Find the block wrapper element
        const blockWrapper = doc.querySelector(`[data-block="${blockClientId}"]`);
        if (!blockWrapper) {
            return null;
        }

        // Find the actual text element based on block type
        // Note: WordPress 6.5+ puts data-block directly on the element (e.g., <h2 data-block="...">)
        // Older versions use a wrapper div. We support both structures.
        let textElement = null;

        // Core heading blocks (h1-h6)
        if (blockName === 'core/heading') {
            // Check if blockWrapper itself is the heading (new WordPress structure)
            if (blockWrapper.matches('h1, h2, h3, h4, h5, h6')) {
                textElement = blockWrapper;
            } else {
                // Fall back to finding heading inside wrapper (old WordPress structure)
                textElement = blockWrapper.querySelector('h1, h2, h3, h4, h5, h6');
            }
        }
        // Core paragraph blocks
        else if (blockName === 'core/paragraph') {
            // Check if blockWrapper itself is the paragraph (new WordPress structure)
            if (blockWrapper.matches('p')) {
                textElement = blockWrapper;
            } else {
                // Fall back to finding paragraph inside wrapper (old WordPress structure)
                textElement = blockWrapper.querySelector('p');
            }
        }
        // GenerateBlocks headline blocks
        else if (blockName === 'generateblocks/headline') {
            textElement = blockWrapper.querySelector('[class*="gb-headline"]');
        }
        // Typography Stylist blocks
        else if (blockName === 'typost/block') {
            textElement = blockWrapper.querySelector('.typost-block-content');
        }
        // Fallback: try common RichText elements
        else {
            textElement = blockWrapper.querySelector('h1, h2, h3, h4, h5, h6, p, [contenteditable="true"]');
        }

        return textElement;
    }

    /**
     * Get block's inherited font-family from computed styles
     * Detects the current font applied by theme or block settings
     *
     * @param {string} blockClientId - Block's client ID
     * @param {string} blockName - Block type name (e.g., 'core/heading')
     * @param {Document} targetDocument - Document to query (defaults to document)
     * @param {Window} targetWindow - Window context for getComputedStyle (defaults to window)
     * @return {string} Font family string from computed styles, or empty string if not found
     */
    function getBlockInheritedFont(blockClientId, blockName, targetDocument, targetWindow) {
        const textElement = findBlockTextElement(blockClientId, blockName, targetDocument);
        if (!textElement) {
            return '';
        }

        const win = targetWindow || window;
        const fontFamily = win.getComputedStyle(textElement).getPropertyValue('font-family');
        return fontFamily ? fontFamily.replace(/['"]/g, '') : '';
    }

    /**
     * Get a block's rendered font-weight from computed styles.
     *
     * Themes make headings bold through CSS, not through any stored attribute,
     * so this is the only way to know what a core heading actually looks like
     * before converting it to a Typography Stylist block.
     *
     * @since 2.3.0
     * @param {string} blockClientId - Block's client ID
     * @param {string} blockName - Block type name (e.g., 'core/heading')
     * @param {Document} targetDocument - Document to query (defaults to document)
     * @param {Window} targetWindow - Window context for getComputedStyle (defaults to window)
     * @return {string} Computed weight (e.g. '700'), or '' when it cannot be read
     */
    function getBlockInheritedWeight(blockClientId, blockName, targetDocument, targetWindow) {
        const textElement = findBlockTextElement(blockClientId, blockName, targetDocument);
        if (!textElement) {
            return '';
        }

        const win = targetWindow || window;
        const weight = win.getComputedStyle(textElement).getPropertyValue('font-weight');
        if (!weight) {
            return '';
        }

        // Browsers report keywords on some platforms; map them to numbers so
        // the value is always a valid block attribute.
        const keywords = { normal: '400', bold: '700', bolder: '700', lighter: '300' };
        const normalized = String(weight).trim().toLowerCase();
        if (keywords[normalized]) {
            return keywords[normalized];
        }
        return /^\d+$/.test(normalized) ? normalized : '';
    }

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
     * Typography Features Component
     */
    class TypographyFeaturesControl extends Component {
        constructor(props) {
            super(props);

            // Names this instance's modal. See typostInlineInstanceCount above.
            typostInlineInstanceCount += 1;
            this.modalTitleId = `typost-inline-title-${typostInlineInstanceCount}`;

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

            // Property changes recorded since the last apply. When the selection
            // is mixed (multiple distinct typost formats), only these changes are
            // applied per-run — the rest of each run's formatting is preserved.
            this._pendingChanges = { keys: new Set(), featureToggles: [] };

            this.state = {
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

            // Extension hook: Register state provider for extensions to read current state
            const self = this;
            this._stateProviderFilter = function(state, editorType) {
                if (editorType === 'inline') {
                    return {
                        editorType: 'inline',
                        // Text with no typost font of its own still renders in
                        // something — usually a plugin font applied by the theme.
                        // Resolving it means the Glyphs panel browses the font
                        // the author can actually see, instead of falling back
                        // to whichever font happens to be first in the list.
                        fontId: self.state.selectedFontId || self.getInheritedFontId(),
                        // Rendered weight, not the '400' default: a glyph
                        // inserted into a theme-bold headline was coming out
                        // lighter than the text around it, because consumers
                        // wrote this value onto the span they created.
                        fontWeight: self.getEffectiveFontWeight(),
                        // Rendered style, not just span styling — an <em>-italic
                        // selection should give consumers (Glyphs panel) the
                        // italic face even without a data-fontstyle span
                        fontStyle: self.getRenderedFontStyle(),
                        fontSize: self.state.fontSize,
                        fontSizeMin: self.state.fontSizeMin,
                        fontSizePreferred: self.state.fontSizePreferred,
                        fontSizeMax: self.state.fontSizeMax,
                        letterSpacing: self.state.letterSpacing,
                        lineHeight: self.state.lineHeight,
                        features: self.state.selectedFeatures,
                        paragraphStyleId: self.state.paragraphStyleId,
                        animationId: self.state.animationId,
                        fontVariationSettings: self.state.fontVariationSettings
                    };
                }
                return state;
            };
            window.typostHooks.addFilter('typost_current_editor_state', this._stateProviderFilter, 10);

            // Extension hook: Listen for block property application from extensions
            // Uses !== undefined checks so partial updates only override fields
            // present in the event, preserving current state for missing fields
            this._handleApplyBlockProperties = function(e) {
                if (e.detail && e.detail.source === 'inline' && e.detail.properties) {
                    const props = e.detail.properties;
                    // Record which properties this event changes so mixed
                    // selections only get those patched per-run. Style/animation
                    // ids reset to wholesale (extensions own the full format).
                    if (e.detail.paragraphStyleId !== undefined || e.detail.animationId !== undefined || props.features !== undefined) {
                        self._resetPendingChanges();
                    } else {
                        if (props.fontId !== undefined) { self._recordChange('font'); }
                        if (props.fontWeight !== undefined) { self._recordChange('fontWeight'); }
                        if (props.fontStyle !== undefined) { self._recordChange('fontStyle'); }
                        if (props.fontSize !== undefined || props.fontSizeMin !== undefined || props.fontSizePreferred !== undefined || props.fontSizeMax !== undefined) { self._recordChange('fontSize'); }
                        if (props.letterSpacing !== undefined) { self._recordChange('letterSpacing'); }
                        if (props.lineHeight !== undefined) { self._recordChange('lineHeight'); }
                        if (props.fontVariationSettings !== undefined) { self._recordChange('fontVariationSettings'); }
                    }
                    self.setState({
                        selectedFontId: props.fontId !== undefined ? (props.fontId || 0) : self.state.selectedFontId,
                        selectedFont: props.fontId !== undefined ? (props.fontId ? self.resolveFontFamily(props.fontId) : '') : self.state.selectedFont,
                        fontWeight: props.fontWeight !== undefined ? (props.fontWeight || '400') : self.state.fontWeight,
                        fontStyle: props.fontStyle !== undefined ? (props.fontStyle || '') : self.state.fontStyle,
                        fontSize: props.fontSize !== undefined ? (props.fontSize || 'inherit') : self.state.fontSize,
                        fontSizeMin: props.fontSizeMin !== undefined ? (props.fontSizeMin || 16) : self.state.fontSizeMin,
                        fontSizePreferred: props.fontSizePreferred !== undefined ? (props.fontSizePreferred || 24) : self.state.fontSizePreferred,
                        fontSizeMax: props.fontSizeMax !== undefined ? (props.fontSizeMax || 32) : self.state.fontSizeMax,
                        letterSpacing: props.letterSpacing !== undefined ? (props.letterSpacing || 0) : self.state.letterSpacing,
                        lineHeight: props.lineHeight !== undefined ? (props.lineHeight || 0) : self.state.lineHeight,
                        selectedFeatures: props.features !== undefined ? (props.features || []) : self.state.selectedFeatures,
                        paragraphStyleId: e.detail.paragraphStyleId !== undefined ? (e.detail.paragraphStyleId || 0) : self.state.paragraphStyleId,
                        animationId: e.detail.animationId !== undefined ? (e.detail.animationId || 0) : self.state.animationId,
                        fontVariationSettings: props.fontVariationSettings !== undefined ? sanitizeFontVariationSettings(props.fontVariationSettings || '') : self.state.fontVariationSettings
                    }, function() {
                        self._doApplyFeatures();
                    });
                }
            };
            document.addEventListener('typost-apply-block-properties', this._handleApplyBlockProperties);

            // Extension hook: Listen for content insertion from extensions (e.g., Glyphs Panel)
            // Inserts text at the cursor (or replaces the selection), optionally
            // wrapping the inserted text in a typost-styled span via format attributes.
            this._handleInsertContent = function(e) {
                if (!e.detail || e.detail.source !== 'inline' || !e.detail.text) {
                    return;
                }
                // Only a mounted instance handles insertion. React StrictMode
                // constructs discarded shadow instances whose constructor-added
                // listeners are never cleaned up — without this guard each
                // insert would be applied twice.
                if (!self._isMounted) {
                    return;
                }
                const { value, onChange } = self.props;
                if (!value || !onChange) {
                    return;
                }
                const { savedSelectionStart, savedSelectionEnd } = self.state;

                // Selection may be lost to modal focus; fall back to saved
                // bounds, then to the range captured by the extension when its
                // UI launched (detail.range), then append at the end
                const selectionLost = value.start === value.end && savedSelectionStart !== null && savedSelectionEnd !== null && savedSelectionStart !== savedSelectionEnd;
                let start = selectionLost ? savedSelectionStart : value.start;
                let end = selectionLost ? savedSelectionEnd : value.end;
                if (!Number.isFinite(start)) {
                    if (e.detail.range && Number.isFinite(e.detail.range.start)) {
                        start = e.detail.range.start;
                        end = Number.isFinite(e.detail.range.end) ? e.detail.range.end : start;
                    } else {
                        start = value.text.length;
                        end = start;
                    }
                }
                if (!Number.isFinite(end)) end = start;
                // Normalize: integers, swap if reversed, clamp to text bounds
                start = Math.floor(start);
                end = Math.floor(end);
                if (end < start) {
                    const swap = start;
                    start = end;
                    end = swap;
                }
                start = Math.max(0, Math.min(start, value.text.length));
                end = Math.max(start, Math.min(end, value.text.length));

                const text = String(e.detail.text).slice(0, 50);
                let newValue = insert(value, text, start, end);
                const insertEnd = start + text.length;

                // Copy formats so insertion behaves like typing (continuity).
                // When replacing a selection, inherit from the replaced range's
                // first character (the glyph being swapped) — the preceding
                // character may sit outside the styled span.
                const inherited = (end > start && value.formats[start])
                    ? value.formats[start]
                    : ((start > 0 && value.formats[start - 1]) ? value.formats[start - 1] : []);
                inherited.forEach(function(format) {
                    newValue = applyFormat(newValue, format, start, insertEnd);
                });

                // Wrap inserted text in a typost-styled span when attributes provided.
                // applyFormat replaces the inherited typost format on the inserted
                // range, so merge the replaced format's sizing/spacing into the new
                // attributes first — a swapped glyph must keep its span's styling.
                if (e.detail.attributes && typeof e.detail.attributes === 'object') {
                    const inheritedTypost = inherited.find(function(f) { return f && f.type === FORMAT_TYPE; });
                    const mergeAttrs = (window.typostSharedUtils && window.typostSharedUtils.mergeInsertionFormatAttributes)
                        ? window.typostSharedUtils.mergeInsertionFormatAttributes
                        : function(incoming) { return incoming; };
                    newValue = applyFormat(newValue, {
                        type: FORMAT_TYPE,
                        attributes: mergeAttrs(e.detail.attributes, inheritedTypost ? inheritedTypost.attributes : null)
                    }, start, insertEnd);
                }

                // swap (alternates-view) insertions keep the inserted text
                // selected so the next alternate/base click replaces the same
                // glyph; sequence insertions collapse the caret after the text
                if (e.detail.swap) {
                    newValue.start = start;
                    newValue.end = insertEnd;
                    onChange(newValue);
                    self.setState({ savedSelectionStart: start, savedSelectionEnd: insertEnd });
                } else {
                    newValue.start = insertEnd;
                    newValue.end = insertEnd;
                    onChange(newValue);
                    self.setState({ savedSelectionStart: insertEnd, savedSelectionEnd: insertEnd });
                }
            };
            document.addEventListener('typost-insert-content', this._handleInsertContent);

            // Extension hook: when the Glyphs panel (a separate Modal that forced
            // this inline Modal closed) is dismissed, reopen the inline editor so
            // the author returns to where they launched from. The saved selection
            // range travels back with the event because togglePopover cleared it
            // when WordPress force-closed this Modal.
            //
            // info.reopenHost === false means the panel was launched straight
            // from the block toolbar with no host modal open — reopening one
            // the author never asked for would be a surprise. An absent flag
            // (as older extensions send) keeps the reopen behaviour.
            this._handleGlyphsClosed = function(src, info) {
                if (src !== 'inline') {
                    return;
                }
                if (info && info.reopenHost === false) {
                    return;
                }
                var reopenState = { isOpen: true };
                if (info && info.range) {
                    reopenState.savedSelectionStart = info.range.start;
                    reopenState.savedSelectionEnd = info.range.end;
                }
                self.setState(reopenState, function() {
                    window.typostHooks.doAction('typost_inline_modal_opened', self.state);
                });
            };
            window.typostHooks.addAction('typost_glyphs_panel_closed', this._handleGlyphsClosed, 10);

            // Extension hook: let an extension trigger the conversion its own
            // UI is offering — the word-boundary notice is only useful if the
            // fix it recommends is reachable from where the notice is shown.
            // Every mounted instance handles it, which is harmless: convert
            // reads the selected block from the store, and replaceBlocks on an
            // already-replaced client ID is a no-op.
            this._handleConvertRequest = function() {
                if (self._isMounted) {
                    self.convertToBlock();
                }
            };
            document.addEventListener('typost-convert-to-block', this._handleConvertRequest);

            // Extension hook: extra toolbar buttons may register after this
            // component first renders (async or conditionally loaded
            // extensions), so re-render when the registry changes.
            this._handleToolbarButtonsChanged = function() {
                if (self._isMounted) {
                    self.forceUpdate();
                }
            };
            window.typostHooks.addAction('typost_editor_toolbar_buttons_changed', this._handleToolbarButtonsChanged, 10);
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

            // Allow cursor position (start === end) as well as selections
            // This lets us detect features at the cursor position

            // Parse the HTML to find styled spans
            const parser = new DOMParser();
            const doc = parser.parseFromString(`<div>${content}</div>`, 'text/html');
            const container = doc.body.firstChild;

            // Find all styled spans
            const styledSpans = container.querySelectorAll('span.typost-styled');

            // Find the smallest (most specific/innermost) span that matches
            let smallestMatchingSpan = null;
            let smallestSpanSize = Infinity;

            // Build offset map once (accounts for <br> line breaks)
            const textNodeMap = buildTextOffsetMap(container, doc);

            // Calculate character offset for each span
            for (const span of styledSpans) {
                // Find this span's position in the text using pre-built map
                let spanStart = 0;
                let spanEnd = 0;
                let found = false;

                for (const entry of textNodeMap) {
                    if (span.contains(entry.node)) {
                        if (!found) {
                            spanStart = entry.start;
                            found = true;
                        }
                        spanEnd = entry.end;
                    }
                }

                // Check if the selection overlaps with this span
                // For cursor position (start === end), check if cursor is inside the span
                // For selection (start !== end), check if selection overlaps with span
                const isCursor = value.start === value.end;
                const isInside = isCursor && found && value.start >= spanStart && value.start <= spanEnd;
                const overlaps = !isCursor && found && value.start < spanEnd && value.end > spanStart;

                if (found && (isInside || overlaps)) {
                    const spanSize = spanEnd - spanStart;

                    // Keep track of the smallest matching span
                    if (spanSize < smallestSpanSize) {
                        smallestMatchingSpan = span;
                        smallestSpanSize = spanSize;
                    }
                }
            }

            return smallestMatchingSpan;
        }

        /**
         * Get inline features from styled spans at current selection in Typographic Stylist blocks
         * Optimized version - only called when popover opens, not on every render
         * @return {Array} Array of feature codes from the styled span at selection
         * @private
         */
        getInlineFeaturesForTypostBlock() {
            const styledSpan = this.getStyledSpanAtSelection();

            if (styledSpan) {
                // Extract features from data attribute (preferred - faster and more reliable)
                const dataFeatures = styledSpan.getAttribute('data-features');
                if (dataFeatures) {
                    return dataFeatures.split(',');
                }

                // Fallback: parse from style attribute
                // For backward compatibility with content created before data-features attribute was added
                // All new content (created after this change) will have data-features set
                const style = styledSpan.getAttribute('style') || '';
                const featureMatch = style.match(/font-feature-settings:\s*([^;]+)/);

                if (featureMatch) {
                    // Parse feature codes from CSS
                    const featuresParsed = featureMatch[1]
                        .split(',')
                        .map(f => {
                            const match = f.trim().match(/["']([^"']+)["']|&quot;([^&]+)&quot;/);
                            return match;
                        })
                        .filter(m => m)
                        .map(m => m[1] || m[2]);

                    return featuresParsed;
                }
            }

            return [];
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
         * Precedence: a weight stored on the selection, then one the author
         * picked in this popover, then the weight actually rendering.
         *
         * @since 2.3.0
         * @return {string} Weight to use
         */
        getEffectiveFontWeight() {
            const explicitWeight = this.getExplicitFontWeight();
            if (explicitWeight) {
                return explicitWeight;
            }
            if (this._pendingChanges.keys.has('fontWeight')) {
                return this.state.fontWeight;
            }
            return this.getBlockInheritedWeight() || this.state.fontWeight;
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
         * Detects the current font applied by theme or block settings
         * @return {string} Font family string from computed styles, or empty string if not found
         */
        getBlockInheritedFont() {
            const { select } = wp.data;
            const selectedBlockClientId = select('core/block-editor').getSelectedBlockClientId();

            if (!selectedBlockClientId) {
                return '';
            }

            // Get the selected block to determine its type
            const selectedBlock = select('core/block-editor').getBlock(selectedBlockClientId);
            if (!selectedBlock) {
                return '';
            }

            // WordPress editor uses an iframe for the canvas
            const editorIframe = document.querySelector('iframe[name="editor-canvas"]');
            const targetDocument = editorIframe?.contentDocument || document;
            const targetWindow = editorIframe?.contentWindow || window;

            // Use the standalone utility function
            return getBlockInheritedFont(
                selectedBlockClientId,
                selectedBlock.name,
                targetDocument,
                targetWindow
            );
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
         * Get the block's rendered font-weight from computed styles.
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
            const { select } = wp.data;
            const selectedBlockClientId = select('core/block-editor').getSelectedBlockClientId();
            const selectedBlock = selectedBlockClientId ? select('core/block-editor').getBlock(selectedBlockClientId) : null;
            if (!selectedBlock) {
                return '';
            }

            // Block content lives in the editor canvas iframe (WP 6.3+)
            const editorIframe = document.querySelector('iframe[name="editor-canvas"]');
            const targetDocument = editorIframe?.contentDocument || document;
            const targetWindow = editorIframe?.contentWindow || window;

            return getBlockInheritedWeight(
                selectedBlockClientId,
                selectedBlock.name,
                targetDocument,
                targetWindow
            );
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

            this.setState({
                savedSelectionStart: savedSelectionStart,
                savedSelectionEnd: savedSelectionEnd
            });

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

            this.setState(state => ({
                isOpen: !state.isOpen,
                selectedFeatures: this.getActiveFeatures() || [],
                selectedFont: this.resolveActiveFont(),
                selectedFontId: this.getActiveFontId() || 0,
                fontSize: this.getActiveFontSize() || 'inherit',
                fontSizeMin: this.getActiveFontSizeMin() || 16,
                fontSizePreferred: this.getActiveFontSizePreferred() || 24,
                fontSizeMax: this.getActiveFontSizeMax() || 32,
                fontWeight: this.getActiveFontWeight() || '400',
                fontStyle: this.getActiveFontStyle() || '',
                letterSpacing: this.getActiveLetterSpacing() || 0,
                lineHeight: this.getActiveLineHeight() || 0,
                fontVariationSettings: this.getActiveFontVariationSettings() || '',
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
                } else if (wasOpen && !this.state.isOpen) {
                    window.typostHooks.doAction('typost_inline_modal_closed');
                }
            });
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
                            newState.fontWeight = this.getClosestWeight(currentWeight, available);
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
        getConvertBlockedMessage(reason, parentTitle) {
            const convertBlockedReason = reason !== undefined ? reason : this.state.convertBlockedReason;
            const convertParentTitle = parentTitle !== undefined ? parentTitle : this.state.convertParentTitle;

            if (!shouldExplainConvertBlock(convertBlockedReason)) {
                return '';
            }

            if (convertBlockedReason === CONVERT_BLOCKED.LOCKED) {
                return __('This block can’t be converted to a Typography Stylist block because it is locked, or part of a locked template or pattern.', 'typography-stylist');
            }

            if (convertParentTitle) {
                /* translators: %s: Title of the parent block, e.g. "Group". */
                return sprintf(
                    __('This block can’t be converted here — the parent %s block only allows certain blocks inside it. Move the block out of it to convert.', 'typography-stylist'),
                    convertParentTitle
                );
            }

            return __('This block can’t be converted here — its parent block only allows certain blocks inside it. Move the block out of it to convert.', 'typography-stylist');
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
                    : this.getConvertBlockedMessage(capability.reason, capability.parentTitle);
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
                    message: __('Your selection breaks a word boundary. Screen readers generally handle inline spans well, but for the best accessibility, consider converting to a Typography Stylist block which provides dedicated screen reader text.', 'typography-stylist')
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
            let tagName = 'h2';
            if (isAlreadyTypostBlock) {
                tagName = currentBlock.attributes.tagName || 'h2';
            } else if (currentBlock.name === 'core/heading' && currentBlock.attributes.level) {
                tagName = `h${currentBlock.attributes.level}`;
            } else if (currentBlock.name === 'core/paragraph') {
                tagName = 'p';
            }

            // A core heading is bold because the theme styles h2, not because
            // anything stored says 700 — and the block's fontWeight defaults to
            // '400', which save.js always emits, so a straight conversion
            // visibly lightens the heading.
            const convertFontWeight = this.getEffectiveFontWeight();

            let contentForBlock;

            // Use saved selection bounds if current selection was lost due to modal focus
            const { savedSelectionStart, savedSelectionEnd } = this.state;
            const effectiveStart = (value.start === value.end && savedSelectionStart !== null) ? savedSelectionStart : value.start;
            const effectiveEnd = (value.start === value.end && savedSelectionEnd !== null) ? savedSelectionEnd : value.end;

            // Check if there's a selection (partial text selected)
            if (effectiveStart !== effectiveEnd) {
                // User selected a portion of text - apply styling only to that portion
                // Use the current block's HTML content to preserve existing spans.
                // String() matters: content can be a RichTextData object (WP 6.5+)
                const existingContent = String(currentBlock.attributes.content || '');
                const fullText = getTextContent(value);

                // Build style string for the selected portion
                const { selectedFeatures, selectedFont, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, fontWeight, letterSpacing, lineHeight } = this.state;
                const styleArray = [];

                if (selectedFeatures.length > 0) {
                    // Sanitize each feature ID to prevent injection
                    const sanitizedFeatures = selectedFeatures.map(f => sanitizeCSSValue(f));
                    styleArray.push(`font-feature-settings: ${sanitizedFeatures.map(f => `"${f}" 1`).join(', ')}`);
                }
                if (this.state.selectedFontId) {
                    // Modern format: CSS variable keyed by numeric font ID (drives
                    // frontend @font-face detection like every other span)
                    styleArray.push(`font-family: var(--font-${parseInt(this.state.selectedFontId, 10)})`);
                } else if (selectedFont) {
                    const sanitizedFont = sanitizeFontFamily(selectedFont);
                    styleArray.push(`font-family: ${sanitizedFont}`);
                }
                if (fontWeight && fontWeight !== '400') {
                    const sanitizedWeight = sanitizeCSSValue(fontWeight);
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
                if (fontSize === 'responsive') {
                    // Ensure all numeric values are actually numbers
                    const minPx = parseFloat(fontSizeMin) || 16;
                    const prefRem = parseFloat(fontSizePreferred) || 24;
                    const maxPx = parseFloat(fontSizeMax) || 32;
                    styleArray.push(`font-size: clamp(${minPx}px, ${prefRem / 16}rem + ${((maxPx - minPx) / (RESPONSIVE_FONT_MAX_VIEWPORT - RESPONSIVE_FONT_MIN_VIEWPORT)) * 100}vw, ${maxPx}px)`);
                }

                const styleString = styleArray.join('; ');

                // If we have existing HTML content with spans, we need to preserve it
                if (hasHTMLTags(existingContent)) {
                    // Build the new span's attributes in the modern format
                    const spanAttributes = {};
                    if (selectedFeatures.length > 0) {
                        spanAttributes['data-features'] = selectedFeatures.map(f => sanitizeCSSValue(f)).join(',');
                    }
                    if (this.state.selectedFontId) {
                        spanAttributes['data-font-id'] = String(this.state.selectedFontId);
                    }
                    if (fontWeight && fontWeight !== '400') {
                        spanAttributes['data-fontweight'] = String(fontWeight);
                    }

                    // Apply over the existing HTML with the shared span-preserving
                    // applier: selections crossing span boundaries are extracted and
                    // re-wrapped with every surrounding span intact (the old
                    // surroundContents call threw on ANY cross-span selection and
                    // fell back to a plain-text rebuild that destroyed all existing
                    // styling — exactly the selections the convert button exists for)
                    const applied = (window.typostSharedUtils && window.typostSharedUtils.applyStylingSafeStringMethod)
                        ? window.typostSharedUtils.applyStylingSafeStringMethod(existingContent, effectiveStart, effectiveEnd, spanAttributes, styleString)
                        : { success: false };

                    // On failure, convert with the content untouched rather than
                    // ever rebuilding from plain text — no styling is worth losing
                    contentForBlock = applied.success ? applied.content : existingContent;
                } else {
                    // No existing HTML, use simple text replacement
                    const beforeText = fullText.substring(0, effectiveStart);
                    const selectedText = fullText.substring(effectiveStart, effectiveEnd);
                    const afterText = fullText.substring(effectiveEnd);
                    contentForBlock = escapeHTML(beforeText) +
                        `<span class="typost-styled" data-features="${selectedFeatures.join(',')}" style="${styleString}">${escapeHTML(selectedText)}</span>` +
                        escapeHTML(afterText);
                }

                // If already an Typography Stylist block, just update its attributes
                if (isAlreadyTypostBlock) {
                    dispatch('core/block-editor').updateBlockAttributes(selectedBlockClientId, {
                        content: contentForBlock,
                        // Preserve existing block-level features, don't apply inline features globally
                        features: currentBlock.attributes.features || [],
                        fontFamily: this.state.selectedFont,
                        fontSize: this.state.fontSize,
                        fontSizeMin: this.state.fontSizeMin,
                        fontSizePreferred: this.state.fontSizePreferred,
                        fontSizeMax: this.state.fontSizeMax,
                        fontWeight: this.state.fontWeight,
                        letterSpacing: this.state.letterSpacing,
                        lineHeight: this.state.lineHeight
                    });
                } else {
                    // Create new Typography Stylist block preserving user's settings from inline editor
                    // Don't apply inline features globally - they're only for the selection
                    const typostBlock = createBlock('typost/block', {
                        content: contentForBlock,
                        tagName: tagName,
                        features: [],
                        fontFamily: this.state.selectedFont,
                        fontSize: this.state.fontSize,
                        fontSizeMin: this.state.fontSizeMin,
                        fontSizePreferred: this.state.fontSizePreferred,
                        fontSizeMax: this.state.fontSizeMax,
                        fontWeight: convertFontWeight,
                        letterSpacing: this.state.letterSpacing,
                        lineHeight: this.state.lineHeight
                    });

                    // Replace current block
                    dispatch('core/block-editor').replaceBlocks(selectedBlockClientId, typostBlock);

                    // Safety fallback: verify replacement succeeded
                    // replaceBlocks removes the old block and creates a new one with a different clientId.
                    // If the old block is gone, the replacement succeeded (even if the user deselected
                    // within the timeout window). Only fall back when the old block still exists,
                    // meaning replaceBlocks was silently blocked (e.g., by pattern locking).
                    setTimeout(() => {
                        const blockEditorSelect = select('core/block-editor');
                        const oldBlock = blockEditorSelect.getBlock(selectedBlockClientId);

                        if (!oldBlock) {
                            return;
                        }

                        const selectedAfter = blockEditorSelect.getSelectedBlock();
                        if (!selectedAfter || selectedAfter.name !== 'typost/block') {
                            this._doApplyFeatures();
                            dispatch('core/notices').createInfoNotice(
                                __('Block could not be converted. Features were applied directly.', 'typography-stylist'),
                                { type: 'snackbar', isDismissible: true }
                            );
                        }
                    }, 100);
                }
            } else {
                // No selection - apply to entire block (original behavior).
                // String() matters: content can be a RichTextData object (WP 6.5+)
                const textContent = String(currentBlock.attributes.content || '') || getTextContent(value);

                // If already an Typography Stylist block, just update its attributes
                if (isAlreadyTypostBlock) {
                    dispatch('core/block-editor').updateBlockAttributes(selectedBlockClientId, {
                        content: textContent,
                        features: this.state.selectedFeatures,
                        fontFamily: this.state.selectedFont,
                        fontSize: this.state.fontSize,
                        fontSizeMin: this.state.fontSizeMin,
                        fontSizePreferred: this.state.fontSizePreferred,
                        fontSizeMax: this.state.fontSizeMax,
                        fontWeight: this.state.fontWeight,
                        letterSpacing: this.state.letterSpacing,
                        lineHeight: this.state.lineHeight
                    });
                } else {
                    const typostBlock = createBlock('typost/block', {
                        content: textContent,
                        tagName: tagName,
                        features: this.state.selectedFeatures,
                        fontFamily: this.state.selectedFont,
                        fontSize: this.state.fontSize,
                        fontSizeMin: this.state.fontSizeMin,
                        fontSizePreferred: this.state.fontSizePreferred,
                        fontSizeMax: this.state.fontSizeMax,
                        fontWeight: convertFontWeight,
                        letterSpacing: this.state.letterSpacing,
                        lineHeight: this.state.lineHeight
                    });

                    // Replace current block
                    dispatch('core/block-editor').replaceBlocks(selectedBlockClientId, typostBlock);

                    // Safety fallback: verify replacement succeeded (see partial-selection branch for explanation)
                    setTimeout(() => {
                        const blockEditorSelect = select('core/block-editor');
                        const oldBlock = blockEditorSelect.getBlock(selectedBlockClientId);

                        if (!oldBlock) {
                            return;
                        }

                        const selectedAfter = blockEditorSelect.getSelectedBlock();
                        if (!selectedAfter || selectedAfter.name !== 'typost/block') {
                            this._doApplyFeatures();
                            dispatch('core/notices').createInfoNotice(
                                __('Block could not be converted. Features were applied directly.', 'typography-stylist'),
                                { type: 'snackbar', isDismissible: true }
                            );
                        }
                    }, 100);
                }
            }

            // Close popover
            this.setState({ isOpen: false });
        }

        /**
         * Translate the pending property changes into a per-run patch for
         * patchTypostFormatAttributes(): data attributes + style declarations
         * to set (or null to remove), plus feature add/remove toggles.
         */
        _buildPatchFromPending(pending) {
            const { selectedFont, selectedFontId, fontWeight, fontStyle, letterSpacing, lineHeight, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, fontVariationSettings } = this.state;
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
                dataAttrs['data-fontweight'] = fontWeight;
                styleDecls['font-weight'] = fontWeight;
            }
            if (pending.keys.has('fontStyle')) {
                dataAttrs['data-fontstyle'] = fontStyle || null;
                styleDecls['font-style'] = fontStyle || null;
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
                if (fontSize !== 'inherit') {
                    // 'fit' (from a fit-mode paragraph style) has no inline
                    // meaning — spans serialize its fallback clamp as responsive
                    dataAttrs['data-fontsize'] = fontSize === 'fit' ? 'responsive' : fontSize;
                    dataAttrs['data-fontsize-min'] = String(fontSizeMin);
                    dataAttrs['data-fontsize-preferred'] = String(fontSizePreferred);
                    dataAttrs['data-fontsize-max'] = String(fontSizeMax);
                    styleDecls['font-size'] = `clamp(${fontSizeMin}px, ${fontSizePreferred / 16}rem + ${((fontSizeMax - fontSizeMin) / (RESPONSIVE_FONT_MAX_VIEWPORT - RESPONSIVE_FONT_MIN_VIEWPORT)) * 100}vw, ${fontSizeMax}px)`;
                } else {
                    dataAttrs['data-fontsize'] = null;
                    dataAttrs['data-fontsize-min'] = null;
                    dataAttrs['data-fontsize-preferred'] = null;
                    dataAttrs['data-fontsize-max'] = null;
                    styleDecls['font-size'] = null;
                }
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
         * Core feature application logic (live preview auto-apply)
         */
        _doApplyFeatures() {
            const { value, onChange } = this.props;
            const { selectedFeatures, selectedFont, selectedFontId, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, fontWeight, fontStyle, letterSpacing, lineHeight, savedSelectionStart, savedSelectionEnd, paragraphStyleId, animationId, fontVariationSettings } = this.state;

            // Check if selection was lost due to modal focus and we have saved bounds
            const selectionLost = value.start === value.end && savedSelectionStart !== null && savedSelectionEnd !== null && savedSelectionStart !== savedSelectionEnd;

            // Preserve raw feature settings (indexed alternates like "salt" 2,
            // set by extensions via data-feature-settings) across re-applies —
            // the comma-tag data-features format cannot express them.
            // When the live selection collapsed due to modal focus, the format
            // must be read at the saved bounds — getActiveFormat() looks at the
            // collapsed caret, which may sit outside the styled span.
            let activeFormatForRaw;
            if (selectionLost) {
                const formatsAtSaved = (value.formats && value.formats[savedSelectionStart]) || [];
                activeFormatForRaw = formatsAtSaved.find((format) => format.type === FORMAT_TYPE);
            } else {
                activeFormatForRaw = getActiveFormat(value, FORMAT_TYPE);
            }
            const rawFeatureSettings = (activeFormatForRaw && activeFormatForRaw.attributes && activeFormatForRaw.attributes['data-feature-settings']) || '';

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

                const patch = this._buildPatchFromPending(pending);
                this._resetPendingChanges();

                const runs = shared.computeTypostFormatRuns(value.formats, effectiveStart, effectiveEnd, FORMAT_TYPE);
                let newValue = value;
                runs.forEach((run) => {
                    const patchedAttrs = shared.patchTypostFormatAttributes(run.attributes, patch);
                    if (patchedAttrs) {
                        newValue = applyFormat(newValue, {
                            type: FORMAT_TYPE,
                            attributes: patchedAttrs
                        }, run.start, run.end);
                    } else if (run.attributes) {
                        newValue = removeFormat(newValue, FORMAT_TYPE, run.start, run.end);
                    }
                });
                onChange(newValue);
                return;
            }
            if (pending) {
                this._resetPendingChanges();
            }

            if (selectedFeatures.length === 0 && !selectedFont && fontSize === 'inherit' && fontWeight === '400' && !fontStyle && letterSpacing === 0 && lineHeight === 0 && !paragraphStyleId && !animationId && !fontVariationSettings && !rawFeatureSettings) {
                // Remove format if no features, font, font size, weight, letter spacing, or line height selected
                if (selectionLost) {
                    onChange(removeFormat(value, FORMAT_TYPE, savedSelectionStart, savedSelectionEnd));
                } else {
                    onChange(removeFormat(value, FORMAT_TYPE));
                }
            } else {
                // Build attributes
                const attributes = {};
                let styleString = '';

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
                        cssValue = rawFeatureSettings + (extraTags.length > 0 ? ', ' + this.featuresToCSS(extraTags) : '');
                    } else {
                        cssValue = this.featuresToCSS(selectedFeatures);
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
                        if (styleString) styleString += '; ';
                        styleString += `font-family: var(--font-${selectedFontId})`;
                    }
                } else if (selectedFont) {
                    attributes['data-font'] = selectedFont;
                    if (!hasActiveStyle) {
                        if (styleString) styleString += '; ';
                        styleString += `font-family: ${selectedFont}`;
                    }
                }

                // Add font weight (always apply, default to normal)
                attributes['data-fontweight'] = fontWeight;
                if (!hasActiveStyle) {
                    if (styleString) styleString += '; ';
                    styleString += `font-weight: ${fontWeight}`;
                }

                // Add font style (visual italic — semantic emphasis stays <em>)
                if (fontStyle) {
                    attributes['data-fontstyle'] = fontStyle;
                    if (!hasActiveStyle) {
                        if (styleString) styleString += '; ';
                        styleString += `font-style: ${fontStyle}`;
                    }
                }

                // Add letter spacing
                if (letterSpacing !== 0) {
                    attributes['data-letterspacing'] = letterSpacing.toString();
                    if (!hasActiveStyle) {
                        if (styleString) styleString += '; ';
                        styleString += `letter-spacing: ${letterSpacing / 1000}em`;
                    }
                }

                // Add line height
                if (lineHeight !== 0) {
                    attributes['data-lineheight'] = lineHeight.toString();
                    if (!hasActiveStyle) {
                        if (styleString) styleString += '; ';
                        styleString += `line-height: ${lineHeight}`;
                    }
                }

                // Add font size. 'fit' (from a fit-mode paragraph style) has no
                // inline meaning — spans serialize its fallback clamp as responsive
                if (fontSize !== 'inherit') {
                    attributes['data-fontsize'] = fontSize === 'fit' ? 'responsive' : fontSize;
                    attributes['data-fontsize-min'] = fontSizeMin.toString();
                    attributes['data-fontsize-preferred'] = fontSizePreferred.toString();
                    attributes['data-fontsize-max'] = fontSizeMax.toString();

                    if (!hasActiveStyle) {
                        if (styleString) styleString += '; ';
                        styleString += `font-size: clamp(${fontSizeMin}px, ${fontSizePreferred / 16}rem + ${((fontSizeMax - fontSizeMin) / (RESPONSIVE_FONT_MAX_VIEWPORT - RESPONSIVE_FONT_MIN_VIEWPORT)) * 100}vw, ${fontSizeMax}px)`;
                    }
                }

                // Add font variation settings (variable font axes)
                if (fontVariationSettings) {
                    const safeFontVariationSettings = sanitizeFontVariationSettings(fontVariationSettings);
                    if (safeFontVariationSettings) {
                        attributes['data-font-variation-settings'] = safeFontVariationSettings;
                        if (!hasActiveStyle) {
                            if (styleString) styleString += '; ';
                            styleString += `font-variation-settings: ${safeFontVariationSettings}`;
                        }
                    }
                }

                // Only set inline style when no paragraph style is active
                if (!hasActiveStyle) {
                    attributes['style'] = styleString;
                }

                // Add aria-label if enabled for accessibility
                if (isFlagEnabled(typostData.enableAriaLabels) && value) {
                    const effectiveStart = selectionLost ? savedSelectionStart : value.start;
                    const effectiveEnd = selectionLost ? savedSelectionEnd : value.end;
                    const selectedText = effectiveStart !== effectiveEnd
                        ? getTextContent(slice(value, effectiveStart, effectiveEnd))
                        : getTextContent(value);
                    if (selectedText) {
                        attributes['aria-label'] = selectedText;
                    }
                }

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
            this.setState({
                selectedFeatures: preset.features,
                selectedFont: preset.fontFamily || '',
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
            const selectionLost = value.start === value.end && savedSelectionStart !== null && savedSelectionEnd !== null && savedSelectionStart !== savedSelectionEnd;

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
                letterSpacing: 0,
                lineHeight: 0,
                activePreset: null
                // Note: Keep popover open (isOpen: true) so user can see cleared state
            });
        }

        /**
         * Convert features array to CSS string
         */
        featuresToCSS(features) {
            return features.map(f => `"${f}" 1`).join(', ');
        }

        /**
         * Group features by category
         */
        groupFeatures() {
            const allFeatures = typostData.features || [];
            const visibilityMap = typostData.fontFeatureVisibility || {};
            const fontId = this.state.selectedFontId || 0;

            // Filter by per-font visibility if the utility is available
            const features = (window.typostSharedUtils && window.typostSharedUtils.filterFeaturesByVisibility)
                ? window.typostSharedUtils.filterFeaturesByVisibility(allFeatures, fontId, visibilityMap)
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
         * Get filtered weight options based on the selected font's available weights.
         * Returns all weights if no font is selected or font has no restrictions.
         */
        getFilteredWeightOptions(fontId) {
            const ALL_WEIGHTS = [
                { label: __('100 - Thin', 'typography-stylist'), value: '100' },
                { label: __('200 - Extra Light', 'typography-stylist'), value: '200' },
                { label: __('300 - Light', 'typography-stylist'), value: '300' },
                { label: __('400 - Normal', 'typography-stylist'), value: '400' },
                { label: __('500 - Medium', 'typography-stylist'), value: '500' },
                { label: __('600 - Semi Bold', 'typography-stylist'), value: '600' },
                { label: __('700 - Bold', 'typography-stylist'), value: '700' },
                { label: __('800 - Extra Bold', 'typography-stylist'), value: '800' },
                { label: __('900 - Black', 'typography-stylist'), value: '900' }
            ];

            if (!fontId || !this.fontIdMap || !this.fontIdMap[fontId]) {
                return ALL_WEIGHTS;
            }

            const available = this.fontIdMap[fontId].availableWeights;
            if (!available || available.length === 0) {
                return ALL_WEIGHTS;
            }

            return ALL_WEIGHTS.filter(w => available.includes(w.value));
        }

        /**
         * Get the closest available weight to the given weight.
         * Used when switching fonts and the current weight isn't available.
         */
        getClosestWeight(currentWeight, availableWeights) {
            if (!availableWeights || availableWeights.length === 0) return currentWeight;
            if (availableWeights.includes(currentWeight)) return currentWeight;

            const current = parseInt(currentWeight, 10);
            let closest = availableWeights[0];
            let minDiff = Math.abs(current - parseInt(closest, 10));

            for (const w of availableWeights) {
                const diff = Math.abs(current - parseInt(w, 10));
                if (diff < minDiff) {
                    minDiff = diff;
                    closest = w;
                }
            }
            return closest;
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
         * Render feature toggle
         */
        renderFeatureToggle(feature) {
            const { selectedFeatures, selectedFont, selectedText, blockInheritedFont } = this.state;
            const isActive = selectedFeatures.includes(feature.id);

            // Use selected text or default sample text for feature preview
            const previewText = selectedText || 'ffi ffl Th AE';

            // Build preview styles - with this feature AND all currently selected features
            const allPreviewFeatures = [...new Set([feature.id, ...selectedFeatures])];
            const previewStyle = {
                fontFeatureSettings: allPreviewFeatures.map(f => `"${f}" 1`).join(', ')
            };
            // Use selected font, or fallback to block's inherited font when Default is selected
            const fontToUse = selectedFont || blockInheritedFont;
            if (fontToUse) {
                previewStyle.fontFamily = fontToUse;
            }

            // Render the italic face when the selection is italic — the live
            // popover Font Style choice first, then the span's data-fontstyle,
            // then the editor's own Italic <em> format. Italic faces carry
            // their own glyphs and feature sets.
            const renderedStyle = this.getRenderedFontStyle();
            if (renderedStyle) {
                previewStyle.fontStyle = renderedStyle;
            }

            return (
                <div key={feature.id} className="typost-feature-toggle">
                    <ToggleControl
                        label={feature.name}
                        help={feature.description}
                        checked={isActive}
                        onChange={() => this.toggleFeature(feature.id)}
                    />
                    <code className="typost-feature-code">{feature.id}</code>
                    <div className="typost-feature-preview">
                        <Button
                            className="typost-feature-preview-on typost-feature-apply-btn"
                            onClick={() => this.applyFeatureFromPreview(feature.id)}
                            style={previewStyle}
                            aria-label={sprintf(__('Click to apply %s feature', 'typography-stylist'), feature.name)}
                            title={sprintf(__('Click to apply %s', 'typography-stylist'), feature.name)}
                        >
                            {previewText}
                        </Button>
                    </div>
                </div>
            );
        }

        /**
         * Render preset button
         */
        renderPresetButton(preset) {
            const { activePreset } = this.state;
            const isActive = activePreset === preset.id;

            return (
                <Button
                    key={preset.id}
                    isSecondary={!isActive}
                    isPrimary={isActive}
                    onClick={() => this.applyPreset(preset)}
                    className="typost-preset-button"
                >
                    <div className="typost-preset-name">{preset.name}</div>
                    <div className="typost-preset-features-list">{preset.features.join(', ')}</div>
                </Button>
            );
        }

        /**
         * Modal drag handlers
         */
        handleDragStart(e) {
            // Don't drag if clicking the close button
            if (e.target.closest('.typost-modal-close-button')) {
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
         * Cleanup event listeners and debounced functions when component unmounts
         */
        componentDidMount() {
            // Distinguishes the live instance from StrictMode shadow instances
            // (whose constructors run but which are never mounted) — see
            // _handleInsertContent guard
            this._isMounted = true;
        }

        componentWillUnmount() {
            this._isMounted = false;

            // Cleanup modal drag/resize event listeners
            document.removeEventListener('mousemove', this.handleDragMove);
            document.removeEventListener('mouseup', this.handleDragEnd);
            document.removeEventListener('mousemove', this.handleResizeMove);
            document.removeEventListener('mouseup', this.handleResizeEnd);

            // Cleanup debounced apply functions (v2.0.0 - live preview)
            this.debouncedApplySlider.cancel();
            this.debouncedApplyDropdown.cancel();
            this.debouncedApplyFontSize.cancel();

            // Cleanup extension hook listeners
            if (this._handleApplyBlockProperties) {
                document.removeEventListener('typost-apply-block-properties', this._handleApplyBlockProperties);
            }
            if (this._handleInsertContent) {
                document.removeEventListener('typost-insert-content', this._handleInsertContent);
            }

            // Cleanup state provider filter
            if (this._stateProviderFilter) {
                window.typostHooks.removeFilter('typost_current_editor_state', this._stateProviderFilter);
            }

            // Cleanup glyphs-panel reopen handler
            if (this._handleGlyphsClosed) {
                window.typostHooks.removeAction('typost_glyphs_panel_closed', this._handleGlyphsClosed);
            }

            // Cleanup extension toolbar button re-render handler
            if (this._handleToolbarButtonsChanged) {
                window.typostHooks.removeAction('typost_editor_toolbar_buttons_changed', this._handleToolbarButtonsChanged);
            }

            // Cleanup extension convert bridge
            if (this._handleConvertRequest) {
                document.removeEventListener('typost-convert-to-block', this._handleConvertRequest);
            }
        }

        render() {
            const { isActive, isInTypostBlock = false } = this.props;
            const { isOpen, selectedFont, selectedFontId, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, fontWeight, letterSpacing, lineHeight, wordBoundaryWarning, canConvert, showClearConfirmation, dontShowClearWarning, fontDetectionFailed } = this.state;
            const groupedFeatures = this.groupFeatures();
            const presets = typostData.presets || [];
            const fontOptions = this.getFontOptions();
            const hasFonts = fontOptions.length > 0;
            // '' when the omission needs no explanation (already a Typography
            // Stylist block, or a block type with no conversion mapping).
            const convertBlockedMessage = canConvert ? '' : this.getConvertBlockedMessage();
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
                        <BlockControls>
                            <ToolbarGroup>
                                <ToolbarButton
                                    icon={TSIcon}
                                    // Same string as the block's Quick Feature
                                    // Toggle button in edit.js: one control,
                                    // one name. "Typography Stylist" alone did
                                    // not say what the button does.
                                    label={__('Typography Stylist Features', 'typography-stylist')}
                                    onClick={this.togglePopover}
                                    isActive={isActive}
                                    className="typost-toolbar-button"
                                />
                                {extensionButtons.map((button) => (
                                    <ToolbarButton
                                        key={button.id}
                                        icon={button.icon}
                                        title={button.label}
                                        isActive={!!button.isActive}
                                        onClick={() => this.handleExtensionToolbarClick(button)}
                                        className={`typost-toolbar-button typost-ext-toolbar-button typost-ext-toolbar-button--${button.id}`}
                                    />
                                ))}
                            </ToolbarGroup>
                        </BlockControls>
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
                            {/* Custom draggable header */}
                            <div
                                className="typost-modal-header"
                                onMouseDown={this.handleDragStart}
                                onKeyDown={this.handleHeaderKeyDown}
                                role="toolbar"
                                aria-label={__('Drag to reposition modal', 'typography-stylist')}
                                tabIndex={0}
                                style={{ cursor: this.state.isDragging ? 'grabbing' : 'grab' }}
                            >
                                <h3 id={this.modalTitleId}>{__('Typography Stylist', 'typography-stylist')}</h3>
                                <Button
                                    icon="no-alt"
                                    label={__('Close', 'typography-stylist')}
                                    onClick={this.togglePopover}
                                    className="typost-modal-close-button"
                                />
                            </div>

                            {/* Modal content wrapper with scroll */}
                            <div className="typost-modal-content" style={{
                                height: `calc(${this.state.modalHeight}px - 60px)`,
                                overflowY: 'auto'
                            }}>
                                <div className="typost-popover-content">

                                {/* Usage tips notice - dismissible, dismissal remembered per browser */}
                                {!this.state.tipsDismissed && (
                                    <div className="typost-sticky-notice-wrapper">
                                        {wp.element.createElement(Notice, {
                                            status: 'info',
                                            isDismissible: true,
                                            onRemove: this.dismissTips,
                                            className: 'typost-drag-notice'
                                        },
                                            wp.element.createElement('p', { style: { margin: 0 } },
                                                '💡 ' + __('Tip: Drag the title bar to reposition this panel.', 'typography-stylist')
                                            ),
                                            wp.element.createElement('p', { style: { margin: '4px 0 0' } },
                                                __('Changes apply instantly, press Ctrl+Z (Cmd+Z on Mac) to undo.', 'typography-stylist')
                                            )
                                        )}
                                    </div>
                                )}

                                {/* Scrollable Content Wrapper */}
                                <div className="typost-scrollable-content">

                                {/* Accessibility Warning — Non-blocking Notice (v2.0.0).
                                    Sits at the top of the panel: it reports a problem with
                                    the selection the author just made and offers the fix, so
                                    burying it under every feature control meant scrolling
                                    past all of them to find out anything was wrong. */}
                                {wordBoundaryWarning && (
                                    <Notice status="warning" isDismissible={false} className="typost-word-boundary-notice">
                                        <strong>{__('Accessibility Notice', 'typography-stylist')}</strong>
                                        <p>{wordBoundaryWarning}</p>
                                        {canConvert && (
                                            <Button variant="secondary" onClick={this.convertToBlock} className="typost-convert-button">
                                                {__('Convert to Typography Stylist Block', 'typography-stylist')}
                                            </Button>
                                        )}
                                        {!canConvert && convertBlockedMessage && (
                                            <p className="typost-convert-blocked">{convertBlockedMessage}</p>
                                        )}
                                        <p className="typost-warning-settings-link">
                                            <a href={typostData.settingsUrl + '&tab=accessibility'} target="_blank" rel="noopener noreferrer">
                                                {__('Manage accessibility settings', 'typography-stylist')}
                                            </a>
                                        </p>
                                    </Notice>
                                )}

                                {/* Extension hook point: top of modal (e.g., Paragraph Styles dropdown) */}
                                <div className="typost-hook-point" data-hook="typost_inline_modal_top" ref={(el) => {
                                    if (el && !el._hooked) {
                                        el._hooked = true;
                                        window.typostHooks.doAction('typost_inline_modal_top', el, this.state);
                                    }
                                }} />

                                {/* Font Detection Warning */}
                                {fontDetectionFailed && !selectedFont && (
                                    wp.element.createElement(Notice, {
                                        status: 'warning',
                                        isDismissible: false,
                                        className: 'typost-font-detection-notice'
                                    },
                                        wp.element.createElement('p', { style: { margin: 0 } },
                                            __('Font could not be detected for this block type.', 'typography-stylist')
                                        ),
                                        wp.element.createElement('p', { style: { margin: '8px 0 0 0', fontSize: '12px' } },
                                            __('For the best experience with OpenType features, consider using the Typography Stylist block instead of the inline toolbar.', 'typography-stylist')
                                        )
                                    )
                                )}

                                {/* Font Selector */}
                                {hasFonts && (
                                    <div className="typost-modal-section typost-font-section">
                                        <h4>{__('Font Family', 'typography-stylist')}</h4>
                                        <FontPicker
                                            /* The h4 above is the visible heading; the
                                               control still needs its own accessible name. */
                                            label={__('Font Family', 'typography-stylist')}
                                            hideLabelFromVision
                                            placeholder={__('(Default)', 'typography-stylist')}
                                            value={selectedFontId ? String(selectedFontId) : ''}
                                            options={fontOptions}
                                            onChange={this.setFont}
                                        />
                                        {this.state.wpAdoptError && (
                                            wp.element.createElement(Notice, {
                                                status: 'error',
                                                isDismissible: true,
                                                onRemove: () => this.setState({ wpAdoptError: false })
                                            },
                                                __('This WordPress Font Library font could not be added. Please try again.', 'typography-stylist')
                                            )
                                        )}
                                    </div>
                                )}

                                {/* Font Weight Control - replaceable via typost_weight_control filter */}
                                {(() => {
                                    const weightControlType = window.typostHooks
                                        ? window.typostHooks.applyFilters('typost_weight_control', 'default', this.state.selectedFontId)
                                        : 'default';

                                    // 'hidden': suppress the weight control entirely (no wrapper, no hook)
                                    if (weightControlType === 'hidden') return null;

                                    if (weightControlType !== 'default') {
                                        return (
                                            <div className="typost-modal-section typost-fontweight-section">
                                                {/* key: remount (and re-fire the action) when the font changes */}
                                                <div key={`typost-weight-${this.state.selectedFontId || 'none'}`} className="typost-hook-point" data-hook="typost_weight_control" ref={(el) => {
                                                    if (el && !el._hooked) {
                                                        el._hooked = true;
                                                        window.typostHooks.doAction('typost_weight_control', el, this.state);
                                                    }
                                                }} />
                                            </div>
                                        );
                                    }

                                    const weightOptions = this.getFilteredWeightOptions(this.state.selectedFontId);
                                    if (weightOptions.length <= 1) return null;
                                    return (
                                        <div className="typost-modal-section typost-fontweight-section">
                                            <h4>{__('Font Weight', 'typography-stylist')}</h4>
                                            <SelectControl
                                                value={fontWeight}
                                                options={weightOptions}
                                                onChange={this.setFontWeight}
                                            />
                                        </div>
                                    );
                                })()}

                                {/* Extension hook point: after font controls (e.g., Variable Font axes).
                                    Sits directly below the weight control so a variable font's
                                    axis sliders stay grouped with the weight they extend.
                                    key: remount (and re-fire the action) when the font changes */}
                                <div key={`typost-afc-${this.state.selectedFontId || 'none'}`} className="typost-hook-point" data-hook="typost_inline_after_font_controls" ref={(el) => {
                                    if (el && !el._hooked) {
                                        el._hooked = true;
                                        window.typostHooks.doAction('typost_inline_after_font_controls', el, this.state);
                                    }
                                }} />

                                {/* Font Style Control (visual italic — semantic emphasis stays <em>) */}
                                <div className="typost-modal-section typost-fontstyle-section">
                                    <h4>{__('Font Style', 'typography-stylist')}</h4>
                                    <SelectControl
                                        value={this.state.fontStyle}
                                        options={[
                                            { label: __('Inherit', 'typography-stylist'), value: '' },
                                            { label: __('Normal (upright)', 'typography-stylist'), value: 'normal' },
                                            { label: __('Italic', 'typography-stylist'), value: 'italic' }
                                        ]}
                                        onChange={this.setFontStyle}
                                        help={__('Visual style only — the italic face of the font, without adding emphasis. To emphasize text semantically (screen readers announce it), use the editor’s Italic button instead.', 'typography-stylist')}
                                    />
                                </div>

                                {/* Font Size Controls */}
                                <div className="typost-modal-section typost-fontsize-section">
                                    <h4>{__('Font Size', 'typography-stylist')}</h4>
                                    <SelectControl
                                        value={fontSize}
                                        options={[
                                            { label: __('Inherit', 'typography-stylist'), value: 'inherit' },
                                            { label: __('Responsive (Fluid)', 'typography-stylist'), value: 'responsive' },
                                            // Fit to Width only exists on Typography Stylist blocks;
                                            // the value can still appear here via a fit-mode paragraph
                                            // style. Shown disabled (and only while active) so the
                                            // dropdown reflects the truth instead of a wrong option.
                                            ...(fontSize === 'fit' ? [{ label: __('Fit to Width (blocks only)', 'typography-stylist'), value: 'fit', disabled: true }] : [])
                                        ]}
                                        onChange={this.setFontSize}
                                        help={fontSize === 'responsive'
                                            ? __('Responsive mode uses CSS clamp() for fluid sizing across viewports.', 'typography-stylist')
                                            : (fontSize === 'fit'
                                                ? __('This paragraph style fits text to the block width — inline text renders the style’s fluid fallback size instead.', 'typography-stylist')
                                                : undefined)}
                                    />

                                    {fontSize === 'responsive' && (
                                        <div className="typost-fontsize-controls">
                                            <RangeControl
                                                label={__('Minimum Size (mobile)', 'typography-stylist')}
                                                value={fontSizeMin}
                                                onChange={this.setFontSizeMin}
                                                min={8}
                                                max={120}
                                                step={1}
                                                help={`${fontSizeMin}px`}
                                            />
                                            <RangeControl
                                                label={__('Preferred Size (tablet)', 'typography-stylist')}
                                                value={fontSizePreferred}
                                                onChange={this.setFontSizePreferred}
                                                min={8}
                                                max={120}
                                                step={1}
                                                help={`${fontSizePreferred}px`}
                                            />
                                            <RangeControl
                                                label={__('Maximum Size (desktop)', 'typography-stylist')}
                                                value={fontSizeMax}
                                                onChange={this.setFontSizeMax}
                                                min={8}
                                                max={120}
                                                step={1}
                                                help={`${fontSizeMax}px`}
                                            />
                                        </div>
                                    )}
                                </div>

                                {/* Line Height Control */}
                                <div className="typost-modal-section typost-lineheight-section">
                                    <h4>{__('Line Height', 'typography-stylist')}</h4>
                                    <RangeControl
                                        value={lineHeight === 0 ? 1.5 : lineHeight}
                                        onChange={this.setLineHeight}
                                        min={0.5}
                                        max={3}
                                        step={0.1}
                                        help={lineHeight === 0 ? __('Currently using browser default', 'typography-stylist') : lineHeight}
                                        allowReset
                                        resetFallbackValue={0}
                                        marks={[
                                            { value: 1.5, label: '1.5' }
                                        ]}
                                        renderTooltipContent={(value) => lineHeight === 0 ? __('Browser default', 'typography-stylist') : value}
                                    />
                                </div>

                                {/* Letter Spacing Control */}
                                <div className="typost-modal-section typost-letterspacing-section">
                                    <h4>{__('Letter Spacing', 'typography-stylist')}</h4>
                                    <RangeControl
                                        value={letterSpacing}
                                        onChange={this.setLetterSpacing}
                                        min={-200}
                                        max={200}
                                        step={1}
                                        help={letterSpacing === 0 ? __('Normal', 'typography-stylist') : `${letterSpacing / 1000}em`}
                                        allowReset
                                        resetFallbackValue={0}
                                    />
                                </div>

                                {/* Presets Section */}
                                {presets.length > 0 && (
                                    <div className="typost-presets-section">
                                        <h4>{__('Quick Presets', 'typography-stylist')}</h4>
                                        <div className="typost-presets-grid">
                                            {presets.map(preset => this.renderPresetButton(preset))}
                                        </div>
                                    </div>
                                )}

                                {/* Extension hook point: before features (e.g., Glyphs panel) */}
                                <div className="typost-hook-point" data-hook="typost_inline_before_features" ref={(el) => {
                                    if (el && !el._hooked) {
                                        el._hooked = true;
                                        window.typostHooks.doAction('typost_inline_before_features', el, this.state);
                                    }
                                }} />

                                {/* Features Section */}
                                <div className="typost-features-section">
                                    <h4>{__('Individual Features', 'typography-stylist')}</h4>

                                    {Object.entries(groupedFeatures).map(([category, features]) => (
                                        <PanelBody
                                            key={category}
                                            title={this.getCategoryTitle(category)}
                                            initialOpen={category === 'ligatures'}
                                            className="typost-feature-category"
                                        >
                                            {features.map(feature => this.renderFeatureToggle(feature))}
                                        </PanelBody>
                                    ))}
                                </div>

                                {/* Extension hook point: after features */}
                                <div className="typost-hook-point" data-hook="typost_inline_after_features" ref={(el) => {
                                    if (el && !el._hooked) {
                                        el._hooked = true;
                                        window.typostHooks.doAction('typost_inline_after_features', el, this.state);
                                    }
                                }} />

                                {/* Convert to block — always reachable for convertible blocks, not
                                    only when the accessibility notice fires. When the conversion is
                                    impossible the reason is stated instead of rendering nothing,
                                    which previously read as a missing feature. The word-boundary
                                    notice at the top of the panel carries its own copy, so this is
                                    suppressed while it shows. */}
                                {!wordBoundaryWarning && (canConvert || convertBlockedMessage) && (
                                    <div className="typost-convert-section">
                                        {canConvert ? (
                                            <>
                                                <Button variant="secondary" onClick={this.convertToBlock} className="typost-convert-button">
                                                    {__('Convert to Typography Stylist Block', 'typography-stylist')}
                                                </Button>
                                                <p className="typost-convert-description">
                                                    {__('Converts this heading or paragraph into a Typography Stylist block, which adds screen reader text and block-level typography controls.', 'typography-stylist')}
                                                </p>
                                            </>
                                        ) : (
                                            <p className="typost-convert-blocked">{convertBlockedMessage}</p>
                                        )}
                                    </div>
                                )}

                                {/* Clear Confirmation - Inline */}
                                {showClearConfirmation && (
                                    <div className="typost-clear-confirmation-inline">
                                        {wp.element.createElement(Notice, {
                                            status: 'warning',
                                            isDismissible: false,
                                            className: 'typost-clear-warning'
                                        },
                                            wp.element.createElement('p', { style: { margin: '0 0 12px 0', fontWeight: '600' } },
                                                __('Clear All Typography Settings?', 'typography-stylist')
                                            ),
                                            wp.element.createElement('p', { style: { margin: '0 0 12px 0', fontSize: '13px' } },
                                                __('This will remove all typography features, font selections, and styling.', 'typography-stylist')
                                            ),
                                            wp.element.createElement(CheckboxControl, {
                                                label: __('Do not show this warning again (this session)', 'typography-stylist'),
                                                checked: dontShowClearWarning,
                                                onChange: (checked) => this.setState({ dontShowClearWarning: checked })
                                            }),
                                            wp.element.createElement(ButtonGroup, { style: { marginTop: '12px' } },
                                                wp.element.createElement(Button, {
                                                    isPrimary: true,
                                                    onClick: this.confirmClear
                                                }, __('Clear All Settings', 'typography-stylist')),
                                                wp.element.createElement(Button, {
                                                    isSecondary: true,
                                                    onClick: this.cancelClear
                                                }, __('Cancel', 'typography-stylist'))
                                            )
                                        )}
                                    </div>
                                )}

                                {/* Extension hook point: bottom of modal */}
                                <div className="typost-hook-point" data-hook="typost_inline_modal_bottom" ref={(el) => {
                                    if (el && !el._hooked) {
                                        el._hooked = true;
                                        window.typostHooks.doAction('typost_inline_modal_bottom', el, this.state);
                                    }
                                }} />

                                {/* Action Buttons (v2.0.0 - live preview, no Apply button) */}
                                {!showClearConfirmation && (
                                    <div className="typost-popover-actions">
                                        <ButtonGroup>
                                            <Button
                                                isSecondary
                                                onClick={this.handleClearClick}
                                            >
                                                {__('Clear', 'typography-stylist')}
                                            </Button>
                                            <Button
                                                isTertiary
                                                onClick={this.togglePopover}
                                            >
                                                {__('Close', 'typography-stylist')}
                                            </Button>
                                        </ButtonGroup>
                                    </div>
                                )}
                                </div>{/* End typost-scrollable-content */}
                            </div>{/* End typost-popover-content */}
                            </div>{/* End typost-modal-content */}

                            {/* Resize handles - 8 directions */}
                            <div className="typost-resize-handles">
                                <div
                                    className="typost-resize-handle typost-resize-n"
                                    onMouseDown={(e) => this.handleResizeStart(e, 'n')}
                                    role="slider"
                                    aria-label={__('Resize modal vertically', 'typography-stylist')}
                                    tabIndex={0}
                                    style={{ cursor: 'ns-resize' }}
                                />
                                <div
                                    className="typost-resize-handle typost-resize-ne"
                                    onMouseDown={(e) => this.handleResizeStart(e, 'ne')}
                                    role="slider"
                                    aria-label={__('Resize modal diagonally', 'typography-stylist')}
                                    tabIndex={0}
                                    style={{ cursor: 'nesw-resize' }}
                                />
                                <div
                                    className="typost-resize-handle typost-resize-e"
                                    onMouseDown={(e) => this.handleResizeStart(e, 'e')}
                                    role="slider"
                                    aria-label={__('Resize modal horizontally', 'typography-stylist')}
                                    tabIndex={0}
                                    style={{ cursor: 'ew-resize' }}
                                />
                                <div
                                    className="typost-resize-handle typost-resize-se"
                                    onMouseDown={(e) => this.handleResizeStart(e, 'se')}
                                    role="slider"
                                    aria-label={__('Resize modal', 'typography-stylist')}
                                    tabIndex={0}
                                    style={{ cursor: 'nwse-resize' }}
                                />
                                <div
                                    className="typost-resize-handle typost-resize-s"
                                    onMouseDown={(e) => this.handleResizeStart(e, 's')}
                                    role="slider"
                                    aria-label={__('Resize modal vertically', 'typography-stylist')}
                                    tabIndex={0}
                                    style={{ cursor: 'ns-resize' }}
                                />
                                <div
                                    className="typost-resize-handle typost-resize-sw"
                                    onMouseDown={(e) => this.handleResizeStart(e, 'sw')}
                                    role="slider"
                                    aria-label={__('Resize modal diagonally', 'typography-stylist')}
                                    tabIndex={0}
                                    style={{ cursor: 'nesw-resize' }}
                                />
                                <div
                                    className="typost-resize-handle typost-resize-w"
                                    onMouseDown={(e) => this.handleResizeStart(e, 'w')}
                                    role="slider"
                                    aria-label={__('Resize modal horizontally', 'typography-stylist')}
                                    tabIndex={0}
                                    style={{ cursor: 'ew-resize' }}
                                />
                                <div
                                    className="typost-resize-handle typost-resize-nw"
                                    onMouseDown={(e) => this.handleResizeStart(e, 'nw')}
                                    role="slider"
                                    aria-label={__('Resize modal diagonally', 'typography-stylist')}
                                    tabIndex={0}
                                    style={{ cursor: 'nwse-resize' }}
                                />
                            </div>
                        </Modal>
                    )}
                </Fragment>
            );
        }

        /**
         * Get category title
         */
        getCategoryTitle(category) {
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

})(window.wp);
