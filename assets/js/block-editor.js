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
    const { compose } = wp.compose;

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
                if (window && window.console && typeof window.console.warn === 'function') {
                    window.console.warn('Typography Stylist: sessionStorage is not available; "don\'t show again" preference for clear warning will not persist.', e);
                }
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
                showPreview: true,
                activePreset: null,
                previewText: '',
                previewDevice: 'tablet',
                showAccessibilityWarning: false,
                warningMessage: '',
                changeHistory: [],
                showClearConfirmation: false,
                dontShowClearWarning: hideWarning,
                // Inline features cached when popover opens (for inline editor toolbar)
                // Note: Typographic Stylist block sidebar (edit.js) uses useMemo for similar optimization
                inlineFeatures: [],
                // Font inherited from block's computed styles (when Default font is selected)
                blockInheritedFont: '',
                // Flag to track if font detection failed (no text element found)
                fontDetectionFailed: false,
                // Track if user has made changes to show apply notice
                hasChanges: false,
                // Initial state when popover opens (for comparing on undo)
                initialState: null,
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
                resizeDirection: null
            };

            this.togglePopover = this.togglePopover.bind(this);
            this.toggleFeature = this.toggleFeature.bind(this);
            this.applyFeatures = this.applyFeatures.bind(this);
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
            this.setPreviewDevice = this.setPreviewDevice.bind(this);
            this.validateSelection = this.validateSelection.bind(this);
            this.convertToBlock = this.convertToBlock.bind(this);
            this.applyFeaturesForce = this.applyFeaturesForce.bind(this);
            this.applyFeatureFromPreview = this.applyFeatureFromPreview.bind(this);
            this.undoLastChange = this.undoLastChange.bind(this);
            this.saveToHistory = this.saveToHistory.bind(this);
            // Modal drag/resize handlers
            this.initializeModalPosition = this.initializeModalPosition.bind(this);
            this.handleDragStart = this.handleDragStart.bind(this);
            this.handleDragMove = this.handleDragMove.bind(this);
            this.handleDragEnd = this.handleDragEnd.bind(this);
            this.handleResizeStart = this.handleResizeStart.bind(this);
            this.handleResizeMove = this.handleResizeMove.bind(this);
            this.handleResizeEnd = this.handleResizeEnd.bind(this);
            this.handleHeaderKeyDown = this.handleHeaderKeyDown.bind(this);
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

            // Calculate character offset for each span
            for (const span of styledSpans) {
                // Find this span's position in the text
                const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
                let spanStart = 0;
                let spanEnd = 0;
                let found = false;
                let offset = 0;

                let node;
                while ((node = walker.nextNode())) {
                    const nodeLength = node.nodeValue.length;

                    // Check if this text node is inside our span
                    if (span.contains(node)) {
                        if (!found) {
                            spanStart = offset;
                            found = true;
                        }
                        spanEnd = offset + nodeLength;
                    }

                    offset += nodeLength;
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

            // Extract selected text and compute inline features when opening popover
            let extractedText = '';
            let computedInlineFeatures = [];
            let inheritedFont = '';
            let detectionFailed = false;
            let capturedInitialState = null;
            let modalPosition = {};

            if (!this.state.isOpen && value) {
                if (value.start !== value.end) {
                    // There's a selection - extract it
                    const slicedValue = slice(value, value.start, value.end);
                    extractedText = getTextContent(slicedValue);
                } else {
                    // No selection - use entire text
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

                // Capture initial state when opening popover (for undo comparison)
                capturedInitialState = {
                    selectedFeatures: this.getActiveFeatures() || [],
                    selectedFont: this.getActiveFont() || '',
                    fontSize: this.getActiveFontSize() || 'inherit',
                    fontSizeMin: this.getActiveFontSizeMin() || 16,
                    fontSizePreferred: this.getActiveFontSizePreferred() || 24,
                    fontSizeMax: this.getActiveFontSizeMax() || 32,
                    fontWeight: this.getActiveFontWeight() || '400',
                    letterSpacing: this.getActiveLetterSpacing() || 0,
                    lineHeight: this.getActiveLineHeight() || 0
                };

                // Initialize modal position when opening
                modalPosition = this.initializeModalPosition();
            }

            this.setState(state => ({
                isOpen: !state.isOpen,
                selectedFeatures: this.getActiveFeatures() || [],
                selectedFont: this.getActiveFont() || '',
                fontSize: this.getActiveFontSize() || 'inherit',
                fontSizeMin: this.getActiveFontSizeMin() || 16,
                fontSizePreferred: this.getActiveFontSizePreferred() || 24,
                fontSizeMax: this.getActiveFontSizeMax() || 32,
                fontWeight: this.getActiveFontWeight() || '400',
                letterSpacing: this.getActiveLetterSpacing() || 0,
                lineHeight: this.getActiveLineHeight() || 0,
                previewText: extractedText,
                inlineFeatures: computedInlineFeatures,
                blockInheritedFont: inheritedFont,
                fontDetectionFailed: detectionFailed,
                initialState: capturedInitialState,
                // Reset hasChanges when closing popover (discarding unapplied changes)
                hasChanges: state.isOpen ? false : state.hasChanges,
                // Reset modal position and drag/resize state
                ...(!state.isOpen && modalPosition),
                isDragging: false,
                isResizing: false
            }));
        }

        /**
         * Set font family (value can be font ID or font family string)
         */
        setFont(value) {
            // Save to history before making changes
            this.saveToHistory();

            if (value === '') {
                // Reset to default
                this.setState({
                    selectedFont: '',
                    selectedFontId: 0,
                    hasChanges: true
                });
            } else {
                // Try to parse as ID (new system)
                const fontId = parseInt(value, 10);
                const fontData = this.fontIdMap && this.fontIdMap[fontId];
                if (!isNaN(fontId) && fontData) {
                    // New ID-based system
                    this.setState({
                        selectedFont: fontData.family,
                        selectedFontId: fontId,
                        hasChanges: true
                    });
                } else {
                    // Old string-based system (backward compatibility)
                    this.setState({
                        selectedFont: value,
                        selectedFontId: 0,
                        hasChanges: true
                    });
                }
            }
        }

        /**
         * Set font size mode
         */
        setFontSize(mode) {
            // Save to history before making changes
            this.saveToHistory();

            this.setState({
                fontSize: mode,
                hasChanges: true
            });
        }

        /**
         * Set font size min
         */
        setFontSizeMin(value) {
            this.setState({
                fontSizeMin: value
            });
        }

        /**
         * Set font size preferred
         */
        setFontSizePreferred(value) {
            this.setState({
                fontSizePreferred: value
            });
        }

        /**
         * Set font size max
         */
        setFontSizeMax(value) {
            this.setState({
                fontSizeMax: value
            });
        }

        /**
         * Set font weight
         */
        setFontWeight(value) {
            // Save to history before making changes
            this.saveToHistory();

            this.setState({
                fontWeight: value,
                hasChanges: true
            });
        }

        /**
         * Set letter spacing
         */
        setLetterSpacing(value) {
            // Save to history before making changes
            this.saveToHistory();

            this.setState({
                letterSpacing: value,
                hasChanges: true
            });
        }

        /**
         * Set line height
         */
        setLineHeight(value) {
            // Save to history before making changes
            this.saveToHistory();

            this.setState({
                lineHeight: value,
                hasChanges: true
            });
        }

        /**
         * Set preview device
         */
        setPreviewDevice(device) {
            this.setState({
                previewDevice: device
            });
        }

        /**
         * Toggle individual feature
         */
        toggleFeature(featureId) {
            // Save to history before making changes
            this.saveToHistory();

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
                    activePreset: null,
                    hasChanges: true
                };
            });
        }

        /**
         * Validate selection to detect word boundary issues
         */
        validateSelection() {
            const { value } = this.props;

            if (!value || value.start === value.end) {
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
            const { start, end } = value;

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
                    message: __('For better accessibility, select complete words or phrases. Or convert to a Typography Stylist block for accessible styling of partial words.', 'typography-stylist')
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
                console.error('No block selected');
                return;
            }

            const currentBlock = select('core/block-editor').getBlock(selectedBlockClientId);
            if (!currentBlock) {
                console.error('Could not get current block');
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

            // Check if there's a selection (partial text selected)
            if (value.start !== value.end) {
                // User selected a portion of text - apply styling only to that portion
                // Use the current block's HTML content to preserve existing spans
                const existingContent = currentBlock.attributes.content || '';
                const fullText = getTextContent(value);

                // Build style string for the selected portion
                const { selectedFeatures, selectedFont, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, fontWeight, letterSpacing } = this.state;
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

                    // Validate selection bounds
                    const textLength = container.textContent.length;
                    const validationResult = validateSelectionBounds(value.start, value.end, textLength);
                    if (!validationResult.valid) {
                        console.error('Typographic Stylist Inline Editor - Invalid selection bounds:', validationResult.error, { start: value.start, end: value.end, textLength });
                        return;
                    }

                    // Create a range for the selection
                    const walker = doc.createTreeWalker(container, NodeFilter.SHOW_TEXT);
                    let currentOffset = 0;
                    let startNode = null, startOffset = 0;
                    let endNode = null, endOffset = 0;

                    let textNode;
                    while ((textNode = walker.nextNode())) {
                        const nodeLength = textNode.nodeValue.length;

                        if (!startNode && currentOffset + nodeLength >= value.start) {
                            startNode = textNode;
                            startOffset = value.start - currentOffset;
                        }

                        if (currentOffset + nodeLength >= value.end) {
                            endNode = textNode;
                            endOffset = value.end - currentOffset;
                            break;
                        }

                        currentOffset += nodeLength;
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
                            console.error('Typographic Stylist Inline Editor - Failed to wrap selection, using fallback:', e);
                            // If we can't wrap (e.g., crosses element boundaries), fall back to text replacement
                            const beforeText = fullText.substring(0, value.start);
                            const selectedText = fullText.substring(value.start, value.end);
                            const afterText = fullText.substring(value.end);
                            contentForBlock = escapeHTML(beforeText) +
                                `<span class="typost-styled" data-features="${selectedFeatures.join(',')}" style="${styleString}">${escapeHTML(selectedText)}</span>` +
                                escapeHTML(afterText);
                        }
                    } else {
                        // Fall back to simple text replacement
                        const beforeText = fullText.substring(0, value.start);
                        const selectedText = fullText.substring(value.start, value.end);
                        const afterText = fullText.substring(value.end);
                        contentForBlock = escapeHTML(beforeText) +
                            `<span class="typost-styled" data-features="${selectedFeatures.join(',')}" style="${styleString}">${escapeHTML(selectedText)}</span>` +
                            escapeHTML(afterText);
                    }
                } else {
                    // No existing HTML, use simple text replacement
                    const beforeText = fullText.substring(0, value.start);
                    const selectedText = fullText.substring(value.start, value.end);
                    const afterText = fullText.substring(value.end);
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
                        letterSpacing: this.state.letterSpacing
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
                        letterSpacing: this.state.letterSpacing
                    });

                    // Replace current block
                    dispatch('core/block-editor').replaceBlocks(selectedBlockClientId, typostBlock);
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
                }
            }

            // Close popover
            this.setState({ isOpen: false });
        }

        /**
         * Apply selected features
         */
        applyFeatures() {
            const { value, onChange } = this.props;
            const { selectedFeatures, selectedFont, selectedFontId, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, fontWeight, letterSpacing, lineHeight } = this.state;

            // Validate selection
            const validation = this.validateSelection();
            if (!validation.valid) {
                // Show warning with options
                this.setState({
                    showAccessibilityWarning: true,
                    warningMessage: validation.message
                });
                return;
            }

            if (selectedFeatures.length === 0 && !selectedFont && fontSize === 'inherit' && fontWeight === '400' && letterSpacing === 0 && lineHeight === 0) {
                // Remove format if no features, font, font size, weight, letter spacing, or line height selected
                onChange(removeFormat(value, FORMAT_TYPE));
            } else {
                // Build attributes
                const attributes = {};
                let styleString = '';

                // Add features
                if (selectedFeatures.length > 0) {
                    const cssValue = this.featuresToCSS(selectedFeatures);
                    attributes['data-features'] = selectedFeatures.join(',');
                    styleString += `font-feature-settings: ${cssValue}`;
                }

                // Add font family - use CSS variable if fontId is available
                if (selectedFontId) {
                    attributes['data-font'] = selectedFont;
                    attributes['data-font-id'] = String(selectedFontId);
                    if (styleString) styleString += '; ';
                    styleString += `font-family: var(--font-${selectedFontId})`;
                } else if (selectedFont) {
                    attributes['data-font'] = selectedFont;
                    if (styleString) styleString += '; ';
                    styleString += `font-family: ${selectedFont}`;
                }

                // Add font weight (always apply, default to normal)
                attributes['data-fontweight'] = fontWeight;
                if (styleString) styleString += '; ';
                styleString += `font-weight: ${fontWeight}`;

                // Add letter spacing
                if (letterSpacing !== 0) {
                    attributes['data-letterspacing'] = letterSpacing.toString();
                    if (styleString) styleString += '; ';
                    styleString += `letter-spacing: ${letterSpacing / 1000}em`;
                }

                // Add line height
                if (lineHeight !== 0) {
                    attributes['data-lineheight'] = lineHeight.toString();
                    if (styleString) styleString += '; ';
                    styleString += `line-height: ${lineHeight}`;
                }

                // Add font size
                if (fontSize !== 'inherit') {
                    attributes['data-fontsize'] = fontSize;
                    attributes['data-fontsize-min'] = fontSizeMin.toString();
                    attributes['data-fontsize-preferred'] = fontSizePreferred.toString();
                    attributes['data-fontsize-max'] = fontSizeMax.toString();

                    if (styleString) styleString += '; ';
                    styleString += `font-size: clamp(${fontSizeMin}px, ${fontSizePreferred / 16}rem + ${((fontSizeMax - fontSizeMin) / (RESPONSIVE_FONT_MAX_VIEWPORT - RESPONSIVE_FONT_MIN_VIEWPORT)) * 100}vw, ${fontSizeMax}px)`;
                }

                attributes['style'] = styleString;

                // Add aria-label if enabled for accessibility
                if (typostData.enableAriaLabels && value) {
                    const selectedText = value.start !== value.end
                        ? getTextContent(slice(value, value.start, value.end))
                        : getTextContent(value);
                    if (selectedText) {
                        attributes['aria-label'] = selectedText;
                    }
                }

                onChange(applyFormat(value, {
                    type: FORMAT_TYPE,
                    attributes: attributes
                }));
            }

            this.setState({ isOpen: false, hasChanges: false });
        }

        /**
         * Apply features without validation (force apply)
         */
        applyFeaturesForce() {
            const { value, onChange } = this.props;
            const { selectedFeatures, selectedFont, selectedFontId, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, fontWeight, letterSpacing, lineHeight } = this.state;

            if (selectedFeatures.length === 0 && !selectedFont && fontSize === 'inherit' && fontWeight === '400' && letterSpacing === 0 && lineHeight === 0) {
                onChange(removeFormat(value, FORMAT_TYPE));
            } else {
                const attributes = {};
                let styleString = '';

                if (selectedFeatures.length > 0) {
                    const cssValue = this.featuresToCSS(selectedFeatures);
                    attributes['data-features'] = selectedFeatures.join(',');
                    styleString += `font-feature-settings: ${cssValue}`;
                }

                // Add font family - use CSS variable if fontId is available
                if (selectedFontId) {
                    attributes['data-font'] = selectedFont;
                    attributes['data-font-id'] = String(selectedFontId);
                    if (styleString) styleString += '; ';
                    styleString += `font-family: var(--font-${selectedFontId})`;
                } else if (selectedFont) {
                    attributes['data-font'] = selectedFont;
                    if (styleString) styleString += '; ';
                    styleString += `font-family: ${selectedFont}`;
                }

                attributes['data-fontweight'] = fontWeight;
                if (styleString) styleString += '; ';
                styleString += `font-weight: ${fontWeight}`;

                if (letterSpacing !== 0) {
                    attributes['data-letterspacing'] = letterSpacing.toString();
                    if (styleString) styleString += '; ';
                    styleString += `letter-spacing: ${letterSpacing / 1000}em`;
                }

                if (lineHeight !== 0) {
                    attributes['data-lineheight'] = lineHeight.toString();
                    if (styleString) styleString += '; ';
                    styleString += `line-height: ${lineHeight}`;
                }

                if (fontSize !== 'inherit') {
                    attributes['data-fontsize'] = fontSize;
                    attributes['data-fontsize-min'] = fontSizeMin.toString();
                    attributes['data-fontsize-preferred'] = fontSizePreferred.toString();
                    attributes['data-fontsize-max'] = fontSizeMax.toString();

                    if (styleString) styleString += '; ';
                    styleString += `font-size: clamp(${fontSizeMin}px, ${fontSizePreferred / 16}rem + ${((fontSizeMax - fontSizeMin) / (RESPONSIVE_FONT_MAX_VIEWPORT - RESPONSIVE_FONT_MIN_VIEWPORT)) * 100}vw, ${fontSizeMax}px)`;
                }

                attributes['style'] = styleString;

                // Add aria-label if enabled for accessibility (in force apply)
                if (typostData.enableAriaLabels && value) {
                    const selectedText = value.start !== value.end
                        ? getTextContent(slice(value, value.start, value.end))
                        : getTextContent(value);
                    if (selectedText) {
                        attributes['aria-label'] = selectedText;
                    }
                }

                onChange(applyFormat(value, {
                    type: FORMAT_TYPE,
                    attributes: attributes
                }));
            }

            this.setState({ isOpen: false, hasChanges: false });
        }

        /**
         * Apply preset
         */
        applyPreset(preset) {
            // Save to history before making changes
            this.saveToHistory();

            this.setState({
                selectedFeatures: preset.features,
                selectedFont: preset.fontFamily || '',
                activePreset: preset.id,
                hasChanges: true
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
                // Optionally, log the error for debugging
                if (window && window.console && typeof window.console.error === 'function') {
                    window.console.error('Failed to clear Typography Stylist features:', error);
                }
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
            // Save to history before clearing
            this.saveToHistory();

            const { value, onChange } = this.props;
            onChange(removeFormat(value, FORMAT_TYPE));
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
                activePreset: null,
                hasChanges: false
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
                            this.fontIdMap[font.font_id] = { family, fallbacks: font.fallbacks };
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
                        this.fontIdMap[font.font_id] = { family: font.font_family, fallbacks: font.fallbacks };
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
                            this.fontIdMap[font.font_id] = { family, fallbacks: font.fallbacks };
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
                        this.fontIdMap[font.font_id] = { family: font.font_family, fallbacks: font.fallbacks };
                    }
                });
            }

            return options;
        }

        /**
         * Save current state to history
         */
        saveToHistory() {
            const { selectedFeatures, selectedFont, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, fontWeight, letterSpacing, lineHeight, changeHistory } = this.state;

            const snapshot = {
                selectedFeatures: [...selectedFeatures],
                selectedFont,
                fontSize,
                fontSizeMin,
                fontSizePreferred,
                fontSizeMax,
                fontWeight,
                letterSpacing,
                lineHeight
            };

            // Limit history to last 20 changes
            const newHistory = [...changeHistory, snapshot].slice(-20);

            this.setState({ changeHistory: newHistory });
        }

        /**
         * Apply feature from preview button
         */
        applyFeatureFromPreview(featureId) {
            const { selectedFeatures } = this.state;

            // Save current state to history before making changes
            // (consistent with toggleFeature behavior - always create history entry)
            this.saveToHistory();

            // Add feature if not already active (idempotent operation)
            if (!selectedFeatures.includes(featureId)) {
                this.setState({
                    selectedFeatures: [...selectedFeatures, featureId]
                });
            }
        }

        /**
         * Undo last change - restore previous state from history
         */
        undoLastChange() {
            const { changeHistory, initialState } = this.state;

            if (changeHistory.length > 0) {
                // Get the last history entry
                const newHistory = [...changeHistory];
                const previousState = newHistory.pop();

                // Check if we're back to initial state (when popover opened)
                let isBackToInitialState = false;
                if (initialState) {
                    // Compare against initial state (use spread to avoid mutating arrays)
                    isBackToInitialState =
                        JSON.stringify([...(previousState.selectedFeatures || [])].sort()) === JSON.stringify([...(initialState.selectedFeatures || [])].sort()) &&
                        previousState.selectedFont === initialState.selectedFont &&
                        previousState.fontSize === initialState.fontSize &&
                        previousState.fontSizeMin === initialState.fontSizeMin &&
                        previousState.fontSizePreferred === initialState.fontSizePreferred &&
                        previousState.fontSizeMax === initialState.fontSizeMax &&
                        previousState.fontWeight === initialState.fontWeight &&
                        previousState.letterSpacing === initialState.letterSpacing &&
                        previousState.lineHeight === initialState.lineHeight;
                }

                // Restore previous state
                this.setState({
                    selectedFeatures: previousState.selectedFeatures,
                    selectedFont: previousState.selectedFont,
                    fontSize: previousState.fontSize,
                    fontSizeMin: previousState.fontSizeMin,
                    fontSizePreferred: previousState.fontSizePreferred,
                    fontSizeMax: previousState.fontSizeMax,
                    fontWeight: previousState.fontWeight,
                    letterSpacing: previousState.letterSpacing,
                    lineHeight: previousState.lineHeight,
                    changeHistory: newHistory,
                    // Reset hasChanges if we're back to initial state
                    hasChanges: !isBackToInitialState
                });
            }
        }

        /**
         * Render feature toggle
         */
        renderFeatureToggle(feature) {
            const { selectedFeatures, selectedFont, previewText, blockInheritedFont } = this.state;
            const isActive = selectedFeatures.includes(feature.id);

            // Use preview text or default sample text
            const sampleText = previewText || 'ffi ffl Th AE';

            // Build preview styles - with this feature only
            const previewStyle = {
                fontFeatureSettings: `"${feature.id}" 1`
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
                            {sampleText}
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
         * Cleanup event listeners when component unmounts
         */
        componentWillUnmount() {
            document.removeEventListener('mousemove', this.handleDragMove);
            document.removeEventListener('mouseup', this.handleDragEnd);
            document.removeEventListener('mousemove', this.handleResizeMove);
            document.removeEventListener('mouseup', this.handleResizeEnd);
        }

        render() {
            const { isActive, isInTypostBlock = false } = this.props;
            const { isOpen, selectedFeatures, selectedFont, selectedFontId, fontSize, fontSizeMin, fontSizePreferred, fontSizeMax, fontWeight, letterSpacing, lineHeight, showPreview, previewText, previewDevice, showAccessibilityWarning, warningMessage, showClearConfirmation, dontShowClearWarning, blockInheritedFont, fontDetectionFailed } = this.state;
            const groupedFeatures = this.groupFeatures();
            const presets = typostData.presets || [];
            const fontOptions = this.getFontOptions();
            const hasFonts = fontOptions.length > 0;

            // Use stored preview text or fallback
            const displayText = previewText || __('Elegant Typography & Flourish', 'typography-stylist');

            // Build preview style
            const previewStyle = {
                fontFeatureSettings: this.featuresToCSS(selectedFeatures)
            };
            // Use selected font, or fallback to block's inherited font when Default is selected
            const fontToUse = selectedFont || blockInheritedFont;
            if (fontToUse) {
                previewStyle.fontFamily = fontToUse;
            }
            // Apply font weight to preview
            previewStyle.fontWeight = fontWeight;

            // Apply letter spacing to preview
            if (letterSpacing !== 0) {
                previewStyle.letterSpacing = `${letterSpacing / 1000}em`;
            }

            // Apply line height to preview
            if (lineHeight !== 0) {
                previewStyle.lineHeight = lineHeight;
            }

            // Apply font size to preview based on device selection
            if (fontSize === 'responsive') {
                let previewSize = fontSizePreferred;
                if (previewDevice === 'mobile') {
                    previewSize = fontSizeMin;
                } else if (previewDevice === 'desktop') {
                    previewSize = fontSizeMax;
                }
                previewStyle.fontSize = `${previewSize}px`;
            }

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

                                {/* Info Notice - Features require Apply button - STICKY - Only show after changes */}
                                {this.state.hasChanges && (
                                    <div className="typost-sticky-notice-wrapper">
                                        {wp.element.createElement(Notice, {
                                            status: 'info',
                                            isDismissible: false,
                                            className: 'typost-apply-notice'
                                        },
                                            wp.element.createElement('p', { style: { margin: 0 } },
                                                __('Click "Apply" below the preview to confirm changes.', 'typography-stylist')
                                            )
                                        )}
                                    </div>
                                )}

                                {/* Scrollable Content Wrapper */}
                                <div className="typost-scrollable-content">
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

                                {/* Font Weight Control */}
                                <div className="typost-fontweight-section">
                                    <h4>{__('Font Weight', 'typography-stylist')}</h4>
                                    <SelectControl
                                        value={fontWeight}
                                        options={[
                                            { label: __('100 - Thin', 'typography-stylist'), value: '100' },
                                            { label: __('200 - Extra Light', 'typography-stylist'), value: '200' },
                                            { label: __('300 - Light', 'typography-stylist'), value: '300' },
                                            { label: __('400 - Normal', 'typography-stylist'), value: '400' },
                                            { label: __('500 - Medium', 'typography-stylist'), value: '500' },
                                            { label: __('600 - Semi Bold', 'typography-stylist'), value: '600' },
                                            { label: __('700 - Bold', 'typography-stylist'), value: '700' },
                                            { label: __('800 - Extra Bold', 'typography-stylist'), value: '800' },
                                            { label: __('900 - Black', 'typography-stylist'), value: '900' }
                                        ]}
                                        onChange={this.setFontWeight}
                                    />
                                </div>

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

                                {/* Accessibility Warning */}
                                {showAccessibilityWarning && (
                                    <div className="typost-accessibility-warning">
                                        <p className="typost-warning-message">
                                            ⚠️ {warningMessage}
                                        </p>
                                        <ButtonGroup>
                                            <Button
                                                isPrimary
                                                onClick={this.convertToBlock}
                                            >
                                                {__('Convert to Typography Stylist Block', 'typography-stylist')}
                                            </Button>
                                            <Button
                                                isSecondary
                                                onClick={() => {
                                                    this.setState({ showAccessibilityWarning: false });
                                                    // Apply anyway - bypass validation
                                                    this.applyFeaturesForce();
                                                }}
                                            >
                                                {__('Apply Anyway', 'typography-stylist')}
                                            </Button>
                                            <Button
                                                isTertiary
                                                onClick={() => this.setState({ showAccessibilityWarning: false })}
                                            >
                                                {__('Cancel', 'typography-stylist')}
                                            </Button>
                                        </ButtonGroup>
                                    </div>
                                )}

                                {/* Preview Section */}
                                {showPreview && !showAccessibilityWarning && (
                                    <div className="typost-preview-section">
                                        <div className="typost-preview-header">
                                            <h4>{__('Preview', 'typography-stylist')}</h4>
                                            {fontSize === 'responsive' && (
                                                <ButtonGroup className="typost-preview-device-toggle">
                                                    <Button
                                                        isSmall
                                                        isPrimary={previewDevice === 'mobile'}
                                                        isSecondary={previewDevice !== 'mobile'}
                                                        onClick={() => this.setPreviewDevice('mobile')}
                                                    >
                                                        {__('Mobile', 'typography-stylist')}
                                                    </Button>
                                                    <Button
                                                        isSmall
                                                        isPrimary={previewDevice === 'tablet'}
                                                        isSecondary={previewDevice !== 'tablet'}
                                                        onClick={() => this.setPreviewDevice('tablet')}
                                                    >
                                                        {__('Tablet', 'typography-stylist')}
                                                    </Button>
                                                    <Button
                                                        isSmall
                                                        isPrimary={previewDevice === 'desktop'}
                                                        isSecondary={previewDevice !== 'desktop'}
                                                        onClick={() => this.setPreviewDevice('desktop')}
                                                    >
                                                        {__('Desktop', 'typography-stylist')}
                                                    </Button>
                                                </ButtonGroup>
                                            )}
                                        </div>
                                        <div
                                            className="typost-preview-text"
                                            style={previewStyle}
                                        >
                                            {displayText}
                                        </div>
                                        {selectedFeatures.length > 0 && (
                                            <div className="typost-preview-features">
                                                <strong>{__('Active: ', 'typography-stylist')}</strong>
                                                {selectedFeatures.join(', ')}
                                            </div>
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

                                {/* Action Buttons */}
                                {!showClearConfirmation && (
                                    <div className="typost-popover-actions">
                                        <ButtonGroup>
                                            <Button
                                                isPrimary
                                                onClick={this.applyFeatures}
                                            >
                                                {__('Apply', 'typography-stylist')}
                                            </Button>
                                            {this.state.changeHistory.length > 0 && (
                                                <Button
                                                    isSecondary
                                                    onClick={this.undoLastChange}
                                                    title={__('Undo last change', 'typography-stylist')}
                                                >
                                                    {__('Undo', 'typography-stylist')} {this.state.changeHistory.length > 1 && `(${this.state.changeHistory.length})`}
                                                </Button>
                                            )}
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
                                                {__('Cancel', 'typography-stylist')}
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
