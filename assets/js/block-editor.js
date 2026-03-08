/**
 * Block Editor Integration for Typography Stylist
 * Adds custom format type for OpenType features
 */

// Import drag/resize utilities (CommonJS for browserify)
const { constrainToViewport, calculateDragDelta, calculateResize } = require('./modal-drag-resize.js');

// Viewport breakpoints for responsive font sizing
const RESPONSIVE_FONT_MIN_VIEWPORT = 320;  // Mobile baseline
const RESPONSIVE_FONT_MAX_VIEWPORT = 1920; // Desktop baseline

(function(wp) {
    const { registerFormatType, toggleFormat, applyFormat, removeFormat, getActiveFormat, slice, getTextContent } = wp.richText;
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
     * @since 1.3.0
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
        if (!blockClientId || !blockName) {
            return '';
        }

        // Use provided document/window or defaults
        const doc = targetDocument || document;
        const win = targetWindow || window;

        // Find the block wrapper element
        const blockWrapper = doc.querySelector(`[data-block="${blockClientId}"]`);
        if (!blockWrapper) {
            return '';
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

        // If we found a text element, get its computed font
        if (textElement) {
            const computedStyle = win.getComputedStyle(textElement);
            const fontFamily = computedStyle.getPropertyValue('font-family');
            return fontFamily ? fontFamily.replace(/['"]/g, '') : '';
        }

        return '';
    }

    // Expose utilities for testing
    if (typeof window !== 'undefined') {
        window.typostUtils = {
            escapeHTML,
            hasHTMLTags,
            validateSelectionBounds,
            sanitizeFontFamily,
            sanitizeCSSValue,
            getBlockInheritedFont
        };
    }

    /**
     * Custom "T" icon for Typography Stylist
     */
    const TSIcon = () => (
        wp.element.createElement('svg', {
            width: 20,
            height: 20,
            viewBox: '0 0 1067 1067',
            xmlns: 'http://www.w3.org/2000/svg'
        },
            wp.element.createElement('path', {
                d: 'M22.621,323.219c0,116.595 86.232,204.042 200.398,204.042c81.374,0 134.814,-41.294 134.814,-100.806c0,-36.436 -26.72,-68.014 -66.799,-68.014c-71.658,0 -75.301,80.159 -122.668,80.159c-54.654,0 -87.447,-58.298 -87.447,-115.381c0,-78.945 52.225,-137.243 156.675,-137.243c78.945,0 162.748,29.149 250.194,59.512l0,647.348c0,92.305 -20.647,99.592 -117.81,105.665l0,30.363l355.859,0l0,-30.363c-97.163,-6.073 -117.81,-13.36 -117.81,-105.665l0,-609.697c65.585,20.647 133.599,36.436 206.471,36.436c144.53,0 229.547,-83.803 229.547,-184.609c0,-57.083 -32.792,-97.163 -80.159,-97.163c-40.08,0 -72.872,27.934 -72.872,69.229c0,49.796 42.509,65.585 42.509,100.806c0,36.436 -38.865,58.298 -106.879,58.298c-136.028,0 -329.139,-171.25 -534.396,-171.25c-173.679,0 -269.627,109.308 -269.627,228.333Z',
                fill: 'currentColor'
            })
        )
    );

    /**
     * Typography Features Component
     */
    class TypographyFeaturesControl extends Component {
        constructor(props) {
            super(props);

            // Check if user has disabled warning for this session
            let hideWarning = false;
            try {
                hideWarning = sessionStorage.getItem('typography_stylist_hide_clear_warning') === 'true';
            } catch (e) {
                // Session storage might not be available
            }

            this.state = {
                isOpen: false,
                selectedFeatures: this.getActiveFeatures() || [],
                selectedFont: this.getActiveFont() || '',
                selectedFontId: this.getActiveFontId() || 0,
                fontSize: this.getActiveFontSize() || 'inherit',
                fontSizeMin: this.getActiveFontSizeMin() || 16,
                fontSizePreferred: this.getActiveFontSizePreferred() || 24,
                fontSizeMax: this.getActiveFontSizeMax() || 32,
                fontWeight: this.getActiveFontWeight() || '400',
                letterSpacing: this.getActiveLetterSpacing() || 0,
                lineHeight: this.getActiveLineHeight() || 0,
                selectedText: '', // Extracted text for feature previews
                activePreset: null,
                wordBoundaryWarning: '',
                canConvert: true,
                showClearConfirmation: false,
                dontShowClearWarning: hideWarning,
                // Inline features cached when popover opens (for inline editor toolbar)
                // Note: Typographic Stylist block sidebar (edit.js) uses useMemo for similar optimization
                inlineFeatures: [],
                // Font inherited from block's computed styles (when Default font is selected)
                blockInheritedFont: '',
                // Flag to track if font detection failed (no text element found)
                fontDetectionFailed: false,
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
                // Font variation settings (set by extension via event, '' = none)
                fontVariationSettings: ''
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
            this.setLetterSpacing = this.setLetterSpacing.bind(this);
            this.setLineHeight = this.setLineHeight.bind(this);
            this.validateSelection = this.validateSelection.bind(this);
            this.convertToBlock = this.convertToBlock.bind(this);

            this.applyFeatureFromPreview = this.applyFeatureFromPreview.bind(this);
            // Modal drag/resize handlers
            this.initializeModalPosition = this.initializeModalPosition.bind(this);
            this.handleDragStart = this.handleDragStart.bind(this);
            this.handleDragMove = this.handleDragMove.bind(this);
            this.handleDragEnd = this.handleDragEnd.bind(this);
            this.handleResizeStart = this.handleResizeStart.bind(this);
            this.handleResizeMove = this.handleResizeMove.bind(this);
            this.handleResizeEnd = this.handleResizeEnd.bind(this);
            this.handleHeaderKeyDown = this.handleHeaderKeyDown.bind(this);

            // Create debounced apply functions (v1.3.0 - live preview)
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
                        fontId: self.state.selectedFontId,
                        fontWeight: self.state.fontWeight,
                        fontSize: self.state.fontSize,
                        fontSizeMin: self.state.fontSizeMin,
                        fontSizePreferred: self.state.fontSizePreferred,
                        fontSizeMax: self.state.fontSizeMax,
                        letterSpacing: self.state.letterSpacing,
                        lineHeight: self.state.lineHeight,
                        features: self.state.selectedFeatures,
                        paragraphStyleId: self.state.paragraphStyleId,
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
                    self.setState({
                        selectedFontId: props.fontId !== undefined ? (props.fontId || 0) : self.state.selectedFontId,
                        selectedFont: props.fontId !== undefined ? (props.fontId ? self.resolveFontFamily(props.fontId) : '') : self.state.selectedFont,
                        fontWeight: props.fontWeight !== undefined ? (props.fontWeight || '400') : self.state.fontWeight,
                        fontSize: props.fontSize !== undefined ? (props.fontSize || 'inherit') : self.state.fontSize,
                        fontSizeMin: props.fontSizeMin !== undefined ? (props.fontSizeMin || 16) : self.state.fontSizeMin,
                        fontSizePreferred: props.fontSizePreferred !== undefined ? (props.fontSizePreferred || 24) : self.state.fontSizePreferred,
                        fontSizeMax: props.fontSizeMax !== undefined ? (props.fontSizeMax || 32) : self.state.fontSizeMax,
                        letterSpacing: props.letterSpacing !== undefined ? (props.letterSpacing || 0) : self.state.letterSpacing,
                        lineHeight: props.lineHeight !== undefined ? (props.lineHeight || 0) : self.state.lineHeight,
                        selectedFeatures: props.features !== undefined ? (props.features || []) : self.state.selectedFeatures,
                        paragraphStyleId: e.detail.paragraphStyleId !== undefined ? (e.detail.paragraphStyleId || 0) : self.state.paragraphStyleId,
                        fontVariationSettings: props.fontVariationSettings !== undefined ? (props.fontVariationSettings || '') : self.state.fontVariationSettings
                    }, function() {
                        self._doApplyFeatures();
                    });
                }
            };
            document.addEventListener('typost-apply-block-properties', this._handleApplyBlockProperties);
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
            const { value } = this.props;
            const activeFormat = getActiveFormat(value, FORMAT_TYPE);

            if (activeFormat && activeFormat.attributes && activeFormat.attributes['data-fontweight']) {
                return activeFormat.attributes['data-fontweight'];
            }

            return '400';
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
            let canConvert = true;

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

                // Check word boundary when opening (v1.3.0 - now informational, not blocking)
                if (selectionStart !== selectionEnd) {
                    const validation = this.validateSelection(selectionStart, selectionEnd);
                    if (!validation.valid) {
                        wordBoundaryWarning = validation.message;
                        // Compute canConvert when there's a warning
                        const selectedBlockClientId = select('core/block-editor').getSelectedBlockClientId();
                        const rootClientId = selectedBlockClientId
                            ? select('core/block-editor').getBlockRootClientId(selectedBlockClientId)
                            : null;
                        canConvert = selectedBlockClientId &&
                            select('core/block-editor').canRemoveBlock(selectedBlockClientId) &&
                            select('core/block-editor').canInsertBlockType('typost/block', rootClientId);
                    }
                }

                // Initialize modal position when opening
                modalPosition = this.initializeModalPosition();
            }

            const wasOpen = this.state.isOpen;

            this.setState(state => ({
                isOpen: !state.isOpen,
                selectedFeatures: this.getActiveFeatures() || [],
                selectedFont: this.getActiveFont() || '',
                selectedFontId: this.getActiveFontId() || 0,
                fontSize: this.getActiveFontSize() || 'inherit',
                fontSizeMin: this.getActiveFontSizeMin() || 16,
                fontSizePreferred: this.getActiveFontSizePreferred() || 24,
                fontSizeMax: this.getActiveFontSizeMax() || 32,
                fontWeight: this.getActiveFontWeight() || '400',
                letterSpacing: this.getActiveLetterSpacing() || 0,
                lineHeight: this.getActiveLineHeight() || 0,
                selectedText: !state.isOpen ? extractedText : '',
                inlineFeatures: computedInlineFeatures,
                blockInheritedFont: inheritedFont,
                fontDetectionFailed: detectionFailed,
                wordBoundaryWarning: !state.isOpen ? wordBoundaryWarning : '',
                canConvert: canConvert,
                // Save selection bounds when opening, clear when closing
                savedSelectionStart: !state.isOpen ? selectionStart : null,
                savedSelectionEnd: !state.isOpen ? selectionEnd : null,
                // Reset modal position and drag/resize state
                ...(!state.isOpen && modalPosition),
                isDragging: false,
                isResizing: false,
                // Reset paragraph style ID (extension sets via event)
                paragraphStyleId: !state.isOpen ? (this.getActiveStyleId() || 0) : 0
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
         * Set font family (value can be font ID or font family string)
         */
        setFont(value) {
            if (value === '') {
                // Reset to default
                this.setState({
                    selectedFont: '',
                    selectedFontId: 0
                }, () => {
                    this.debouncedApplyDropdown();
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
            if (!isNaN(id) && this.fontIdMap && this.fontIdMap[id]) {
                return this.fontIdMap[id].family;
            }
            return '';
        }

        /**
         * Set font size mode
         */
        setFontSize(mode) {
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
            this.setState({
                fontWeight: value
            }, () => {
                this.debouncedApplyDropdown();
            });
        }

        /**
         * Set letter spacing
         */
        setLetterSpacing(value) {
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
                } else {
                    features.push(featureId);
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

            let contentForBlock;

            // Use saved selection bounds if current selection was lost due to modal focus
            const { savedSelectionStart, savedSelectionEnd } = this.state;
            const effectiveStart = (value.start === value.end && savedSelectionStart !== null) ? savedSelectionStart : value.start;
            const effectiveEnd = (value.start === value.end && savedSelectionEnd !== null) ? savedSelectionEnd : value.end;

            // Check if there's a selection (partial text selected)
            if (effectiveStart !== effectiveEnd) {
                // User selected a portion of text - apply styling only to that portion
                // Use the current block's HTML content to preserve existing spans
                const existingContent = currentBlock.attributes.content || '';
                const fullText = getTextContent(value);

                // Build style string for the selected portion
                const { selectedFeatures, selectedFont, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, fontWeight, letterSpacing, lineHeight } = this.state;
                const styleArray = [];

                if (selectedFeatures.length > 0) {
                    // Sanitize each feature ID to prevent injection
                    const sanitizedFeatures = selectedFeatures.map(f => sanitizeCSSValue(f));
                    styleArray.push(`font-feature-settings: ${sanitizedFeatures.map(f => `"${f}" 1`).join(', ')}`);
                }
                if (selectedFont) {
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
                    // Parse the HTML to work with it
                    const parser = new DOMParser();
                    const doc = parser.parseFromString(`<div>${existingContent}</div>`, 'text/html');
                    const container = doc.body.firstChild;

                    // Create offset map for the selection (accounts for <br> line breaks)
                    const selTextMap = buildTextOffsetMap(container, doc);

                    // Use offset map's final position for text length (matches BR counting)
                    const textLength = selTextMap.length > 0 ? selTextMap[selTextMap.length - 1].end : container.textContent.length;
                    const validationResult = validateSelectionBounds(effectiveStart, effectiveEnd, textLength);
                    if (!validationResult.valid) {
                        return;
                    }
                    let startNode = null, startOffset = 0;
                    let endNode = null, endOffset = 0;

                    for (const entry of selTextMap) {
                        if (!startNode && entry.end >= effectiveStart) {
                            startNode = entry.node;
                            startOffset = effectiveStart - entry.start;
                        }

                        if (entry.end >= effectiveEnd) {
                            endNode = entry.node;
                            endOffset = effectiveEnd - entry.start;
                            break;
                        }
                    }

                    // If we found the nodes, wrap the selection
                    if (startNode && endNode) {
                        const range = doc.createRange();
                        range.setStart(startNode, startOffset);
                        range.setEnd(endNode, endOffset);

                        const span = doc.createElement('span');
                        span.className = 'typost-styled';
                        // Always set data-features for new content (faster parsing than style attribute)
                        // Note: getInlineFeaturesForTypostBlock() includes fallback for backward compatibility
                        span.setAttribute('data-features', selectedFeatures.join(','));
                        span.setAttribute('style', styleString);

                        try {
                            range.surroundContents(span);
                            contentForBlock = container.innerHTML;
                        } catch (e) {
                            // If we can't wrap (e.g., crosses element boundaries), fall back to text replacement
                            const beforeText = fullText.substring(0, effectiveStart);
                            const selectedText = fullText.substring(effectiveStart, effectiveEnd);
                            const afterText = fullText.substring(effectiveEnd);
                            contentForBlock = escapeHTML(beforeText) +
                                `<span class="typost-styled" data-features="${selectedFeatures.join(',')}" style="${styleString}">${escapeHTML(selectedText)}</span>` +
                                escapeHTML(afterText);
                        }
                    } else {
                        // Fall back to simple text replacement
                        const beforeText = fullText.substring(0, effectiveStart);
                        const selectedText = fullText.substring(effectiveStart, effectiveEnd);
                        const afterText = fullText.substring(effectiveEnd);
                        contentForBlock = escapeHTML(beforeText) +
                            `<span class="typost-styled" data-features="${selectedFeatures.join(',')}" style="${styleString}">${escapeHTML(selectedText)}</span>` +
                            escapeHTML(afterText);
                    }
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
                        fontWeight: this.state.fontWeight,
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
                // No selection - apply to entire block (original behavior)
                const textContent = currentBlock.attributes.content || getTextContent(value);

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
                        fontWeight: this.state.fontWeight,
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
         * Core feature application logic (live preview auto-apply)
         */
        _doApplyFeatures() {
            const { value, onChange } = this.props;
            const { selectedFeatures, selectedFont, selectedFontId, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, fontWeight, letterSpacing, lineHeight, savedSelectionStart, savedSelectionEnd, paragraphStyleId, fontVariationSettings } = this.state;

            // Check if selection was lost due to modal focus and we have saved bounds
            const selectionLost = value.start === value.end && savedSelectionStart !== null && savedSelectionEnd !== null && savedSelectionStart !== savedSelectionEnd;

            if (selectedFeatures.length === 0 && !selectedFont && fontSize === 'inherit' && fontWeight === '400' && letterSpacing === 0 && lineHeight === 0 && !paragraphStyleId && !fontVariationSettings) {
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

                // Add features
                if (selectedFeatures.length > 0) {
                    const cssValue = this.featuresToCSS(selectedFeatures);
                    attributes['data-features'] = selectedFeatures.join(',');
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

                // Add font size
                if (fontSize !== 'inherit') {
                    attributes['data-fontsize'] = fontSize;
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
                    attributes['data-font-variation-settings'] = fontVariationSettings;
                    if (!hasActiveStyle) {
                        if (styleString) styleString += '; ';
                        styleString += `font-variation-settings: ${fontVariationSettings}`;
                    }
                }

                // Only set inline style when no paragraph style is active
                if (!hasActiveStyle) {
                    attributes['style'] = styleString;
                }

                // Add aria-label if enabled for accessibility
                if (typostData.enableAriaLabels && value) {
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

            // v1.3.0: Don't close modal on apply - modal stays open for live preview
        }


        /**
         * Apply preset
         */
        applyPreset(preset) {
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
            const showConfirmation = typostData.showClearConfirmation && !this.state.dontShowClearWarning;

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
            const features = typostData.features || [];
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
            const fonts = typostData.fonts || [];
            const adobeFonts = typostData.adobeFonts || [];
            const manualFonts = typostData.manualFonts || [];
            const options = [];

            // Build font ID map for quick lookup (clear before repopulating)
            this.fontIdMap = {};

            // Uploaded fonts (MyFonts, etc.)
            if (fonts.length > 0) {
                fonts.forEach(font => {
                    if (font.font_faces && font.font_faces.length > 0 && font.font_id) {
                        // Get unique font families from this kit
                        const families = [...new Set(font.font_faces.map(face => face.family))];
                        families.forEach(family => {
                            options.push({
                                label: `📁 ${family}`,
                                value: String(font.font_id),
                                fontFamily: family,
                                fontId: font.font_id
                            });
                            this.fontIdMap[font.font_id] = { family, fallbacks: font.fallbacks, availableWeights: font.available_weights || [] };
                        });
                    }
                });
            }

            // Adobe Fonts
            if (adobeFonts.length > 0) {
                adobeFonts.forEach(font => {
                    // Handle new structure: font_family (singular string - one entry per family)
                    if (font.font_family && font.font_id) {
                        options.push({
                            label: `🅰️ ${font.font_family}`,
                            value: String(font.font_id),
                            fontFamily: font.font_family,
                            fontId: font.font_id
                        });
                        this.fontIdMap[font.font_id] = { family: font.font_family, fallbacks: font.fallbacks, availableWeights: font.available_weights || [] };
                    }
                    // Handle legacy structure: font_families (plural array - multiple families per entry)
                    else if (font.font_families && font.font_families.length > 0 && font.font_id) {
                        font.font_families.forEach(family => {
                            options.push({
                                label: `🅰️ ${family}`,
                                value: String(font.font_id),
                                fontFamily: family,
                                fontId: font.font_id
                            });
                            this.fontIdMap[font.font_id] = { family, fallbacks: font.fallbacks, availableWeights: font.available_weights || [] };
                        });
                    }
                });
            }

            // Manual fonts
            if (manualFonts.length > 0) {
                manualFonts.forEach(font => {
                    if (font.font_family && font.font_id) {
                        options.push({
                            label: `⚙️ ${font.name}`,
                            value: String(font.font_id),
                            fontFamily: font.font_family,
                            fontId: font.font_id
                        });
                        this.fontIdMap[font.font_id] = { family: font.font_family, fallbacks: font.fallbacks, availableWeights: font.available_weights || [] };
                    }
                });
            }

            return options;
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
        componentWillUnmount() {
            // Cleanup modal drag/resize event listeners
            document.removeEventListener('mousemove', this.handleDragMove);
            document.removeEventListener('mouseup', this.handleDragEnd);
            document.removeEventListener('mousemove', this.handleResizeMove);
            document.removeEventListener('mouseup', this.handleResizeEnd);

            // Cleanup debounced apply functions (v1.3.0 - live preview)
            this.debouncedApplySlider.cancel();
            this.debouncedApplyDropdown.cancel();
            this.debouncedApplyFontSize.cancel();

            // Cleanup extension hook listener
            if (this._handleApplyBlockProperties) {
                document.removeEventListener('typost-apply-block-properties', this._handleApplyBlockProperties);
            }

            // Cleanup state provider filter
            if (this._stateProviderFilter) {
                window.typostHooks.removeFilter('typost_current_editor_state', this._stateProviderFilter);
            }
        }

        render() {
            const { isActive, isInTypostBlock = false } = this.props;
            const { isOpen, selectedFont, selectedFontId, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, fontWeight, letterSpacing, lineHeight, wordBoundaryWarning, canConvert, showClearConfirmation, dontShowClearWarning, fontDetectionFailed } = this.state;
            const groupedFeatures = this.groupFeatures();
            const presets = typostData.presets || [];
            const fontOptions = this.getFontOptions();
            const hasFonts = fontOptions.length > 0;

            return (
                <Fragment>
                    {/* Only show button if NOT in a Typography Stylist block */}
                    {!isInTypostBlock && (
                        <BlockControls>
                            <ToolbarGroup>
                                <ToolbarButton
                                    icon={TSIcon}
                                    title={__('Typography Stylist', 'typography-stylist')}
                                    onClick={this.togglePopover}
                                    isActive={isActive}
                                    className="typost-toolbar-button"
                                />
                            </ToolbarGroup>
                        </BlockControls>
                    )}

                    {isOpen && (
                        <Modal
                            title=""
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
                                <h3>{__('Typography Stylist', 'typography-stylist')}</h3>
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

                                {/* Drag instruction notice - always visible */}
                                <div className="typost-sticky-notice-wrapper">
                                    {wp.element.createElement(Notice, {
                                        status: 'info',
                                        isDismissible: false,
                                        className: 'typost-drag-notice'
                                    },
                                        wp.element.createElement('p', { style: { margin: 0 } },
                                            '💡 ' + __('Tip: Drag the title bar to reposition this panel', 'typography-stylist')
                                        )
                                    )}
                                </div>

                                {/* Scrollable Content Wrapper */}
                                <div className="typost-scrollable-content">

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
                                    <div className="typost-font-section">
                                        <h4>{__('Font Family', 'typography-stylist')}</h4>
                                        <SelectControl
                                            value={selectedFontId ? String(selectedFontId) : ''}
                                            options={[
                                                { label: __('(Default)', 'typography-stylist'), value: '' },
                                                ...fontOptions
                                            ]}
                                            onChange={this.setFont}
                                        />
                                    </div>
                                )}

                                {/* Font Weight Control - replaceable via typost_weight_control filter */}
                                {(() => {
                                    const weightControlType = window.typostHooks
                                        ? window.typostHooks.applyFilters('typost_weight_control', 'default', this.state.selectedFontId)
                                        : 'default';

                                    if (weightControlType !== 'default') {
                                        return (
                                            <div className="typost-fontweight-section">
                                                <div className="typost-hook-point" data-hook="typost_weight_control" ref={(el) => {
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
                                        <div className="typost-fontweight-section">
                                            <h4>{__('Font Weight', 'typography-stylist')}</h4>
                                            <SelectControl
                                                value={fontWeight}
                                                options={weightOptions}
                                                onChange={this.setFontWeight}
                                            />
                                        </div>
                                    );
                                })()}

                                {/* Extension hook point: after font controls (e.g., Variable Font axes) */}
                                <div className="typost-hook-point" data-hook="typost_inline_after_font_controls" ref={(el) => {
                                    if (el && !el._hooked) {
                                        el._hooked = true;
                                        window.typostHooks.doAction('typost_inline_after_font_controls', el, this.state);
                                    }
                                }} />

                                {/* Font Size Controls */}
                                <div className="typost-fontsize-section">
                                    <h4>{__('Font Size', 'typography-stylist')}</h4>
                                    <SelectControl
                                        value={fontSize}
                                        options={[
                                            { label: __('Inherit', 'typography-stylist'), value: 'inherit' },
                                            { label: __('Responsive (Fluid)', 'typography-stylist'), value: 'responsive' }
                                        ]}
                                        onChange={this.setFontSize}
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
                                <div className="typost-lineheight-section">
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
                                <div className="typost-letterspacing-section">
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

                                {/* Accessibility Warning - Non-blocking Notice (v1.3.0) */}
                                {wordBoundaryWarning && (
                                    <Notice status="warning" isDismissible={false} className="typost-word-boundary-notice">
                                        <strong>{__('Accessibility Notice', 'typography-stylist')}</strong>
                                        <p>{wordBoundaryWarning}</p>
                                        {canConvert && (
                                            <Button isLink onClick={this.convertToBlock}>
                                                {__('Convert to Typography Stylist Block', 'typography-stylist')}
                                            </Button>
                                        )}
                                        <p className="typost-warning-settings-link">
                                            <a href={typostData.settingsUrl + '&tab=accessibility'} target="_blank" rel="noopener noreferrer">
                                                {__('Manage accessibility settings', 'typography-stylist')}
                                            </a>
                                        </p>
                                    </Notice>
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

                                {/* Action Buttons (v1.3.0 - live preview, no Apply button) */}
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
